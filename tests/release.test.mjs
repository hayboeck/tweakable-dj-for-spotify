// Tests für die Prüfung vor dem Veröffentlichen (.github/release-check.mjs, aufgerufen von .github/workflows/release.yml):
// Tag nach SemVer, Tag ↔ "version" in package.json, Abschnitt in CHANGELOG.md, Vorabversion → Pre-release, Titel und die
// früheren Releases für die Liste überholter Dateien. Ohne Netzwerk, ohne git; alles in temporären Ordnern.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { previousTags, releaseInfo, tagVersion } from '../.github/release-check.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = path.join(ROOT, '.github', 'release-check.mjs');

const section = v => `## [${v}] – 2026-10-09\n\n### English\n\n- **${v} item**: text\n\n### Deutsch\n\n- **${v} Punkt**: Text\n`;
const CHANGELOG = `# Changelog\n\n## [Unreleased]\n\n### English\n\n- **Later**: x\n\n${section('0.4.0-beta.1')}\n${section('0.3.3')}`;

test('tagVersion: v + SemVer, mit oder ohne Vorab-Kennung; sonst null', () => {
  for (const [tag, version] of [['v0.3.3', '0.3.3'], ['v0.4.0-beta.1', '0.4.0-beta.1'], ['v0.4.0-rc.1', '0.4.0-rc.1'], ['v1.0.0-alpha', '1.0.0-alpha'],
    ['v1.0.0-0.3.7', '1.0.0-0.3.7'], ['v10.20.30-x-y.1', '10.20.30-x-y.1']]) {
    assert.equal(tagVersion(tag), version, tag);
  }
  for (const tag of ['0.3.3', 'V0.3.3', 'v0.4', 'v0.4.0.1', 'v0.4.0-', 'v0.4.0-beta..1', 'v0.4.0+build.1', 'v01.2.3', 'v0.4.0-beta.01',
    'v0.4.0-beta 1', 'vx.y.z', '', undefined]) {
    assert.equal(tagVersion(tag), null, String(tag));
  }
});

test('releaseInfo: Vorabversion → prerelease und Titel mit „(Vorabversion / pre-release)“; reguläre Version wie bisher', () => {
  assert.deepEqual(releaseInfo('v0.4.0-beta.1', '0.4.0-beta.1', CHANGELOG), {
    version: '0.4.0-beta.1', prerelease: true, title: 'Tweakable DJ for Spotify v0.4.0-beta.1 (Vorabversion / pre-release)',
  });
  assert.deepEqual(releaseInfo('v0.3.3', '0.3.3', CHANGELOG), { version: '0.3.3', prerelease: false, title: 'Tweakable DJ for Spotify v0.3.3' });
  assert.equal(releaseInfo('v0.4.0-rc.1', '0.4.0-rc.1', `${CHANGELOG}\n${section('0.4.0-rc.1')}`).prerelease, true);
});

