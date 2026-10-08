// Persönliche Dateien sicher schreiben und lesen (state.json, tokens.json, config.jsonc, probelauf.json, lastfm-cache.json,
// automatik.json bzw. jetzt.json).
// writeAtomic: erst in eine Zwischendatei im selben Ordner schreiben, dann umbenennen. So liest ein anderer Prozess
// (automatischer Lauf, Oberfläche, „Playlist jetzt neu erstellen“) nie eine halb geschriebene Datei, und bricht das Programm
// mittendrin ab, bleibt die alte Datei vollständig.
import fs from 'node:fs';
import path from 'node:path';

let count = 0;
// Kurz warten, ohne die Funktion asynchron zu machen (nur beim seltenen Fall einer gerade geöffneten Datei unter Windows).
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const BUSY = ['EPERM', 'EACCES', 'EBUSY'];

// Schreibt data nach file. mode: Rechte einer neuen Datei (z. B. 0o600 für tokens.json, nur Mac/Linux); eine vorhandene Datei
// behält ihre Rechte. Ein symbolischer Link bleibt ein Link (dann direkt ins Ziel geschrieben).
export function writeAtomic(file, data, { mode } = {}) {
  let st = null;
  try {
    st = fs.lstatSync(file);
  } catch {
    // gibt es noch nicht
  }
  const direct = () => fs.writeFileSync(file, data, mode === undefined ? undefined : { mode });
  if (st?.isSymbolicLink()) return direct();
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${++count}.tmp`);
  try {
    fs.writeFileSync(tmp, data, { mode: st ? st.mode & 0o777 : mode ?? 0o666 });
    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(tmp, file);
        return undefined;
      } catch (e) {
        // Windows: Ziel gerade von einem anderen Programm geöffnet (Virenscanner, Editor) – kurz warten, zuletzt direkt schreiben.
        if (!BUSY.includes(e.code)) throw e;
        if (attempt >= 5) return direct();
        pause(40 * (attempt + 1));
      }
    }
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// Text einer Datei ohne Byte Order Mark (U+FEFF) am Anfang – den setzen manche Editoren bzw. Windows PowerShell 5.1
// („UTF-8 mit BOM“), JSON.parse versteht ihn nicht.
export const readText = file => fs.readFileSync(file, 'utf8').replace(/^﻿/, '');

// JSON einer Datei; fallback, wenn es sie nicht gibt. Kaputter Inhalt wirft (dann lieber nicht überschreiben).
export function readJson(file, fallback) {
  let text;
  try {
    text = readText(file);
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
  return JSON.parse(text);
}
