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
const placeholders =text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

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
    for (const m of src.matchAll(/'((?:config|login|run|ui|schedule|spotify|lastfm|node|update)\.[a-zA-Z]+)'/g)) {
      if (!NOT_KEYS.includes(m[1])) used.add(m[1]);
    }
  }
  for (const key of ['stale', 'failed', 'ok']) used.add(`login.${key}Title`).add(`login.${key}Text`);
  assert.ok(used.size > 80, `nur ${used.size} Schlüssel gefunden`);
  const missing = [...used].filter(k => !(k in MESSAGES.de) || !(k in MESSAGES.en));
  assert.deepEqual(missing, []);
});

test('t: Platzhalter, unbekannte Sprache und unbekannter Schlüssel', () => {
  assert.equal(t('de', 'run.songs', { count: 11 }), '  11 Songs');
  assert.equal(t('en', 'run.songs', { count: 11 }), '  11 songs');
  assert.equal(t('fr', 'run.songs', { count: 1 }), '  1 songs', 'unbekannte Sprache = Englisch');
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