test('releaseInfo: Tag passt nicht zu package.json, ist keine SemVer-Nummer oder CHANGELOG.md hat keinen Abschnitt → Fehler', () => {
  assert.throws(() => releaseInfo('v0.4.0-beta.1', '0.3.3', CHANGELOG),
    { message: 'Tag v0.4.0-beta.1 passt nicht zu "version": "0.3.3" in package.json (erwartet: "0.4.0-beta.1").' });
  assert.throws(() => releaseInfo('v0.4.0', '0.4.0-beta.1', CHANGELOG), /passt nicht zu "version": "0\.4\.0-beta\.1"/);
  assert.throws(() => releaseInfo('v0.4.0-beta.1', undefined, CHANGELOG), /passt nicht/);
  assert.throws(() => releaseInfo('v0.4.0+build.1', '0.4.0+build.1', CHANGELOG), /ist keine Versionsnummer nach SemVer/);
  assert.throws(() => releaseInfo('release-1', '1.0.0', CHANGELOG), /ist keine Versionsnummer nach SemVer/);
  // Abschnitt fehlt ([Unreleased] allein genügt nicht) bzw. eine Sprache fehlt
  assert.throws(() => releaseInfo('v0.4.0-beta.2', '0.4.0-beta.2', CHANGELOG),
    { message: 'CHANGELOG.md hat keinen Abschnitt „## [0.4.0-beta.2] …“ mit Punkten unter „### English“.' });
  assert.throws(() => releaseInfo('v0.3.3', '0.3.3', CHANGELOG.replace('- **0.3.3 Punkt**: Text', '')), /unter „### Deutsch“/);
  assert.throws(() => releaseInfo('v0.3.3', '0.3.3', null), /CHANGELOG\.md hat keinen Abschnitt/);
});

test('previousTags: nur kleinere Versionen, Vorabversionen eingeschlossen, neuere und ungültige nicht; aufsteigend', () => {
  const tags = ['v0.3.3', 'v0.1.0', 'v0.4.0-beta.1', 'v0.4.0-beta.2', 'v0.3.4', 'v0.4.0', 'kaputt', 'v0.2.0', 'v0.2.0'];
  assert.deepEqual(previousTags('v0.4.0-beta.2', tags), ['v0.1.0', 'v0.2.0', 'v0.3.3', 'v0.3.4', 'v0.4.0-beta.1']);
  assert.deepEqual(previousTags('v0.4.0', tags), ['v0.1.0', 'v0.2.0', 'v0.3.3', 'v0.3.4', 'v0.4.0-beta.1', 'v0.4.0-beta.2']);
  // Fehlerbehebung 0.3.4 nach der Vorabversion 0.4.0-beta.1: deren Dateien sind für 0.3.4 nicht „überholt“
  assert.deepEqual(previousTags('v0.3.4', tags), ['v0.1.0', 'v0.2.0', 'v0.3.3']);
  assert.deepEqual(previousTags('v0.1.0', tags), [], 'allererstes Release');
});

test('Das Repository selbst: package.json und CHANGELOG.md passen zusammen (so wäre der Tag v<version> veröffentlichbar)', () => {
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const info = releaseInfo(`v${version}`, version, fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'));
  assert.equal(info.prerelease, version.includes('-'));
  assert.equal(info.title, `Tweakable DJ for Spotify v${version}${info.prerelease ? ' (Vorabversion / pre-release)' : ''}`);
  // Jede Version in CHANGELOG.md hat unten ihren Link aufs Release
  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert.ok(changelog.includes(`\n[${version}]: https://github.com/hayboeck/tweakable-dj-for-spotify/releases/tag/v${version}\n`), 'Link zur Version');
});

// Aufruf wie in release.yml: im Ordner des Repositorys, Ergebnis nach $GITHUB_OUTPUT; Fehler als ::error:: mit Exit-Code 1.
test('Aufruf wie im Ablauf: Ergebnis in $GITHUB_OUTPUT, Fehler mit ::error:: und Exit-Code 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj release ü-'));
  try {
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), CHANGELOG);
    const run = (version, tag, ...tags) => {
      fs.writeFileSync(path.join(dir, 'package.json'), `﻿${JSON.stringify({ name: 'tweakable-dj', version }, null, 2)}\n`);
      const out = path.join(dir, 'github-output.txt');
      fs.rmSync(out, { force: true });
      const r = spawnSync(process.execPath, [SCRIPT, tag, ...tags], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out } });
      return { status: r.status, stdout: r.stdout, output: fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null };
    };
    const beta = run('0.4.0-beta.1', 'v0.4.0-beta.1', 'v0.3.3', 'v0.4.0-beta.1', 'v0.1.0');
    assert.equal(beta.status, 0, beta.stdout);
    assert.equal(beta.output, 'version=0.4.0-beta.1\nprerelease=true\ntitle=Tweakable DJ for Spotify v0.4.0-beta.1 (Vorabversion / pre-release)\n'
      + 'previous=v0.1.0 v0.3.3\n');
    assert.equal(beta.stdout, beta.output, 'auch im Protokoll');
    const regular = run('0.3.3', 'v0.3.3', 'v0.1.0', 'v0.3.3', 'v0.4.0-beta.1');
    assert.equal(regular.output, 'version=0.3.3\nprerelease=false\ntitle=Tweakable DJ for Spotify v0.3.3\nprevious=v0.1.0\n');
    const wrong = run('0.3.3', 'v0.4.0-beta.1');
    assert.equal(wrong.status, 1);
    assert.equal(wrong.output, null, 'nichts nach $GITHUB_OUTPUT');
    assert.match(wrong.stdout, /^::error::Tag v0\.4\.0-beta\.1 passt nicht zu "version": "0\.3\.3" in package\.json/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// release.yml nutzt das Ergebnis: Prüfung zuerst, Vorabversion mit --prerelease und --latest=false, reguläre ohne; frühere
// Releases aus previous (nicht mehr alle Tags v*).
test('release.yml: Prüfung vor den Tests, Pre-release-Markierung nur für Vorabversionen, frühere Releases aus der Prüfung', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8').replace(/\r/g, '');
  const check = yml.indexOf('node .github/release-check.mjs "$GITHUB_REF_NAME" $(git tag -l \'v*\')');
  assert.ok(check > 0 && check < yml.indexOf('run: npm test'), 'Prüfung vor den Tests');
  assert.match(yml, /id: pruefung\n\s+run: node \.github\/release-check\.mjs/);
  assert.match(yml, /FRUEHER: \$\{\{ steps\.pruefung\.outputs\.previous \}\}/);
  assert.match(yml, /for frueher_tag in \$FRUEHER; do/);
  assert.match(yml, /VORAB: \$\{\{ steps\.pruefung\.outputs\.prerelease \}\}/);
  assert.match(yml, /TITEL: \$\{\{ steps\.pruefung\.outputs\.title \}\}/);
  // Drei Fälle: Release gibt es schon (Vorabversion wieder als Pre-release markiert), Vorabversion neu, reguläre neu
  const step = yml.slice(yml.indexOf('- name: Release anlegen und ZIP-Datei anhängen'));
  const [existing, pre, regular] = step.split(/\n\s+(?:elif \[ "\$VORAB" = "true" \]; then|else)\n/);
  assert.match(existing, /gh release upload "\$tag" "\$ZIP_DATEI" manifest\.json --clobber\n\s+if \[ "\$VORAB" = "true" \]; then\n\s+gh release edit "\$tag" --prerelease --latest=false/);
  assert.match(pre, /gh release create "\$tag" "\$ZIP_DATEI" manifest\.json[\s\\]+--title "\$TITEL"[\s\\]+--generate-notes[\s\\]+--verify-tag[\s\\]+--prerelease[\s\\]+--latest=false$/);
  assert.match(regular, /gh release create "\$tag" "\$ZIP_DATEI" manifest\.json[\s\\]+--title "\$TITEL"[\s\\]+--generate-notes[\s\\]+--verify-tag\n\s+fi/);
  assert.doesNotMatch(regular, /prerelease|latest/);
  assert.doesNotMatch(yml, /case "\$tag" in \*-\*\)/, 'kein Raten am Bindestrich mehr');
});
