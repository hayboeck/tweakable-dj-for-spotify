// Kleiner Treiber für Chrome, Chromium bzw. Edge im Hintergrund (headless) für die Browser-Tests der Oberfläche
// (tests/browser.test.mjs): Chrome DevTools Protocol über eine WebSocket-Verbindung (eigener kleiner Client, ohne
// Abhängigkeiten; Node 18 und 20 haben noch kein WebSocket). Jeder Start hat ein eigenes, leeres Profil in einem temporären
// Ordner und einen freien Port (den nennt der Browser in DevToolsActivePort).
//   findBrowser() → Pfad zum Programm oder null (dann werden die Tests übersprungen). CHROME_PATH setzt ihn fest.
//   const browser = await launch(file); const page = await browser.newPage(); … await browser.close();
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Übliche Orte je Plattform; unter Linux und macOS zusätzlich über PATH.
export function findBrowser(env = process.env) {
  if (env.CHROME_PATH) return fs.existsSync(env.CHROME_PATH) ? env.CHROME_PATH : null;
  const candidates = process.platform === 'win32'
    ? ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA'].flatMap(v => (env[v] ? [
      path.join(env[v], 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(env[v], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(env[v], 'Chromium', 'Application', 'chrome.exe'),
    ] : []))
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : [];
  for (const file of candidates) if (fs.existsSync(file)) return file;
  if (process.platform === 'win32') return null;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    const r = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
    const found = r.status === 0 ? r.stdout.trim() : '';
    if (found) return found;
  }
  return null;
}

