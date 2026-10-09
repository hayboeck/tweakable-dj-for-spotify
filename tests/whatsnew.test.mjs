// „Neu in v0.x.y“ (whatsnew.mjs): Punkte aus CHANGELOG.md und wann der Hinweis erscheint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  changesSince, MAX_ITEMS, OLDER_ITEMS, SEEN_FILE, TOTAL_ITEMS, markSeen, parseChangelog, seenVersion, shortItem, updatedFrom, whatsNew,
} from '../whatsnew.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const CHANGELOG = `# Changelog

## [Unreleased]

### English

- **Not yet released**: nothing to show.

## [0.3.0] – 2026-10-08

### English

**New**

- **Heart in the test run**: next to the ×, every song has a ♥.
- After a run, the output says e.g. *34 artists*. More text follows here.
- **Restore previous playlist**: a button below the output.
  - an indented detail that doesn’t count

**Fixed**

- **\`Update now\`** works without a window.

### Deutsch

**Neu**

- **Herz im Probelauf**: Neben dem × hat jeder Song ein ♥.
- **Vorige Playlist wiederherstellen**: ein Button unter der Ausgabe.

## [0.2.4] – 2026-10-07

### English

- Only sentences here, z. B. with an abbreviation: and more. Second sentence.
- A very long sentence ${'without any end '.repeat(12)}.

### Deutsch

- Nur Sätze, z. B. mit Abkürzung. Zweiter Satz.
`;

