#!/usr/bin/env node
// Legt manifest.json für ein Release an (aufgerufen von .github/workflows/release.yml, kurz vor dem Packen der ZIP-Datei):
//   node .github/release-manifest.mjs <Ordner> <Version>
// Ergebnis: <Ordner>/manifest.json mit der Version und allen Dateien des Ordners (Pfad, Größe, SHA-256, ausführbar).
// Die Liste ist die Erlaubnisliste für „Jetzt aktualisieren“ (install-update.mjs): Nur diese Dateien schreibt ein Update.
// Sie wird hier mit denselben Regeln geprüft wie beim Update (keine persönlichen Dateien, keine Pfade außerhalb), damit
// nie ein Release entsteht, das jedes Update ablehnen müsste.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST, checkManifest } from '../install-update.mjs';

// Startdateien für Mac und Linux: im Release immer ausführbar (der Ablauf setzt chmod +x).
const EXECUTABLE = ['start.sh', 'Tweakable DJ.command'];

export function buildManifest(dir, version) {
  const files = [];
  const walk = rel => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Symbolischer Link im Release: ${p}`);
      if (entry.isDirectory()) walk(p);
      else if (p !== MANIFEST) {
        // ausführbar nur laut Liste, nicht nach den Rechten im Ordner (die hängen davon ab, wo er entpackt wurde)
        const data = fs.readFileSync(path.join(dir, p));
        files.push({ path: p, size: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex'),
          executable: EXECUTABLE.includes(p) });
      }
    }
  };
  walk('');
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const manifest = { name: 'tweakable-dj', version, files };
  checkManifest(manifest, version, 'en'); // wirft z. B. bei config.jsonc oder einem Pfad mit ..
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, version] = process.argv.slice(2);
  if (!dir || !version) {
    console.error('Aufruf: node .github/release-manifest.mjs <Ordner> <Version>');
    process.exit(2);
  }
  const manifest = buildManifest(dir, version);
  fs.writeFileSync(path.join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${MANIFEST}: Version ${version}, ${manifest.files.length} Dateien`);
  for (const f of manifest.files) console.log(`  ${f.sha256.slice(0, 12)}  ${String(f.size).padStart(7)}${f.executable ? ' x' : '  '}  ${f.path}`);
}
