// Baut ein simuliertes Release für die Tests von „Jetzt aktualisieren“ (tests/install-update.test.mjs, tests/ui.test.mjs):
// Programmdateien, manifest.json (mit .github/release-manifest.mjs, wie beim echten Release) und die ZIP-Datei mit dem
// Ordner tweakable-dj/, dazu die Antwortdatei für MOCK_GITHUB (tests/mock-apis.mjs). Ohne Netzwerk, ohne Abhängigkeiten.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { buildManifest } from '../.github/release-manifest.mjs';

export const OWNER_REPO = 'beispiel/tweakable-dj-for-spotify';

// CRC-32 für die ZIP-Datei (zlib.crc32 gibt es erst ab Node 20.15)
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// ZIP-Datei wie von Info-ZIP (zip -r -X): je Eintrag Unix-Rechte in den externen Attributen, Ordner mit "/" am Ende.
// entries: [{ name, data?, mode? (z. B. 0o100755, 0o120777 = Link), method? (0 = gespeichert, sonst Deflate) }]
export function buildZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.from(e.data ?? '');
    const dir = e.name.endsWith('/');
    const method = dir || e.method === 0 || !data.length ? 0 : 8;
    const packed = method ? zlib.deflateRawSync(data, { level: 9 }) : data;
    const mode = e.mode ?? (dir ? 0o40755 : 0o100644);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x800, 6); // Namen in UTF-8
    head.writeUInt16LE(method, 8);
    head.writeUInt32LE(crc32(data), 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26);
    locals.push(head, name, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE((3 << 8) | 30, 4); // Unix, Version 3.0
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8);
    c.writeUInt16LE(method, 10);
    c.writeUInt32LE(crc32(data), 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(((mode << 16) | (dir ? 0x10 : 0)) >>> 0, 38);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += head.length + name.length + packed.length;
  }
  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dirBuf, end]);
}

// Programmdateien eines kleinen Releases (Inhalt egal, Zeilenenden wie im echten Release: .cmd mit CRLF, sonst LF).
export function programFiles(version, extra = '') {
  return {
    'package.json': `${JSON.stringify({ name: 'tweakable-dj', version, repository: `github:${OWNER_REPO}` }, null, 2)}\n`,
    'ui.mjs': `// Oberfläche ${version}${extra}\n`,
    'dj.mjs': `// DJ ${version}\n`,
    'README.md': `# Tweakable DJ ${version}\n`,
    'Tweakable DJ.cmd': '@echo off\r\n(\r\n  node ui.mjs\r\n  pause\r\n  exit /b\r\n)\r\n',
    'Tweakable DJ.command': '#!/bin/sh\ncd "$(dirname "$0")" || exit 1\nexec /bin/sh ./start.sh\n',
    'start.sh': `#!/bin/sh\n# ${version}\nmain() { node ui.mjs; }\nmain "$@"; exit $?\n`,
    'docs/bild.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 255, 254]),
  };
}

// Release in out anlegen. files: { Pfad: Inhalt }; manifest(m): manifest.json nachträglich ändern (z. B. verbotene
// Pfade); zipFiles: Inhalt in der ZIP-Datei abweichend von files (z. B. für falsche SHA-256); zipModes: Unix-Rechte in der
// ZIP-Datei (z. B. 0o120777 = symbolischer Link); zipExtra: weitere Einträge.
// Ergebnis: { tag, manifestFile, zipFile, github (Antwortdatei für MOCK_GITHUB), url (Release-Seite) }
export function makeRelease(out, { version, files = programFiles(version), manifest, zipFiles = {}, zipModes = {}, zipExtra = [], status = 200,
  release = {}, redirect } = {}) {
  const tag = `v${version}`;
  const src = path.join(out, 'src', 'tweakable-dj');
  fs.rmSync(path.join(out, 'src'), { recursive: true, force: true });
  for (const [p, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(src, p)), { recursive: true });
    fs.writeFileSync(path.join(src, p), data);
  }
  let m = buildManifest(src, version);
  if (manifest) m = manifest(m) ?? m;
  const manifestData = Buffer.from(`${JSON.stringify(m, null, 2)}\n`);
  const all = { ...files, ...zipFiles };
  const dirs = [...new Set(Object.keys(all).flatMap(p => p.split('/').slice(0, -1).map((_, i, a) => `${a.slice(0, i + 1).join('/')}/`)))];
  const zip = buildZip([
    { name: 'tweakable-dj/' },
    ...dirs.map(d => ({ name: `tweakable-dj/${d}` })),
    ...Object.entries(all).map(([p, data]) => ({
      name: `tweakable-dj/${p}`, data, mode: zipModes[p] ?? (m.files.find(f => f.path === p)?.executable ? 0o100755 : 0o100644),
    })),
    { name: 'tweakable-dj/manifest.json', data: manifestData },
    ...zipExtra,
  ]);
  const zipName = `tweakable-dj-${tag}.zip`;
  const manifestFile = path.join(out, 'manifest.json');
  const zipFile = path.join(out, zipName);
  fs.writeFileSync(manifestFile, manifestData);
  fs.writeFileSync(zipFile, zip);
  const download = name => `https://github.com/${OWNER_REPO}/releases/download/${tag}/${name}`;
  const url = `https://github.com/${OWNER_REPO}/releases/tag/${tag}`;
  const github = path.join(out, 'github.json');
  fs.writeFileSync(github, JSON.stringify({
    status,
    body: {
      tag_name: tag, html_url: url, draft: false, prerelease: false,
      assets: [
        { name: 'manifest.json', size: manifestData.length, browser_download_url: download('manifest.json') },
        { name: zipName, size: zip.length, browser_download_url: download(zipName) },
      ],
      ...release,
    },
    downloads: { 'manifest.json': manifestFile, [zipName]: zipFile },
    ...(redirect && { redirect }),
  }, null, 2));
  return { tag, manifestFile, zipFile, github, url, manifest: m };
}
