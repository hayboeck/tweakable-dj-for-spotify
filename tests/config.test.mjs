// Unit-Tests für config.mjs: Prüfung der Einstellungen, Spracheinstellung, Vorlagen je Sprache und Speichern in eine
// ältere config.jsonc (fehlende Schlüssel kommen samt Erklärung aus der Vorlage dazu, alles andere bleibt, wie es ist).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  checkValue, checkValues, DEFAULTS, LIMITS, missingCredentials, stripComments, VARIETY_KEYS, VARIETY_LEVELS, varietyLevel,
} from '../config.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEMPLATES = { en: 'config.example.jsonc', de: 'config.example.de.jsonc' };

// So sah eine config.jsonc vor der Automatik aus.
const OLD_CONFIG = `// Einstellungen für Mein DJ. Alles hinter // ist ein Kommentar und wird ignoriert.
{
  // --- Zugangsdaten und Quelle ---
  "spotify": { "clientId": "0123456789abcdef0123456789abcdef" },                       // Client ID aus dem Spotify Developer Dashboard
  "lastfm": { "apiKey": "fedcba9876543210fedcba9876543210", "user": "testhoerer" },  // Last.fm-API-Key und dein Last.fm-Name
  "seed": "liked",                    // Woher deine Favoriten kommen

  // --- Keine Wiederholungen ---
  "excludeRecentDays": 14,            // Songs, die du in so vielen Tagen gehört hast, kommen nicht hinein
  "noRepeatRuns": 3,                  // Songs aus so vielen vorigen Läufen kommen nicht hinein

  // --- Sperrliste ---
  "blockedArtists": ["Künstler A"]    // Künstler, die nie gespielt werden
}
`;

const SCHEDULE = { schedule: 'weekly', scheduleTime: '06:30', scheduleDay: 'FRI' };