test('parseChangelog: fett gedruckte Stichworte der Version, deutsch bzw. sonst englisch', () => {
  assert.deepEqual(parseChangelog(CHANGELOG, '0.3.0', 'en'),
    { items: ['Heart in the test run', 'Restore previous playlist', 'Update now'], more: 0 }, 'nur die Punkte mit Stichwort');
  assert.deepEqual(parseChangelog(CHANGELOG, '0.3.0', 'de'), { items: ['Herz im Probelauf', 'Vorige Playlist wiederherstellen'], more: 0 });
  for (const lang of ['es', 'fr', undefined]) assert.deepEqual(parseChangelog(CHANGELOG, '0.3.0', lang), parseChangelog(CHANGELOG, '0.3.0', 'en'), String(lang));
  assert.deepEqual(parseChangelog(CHANGELOG, 'v0.3.0', 'en').items[0], 'Heart in the test run', 'mit v davor');
  // Ohne Stichworte: der erste Satz (Abkürzungen beenden ihn nicht), lange gekürzt
  const old = parseChangelog(CHANGELOG, '0.2.4', 'en');
  assert.equal(old.items[0], 'Only sentences here, z. B. with an abbreviation');
  assert.ok(old.items[1].length <= 120 && old.items[1].endsWith('…'), old.items[1]);
  assert.deepEqual(parseChangelog(CHANGELOG, '0.2.4', 'de').items, ['Nur Sätze, z. B. mit Abkürzung']);
  // Fehlt etwas: null
  assert.equal(parseChangelog(CHANGELOG, '0.9.9', 'en'), null);
  assert.equal(parseChangelog(CHANGELOG, 'Unreleased', 'en'), null, 'keine Versionsnummer');
  assert.equal(parseChangelog(CHANGELOG.replace(/### Deutsch[\s\S]*?(?=## \[0\.2\.4\])/, ''), '0.3.0', 'de'), null, 'Abschnitt fehlt');
  assert.equal(parseChangelog(null, '0.3.0', 'en'), null);
  // Höchstens MAX_ITEMS, Rest als Anzahl
  const many = `## [1.0.0]\n\n### English\n\n${Array.from({ length: 8 }, (_, i) => `- **Item ${i + 1}**: text`).join('\n')}\n`;
  assert.deepEqual(parseChangelog(many, '1.0.0', 'en'), { items: Array.from({ length: MAX_ITEMS }, (_, i) => `Item ${i + 1}`), more: 3 });
  assert.equal(parseChangelog(many.replace(/\r?\n/g, '\r\n'), '1.0.0', 'en').more, 3, 'Windows-Zeilenenden');
});

test('shortItem: Markdown weg, Stichwort bzw. erster Satz', () => {
  assert.equal(shortItem('- **Archive status**: under *Archived playlists* …'), 'Archive status');
  assert.equal(shortItem('- After a run, the output says when older playlists were removed, e.g. *Removed the 5 oldest*. More.'),
    'After a run, the output says when older playlists were removed, e.g. Removed the 5 oldest');
  assert.equal(shortItem('- `@@RESULT` has the new field `archiveFile`.'), '@@RESULT has the new field archiveFile');
  assert.equal(shortItem('- See [the README](README.md): it explains it.'), 'See the README');
});

// (auch Vorabversionen wie [0.4.0-beta.1])
test('Die echte CHANGELOG.md: jede veröffentlichte Version hat Punkte auf Deutsch und Englisch', () => {
  const text = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const versions = [...text.matchAll(/^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]/gm)].map(m => m[1]);
  assert.ok(versions.includes(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version), 'Abschnitt zur Version in package.json');
  assert.ok(versions.length >= 5, versions.join());
  for (const v of versions) {
    for (const lang of ['de', 'en']) {
      const notes = parseChangelog(text, v, lang);
      assert.ok(notes?.items.length > 0, `${v} ${lang}`);
      assert.ok(notes.items.every(i => i.length <= 120 && !/[*`]/.test(i)), `${v} ${lang}: ${notes.items.join(' | ')}`);
    }
  }
});

function withDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj neu ü-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}
const backup = (dir, from, to) => {
  const b = path.join(dir, '.update', `backup-${from}`);
  fs.mkdirSync(b, { recursive: true });
  fs.writeFileSync(path.join(b, 'backup.json'), JSON.stringify({ from, to, createdAt: '2026-10-08T10:00:00Z', replaced: [], added: [] }));
};
const show = (dir, current = '0.3.0', lang = 'de') => whatsNew({ dir, current, lang, changelog: CHANGELOG, slug: 'owner/repo' });

test('whatsNew: allererster Start nichts; nach einem Update einmal, bis geschlossen', () => withDir(dir => {
  assert.equal(show(dir), null, 'allererster Start');
  assert.equal(seenVersion(dir), '0.3.0', 'ab jetzt gemerkt');
  assert.equal(show(dir), null, 'dieselbe Version');

  // Update auf eine neuere Version (Datei sagt 0.2.4)
  markSeen(dir, '0.2.4');
  assert.deepEqual(show(dir), {
    version: '0.3.0', previous: '0.2.4', items: ['Herz im Probelauf', 'Vorige Playlist wiederherstellen'], more: 0,
    sections: [{ version: '0.3.0', items: ['Herz im Probelauf', 'Vorige Playlist wiederherstellen'] }],
    url: 'https://github.com/owner/repo/releases/tag/v0.3.0',
  });
  assert.equal(show(dir, '0.3.0', 'fr').items[0], 'Heart in the test run');
  assert.equal(seenVersion(dir), '0.2.4', 'Anzeigen allein merkt nichts');
  assert.ok(markSeen(dir, '0.3.0'));
  assert.equal(show(dir), null, 'geschlossen: kommt nicht wieder');
  assert.equal(show(dir, '0.2.4'), null, 'zurück auf eine ältere Version: nichts');

  // Version ohne Punkte in CHANGELOG.md: nichts, gilt als gesehen
  markSeen(dir, '0.2.4');
  assert.equal(show(dir, '0.9.9'), null);
  assert.equal(seenVersion(dir), '0.9.9');
  // Ohne Repository kein Link
  markSeen(dir, '0.2.4');
  assert.equal(whatsNew({ dir, current: '0.3.0', lang: 'en', changelog: CHANGELOG, slug: null }).url, null);
  // Kaputte Datei bzw. ungültige Version = keine gemerkte
  fs.writeFileSync(path.join(dir, SEEN_FILE), '{ kaputt');
  assert.equal(seenVersion(dir), null);
  assert.equal(whatsNew({ dir, current: null, lang: 'de', changelog: CHANGELOG }), null);
  assert.equal(markSeen(dir, 'neu'), false);
}));

test('whatsNew: erstes Update auf eine Version mit Hinweis – vorige Version aus .update/backup-*/backup.json', () => withDir(dir => {
  backup(dir, '0.2.4', '0.3.0');
  backup(dir, '0.2.3', '0.2.4'); // älteres Update auf eine andere Version zählt nicht
  assert.equal(updatedFrom(dir, '0.3.0'), '0.2.4');
  assert.equal(updatedFrom(dir, '0.2.4'), '0.2.3');
  assert.equal(updatedFrom(dir, '0.4.0'), null);
  const w = show(dir);
  assert.deepEqual([w.version, w.previous], ['0.3.0', '0.2.4']);
  assert.equal(fs.existsSync(path.join(dir, SEEN_FILE)), false, 'erst beim Schließen gemerkt');
  markSeen(dir, '0.3.0');
  assert.equal(show(dir), null);
  // Kaputte Sicherung: zählt nicht
  withDir(other => {
    fs.mkdirSync(path.join(other, '.update', 'backup-x'), { recursive: true });
    fs.writeFileSync(path.join(other, '.update', 'backup-x', 'backup.json'), '{ kaputt');
    assert.equal(updatedFrom(other, '0.3.0'), null);
    assert.equal(show(other), null, 'wie ein allererster Start');
  });
}));

test('changesSince: Update über mehrere Versionen – Punkte aller Versionen dazwischen, neueste zuerst, begrenzt', () => {
  const version = (v, n) => `## [${v}] – 2026-10-0${n}\n\n### English\n\n${Array.from({ length: n }, (_, i) => `- **${v} item ${i + 1}**: text`).join('\n')}\n\n### Deutsch\n\n- **${v} Punkt**: Text\n`;
  const text = `# Changelog\n\n## [Unreleased]\n\n### English\n\n- **Not yet**: x\n\n${version('0.3.3', 6)}\n${version('0.3.2', 2)}\n${version('0.3.1', 4)}\n${version('0.3.0', 5)}\n${version('0.2.5', 3)}`;
  const r = changesSince(text, '0.2.5', '0.3.3', 'en');
  assert.deepEqual(r.sections.map(x => [x.version, x.items.length]), [['0.3.3', MAX_ITEMS], ['0.3.2', 2], ['0.3.1', OLDER_ITEMS], ['0.3.0', OLDER_ITEMS]],
    'neueste zuerst, 0.2.5 (die vorige) nicht');
  assert.equal(r.items.length, MAX_ITEMS + 2 + 2 * OLDER_ITEMS);
  assert.ok(r.items.length <= TOTAL_ITEMS);
  assert.equal(r.more, 1 + 0 + (4 - OLDER_ITEMS) + (5 - OLDER_ITEMS), 'nicht gezeigte Punkte');
  // Zusammen höchstens TOTAL_ITEMS: viele Versionen mit vielen Punkten
  const many = Array.from({ length: 9 }, (_, i) => version(`1.0.${i}`, 6)).reverse().join('\n');
  const capped = changesSince(many, '0.9.0', '1.0.8', 'en');
  assert.equal(capped.items.length, TOTAL_ITEMS);
  assert.deepEqual(r.items.slice(0, 2), ['0.3.3 item 1', '0.3.3 item 2']);
  assert.deepEqual(changesSince(text, '0.3.2', '0.3.3', 'de'), { sections: [{ version: '0.3.3', items: ['0.3.3 Punkt'] }], items: ['0.3.3 Punkt'], more: 0 });
  assert.equal(changesSince(text, '0.3.3', '0.3.3', 'en'), null, 'nichts Neues');
  // whatsNew: von 0.2.5 auf 0.3.3 → mehrere Abschnitte
  withDir(dir => {
    markSeen(dir, '0.2.5');
    const w = whatsNew({ dir, current: '0.3.3', lang: 'en', changelog: text, slug: 'owner/repo' });
    assert.deepEqual([w.version, w.previous, w.sections.length, w.url], ['0.3.3', '0.2.5', 4, 'https://github.com/owner/repo/releases/tag/v0.3.3']);
  });
});

// Vorabversionen: eigener Abschnitt „## [0.4.0-beta.1] – Datum“; die reguläre Version (0.4.0) hat einen vollständigen eigenen
// Abschnitt, die ihrer Vorabversionen zählen dann nicht mehr (whatsnew.mjs, oben).
test('Vorabversion: „Neu in v0.4.0-beta.1“ aus ihrem Abschnitt; reguläre Version ohne die Vorab-Abschnitte; gemerkte Vorabversion', () => {
  const version = (v, n = 2) => `## [${v}] – 2026-10-09\n\n### English\n\n${Array.from({ length: n }, (_, i) => `- **${v} item ${i + 1}**: text`).join('\n')}\n\n### Deutsch\n\n- **${v} Punkt**: Text\n`;
  const text = `# Changelog\n\n## [Unreleased]\n\n${['0.5.0-beta.1', '0.4.0', '0.4.0-rc.1', '0.4.0-beta.2', '0.4.0-beta.1', '0.3.3'].map(v => version(v)).join('\n')}`;
  const shown = (previous, current, lang = 'en') => withDir(dir => {
    markSeen(dir, previous);
    const w = whatsNew({ dir, current, lang, changelog: text, slug: 'owner/repo' });
    return w && { version: w.version, previous: w.previous, sections: w.sections.map(x => x.version), url: w.url, first: w.items[0] };
  });
  assert.deepEqual(parseChangelog(text, '0.4.0-beta.1', 'de'), { items: ['0.4.0-beta.1 Punkt'], more: 0 });
  // Von der regulären 0.3.3 auf die Vorabversion (von Hand, mit kopierter seen-version.json)
  assert.deepEqual(shown('0.3.3', '0.4.0-beta.1'), {
    version: '0.4.0-beta.1', previous: '0.3.3', sections: ['0.4.0-beta.1'], url: 'https://github.com/owner/repo/releases/tag/v0.4.0-beta.1',
    first: '0.4.0-beta.1 item 1',
  });
  assert.deepEqual(shown('0.3.3', '0.4.0-beta.2').sections, ['0.4.0-beta.2', '0.4.0-beta.1'], 'frühere Vorabversion derselben Nummer dazu');
  assert.deepEqual(shown('0.4.0-beta.1', '0.4.0-beta.2').sections, ['0.4.0-beta.2'], 'gesehene Vorabversion nicht noch einmal');
  // Reguläre Version: nur ihr eigener Abschnitt, auch nach einer Vorabversion
  assert.deepEqual(shown('0.3.3', '0.4.0').sections, ['0.4.0']);
  assert.deepEqual(shown('0.4.0-rc.1', '0.4.0').sections, ['0.4.0']);
  assert.deepEqual(shown('0.3.3', '0.5.0-beta.1').sections, ['0.5.0-beta.1', '0.4.0'], 'Vorab-Abschnitte anderer Nummern nie');
  // Zurück von der Vorabversion auf eine ältere reguläre: nichts
  assert.equal(shown('0.4.0-beta.1', '0.3.3'), null);
  // Vorabversion ohne eigenen Abschnitt: nichts (auch nicht der der regulären oder [Unreleased]), gilt als gesehen
  withDir(dir => {
    markSeen(dir, '0.3.3');
    assert.equal(whatsNew({ dir, current: '0.4.0-beta.3', lang: 'en', changelog: text, slug: 'owner/repo' }), null);
    assert.equal(seenVersion(dir), '0.4.0-beta.3', 'gemerkte Version mit Vorab-Kennung');
    assert.equal(whatsNew({ dir, current: '0.4.0-beta.2', lang: 'en', changelog: text }), null, '0.4.0-beta.2 < 0.4.0-beta.3');
  });
  // „Jetzt aktualisieren“ von der Vorabversion auf die reguläre: vorige Version aus .update/backup-0.4.0-beta.1
  withDir(dir => {
    backup(dir, '0.4.0-beta.1', '0.4.0');
    assert.equal(updatedFrom(dir, '0.4.0'), '0.4.0-beta.1');
    const w = whatsNew({ dir, current: '0.4.0', lang: 'de', changelog: text, slug: 'owner/repo' });
    assert.deepEqual([w.version, w.previous, w.sections.map(x => x.version)], ['0.4.0', '0.4.0-beta.1', ['0.4.0']]);
  });
});
