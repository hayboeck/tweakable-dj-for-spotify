#!/usr/bin/env node
// Legt manifest.json für ein Release an (aufgerufen von .github/workflows/release.yml, kurz vor dem Packen der ZIP-Datei):
//   node .github/release-manifest.mjs <Ordner> <Version> [<Ordner eines früheren Releases> …]
// Ergebnis: <Ordner>/manifest.json mit der Version und allen Dateien des Ordners (Pfad, Größe, SHA-256, ausführbar), dazu
// obsolete: Dateien früherer Releases (je ein entpackter Ordner, release.yml legt sie per git archive der Tags an), die es in
// diesem nicht mehr gibt, mit dem SHA-256 jeder veröffentlichten Fassung. „Jetzt aktualisieren“ löscht sie nur, wenn sie genau
// so im Programmordner liegen (install-update.mjs).
// Die Liste ist die Erlaubnisliste für „Jetzt aktualisieren“ (install-update.mjs): Nur diese Dateien schreibt ein Update.
// Sie wird hier mit denselben Regeln geprüft wie beim Update (keine persönlichen Dateien, keine Pfade außerhalb), damit
// nie ein Release entsteht, das jedes Update ablehnen müsste.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST, checkManifest, pathProblem } from '../install-update.mjs';

// Startdateien für Mac und Linux: im Release immer ausführbar (der Ablauf setzt chmod +x).
const EXECUTABLE = ['start.sh', 'Tweakable DJ.command'];

const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

// Alle Dateien unter root: [{ path, data }] (ohne manifest.json). Links: Fehler bzw. (lenient, frühere Releases) übergangen.
function listFiles(root, { lenient = false } = {}) {
  const out = [];
  const walk = rel => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        if (lenient) continue;
        throw new Error(`Symbolischer Link im Release: ${p}`);
      }
      if (entry.isDirectory()) walk(p);
      else if (p !== MANIFEST) out.push({ path: p, data: fs.readFileSync(path.join(root, p)) });
    }
  };
  walk('');
  return out;
}

// previous: Ordner früherer Releases (fehlende werden übergangen, z. B. beim allerersten Release).
export function buildManifest(dir, version, previous = []) {
  // ausführbar nur laut Liste, nicht nach den Rechten im Ordner (die hängen davon ab, wo er entpackt wurde)
  const files = listFiles(dir).map(f => ({ path: f.path, size: f.data.length, sha256: sha256(f.data), executable: EXECUTABLE.includes(f.path) }))
    .sort(byPath);
  const current = new Set(files.map(f => f.path.toLowerCase()));
  const old = new Map();
  for (const prev of previous) {
    if (!fs.existsSync(prev) || !fs.statSync(prev).isDirectory()) continue;
    for (const f of listFiles(prev, { lenient: true })) {
      // Was es (in irgendeiner Schreibweise) noch gibt, ersetzt das Update ohnehin; persönliche und unzulässige Pfade nie.
      if (current.has(f.path.toLowerCase()) || pathProblem(f.path)) continue;
      if (!old.has(f.path)) old.set(f.path, new Set());
      old.get(f.path).add(sha256(f.data));
    }
  }
  const obsolete = [...old].map(([p, hashes]) => ({ path: p, sha256: [...hashes].sort() })).sort(byPath);
  const manifest = { name: 'tweakable-dj', version, files, obsolete };
  checkManifest(manifest, version, 'en'); // wirft z. B. bei config.jsonc oder einem Pfad mit ..
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, version, ...previous] = process.argv.slice(2);
  if (!dir || !version) {
    console.error('Aufruf: node .github/release-manifest.mjs <Ordner> <Version>');
    process.exit(2);
  }
  const manifest = buildManifest(dir, version, previous);
  fs.writeFileSync(path.join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${MANIFEST}: Version ${version}, ${manifest.files.length} Dateien`);
  for (const f of manifest.files) console.log(`  ${f.sha256.slice(0, 12)}  ${String(f.size).padStart(7)}${f.executable ? ' x' : '  '}  ${f.path}`);
  console.log(`Überholte Dateien früherer Releases (obsolete): ${manifest.obsolete.length}`);
  for (const o of manifest.obsolete) console.log(`  ${o.sha256.length}× ${o.path}`);
}
