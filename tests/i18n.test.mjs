// Unit-Tests für i18n.mjs: Spracherkennung, Platzhalter, Einzahl/Mehrzahl und Vollständigkeit der Texte in allen Sprachen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatDuration, formatStats, isOne, LANGS, MESSAGES, locale, resolveLang, systemLang, t, tError } from '../i18n.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Texte in Anführungszeichen, die wie Schlüssel aussehen, aber Dateinamen bzw. Stellen in der config.jsonc sind
const NOT_KEYS = ['config.jsonc', 'ui.html', 'ui.mjs', 'spotify.clientId', 'lastfm.apiKey', 'lastfm.user'];
// Namen der Platzhalter {name} und {name|eins|mehr} (Einzahl/Mehrzahl braucht nicht jede Sprache, z. B. „1 Künstler“)
const placeholders = text => [...new Set([...text.matchAll(/\{(\w+)(?:\|[^|{}]*\|[^|{}]*)?\}/g)].map(m => m[1]))].sort();

test('Jeden Text gibt es auf Deutsch, Englisch, Spanisch und Französisch, mit denselben Platzhaltern', () => {
  assert.deepEqual(LANGS, ['de', 'en', 'es', 'fr']);
  assert.deepEqual(Object.keys(MESSAGES).sort(), [...LANGS].sort());
  const de = Object.keys(MESSAGES.de).sort();
  for (const lang of LANGS) {
    const keys = Object.keys(MESSAGES[lang]).sort();
    assert.deepEqual(de.filter(k => !keys.includes(k)), [], `fehlt in ${lang}`);
    assert.deepEqual(keys.filter(k => !de.includes(k)), [], `${lang}: nicht auf Deutsch`);
  }
  for (const key of de) {
    for (const lang of LANGS) {
      assert.ok(typeof MESSAGES[lang][key] === 'string' && MESSAGES[lang][key].trim(), `${lang} ${key} leer`);
      assert.deepEqual(placeholders(MESSAGES[lang][key]), placeholders(MESSAGES.de[key]), `${lang} ${key}`);
      // Zeilenumbrüche (z. B. run.forbidden, ui.stopHint) wie im Deutschen
      assert.equal(MESSAGES[lang][key].split('\n').length, MESSAGES.de[key].split('\n').length, `${lang} ${key}: Zeilen`);
    }
  }
});

// Französisch: schmales geschütztes Leerzeichen (U+202F) vor : ; ! ? und innerhalb von « »; Spanisch: ¿…? und ¡…!
test('Typografie: Französisch mit geschützten Leerzeichen, Spanisch mit ¿ und ¡', () => {
  for (const [key, text] of Object.entries(MESSAGES.fr)) {
    assert.doesNotMatch(text, /[ \u00a0][:;!?]/, `fr ${key}: Leerzeichen vor : ; ! ? muss U+202F sein`);
    assert.doesNotMatch(text, /«(?!\u202f)|(?<!\u202f)»/, `fr ${key}: « » ohne U+202F`);
    assert.doesNotMatch(text, /[„“”]/, `fr ${key}: deutsche bzw. englische Anführungszeichen`);
  }
  for (const [key, text] of Object.entries(MESSAGES.es)) {
    // Jede Frage bzw. jeder Ausruf beginnt mit ¿ bzw. ¡
    assert.equal((text.match(/\?/g) ?? []).length, (text.match(/¿/g) ?? []).length, `es ${key}: ¿…?`);
    assert.equal((text.match(/!/g) ?? []).length, (text.match(/¡/g) ?? []).length, `es ${key}: ¡…!`);
    assert.doesNotMatch(text, /[„“”]/, `es ${key}: deutsche bzw. englische Anführungszeichen`);
  }
  assert.equal(t('fr', 'run.error', { message: 'x' }), 'Erreur\u202f: x');
  assert.equal(t('fr', 'ui.lastfmOk', { name: 'x', scrobbles: 2 }), 'C’est bon ✓ «\u202fx\u202f» a 2 scrobbles.');
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
  const missing = [...used].filter(k => LANGS.some(lang => !(k in MESSAGES[lang])));
  assert.deepEqual(missing, []);
});