// Kopie von config.mjs + Vorlagen in einem eigenen Ordner, damit die echte config.jsonc unberührt bleibt.
// text = null: ohne config.jsonc.
async function withConfig(text, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-'));
  try {
    for (const f of ['config.mjs', 'files.mjs', 'i18n.mjs', 'lineup.mjs', ...Object.values(TEMPLATES)]) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    if (text !== null) fs.writeFileSync(path.join(dir, 'config.jsonc'), text);
    const config = await import(pathToFileURL(path.join(dir, 'config.mjs')).href);
    await fn(config, () => fs.readFileSync(path.join(dir, 'config.jsonc'), 'utf8'), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Spanisch und Französisch haben keine eigene Vorlage, sie nehmen die englische.
const readTemplate = lang => fs.readFileSync(path.join(ROOT, TEMPLATES[lang] ?? TEMPLATES.en), 'utf8');

test('Automatik-Einstellungen: Standard und Prüfung', () => {
  assert.equal(DEFAULTS.schedule, 'off');
  assert.equal(DEFAULTS.scheduleTime, '07:00');
  assert.equal(DEFAULTS.scheduleDay, 'MON');
  for (const v of ['off', 'daily', 'weekly']) assert.equal(checkValue('schedule', v), v);
  for (const v of ['00:00', '07:05', '23:59']) assert.equal(checkValue('scheduleTime', v), v);
  for (const v of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']) assert.equal(checkValue('scheduleDay', v), v);
  for (const v of ['hourly', 'Daily', '', 1]) assert.throws(() => checkValue('schedule', v), /schedule/);
  for (const v of ['7:00', '24:00', '12:60', '07:00:00', ' 07:00', '', 700]) assert.throws(() => checkValue('scheduleTime', v), /scheduleTime/);
  for (const v of ['Mo', 'mon', 'MONTAG', '', 1]) assert.throws(() => checkValue('scheduleDay', v), /scheduleDay/);
  assert.deepEqual(checkValues(SCHEDULE), SCHEDULE);
  assert.throws(() => checkValues({ scheduleZeit: '07:00' }, 'de'), /^Error: Unbekannte Einstellung: scheduleZeit$/);
  assert.throws(() => checkValues({ scheduleZeit: '07:00' }, 'en'), /^Error: Unknown setting: scheduleZeit$/);
});

test('Namen aus Object.prototype sind weder Einstellung noch Feld des Assistenten', () => withConfig(null, config => {
  for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const body = JSON.parse(`{"${key}": {"schedule": "daily"}}`);
    assert.throws(() => config.checkValues(body, 'en'), new RegExp(`^Error: Unknown setting: ${key}$`));
    assert.throws(() => config.saveCredentials(JSON.parse(`{"${key}": "x"}`), 'en'), new RegExp(`^Error: Unknown field: ${key}$`));
  }
}));

test('Spracheinstellung: Standard "", gültig "", "de", "en", "es", "fr"; Meldungen in allen Sprachen', () => {
  assert.equal(DEFAULTS.language, '');
  assert.equal(DEFAULTS.playlistName, 'Tweakable DJ');
  for (const v of ['', 'de', 'en', 'es', 'fr']) assert.equal(checkValue('language', v), v);
  for (const v of ['it', 'DE', 'FR', 'es-ES', 'fr_FR', ' en', null, 1, true]) {
    assert.throws(() => checkValue('language', v, 'de'), /^Error: language: "de", "en", "es", "fr" oder "" erwartet$/, String(v));
    assert.throws(() => checkValue('language', v, 'en'), /^Error: language: expected "de", "en", "es", "fr" or ""$/, String(v));
    assert.throws(() => checkValue('language', v, 'es'), /^Error: language: se esperaba "de", "en", "es", "fr" o ""$/, String(v));
    assert.throws(() => checkValue('language', v, 'fr'), /^Error: language : "de", "en", "es", "fr" ou "" attendu$/, String(v));
  }
  assert.deepEqual(checkValues({ language: 'fr', size: 40 }), { language: 'fr', size: 40 });
  assert.deepEqual(checkValues({ language: 'en', size: 40 }), { language: 'en', size: 40 });
  assert.throws(() => checkValue('size', 'viel', 'de'), /^Error: size in config\.jsonc muss eine ganze Zahl von 1 bis 500 sein \(derzeit "viel"\)\.$/);
  assert.throws(() => checkValue('size', 'viel', 'en'), /^Error: size in config\.jsonc must be a whole number from 1 to 500 \(currently "viel"\)\.$/);
  assert.throws(() => checkValue('useLastfmTopTracks', 'ja', 'en'), /^Error: useLastfmTopTracks: expected boolean$/);
});

// Ansicht „Einfach“ / „Pro“: neue Nutzer (Vorlage) starten mit „Einfach“, eine config.jsonc ohne mode (ältere Version) mit „Pro“.
test('Ansicht mode: simple oder pro; neu aus der Vorlage simple, bestehende config.jsonc ohne mode pro', async () => {
  assert.equal(DEFAULTS.mode, 'simple');
  for (const v of ['simple', 'pro']) assert.equal(checkValue('mode', v), v);
  assert.throws(() => checkValue('mode', 'expert', 'en'), /^Error: mode: expected one of simple, pro$/);
  for (const lang of ['de', 'en']) {
    // Neu: config.jsonc fehlt und wird aus der Vorlage angelegt
    await withConfig(null, async ({ readConfig, updateConfig }) => {
      updateConfig({ language: lang }, lang);
      assert.equal(readConfig(lang).mode, 'simple', `${lang}: neu`);
    });
  }
  // Bestehend (ohne mode): pro; Speichern fügt die Zeile samt Erklärung aus der Vorlage ein
  await withConfig('{\n  "playlistName": "Mix",\n  "language": "de"\n}\n', async ({ readConfig, updateConfig }, read) => {
    assert.equal(readConfig('de').mode, 'pro');
    updateConfig({ mode: 'simple' }, 'de');
    assert.equal(readConfig('de').mode, 'simple');
    assert.match(read(), /"mode": "simple", +\/\/ Ansicht des Tabs Playlist/);
    updateConfig({ mode: 'pro' }, 'de');
    assert.equal(readConfig('de').mode, 'pro');
  });
});

test('Aussehen: theme und accent nur aus den Listen, Standard System und Grün', () => {
  assert.deepEqual([DEFAULTS.theme, DEFAULTS.accent], ['system', 'green']);
  for (const v of ['system', 'light', 'dark']) assert.equal(checkValue('theme', v), v);
  for (const v of ['blue', 'teal', 'gold']) assert.equal(checkValue('accent', v), v);
  assert.throws(() => checkValue('accent', 'lila', 'en'), /^Error: accent: expected one of green, blue, violet, pink, red, orange, gold, teal$/);
  assert.throws(() => checkValue('theme', 'Dark', 'de'), /^Error: theme: einer von system, light, dark erwartet$/);
  assert.throws(() => checkValue('theme', 1, 'en'), /^Error: theme: expected string$/);
});

test('Zahlenwerte: Grenzen aus LIMITS, ganze Zahlen, Meldung mit Schlüssel, Bereich, Datei und Wert', () => {
  const numbers = Object.keys(DEFAULTS).filter(k => typeof DEFAULTS[k] === 'number');
  assert.deepEqual(Object.keys(LIMITS).sort(), numbers.sort(), 'jeder Zahlenwert hat genau einen Eintrag');
  for (const [key, l] of Object.entries(LIMITS)) {
    assert.ok(l.min <= DEFAULTS[key] && DEFAULTS[key] <= l.max, `${key}: Standard im erlaubten Bereich`);
    assert.ok(l.min <= l.slider[0] && l.slider[0] < l.slider[1] && l.slider[1] <= l.max, `${key}: Regler im erlaubten Bereich`);
    assert.ok(l.step > 0 && (!l.int || Number.isInteger(l.step)), `${key}: Schrittweite`);
    for (const v of [l.min, l.max, DEFAULTS[key], ...l.slider]) assert.equal(checkValue(key, v), v, `${key} = ${v}`);
    const message = new RegExp(`^Error: ${key} in config\\.jsonc must be a ${l.int ? 'whole number' : 'number'} from ${l.min} to ${l.max} \\(currently .+\\)\\.$`);
    const bad = [l.min - 1, l.min - 0.01, l.max + 1, l.max * 10, NaN, Infinity, null, String(DEFAULTS[key]), true, [], {}, ...(l.int ? [l.min + 0.5] : [])];
    for (const v of bad) assert.throws(() => checkValue(key, v, 'en'), message, `${key} = ${v}`);
  }
  // Bewusst so: 0 = aus bei Abstand, Sperren und Zeitraum „aktuell“, 1 = aus beim Faktor; Anteile von 0 bis 1
  assert.deepEqual(Object.fromEntries(Object.entries(LIMITS).map(([k, l]) => [k, l.min])), {
    size: 1, familiarShare: 0, adventure: 0, seedsPerRun: 1, followedArtists: -1, preferNewer: -1, currentDays: 0, currentFactor: 1, maxPerArtist: 1,
    artistWindow: 1, maxPerWindow: 1, artistGap: 0, excludeRecentDays: 0, noRepeatRuns: 0, archiveCount: 0,
  });
  // Archiv: Standard 20, 0 = aus, höchstens 200
  assert.deepEqual([DEFAULTS.archiveCount, LIMITS.archiveCount.max], [20, 200]);
  assert.deepEqual([LIMITS.familiarShare.max, LIMITS.adventure.max, LIMITS.size.max], [1, 1, 500]);
  assert.deepEqual(Object.keys(LIMITS).filter(k => !LIMITS[k].int), ['familiarShare', 'adventure', 'followedArtists', 'preferNewer', 'currentFactor']);
  // Neuere / ältere Songs: −1 bis +1, 0 = egal (Standard, Verhalten wie bisher)
  assert.deepEqual([DEFAULTS.preferNewer, LIMITS.preferNewer.min, LIMITS.preferNewer.max], [0, -1, 1]);
  // Gefolgte Künstler: −1 bis +1, 0 = egal (Standard), Kommazahlen erlaubt
  assert.deepEqual([DEFAULTS.followedArtists, LIMITS.followedArtists.min, LIMITS.followedArtists.max], [0, -1, 1]);
  assert.equal(checkValue('followedArtists', -0.25), -0.25);
  assert.equal(checkValue('currentFactor', 2.5), 2.5);
  // Wortlaut in beiden Sprachen
  assert.throws(() => checkValue('size', 0, 'en'), /^Error: size in config\.jsonc must be a whole number from 1 to 500 \(currently 0\)\.$/);
  assert.throws(() => checkValue('size', 0, 'de'), /^Error: size in config\.jsonc muss eine ganze Zahl von 1 bis 500 sein \(derzeit 0\)\.$/);
  assert.throws(() => checkValue('familiarShare', 15, 'de'), /^Error: familiarShare in config\.jsonc muss eine Zahl von 0 bis 1 sein \(derzeit 15\)\.$/);
  assert.throws(() => checkValue('maxPerWindow', 2.5, 'en'), /^Error: maxPerWindow in config\.jsonc must be a whole number from 1 to 100 \(currently 2\.5\)\.$/);
  assert.throws(() => checkValues({ size: 40, artistWindow: 0 }, 'en'), /^Error: artistWindow in config\.jsonc must be a whole number from 1 to 100/);
});

test('Abwechslung bei Künstlern: Stufen setzen die vier Werte, mittel = Standard, sonst eigene Einstellung', () => {
  assert.deepEqual(VARIETY_KEYS, ['maxPerArtist', 'artistWindow', 'maxPerWindow', 'artistGap']);
  assert.deepEqual(VARIETY_LEVELS.map(l => l.id), ['low', 'medium', 'high', 'veryHigh']);
  // Jede Stufe setzt genau die vier Werte, alle im erlaubten Bereich
  for (const { id, values } of VARIETY_LEVELS) {
    assert.deepEqual(Object.keys(values), VARIETY_KEYS, id);
    for (const [k, v] of Object.entries(values)) assert.equal(checkValue(k, v), v, `${id}: ${k}`);
    assert.equal(varietyLevel({ ...DEFAULTS, ...values }), id);
  }
  // Mittlere Stufe = heutige Standardwerte: für Leute mit Standardwerten ändert sich nichts
  assert.deepEqual(VARIETY_LEVELS[1].values, { maxPerArtist: 2, artistWindow: 20, maxPerWindow: 3, artistGap: 4 });
  assert.deepEqual(VARIETY_LEVELS[1].values, Object.fromEntries(VARIETY_KEYS.map(k => [k, DEFAULTS[k]])));
  assert.equal(varietyLevel(DEFAULTS), 'medium');
  // Je höher die Stufe, desto strenger (oder gleich) jede einzelne Regel
  for (let i = 1; i < VARIETY_LEVELS.length; i++) {
    const [a, b] = [VARIETY_LEVELS[i - 1].values, VARIETY_LEVELS[i].values];
    assert.ok(b.maxPerArtist <= a.maxPerArtist && b.artistGap >= a.artistGap, VARIETY_LEVELS[i].id);
    assert.ok(b.maxPerWindow / b.artistWindow <= a.maxPerWindow / a.artistWindow, VARIETY_LEVELS[i].id);
    assert.notDeepEqual(a, b);
  }
  // Eigene Werte (z. B. maxPerArtist 3, Rest Standard) passen zu keiner Stufe; andere Einstellungen spielen keine Rolle
  assert.equal(varietyLevel({ ...DEFAULTS, maxPerArtist: 3 }), null);
  assert.equal(varietyLevel({ ...DEFAULTS, artistGap: 0 }), null);
  assert.equal(varietyLevel({ ...DEFAULTS, size: 100, adventure: 1 }), 'medium');
});

test('Vorlagen und READMEs nennen die erlaubten Bereiche aus LIMITS', () => {
  for (const file of [...Object.values(TEMPLATES), 'README.md', 'README.de.md']) {
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
    for (const [key, { min, max }] of Object.entries(LIMITS)) {
      // Vorlage: Zeile des Schlüssels; README: erste Tabellenzeile mit `key` (Abschnitt „Regeln und Einstellungen“)
      const line = file.endsWith('.jsonc')
        ? lines.find(l => l.startsWith(`  "${key}":`))
        : lines.find(l => l.startsWith('|') && l.includes(`\`${key}\``));
      assert.ok(line?.includes(`${min}–${max}`), `${file}: ${key} ohne „${min}–${max}“: ${line}`);
    }
  }
});

test('loadConfig: ungültige Zahlen aus einer von Hand geänderten config.jsonc → alle in einer Meldung', async () => {
  const ok = { spotify: { clientId: '0123456789abcdef0123456789abcdef' }, lastfm: { apiKey: 'fedcba9876543210fedcba9876543210', user: 'testhoerer' }, seed: 'liked' };
  await withConfig(JSON.stringify({ ...ok, size: 0, maxPerWindow: 0 }), ({ loadConfig, numberProblems, readConfig }) => {
    assert.throws(() => loadConfig('en'), e => !e.errorCode && e.message === 'size in config.jsonc must be a whole number from 1 to 500 (currently 0).'
      + ' maxPerWindow in config.jsonc must be a whole number from 1 to 100 (currently 0).');
    assert.throws(() => loadConfig('de'), /^Error: size in config\.jsonc muss eine ganze Zahl von 1 bis 500 sein \(derzeit 0\)\. maxPerWindow in /);
    // Die Oberfläche liest sie trotzdem (readConfig), damit man sie dort korrigieren kann.
    assert.equal(readConfig('en').size, 0);
    assert.deepEqual(Object.keys(numberProblems(readConfig('en'), 'en')), ['size', 'maxPerWindow']);
  });
  // Größer als der Regler, aber erlaubt; 0 bzw. 1 = aus
  const edge = { size: 500, seedsPerRun: 200, artistGap: 0, excludeRecentDays: 0, noRepeatRuns: 0, currentDays: 0, familiarShare: 1, currentFactor: 1 };
  await withConfig(JSON.stringify({ ...ok, ...edge }), ({ loadConfig, numberProblems }) => {
    const cfg = loadConfig('en');
    assert.deepEqual(Object.fromEntries(Object.keys(edge).map(k => [k, cfg[k]])), edge);
    assert.deepEqual(numberProblems(cfg, 'en'), {});
  });
  // Unvollständige Einrichtung geht vor (die Oberfläche zeigt dann den Assistenten)
  await withConfig(JSON.stringify({ ...ok, spotify: {}, size: 0 }), ({ loadConfig }) => {
    assert.throws(() => loadConfig('en'), e => e.errorCode === 'setup_incomplete');
  });
});

test('Vorlagen: englisch und deutsch mit denselben Werten, jeder Schlüssel mit Erklärung', () => {
  const parsed = Object.fromEntries(Object.keys(TEMPLATES).map(lang => [lang, JSON.parse(stripComments(readTemplate(lang)))]));
  // Gleiche Schlüssel in gleicher Reihenfolge, gleiche Werte – nur die Platzhalter sind übersetzt.
  const neutral = cfg => JSON.stringify(cfg, (_, v) => (typeof v === 'string' && /^(HIER|ENTER_)/.test(v) ? '<Platzhalter>' : v));
  assert.equal(neutral(parsed.en), neutral(parsed.de));
  for (const cfg of Object.values(parsed)) {
    assert.deepEqual(Object.keys(cfg).filter(k => k in DEFAULTS).sort(), Object.keys(DEFAULTS).sort(), 'alle Einstellungen');
    for (const [k, v] of Object.entries(DEFAULTS)) assert.deepEqual(cfg[k], v, k);
    assert.deepEqual(missingCredentials(cfg), ['spotify.clientId', 'lastfm.apiKey', 'lastfm.user'], 'Platzhalter werden erkannt');
  }
  for (const lang of Object.keys(TEMPLATES)) {
    const lines = readTemplate(lang).split('\n').filter(l => /^ {2}"/.test(l));
    assert.equal(lines.length, Object.keys(DEFAULTS).length + 2, `${lang}: eine Zeile pro Schlüssel`);
    for (const line of lines) assert.match(line, / {2}\/\/ \S/, `${lang}: ohne Erklärung: ${line}`);
  }
  assert.match(readTemplate('en'), /^\/\/ Settings for Tweakable DJ\./);
  assert.match(readTemplate('de'), /^\/\/ Einstellungen für Tweakable DJ\./);
  assert.doesNotMatch(readTemplate('en') + readTemplate('de'), /Mein DJ/);
});

test('Speichern in eine alte config.jsonc: Gruppe "Automatik" kommt mit Erklärungen dazu', async () => {
  await withConfig(OLD_CONFIG, async ({ readConfig, updateConfig }, read) => {
    updateConfig(SCHEDULE, 'de');
    const text = read();
    JSON.parse(stripComments(text)); // gültig
    // Bisherige Zeilen bleiben, die letzte bekommt nur ein Komma (Kommentar bleibt in seiner Spalte)
    const old = OLD_CONFIG.split('\n');
    const now = text.split('\n');
    assert.deepEqual(now.slice(0, old.length - 3), old.slice(0, -3));
    assert.equal(now[old.length - 3], '  "blockedArtists": ["Künstler A"],   // Künstler, die nie gespielt werden');
    // Danach Leerzeile, Überschrift und Erklärung aus der Vorlage, dann die drei Werte in dieser Reihenfolge
    const added = now.slice(old.length - 2);
    assert.equal(added[0], '');
    assert.equal(added[1], '  // --- Automatik ---');
    assert.match(added[2], /^ {2}\/\/ In der Oberfläche einstellen/);
    assert.match(added[3], /^ {2}"schedule": "weekly", +\/\/ Playlist automatisch neu erstellen/);
    assert.match(added[4], /^ {2}"scheduleTime": "06:30", +\/\/ Uhrzeit/);
    assert.match(added[5], /^ {2}"scheduleDay": "FRI" +\/\/ Wochentag/);
    assert.deepEqual(added.slice(6), ['}', '']);
    // Kommentare stehen in derselben Spalte wie in der Vorlage
    assert.equal(added[3].indexOf('//'), 38);
    assert.equal(text.match(/--- Automatik ---/g).length, 1);
    assert.deepEqual([readConfig().schedule, readConfig().scheduleTime, readConfig().scheduleDay], ['weekly', '06:30', 'FRI']);

    // Nochmal ändern: nur diese eine Zeile ändert sich
    updateConfig({ scheduleTime: '07:15' }, 'de');
    const changed = read().split('\n');
    const diff = changed.filter((line, i) => line !== now[i]);
    assert.deepEqual(diff, [now[old.length + 2].replace('06:30', '07:15')]);

    // Sprache dazu: eigene Gruppe am Ende, Erklärung aus der deutschen Vorlage
    updateConfig({ language: 'de' }, 'de');
    const withLang = read();
    const unchanged = withLang.replace('"scheduleDay": "FRI", ', '"scheduleDay": "FRI"  '); // bis auf das neue Komma
    assert.ok(unchanged.startsWith(changed.join('\n').replace(/\n\}\n$/, '')), 'bisheriger Text bleibt');
    assert.match(withLang, /"scheduleDay": "FRI", +\/\/ Wochentag[^\n]*\n\n {2}\/\/ --- Sprache ---\n {2}"language": "de" +\/\/ Sprache der Oberfläche[^\n]*\n\}\n$/);
    assert.equal(readConfig().language, 'de');
  });
});

test('Speichern auf Englisch: fehlende Schlüssel kommen mit englischer Erklärung dazu', async () => {
  await withConfig(OLD_CONFIG, async ({ readConfig, updateConfig }, read) => {
    updateConfig({ language: 'en', schedule: 'daily' }, 'en');
    const text = read();
    JSON.parse(stripComments(text));
    assert.ok(text.startsWith(OLD_CONFIG.split('\n').slice(0, -3).join('\n')), 'bisherige Zeilen bleiben');
    assert.match(text, /\n\n {2}\/\/ --- Automatic runs ---\n {2}\/\/ Set this in the interface[^\n]*\n {2}"schedule": "daily", +\/\/ Recreate the playlist/);
    assert.match(text, /\n\n {2}\/\/ --- Language ---\n {2}"language": "en" +\/\/ Language of the interface[^\n]*\n\}\n$/);
    assert.equal(text.match(/"language"/g).length, 1);
    assert.equal(text.split('\n').find(l => l.includes('"language"')).indexOf('//'), 38);
    assert.equal(readConfig().language, 'en');
    // Zurück auf "noch nicht gewählt": nur der Wert ändert sich, der Kommentar bleibt in seiner Spalte
    updateConfig({ language: '' }, 'en');
    const reset = read();
    assert.equal(reset, text.replace('"language": "en"  ', '"language": ""    '));
    assert.equal(readConfig().language, '');
    assert.throws(() => updateConfig({ language: 'it' }, 'en'), /language: expected/);
    assert.equal(read(), reset, 'ungültiger Wert: Datei unverändert');
  });
});

test('Speichern in eine alte config.jsonc: Sperrliste über mehrere Zeilen, nur ein Schlüssel', async () => {
  const multi = OLD_CONFIG.replace('"blockedArtists": ["Künstler A"]    // Künstler, die nie gespielt werden',
    '"blockedArtists": [\n    "Künstler A",                     // zu laut\n    "Künstler B"\n  ]');
  await withConfig(multi, async ({ readConfig, updateConfig }, read) => {
    updateConfig({ schedule: 'daily' }, 'de');
    const text = read();
    JSON.parse(stripComments(text));
    assert.ok(text.includes('    "Künstler A",                     // zu laut\n    "Künstler B"\n  ],\n\n  // --- Automatik ---\n'), text);
    assert.match(text, /\n {2}"schedule": "daily" +\/\/ Playlist automatisch neu erstellen[^\n]*\n\}\n$/);
    assert.deepEqual(readConfig().blockedArtists, ['Künstler A', 'Künstler B']);
    // Standardwerte für die fehlenden Schlüssel
    assert.equal(readConfig().scheduleTime, '07:00');
    assert.equal(readConfig().scheduleDay, 'MON');
  });
});

