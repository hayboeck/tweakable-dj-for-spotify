// Unit-Tests für i18n.mjs: Spracherkennung, Platzhalter und Vollständigkeit der Texte in beiden Sprachen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGS, MESSAGES, locale, resolveLang, systemLang, t, tError } from '../i18n.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Texte in Anführungszeichen, die wie Schlüssel aussehen, aber Dateinamen bzw. Stellen in der config.jsonc sind
const NOT_KEYS = ['config.jsonc', 'ui.html', 'ui.mjs', 'spotify.clientId', 'lastfm.apiKey', 'lastfm.user'];
// Namen der Platzhalter {name} und {name|eins|mehr} (Einzahl/Mehrzahl braucht nicht jede Sprache, z. B. „1 Künstler“)
const placeholders = text => [...new Set([...text.matchAll(/\{(\w+)(?:\|[^|{}]*\|[^|{}]*)?\}/g)].map(m => m[1]))].sort();

test('Jeder Text gibt es auf Deutsch und Englisch, mit denselben Platzhaltern', () => {
  assert.deepEqual(LANGS, ['de', 'en']);
  assert.deepEqual(Object.keys(MESSAGES).sort(), [...LANGS].sort());
  const de = Object.keys(MESSAGES.de).sort();
  const en = Object.keys(MESSAGES.en).sort();
  assert.deepEqual(de.filter(k => !en.includes(k)), [], 'fehlt auf Englisch');
  assert.deepEqual(en.filter(k => !de.includes(k)), [], 'fehlt auf Deutsch');
  for (const key of de) {
    for (const lang of LANGS) assert.ok(typeof MESSAGES[lang][key] === 'string' && MESSAGES[lang][key].trim(), `${lang} ${key} leer`);
    assert.deepEqual(placeholders(MESSAGES.en[key]), placeholders(MESSAGES.de[key]), key);
  }
});

test('Alle Schlüssel, die die Programmdateien verwenden, gibt es', () => {
  const used = new Set();
  for (const file of fs.readdirSync(ROOT).filter(f => f.endsWith('.mjs') && f !== 'i18n.mjs')) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/\b(?:t|tError)\([^,()]+,\s*'([\w.]+)'/g)) used.add(m[1]);
    // Schlüssel, die aus Teilen zusammengesetzt oder in Tabellen stehen
    for (const m of src.matchAll(/'((?:config|login|run|ui|schedule|spotify|lastfm|node|update|apply|trial|export|import)\.[a-zA-Z]+)'/g)) {
      if (!NOT_KEYS.includes(m[1])) used.add(m[1]);
    }
  }
  for (const key of ['stale', 'failed', 'ok']) used.add(`login.${key}Title`).add(`login.${key}Text`);
  // Gründe aus trialProblem() (trial.mjs) und resolveImport() (playlist.mjs), zusammengesetzt als trial.<Grund> bzw. import.reason.<Grund>
  for (const key of ['missing', 'invalid', 'replaced', 'old', 'settings']) used.add(`trial.${key}`);
  for (const key of ['notFound', 'format', 'link', 'error']) used.add(`import.reason.${key}`);
  assert.ok(used.size > 80, `nur ${used.size} Schlüssel gefunden`);
  const missing = [...used].filter(k => !(k in MESSAGES.de) || !(k in MESSAGES.en));
  assert.deepEqual(missing, []);
});

test('t: Platzhalter, unbekannte Sprache und unbekannter Schlüssel', () => {
  assert.equal(t('de', 'run.songs', { count: 11 }), '  11 Songs');
  assert.equal(t('en', 'run.songs', { count: 11 }), '  11 songs');
  assert.equal(t('fr', 'run.songs', { count: 11 }), '  11 songs', 'unbekannte Sprache = Englisch');
  assert.equal(t('de', 'run.error', {}), 'Fehler: {message}', 'fehlender Wert bleibt sichtbar');
  assert.equal(t('en', 'gibt.es.nicht'), 'gibt.es.nicht');
  assert.equal(t('en', 'run.current'), ' · current');
  assert.equal(t('de', 'run.current'), ' · aktuell');
  const e = tError('en', 'spotify.expired', { detail: 'x', again: 'y' }, { errorCode: 'login_expired' });
  assert.ok(e instanceof Error);
  assert.equal(e.message, 'Spotify login expired (x). y');
  assert.equal(e.errorCode, 'login_expired');
  assert.equal(locale('de'), 'de-AT');
  assert.equal(locale('en'), 'en-US');
});