test('t: Platzhalter, unbekannte Sprache und unbekannter Schlüssel', () => {
  assert.equal(t('de', 'run.songs', { count: 11 }), '  11 Songs');
  assert.equal(t('en', 'run.songs', { count: 11 }), '  11 songs');
  assert.equal(t('es', 'run.songs', { count: 11 }), '  11 canciones');
  assert.equal(t('fr', 'run.songs', { count: 11 }), '  11 titres');
  assert.equal(t('it', 'run.songs', { count: 11 }), '  11 songs', 'unbekannte Sprache = Englisch');
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
  assert.equal(locale('es'), 'es-ES');
  assert.equal(locale('fr'), 'fr-FR');
  assert.equal(locale('it'), 'en-US');
});

// Einzahl nach Intl.PluralRules: Französisch 0 und 1 (auch 1,5), Spanisch, Deutsch, Englisch nur genau 1.
test('Einzahl und Mehrzahl nach den Regeln der Sprache (Intl.PluralRules)', () => {
  const one = lang => [0, 1, 1.5, 2, 10, 1000000].filter(n => isOne(lang, n));
  assert.deepEqual(one('de'), [1]);
  assert.deepEqual(one('en'), [1]);
  assert.deepEqual(one('es'), [1]);
  assert.deepEqual(one('fr'), [0, 1, 1.5]);
  assert.deepEqual(one('xx'), [1], 'unbekannt = Englisch');
  assert.equal(t('fr', 'run.songs', { count: 0 }), '  0 titre');
  assert.equal(t('fr', 'run.songs', { count: 1 }), '  1 titre');
  assert.equal(t('fr', 'run.songs', { count: 2 }), '  2 titres');
  assert.equal(t('es', 'run.songs', { count: 0 }), '  0 canciones');
  assert.equal(t('es', 'run.songs', { count: 1 }), '  1 canción');
  assert.equal(t('de', 'run.songs', { count: 0 }), '  0 Songs');
  assert.equal(t('en', 'run.songs', { count: 0 }), '  0 songs');
  // Zahlen im Format der Sprache: es-ES 12.345, fr-FR 12 345 (mit schmalem geschütztem Leerzeichen)
  assert.equal(t('es', 'run.songs', { count: 12345 }), '  12.345 canciones');
  assert.equal(t('fr', 'run.songs', { count: 12345 }), `  ${(12345).toLocaleString('fr-FR')} titres`);
  assert.equal(t('fr', 'run.summary', { name: 'DJ', songs: 1, fresh: 0, freshCurrent: 0, familiar: 0, duration: formatDuration('fr', 200_000) }),
    'DJ\u202f: 1 titre · 3\u00a0min (0 nouveau, dont 0 via ce que tu écoutes en ce moment\u202f; 0 favori)');
  assert.equal(t('es', 'run.summary', { name: 'DJ', songs: 2, fresh: 1, freshCurrent: 0, familiar: 0, duration: formatDuration('es', 420_000, true) }),
    'DJ: 2 canciones · ≈\u00a07\u00a0min (1 nueva, 0 de ellas por lo que escuchas ahora; 0 favoritas)');
  assert.equal(t('fr', 'run.startingPoints', { current: 1, total: 20, factor: 3 }), '  1 point de départ sur 20 vient de ce que tu écoutes en ce moment (facteur 3)');
  assert.equal(t('fr', 'run.startingPoints', { current: 5, total: 20, factor: 1.5 }), '  5 points de départ sur 20 viennent de ce que tu écoutes en ce moment (facteur 1,5)');
  assert.equal(t('es', 'import.hintBlocked', { count: 1 }), 'Aviso: 1 canción está en tu lista de bloqueo y entra igualmente; el archivo es tu lista:');
  assert.ok(t('fr', 'notify.loginText', { days: 1 }).startsWith('Ta connexion Spotify expire dans 1 jour :'));
});