// WebSocket-Client (RFC 6455), nur was CDP braucht: Textnachrichten, Fragmente, Ping. onMessage(text) je Nachricht.
function connectWebSocket(port, wsPath, onMessage) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const key = crypto.randomBytes(16).toString('base64');
    let buf = Buffer.alloc(0);
    let open = false;
    let parts = [];
    const frame = (opcode, payload) => {
      const len = payload.length;
      const head = len < 126 ? Buffer.from([0x80 | opcode, 0x80 | len])
        : len < 65536 ? Buffer.from([0x80 | opcode, 0x80 | 126, len >> 8, len & 255])
          : Buffer.concat([Buffer.from([0x80 | opcode, 0x80 | 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b; })()]);
      const mask = crypto.randomBytes(4);
      const body = Buffer.from(payload);
      for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
      socket.write(Buffer.concat([head, mask, body]));
    };
    socket.on('connect', () => socket.write(`GET ${wsPath} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n`
      + `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    socket.on('error', e => (open ? null : reject(e)));
    socket.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (!open) {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        if (!/^HTTP\/1\.1 101/.test(buf.subarray(0, end).toString())) return reject(new Error(buf.subarray(0, end).toString()));
        buf = buf.subarray(end + 4);
        open = true;
        resolve({ send: text => frame(1, Buffer.from(text, 'utf8')), close: () => { try { frame(8, Buffer.alloc(0)); } catch {} socket.destroy(); } });
      }
      for (;;) {
        if (buf.length < 2) return;
        const fin = (buf[0] & 0x80) !== 0;
        const opcode = buf[0] & 15;
        let len = buf[1] & 127;
        let at = 2;
        if (len === 126) {
          if (buf.length < 4) return;
          len = buf.readUInt16BE(2);
          at = 4;
        } else if (len === 127) {
          if (buf.length < 10) return;
          len = Number(buf.readBigUInt64BE(2));
          at = 10;
        }
        if (buf.length < at + len) return;
        const payload = buf.subarray(at, at + len);
        buf = buf.subarray(at + len);
        if (opcode === 9) frame(10, payload); // Ping → Pong
        else if (opcode === 8) socket.destroy();
        else if (opcode === 1 || opcode === 0) {
          parts.push(Buffer.from(payload));
          if (fin) {
            const text = Buffer.concat(parts).toString('utf8');
            parts = [];
            onMessage(text);
          }
        }
      }
    });
  });
}

// Auf den GitHub-Runnern startet Chrome manchmal sehr langsam (einmal über 20 s): bis zu 60 s warten und einmal neu versuchen.
export async function launch(file) {
  try {
    return await launchOnce(file);
  } catch {
    return launchOnce(file);
  }
}

async function launchOnce(file) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable-dj-browser-'));
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-sync', '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
    '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), 'about:blank'];
  const proc = spawn(file, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', chunk => (stderr = (stderr + chunk).slice(-4000)));
  const exited = new Promise(resolve => proc.once('exit', resolve));
  // Port und Pfad stehen in DevToolsActivePort im Profil, sobald der Browser bereit ist.
  let port;
  let wsPath;
  for (let i = 0; i < 600 && !port; i++) {
    try {
      [port, wsPath] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split(/\r?\n/);
    } catch {
      await sleep(100);
    }
  }
  if (!port) {
    proc.kill();
    throw new Error(`Browser startet nicht: ${stderr}`);
  }
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  const ws = await connectWebSocket(Number(port), wsPath, text => {
    const msg = JSON.parse(text);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`));
      else resolve(msg.result);
    } else {
      for (const l of listeners) l(msg);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params, ...(sessionId && { sessionId }) }));
  });

  const browser = {
    async newPage({ width = 1000, height = 900 } = {}) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const s = (method, params) => send(method, params, sessionId);
      const errors = [];
      const dialogs = [];
      const onMessage = m => {
        if (m.sessionId !== sessionId) return;
        if (m.method === 'Runtime.exceptionThrown') errors.push(`Ausnahme: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`console.error: ${m.params.args.map(a => a.value ?? a.description).join(' ')}`);
        if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.text} ${m.params.entry.url ?? ''}`.trim());
        if (m.method === 'Page.javascriptDialogOpening') {
          dialogs.push(m.params.message);
          s('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
        }
      };
      listeners.add(onMessage);
      await s('Page.enable');
      await s('Runtime.enable');
      await s('Log.enable');
      await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const page = {
        errors, dialogs,
        // Ausdruck in der Seite auswerten (await möglich); Ergebnis als Wert
        async eval(expression) {
          const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
          if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}\n${expression.slice(0, 200)}`);
          return r.result.value;
        },
        async waitFor(expression, timeout = 20_000) {
          const started = Date.now();
          let last;
          while (Date.now() - started < timeout) {
            try {
              last = await page.eval(expression);
              if (last) return last;
            } catch (e) {
              last = e.message;
            }
            await sleep(100);
          }
          throw new Error(`Zeitüberschreitung: ${expression} (zuletzt ${JSON.stringify(last)})`);
        },
        async goto(url) {
          const loaded = new Promise(resolve => {
            const l = m => {
              if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') {
                listeners.delete(l);
                resolve();
              }
            };
            listeners.add(l);
          });
          await s('Page.navigate', { url });
          await Promise.race([loaded, sleep(20_000)]);
        },
        async reload() {
          const loaded = new Promise(resolve => {
            const l = m => {
              if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') {
                listeners.delete(l);
                resolve();
              }
            };
            listeners.add(l);
          });
          await s('Page.reload', { ignoreCache: true });
          await Promise.race([loaded, sleep(20_000)]);
        },
        // Echter Mausklick in die Mitte des Elements (wie ein Mensch; nur, wenn es sichtbar ist). count 2 = Doppelklick.
        async click(selector, count = 1) {
          const at = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.offsetParent === null) return null;
            e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
          if (!at) throw new Error(`nicht sichtbar: ${selector}`);
          for (let n = 1; n <= count; n++) {
            for (const type of ['mousePressed', 'mouseReleased']) {
              await s('Input.dispatchMouseEvent', { type, x: at[0], y: at[1], button: 'left', clickCount: n });
            }
          }
        },
        async viewport(w, h) {
          await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
        },
        async close() {
          listeners.delete(onMessage);
          await send('Target.closeTarget', { targetId }).catch(() => {});
        },
      };
      return page;
    },
    async close() {
      await Promise.race([send('Browser.close').catch(() => {}), sleep(3000)]);
      ws.close();
      await Promise.race([exited, sleep(5000)]);
      if (proc.exitCode === null) proc.kill();
      await Promise.race([exited, sleep(5000)]);
      // Der Browser schreibt nach dem Schließen manchmal noch kurz ins Profil: ein paar Mal versuchen, sonst liegen lassen (temp).
      for (let i = 0; i < 20; i++) {
        try {
          fs.rmSync(profile, { recursive: true, force: true });
          break;
        } catch {
          await sleep(250);
        }
      }
    },
  };
  return browser;
}