test('t: Einzahl und Mehrzahl mit {name|eins|mehr}, Zahl im Format der Sprache', () => {
  assert.equal(t('de', 'run.songs', { count: 1 }), '  1 Song');
  assert.equal(t('en', 'run.songs', { count: 1 }), '  1 song');
  assert.equal(t('de', 'run.songs', { count: 0 }), '  0 Songs');
  assert.equal(t('en', 'run.songs', { count: 1000 }), '  1,000 songs');
  assert.equal(t('de', 'run.songs', { count: 1000 }), `  ${(1000).toLocaleString('de-AT')} Songs`, 'de-AT: 1 000 mit geschütztem Leerzeichen');
  const counts = { name: 'DJ', songs: 1, fresh: 0, freshCurrent: 0, familiar: 1 };
  assert.equal(t('de', 'run.summary', counts), 'DJ: 1 Song (0 neu, davon 0 über aktuelles Hören; 1 Favorit)');
  assert.equal(t('en', 'run.summary', counts), 'DJ: 1 song (0 new, 0 of them via current listening; 1 favorite)');
  assert.equal(t('de', 'run.summary', { ...counts, songs: 2, familiar: 2 }), 'DJ: 2 Songs (0 neu, davon 0 über aktuelles Hören; 2 Favoriten)');
  assert.equal(t('en', 'run.summary', { ...counts, songs: 2, familiar: 2 }), 'DJ: 2 songs (0 new, 0 of them via current listening; 2 favorites)');
  assert.equal(t('de', 'run.blocked', { count: 1 }), '  1 Song wegen der Sperrliste aussortiert');
  assert.equal(t('en', 'run.blocked', { count: 3 }), '  3 songs left out because of the block list');
  assert.equal(t('de', 'run.scrobbles', { total: 1, current: 1, days: 1, artists: 1 }), '  1 Scrobble, davon 1 in den letzten 24 Stunden (1 Künstler)');
  assert.equal(t('en', 'run.scrobbles', { total: 1000, current: 5, days: 7, artists: 1 }), '  1,000 scrobbles, 5 of them in the last 7 days (1 artist)');
  assert.equal(t('de', 'run.startingPoints', { current: 0, total: 1, factor: 3 }), '  0 von 1 Ausgangspunkt aus deinem aktuellen Hören (Faktor 3)');
  assert.equal(t('en', 'run.candidates', { count: 1, hits: 0, total: 1 }), '  1 candidate (0 of 1 Last.fm request from the cache)');
  assert.equal(t('de', 'run.description', { date: 'd', time: 't', fresh: 1, familiar: 1 }), 'Tweakable DJ · d, t Uhr · 1 neuer Song, 1 Favorit');
  assert.equal(t('en', 'update.stepCopy', { count: 1, same: 1 }), 'Replacing 1 file (1 is unchanged) …');
  assert.equal(t('de', 'update.stepCopy', { count: 2, same: 1 }), 'Ersetze 2 Dateien (1 ist unverändert) …');
  assert.equal(t('en', 'ui.lastfmOk', { name: 'x', scrobbles: 12345 }), 'All good ✓ “x” has 12,345 scrobbles.');
  assert.equal(t('de', 'ui.lastfmOk', { name: 'x', scrobbles: 1 }), 'Passt ✓ „x“ hat 1 Scrobble.');
  assert.equal(t('de', 'run.songs', {}), '  {count|# Song|# Songs}', 'fehlender Wert bleibt sichtbar');
  // Jede Einzahl/Mehrzahl hat genau zwei Formen; # steht nur darin
  for (const lang of LANGS) {
    for (const [key, text] of Object.entries(MESSAGES[lang])) {
      for (const m of text.matchAll(/\{\w+\|[^{}]*\}/g)) assert.match(m[0], /^\{\w+\|[^|{}]*\|[^|{}]*\}$/, `${lang} ${key}`);
      assert.doesNotMatch(text.replace(/\{\w+\|[^{}]*\}/g, ''), /#/, `${lang} ${key}: # außerhalb von {…|…|…}`);
    }
  }
});

test('systemLang: TWEAKABLE_DJ_LANG vor LC_ALL/LANG vor der Spracheinstellung von Node.js', () => {
  assert.equal(systemLang({ TWEAKABLE_DJ_LANG: 'de', LANG: 'en_US.UTF-8' }), 'de');
  assert.equal(systemLang({ TWEAKABLE_DJ_LANG: 'en', LANG: 'de_AT.UTF-8' }), 'en');
  assert.equal(systemLang({ LC_ALL: 'de_DE.UTF-8', LANG: 'en_GB.UTF-8' }), 'de');
  assert.equal(systemLang({ LC_ALL: 'C', LANG: 'de_DE.UTF-8' }), 'en');
  assert.equal(systemLang({ LANG: 'de_CH.UTF-8' }), 'de');
  assert.equal(systemLang({ LANG: 'fr_FR.UTF-8' }), 'en', 'alles außer Deutsch = Englisch');
  const fromNode = /^de/i.test(Intl.DateTimeFormat().resolvedOptions().locale) ? 'de' : 'en';
  assert.equal(systemLang({}), fromNode);
});

test('resolveLang: gültiger Wert, sonst Hinweis, sonst Systemsprache', () => {
  assert.equal(resolveLang('en', 'de'), 'en');
  assert.equal(resolveLang('DE', 'en'), 'de');
  assert.equal(resolveLang('', 'en'), 'en');
  assert.equal(resolveLang(undefined, 'de'), 'de');
  assert.equal(resolveLang('fr', 'xx'), systemLang());
  assert.equal(resolveLang(), systemLang());
});

// Tausender überall im Format der Sprache: Konsole (i18n.mjs), Oberfläche (ui.html, gleiche Locale) und READMEs.
// Deutsch wie de-AT: 1 000 mit geschütztem Leerzeichen (U+00A0), Englisch: 1,000.
test('Zahlen: Tausender in Ausgabe, Oberfläche und READMEs im selben Format', () => {
  const NBSP = String.fromCharCode(0xa0);
  const de = (1000).toLocaleString('de-AT');
  assert.equal(de, `1${NBSP}000`);
  assert.equal(t('de', 'run.scrobbles', { total: 1000, current: 1000, days: 7, artists: 1200 }),
    `  ${de} Scrobbles, davon ${de} in den letzten 7 Tagen (1${NBSP}200 Künstler)`);
  assert.equal(t('en', 'run.scrobbles', { total: 1000, current: 1000, days: 7, artists: 1200 }),
    '  1,000 scrobbles, 1,000 of them in the last 7 days (1,200 artists)');
  assert.equal(t('en', 'run.candidates', { count: 1500, hits: 1200, total: 2000 }), '  1,500 candidates (1,200 of 2,000 Last.fm requests from the cache)');
  assert.equal(t('de', 'run.startingPoints', { current: 1000, total: 1000, factor: 1.5 }),
    `  ${de} von ${de} Ausgangspunkten aus deinem aktuellen Hören (Faktor 1,5)`);
  assert.equal(t('de', 'run.summary', { name: 'DJ', songs: 1000, fresh: 1000, freshCurrent: 1000, familiar: 0 }),
    `DJ: ${de} Songs (${de} neu, davon ${de} über aktuelles Hören; 0 Favoriten)`);
  // Werte ohne Einzahl/Mehrzahl, die keine Mengen sind, bleiben, wie sie sind (z. B. Fehlercodes)
  assert.equal(t('de', 'ui.exited', { code: 2147942402 }), '(beendet mit Fehlercode 2147942402)');
  const html = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
  assert.match(html, /\n {2}de: \{\n {4}locale: 'de-AT',/);
  assert.match(html, /\n {2}en: \{\n {4}locale: 'en-US',/);
  const readmeDe = fs.readFileSync(path.join(ROOT, 'README.de.md'), 'utf8');
  const readmeEn = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.doesNotMatch(readmeDe, /\b\d{1,3}(?:[.,]| (?=\d{3}\b))\d{3}\b/, 'README.de: Tausender mit Punkt, Komma oder normalem Leerzeichen');
  assert.ok(readmeDe.includes(`die ${de} neuesten Scrobbles`) && readmeDe.includes(`die ${de}, die du zuletzt gespeichert hast`));
  assert.doesNotMatch(readmeEn, new RegExp(`\\b\\d{1,3}(?:\\.|[ ${NBSP}](?=\\d{3}\\b))\\d{3}\\b`), 'README.md: Tausender mit Punkt oder Leerzeichen');
  assert.ok(readmeEn.includes('the 1,000 newest scrobbles'));
});