test('t: Einzahl und Mehrzahl mit {name|eins|mehr}, Zahl im Format der Sprache', () => {
  assert.equal(t('de', 'run.songs', { count: 1 }), '  1 Song');
  assert.equal(t('en', 'run.songs', { count: 1 }), '  1 song');
  assert.equal(t('de', 'run.songs', { count: 0 }), '  0 Songs');
  assert.equal(t('en', 'run.songs', { count: 1000 }), '  1,000 songs');
  assert.equal(t('de', 'run.songs', { count: 1000 }), `  ${(1000).toLocaleString('de-AT')} Songs`, 'de-AT: 1 000 mit geschütztem Leerzeichen');
  const counts = { name: 'DJ', songs: 1, fresh: 0, freshCurrent: 0, familiar: 1, duration: '4 Min.' };
  assert.equal(t('de', 'run.summary', counts), 'DJ: 1 Song · 4 Min. (0 neu, davon 0 über aktuelles Hören; 1 Favorit)');
  assert.equal(t('en', 'run.summary', { ...counts, duration: '4 min' }), 'DJ: 1 song · 4 min (0 new, 0 of them via current listening; 1 favorite)');
  assert.equal(t('de', 'run.summary', { ...counts, songs: 2, familiar: 2 }), 'DJ: 2 Songs · 4 Min. (0 neu, davon 0 über aktuelles Hören; 2 Favoriten)');
  assert.equal(t('en', 'run.summary', { ...counts, songs: 2, familiar: 2, duration: '4 min' }), 'DJ: 2 songs · 4 min (0 new, 0 of them via current listening; 2 favorites)');
  assert.equal(t('de', 'run.blocked', { count: 1 }), '  1 Song wegen der Sperrliste aussortiert');
  assert.equal(t('en', 'run.blocked', { count: 3 }), '  3 songs left out because of the block list');
  assert.equal(t('de', 'run.scrobbles', { total: 1, current: 1, days: 1, artists: 1 }), '  1 Scrobble, davon 1 in den letzten 24 Stunden (1 Künstler)');
  assert.equal(t('en', 'run.scrobbles', { total: 1000, current: 5, days: 7, artists: 1 }), '  1,000 scrobbles, 5 of them in the last 7 days (1 artist)');
  assert.equal(t('de', 'run.startingPoints', { current: 0, total: 1, factor: 3 }), '  0 von 1 Ausgangspunkt aus deinem aktuellen Hören (Faktor 3)');
  assert.equal(t('en', 'run.candidates', { count: 1, hits: 0, total: 1 }), '  1 candidate (0 of 1 Last.fm request from the cache)');
  // Ohne Spieldauer: Die zeigt Spotify bei der Playlist selbst an.
  assert.equal(t('de', 'run.description', { date: 'd', time: 't', fresh: 1, familiar: 1, duration: formatDuration('de', 10_680_000) }),
    'Tweakable DJ · d, t Uhr · 1 neuer Song, 1 Favorit');
  for (const lang of LANGS) assert.ok(!MESSAGES[lang]['run.description'].includes('{duration}'), lang);
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
  assert.equal(systemLang({ LANG: 'fr_FR.UTF-8' }), 'fr');
  assert.equal(systemLang({ LC_ALL: 'fr_CA.UTF-8', LANG: 'de_AT.UTF-8' }), 'fr');
  assert.equal(systemLang({ LANG: 'es_ES.UTF-8' }), 'es');
  assert.equal(systemLang({ LC_MESSAGES: 'es_MX', LANG: 'en_US.UTF-8' }), 'es');
  assert.equal(systemLang({ TWEAKABLE_DJ_LANG: 'es', LANG: 'fr_FR.UTF-8' }), 'es');
  assert.equal(systemLang({ TWEAKABLE_DJ_LANG: 'FR' }), 'fr');
  assert.equal(systemLang({ LANG: 'it_IT.UTF-8' }), 'en', 'alles andere = Englisch');
  assert.equal(systemLang({ LANG: 'pt_BR.UTF-8' }), 'en');
  const node = Intl.DateTimeFormat().resolvedOptions().locale;
  const fromNode = LANGS.find(l => node.toLowerCase().startsWith(l)) ?? 'en';
  assert.equal(systemLang({}), fromNode);
});

