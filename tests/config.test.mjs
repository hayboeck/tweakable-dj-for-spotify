// Unit-Tests für config.mjs: Prüfung der Einstellungen, Spracheinstellung, Vorlagen je Sprache und Speichern in eine
// ältere config.jsonc (fehlende Schlüssel kommen samt Erklärung aus der Vorlage dazu, alles andere bleibt, wie es ist).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkValue, checkValues, DEFAULTS, missingCredentials, stripComments } from '../config.mjs';

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
    for (const f of ['config.mjs', 'i18n.mjs', ...Object.values(TEMPLATES)]) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    if (text !== null) fs.writeFileSync(path.join(dir, 'config.jsonc'), text);
    const config = await import(pathToFileURL(path.join(dir, 'config.mjs')).href);
    await fn(config, () => fs.readFileSync(path.join(dir, 'config.jsonc'), 'utf8'), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const readTemplate = lang => fs.readFileSync(path.join(ROOT, TEMPLATES[lang]), 'utf8');

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

test('Spracheinstellung: Standard "", gültig "", "de", "en"; Meldungen in beiden Sprachen', () => {
  assert.equal(DEFAULTS.language, '');
  assert.equal(DEFAULTS.playlistName, 'Tweakable DJ');
  for (const v of ['', 'de', 'en']) assert.equal(checkValue('language', v), v);
  for (const v of ['fr', 'DE', 'de-AT', ' en', null, 1, true]) {
    assert.throws(() => checkValue('language', v, 'de'), /^Error: language: "de", "en" oder "" erwartet$/, String(v));
    assert.throws(() => checkValue('language', v, 'en'), /^Error: language: expected "de", "en" or ""$/, String(v));
  }
  assert.deepEqual(checkValues({ language: 'en', size: 40 }), { language: 'en', size: 40 });
  assert.throws(() => checkValue('size', 'viel', 'de'), /size: number erwartet/);
  assert.throws(() => checkValue('size', 'viel', 'en'), /size: expected number/);
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
    assert.throws(() => updateConfig({ language: 'fr' }, 'en'), /language: expected/);
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

test('Neue config.jsonc aus der Vorlage der Sprache; configLanguage liest die gewählte Sprache', async () => {
  for (const lang of ['en', 'de']) {
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
  await withConfig('{ "language": "fr" }', async ({ configLanguage }) => assert.equal(configLanguage(), ''));
});

test('loadConfig: unvollständige Einrichtung mit errorCode, Platzhalter beider Vorlagen', async () => {
  for (const lang of ['en', 'de']) {
    await withConfig(readTemplate(lang), async ({ loadConfig }) => {
      assert.throws(() => loadConfig('en'), e => e.errorCode === 'setup_incomplete'
        && e.message === 'Setup not finished – complete it in the interface (Tweakable DJ.cmd or .command, on Linux start.sh) or fill in config.jsonc: spotify.clientId, lastfm.apiKey, lastfm.user (or leave it empty)');
      assert.throws(() => loadConfig('de'), /^Error: Einrichtung nicht abgeschlossen .*lastfm\.user \(oder leer lassen\)$/);
    });
  }
});