test('Neue config.jsonc aus der Vorlage der Sprache (es, fr: englische Vorlage); configLanguage liest die gewählte Sprache', async () => {
  for (const lang of ['en', 'de', 'es', 'fr']) {
    await withConfig(null, async ({ configLanguage, readConfig, saveCredentials }, read) => {
      assert.equal(configLanguage(), '', 'ohne config.jsonc');
      saveCredentials({ clientId: '0123456789abcdef0123456789abcdef' }, lang);
      // Nur die Client ID ändert sich, ihr Kommentar bleibt in seiner Spalte
      const loose = text => text.replace(/ +\/\//g, ' //');
      assert.equal(loose(read()), loose(readTemplate(lang).replace(/"(HIER_CLIENT_ID_EINTRAGEN|ENTER_CLIENT_ID_HERE)"/, '"0123456789abcdef0123456789abcdef"')));
      const column = text => text.split('\n').find(l => l.includes('"spotify"')).indexOf('//');
      assert.equal(column(read()), column(readTemplate(lang)));
      assert.equal(readConfig(lang).playlistName, 'Tweakable DJ');
    });
    // Sprachwahl vor der Einrichtung legt die Datei ebenfalls an
    await withConfig(null, async ({ configLanguage, updateConfig }, read) => {
      updateConfig({ language: lang }, lang);
      assert.equal(read(), readTemplate(lang).replace('"language": ""  ', `"language": "${lang}"`));
      assert.equal(configLanguage(), lang);
    });
  }
  // Fehlt config.jsonc, legt readConfig sie an und meldet "Einrichtung nicht abgeschlossen"
  await withConfig(null, async ({ readConfig }, read) => {
    assert.throws(() => readConfig('en'), e => e.errorCode === 'setup_incomplete' && /^config\.jsonc has been created/.test(e.message));
    assert.match(read(), /^\/\/ Settings for Tweakable DJ/);
  });
  await withConfig('{ "language": "en", }', async ({ configLanguage, readConfig }) => {
    assert.equal(configLanguage(), '', 'kaputte Datei');
    assert.throws(() => readConfig('de'), /^Error: config\.jsonc ist fehlerhaft/);
    assert.throws(() => readConfig('en'), /^Error: config\.jsonc is invalid/);
  });
  await withConfig('{ "language": "fr" }', async ({ configLanguage }) => assert.equal(configLanguage(), 'fr'));
  await withConfig('{ "language": "es" }', async ({ configLanguage }) => assert.equal(configLanguage(), 'es'));
  await withConfig('{ "language": "it" }', async ({ configLanguage }) => assert.equal(configLanguage(), ''));
  // Spanisch und Französisch: Vorlage mit englischen Erklärungen und ENTER_…-Platzhaltern
  for (const lang of ['es', 'fr']) {
    await withConfig(null, async ({ exampleFile, readConfig, missingCredentials }, read) => {
      assert.equal(path.basename(exampleFile(lang)), 'config.example.jsonc');
      assert.throws(() => readConfig(lang), e => e.errorCode === 'setup_incomplete');
      assert.match(read(), /^\/\/ Settings for Tweakable DJ/);
      assert.match(read(), /"ENTER_CLIENT_ID_HERE"/);
      assert.deepEqual(missingCredentials(readConfig(lang)), ['spotify.clientId', 'lastfm.apiKey', 'lastfm.user']);
    });
  }
});

test('loadConfig: unvollständige Einrichtung mit errorCode, Platzhalter beider Vorlagen', async () => {
  for (const lang of ['en', 'de']) {
    await withConfig(readTemplate(lang), async ({ loadConfig }) => {
      assert.throws(() => loadConfig('es'), e => e.errorCode === 'setup_incomplete' && /^La configuración no está terminada/.test(e.message));
      assert.throws(() => loadConfig('fr'), e => e.errorCode === 'setup_incomplete' && /lastfm\.user \(ou laisse-le vide\)$/.test(e.message));
    });
    await withConfig(readTemplate(lang), async ({ loadConfig }) => {
      assert.throws(() => loadConfig('en'), e => e.errorCode === 'setup_incomplete'
        && e.message === 'Setup not finished – complete it in the interface (Tweakable DJ.cmd or .command, on Linux start.sh) or fill in config.jsonc: spotify.clientId, lastfm.apiKey, lastfm.user (or leave it empty)');
      assert.throws(() => loadConfig('de'), /^Error: Einrichtung nicht abgeschlossen .*lastfm\.user \(oder leer lassen\)$/);
    });
  }
});

// --- Gesperrte Songs (blockedTracks) und „Keine Songs mit expliziten Texten“ (excludeExplicit) ---

const URI_A = 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa';

test('blockedTracks: Objekte { uri, artist, name }, uri darf fehlen; gesäubert, Doppelte über trackKey; höchstens 1000', () => {
  assert.deepEqual([DEFAULTS.blockedTracks, DEFAULTS.excludeExplicit], [[], false]);
  assert.deepEqual(checkValue('blockedTracks', [
    { uri: URI_A, artist: '  Nordlicht ', name: 'Eisblau', kind: 'Favorit' },
    { artist: 'Nordlicht', name: 'Eisblau (Remastered 2011)' }, // gleicher Song, andere Version
    { uri: '', artist: 'Fernweh', name: 'Horizont   Live' },
  ]), [{ uri: URI_A, artist: 'Nordlicht', name: 'Eisblau' }, { artist: 'Fernweh', name: 'Horizont Live' }]);
  assert.equal(checkValue('blockedTracks', Array.from({ length: 1000 }, (_, i) => ({ artist: 'A', name: `T${i}` }))).length, 1000);
  assert.throws(() => checkValue('blockedTracks', Array.from({ length: 1001 }, (_, i) => ({ artist: 'A', name: `T${i}` })), 'de'),
    /^Error: blockedTracks: Liste mit höchstens 1\s000 Songs erwartet$/);
  assert.throws(() => checkValue('blockedTracks', 'Nordlicht', 'en'), /^Error: blockedTracks: expected a list of at most 1,000 songs$/);
  for (const bad of [['Nordlicht – Eisblau'], [null], [[]], [{ artist: 'A' }], [{ name: 'T' }], [{ artist: ' ', name: 'T' }],
    [{ uri: 'spotify:album:aaaaaaaaaaaaaaaaaaaaaa', artist: 'A', name: 'T' }], [{ uri: 42, artist: 'A', name: 'T' }]]) {
    assert.throws(() => checkValue('blockedTracks', bad, 'en'), /^Error: blockedTracks: every song needs "artist" and "name"/, JSON.stringify(bad));
  }
  assert.throws(() => checkValue('blockedTracks', [{ artist: 'A', name: 'x'.repeat(201) }], 'de'), /^Error: blockedTracks: Eintrag zu lang$/);
  assert.equal(checkValue('excludeExplicit', true), true);
  assert.throws(() => checkValue('excludeExplicit', 'ja', 'en'), /^Error: excludeExplicit: expected boolean$/);
});

test('blockedTracks speichern: ein Song pro Zeile, Kommentar hinter "],"; zurück auf [] wie in der Vorlage', async () => {
  for (const lang of ['de', 'en']) {
    await withConfig(readTemplate(lang), async ({ readConfig, updateConfig }, read) => {
      const before = read();
      const songs = [{ uri: URI_A, artist: 'Nordlicht', name: 'Eisblau' }, { artist: 'Fernweh', name: 'Horizont "Live"' }];
      updateConfig({ blockedTracks: songs, excludeExplicit: true }, lang);
      const text = read();
      const lines = text.split('\n');
      const start = lines.findIndex(l => l.startsWith('  "blockedTracks": ['));
      assert.deepEqual(lines.slice(start, start + 3), [
        '  "blockedTracks": [',
        `    { "uri": "${URI_A}", "artist": "Nordlicht", "name": "Eisblau" },`,
        '    { "artist": "Fernweh", "name": "Horizont \\"Live\\"" }',
      ]);
      assert.match(lines[start + 3], /^ {2}\], +\/\/ /);
      assert.equal(lines[start + 3].indexOf('//'), 38, 'Kommentar in der Spalte der Vorlage');
      assert.match(text, /\n {2}"excludeExplicit": true, +\/\//);
      assert.deepEqual([readConfig(lang).blockedTracks, readConfig(lang).excludeExplicit], [songs, true]);
      // Zurück: wieder genau die Vorlage
      updateConfig({ blockedTracks: [], excludeExplicit: false }, lang);
      assert.equal(read(), before);
    });
  }
  // Alte config.jsonc ohne die Schlüssel: kommen samt Erklärung aus der Vorlage dazu
  await withConfig(OLD_CONFIG, async ({ readConfig, updateConfig }, read) => {
    updateConfig({ blockedTracks: [{ artist: 'Nordlicht', name: 'Eisblau' }] }, 'de');
    const text = read();
    assert.ok(text.includes('  "blockedArtists": ["Künstler A"],   // Künstler, die nie gespielt werden\n'
      + '  "blockedTracks": [\n    { "artist": "Nordlicht", "name": "Eisblau" }\n  ]                                   // Songs, die nie gespielt werden'), text);
    assert.deepEqual(readConfig().blockedTracks, [{ artist: 'Nordlicht', name: 'Eisblau' }]);
    assert.deepEqual(readConfig().excludeExplicit, false, 'Standard');
  });
});

// --- „Bei Fehlern benachrichtigen“ (notifyOnFailure) ---

test('notifyOnFailure: Standard an, nur true/false; in einer config.jsonc von 0.1.2 kommt er mit Erklärung zur Automatik', async () => {
  assert.equal(DEFAULTS.notifyOnFailure, true);
  assert.equal(checkValue('notifyOnFailure', false), false);
  assert.throws(() => checkValue('notifyOnFailure', 'false', 'de'), /^Error: notifyOnFailure: /);
  assert.throws(() => checkValue('notifyOnFailure', 0, 'en'), /^Error: notifyOnFailure: expected boolean$/);
  await withConfig(OLD_CONFIG, async ({ notifyOnFailure, readConfig, updateConfig }, read, dir) => {
    assert.equal(notifyOnFailure(), true, 'fehlt in der Datei: an');
    updateConfig({ ...SCHEDULE, language: 'de' }, 'de'); // so sah sie mit 0.1.2 aus
    const before = read();
    updateConfig({ notifyOnFailure: false }, 'de');
    const text = read();
    assert.match(text, /\n {2}"scheduleDay": "FRI", +\/\/ Wochentag[^\n]*\n {2}"notifyOnFailure": false, +\/\/ Systembenachrichtigung, wenn ein automatischer Lauf fehlschlägt[^\n]*\n\n {2}\/\/ --- Sprache ---\n/);
    assert.equal(text.split('\n').find(l => l.includes('"notifyOnFailure"')).indexOf('//'), 38);
    assert.equal(text.replace(/\n {2}"notifyOnFailure"[^\n]*/, ''), before, 'sonst unverändert');
    assert.deepEqual([readConfig().notifyOnFailure, notifyOnFailure()], [false, false]);
    updateConfig({ notifyOnFailure: true }, 'de');
    assert.equal(notifyOnFailure(), true);
    // Kaputte bzw. fehlende Datei: an (ein fehlgeschlagener Lauf soll trotzdem melden)
    fs.writeFileSync(path.join(dir, 'config.jsonc'), '{ "notifyOnFailure": false, }}');
    assert.equal(notifyOnFailure(), true);
    fs.rmSync(path.join(dir, 'config.jsonc'));
    assert.equal(notifyOnFailure(), true);
  });
});