test('resolveLang: gültiger Wert, sonst Hinweis, sonst Systemsprache', () => {
  assert.equal(resolveLang('en', 'de'), 'en');
  assert.equal(resolveLang('DE', 'en'), 'de');
  assert.equal(resolveLang('', 'en'), 'en');
  assert.equal(resolveLang(undefined, 'de'), 'de');
  assert.equal(resolveLang('fr', 'de'), 'fr');
  assert.equal(resolveLang('ES', 'en'), 'es');
  assert.equal(resolveLang('', 'fr'), 'fr');
  assert.equal(resolveLang('it', 'es'), 'es');
  assert.equal(resolveLang('it', 'xx'), systemLang());
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
  assert.equal(t('de', 'run.summary', { name: 'DJ', songs: 1000, fresh: 1000, freshCurrent: 1000, familiar: 0, duration: formatDuration('de', 210_000_000) }),
    `DJ: ${de} Songs · 58:20${NBSP}Std. (${de} neu, davon ${de} über aktuelles Hören; 0 Favoriten)`);
  // Werte ohne Einzahl/Mehrzahl, die keine Mengen sind, bleiben, wie sie sind (z. B. Fehlercodes)
  assert.equal(t('de', 'ui.exited', { code: 2147942402 }), '(beendet mit Fehlercode 2147942402)');
  const html = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
  assert.match(html, /\n {2}de: \{\n {4}locale: 'de-AT',/);
  assert.match(html, /\n {2}en: \{\n {4}locale: 'en-US',/);
  assert.match(html, /\n {2}es: \{\n {4}locale: 'es-ES',/);
  assert.match(html, /\n {2}fr: \{\n {4}locale: 'fr-FR',/);
  const readmeDe = fs.readFileSync(path.join(ROOT, 'README.de.md'), 'utf8');
  const readmeEn = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.doesNotMatch(readmeDe, /\b\d{1,3}(?:[.,]| (?=\d{3}\b))\d{3}\b/, 'README.de: Tausender mit Punkt, Komma oder normalem Leerzeichen');
  assert.ok(readmeDe.includes(`die ${de} neuesten Scrobbles`) && readmeDe.includes(`die ${de}, die du zuletzt gespeichert hast`));
  assert.doesNotMatch(readmeEn, new RegExp(`\\b\\d{1,3}(?:\\.|[ ${NBSP}](?=\\d{3}\\b))\\d{3}\\b`), 'README.md: Tausender mit Punkt oder Leerzeichen');
  assert.ok(readmeEn.includes('the 1,000 newest scrobbles'));
});

// Spieldauer: kurz und in der Sprache, auf ganze Minuten gerundet, mit geschützten Leerzeichen (bricht nicht um).
test('formatDuration: unter und ab einer Stunde, Rundung, geschätzt mit ≈', () => {
  const NBSP = String.fromCharCode(0xa0);
  const plain = (lang, ms, approx) => formatDuration(lang, ms, approx).replaceAll(NBSP, ' ');
  const H = 3_600_000;
  const M = 60_000;
  // unter einer Stunde
  assert.equal(plain('de', 45 * M), '45 Min.');
  for (const lang of ['en', 'es', 'fr']) assert.equal(plain(lang, 45 * M), '45 min', lang);
  // ab einer Stunde
  assert.equal(plain('de', 3 * H + 15 * M), '3:15 Std.');
  assert.equal(plain('en', 3 * H + 15 * M), '3 h 15 min');
  assert.equal(plain('es', 3 * H + 15 * M), '3 h 15 min');
  assert.equal(plain('fr', 3 * H + 15 * M), '3 h 15');
  assert.equal(plain('de', 2 * H + 5 * M), '2:05 Std.');
  assert.equal(plain('fr', 2 * H + 5 * M), '2 h 05');
  assert.equal(plain('en', 2 * H + 5 * M), '2 h 5 min');
  // volle Stunden
  assert.equal(plain('de', H), '1:00 Std.');
  for (const lang of ['en', 'es', 'fr']) assert.equal(plain(lang, H), '1 h', lang);
  // geschätzt
  assert.equal(plain('de', 3 * H + 15 * M, true), '≈ 3:15 Std.');
  assert.equal(plain('en', 3 * H + 15 * M, true), '≈ 3 h 15 min');
  assert.equal(plain('es', 45 * M, true), '≈ 45 min');
  assert.equal(plain('fr', 3 * H + 15 * M, true), '≈ 3 h 15');
  assert.equal(plain('de', 45 * M, true), '≈ 45 Min.');
  // Rundung auf ganze Minuten, auch über die volle Stunde
  assert.equal(plain('de', 2 * H + 58 * M + 29_999), '2:58 Std.');
  assert.equal(plain('de', 2 * H + 58 * M + 30_000), '2:59 Std.');
  assert.equal(plain('de', 59 * M + 30_000), '1:00 Std.');
  assert.equal(plain('en', 59 * M + 29_999), '59 min');
  assert.equal(plain('de', 29_999), '0 Min.');
  // Unbrauchbare Werte und unbekannte Sprache
  for (const v of [NaN, null, undefined, -5 * M, 'x']) assert.equal(plain('de', v), '0 Min.', String(v));
  assert.equal(plain('xx', 45 * M), '45 min');
  // Nur geschützte Leerzeichen
  for (const lang of LANGS) assert.doesNotMatch(formatDuration(lang, 3 * H + 15 * M, true), / /, lang);
});

test('formatStats: Zeile nach der Zusammenfassung in allen Sprachen; fehlende Teile fallen weg', () => {
  const stats = { artists: 34, yearFrom: 1978, yearTo: 2025, firstTime: 12 };
  assert.equal(formatStats('de', stats), '34 Künstler · Erscheinungsjahre 1978–2025 · 12 Songs zum ersten Mal dabei');
  assert.equal(formatStats('en', stats), '34 artists · release years 1978–2025 · 12 songs for the first time');
  assert.equal(formatStats('es', stats), '34 artistas · años de lanzamiento 1978–2025 · 12 canciones por primera vez');
  assert.equal(formatStats('fr', { ...stats, firstTime: 1 }), '34 artistes · années de sortie 1978–2025 · 1 titre pour la première fois');
  assert.equal(formatStats('de', { artists: 1, yearFrom: 2025, yearTo: 2025, firstTime: 1 }), '1 Künstler · Erscheinungsjahr 2025 · 1 Song zum ersten Mal dabei');
  assert.equal(formatStats('en', { artists: 1, yearFrom: 2025, yearTo: 2025, firstTime: 0 }), '1 artist · release year 2025 · 0 songs for the first time');
  assert.equal(formatStats('de', { artists: 2, yearFrom: null, yearTo: null, firstTime: null }), '2 Künstler', 'ohne Jahr und ohne Verlauf');
  assert.equal(formatStats('en', { artists: 1234, yearFrom: 1999, yearTo: 2001 }), '1,234 artists · release years 1999–2001', 'Jahre ohne Trennzeichen');
  assert.equal(formatStats('de', {}), '');
});
