// Unit-Tests für lastfm.mjs: Datei-Cache und Fehlermeldungen, mit simuliertem fetch (kein Netzwerk).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLastfm } from '../lastfm.mjs';

const calls = [];
const REPLIES = {
  'track.getSimilar': q => (q.get('track') === 'Unbekannt'
    ? { error: 6, message: 'Track not found' }
    : { similartracks: { track: [{ name: 'Echo', match: '0.8', artist: { name: 'Nachbar' } }] } }),
  'artist.getSimilar': () => ({ similarartists: { artist: [{ name: 'Nachbar', match: '0.5' }] } }),
  'artist.getTopTracks': q => ({ toptracks: { track: [{ name: 'Hit', artist: { name: q.get('artist') } }] } }),
  'user.getInfo': q => (q.get('user') === 'hoerer' ? { user: { name: 'hoerer', playcount: '42' } } : { error: 6, message: 'User not found' }),
  'user.getTopTracks': () => ({ toptracks: { track: [] } }),
  'user.getRecentTracks': () => ({ recenttracks: { track: [], '@attr': { totalPages: '0' } } }),
};
globalThis.fetch = async url => {
  const q = new URL(url).searchParams;
  calls.push(q.get('method'));
  const body = q.get('api_key') === 'key' ? REPLIES[q.get('method')](q)
    : q.get('api_key') === 'gesperrt' ? { error: 26, message: 'Suspended API key - Access for your account has been suspended, please contact Last.fm' }
    : { error: 10, message: 'Invalid API key - You must be granted a valid key by last.fm' };
  return new Response(JSON.stringify(body), { status: body.error === 10 ? 403 : 200 });
};

function withCacheFile(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-'));
  calls.length = 0;
  return Promise.resolve(fn(path.join(dir, 'lastfm-cache.json'))).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

// Lässt die Uhr für fn() um `days` Tage vorgehen.
async function later(days, fn) {
  const realNow = Date.now;
  Date.now = () => realNow() + days * 86400_000;
  try {
    return await fn();
  } finally {
    Date.now = realNow;
  }
}

test('Cache: gleiche Abfrage nur einmal, Datei erst mit saveCache(), nächster Lauf liest sie', () => withCacheFile(async file => {
  const lastfm = createLastfm('key', file);
  assert.deepEqual(await lastfm.similarTracks('A', 'B'), [{ artist: 'Nachbar', name: 'Echo', match: 0.8 }]);
  await lastfm.similarTracks('A', 'B');
  assert.deepEqual(calls, ['track.getSimilar']);
  assert.deepEqual(lastfm.cacheStats(), { hits: 1, total: 2 });
  assert.equal(fs.existsSync(file), false, 'nicht bei jeder Abfrage schreiben');
  lastfm.saveCache();
  assert.equal(fs.existsSync(file), true);

  const next = createLastfm('key', file);
  await next.similarTracks('A', 'B');
  await next.artistTopTracks('A');
  assert.deepEqual(calls, ['track.getSimilar', 'artist.getTopTracks']);
  assert.deepEqual(next.cacheStats(), { hits: 1, total: 2 });
}));

test('Cache: nach 7 Tagen abgelaufen, abgelaufene Einträge werden beim Speichern entfernt', () => withCacheFile(async file => {
  const lastfm = createLastfm('key', file);
  await lastfm.similarTracks('A', 'B');
  await lastfm.similarArtists('X');
  lastfm.saveCache();

  await later(6, () => createLastfm('key', file).similarTracks('A', 'B'));
  assert.equal(calls.length, 2, 'nach 6 Tagen noch gültig');

  await later(8, async () => {
    const old = createLastfm('key', file);
    await old.similarTracks('A', 'B');
    old.saveCache();
  });
  assert.deepEqual(calls.slice(2), ['track.getSimilar'], 'nach 8 Tagen neu abgefragt');
  const keys = Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')));
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^track\.getSimilar /);
}));

test('Cache: kaputte Datei wird ignoriert und ersetzt', () => withCacheFile(async file => {
  fs.writeFileSync(file, '{ kaputt');
  const lastfm = createLastfm('key', file);
  await lastfm.similarArtists('X');
  lastfm.saveCache();
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))).length, 1);
}));

test('Cache: "nicht gefunden" (Fehler 6) wird ebenfalls gespeichert', () => withCacheFile(async file => {
  const lastfm = createLastfm('key', file);
  assert.deepEqual(await lastfm.similarTracks('A', 'Unbekannt'), []);
  lastfm.saveCache();
  assert.deepEqual(await createLastfm('key', file).similarTracks('A', 'Unbekannt'), []);
  assert.deepEqual(calls, ['track.getSimilar']);
}));

test('Benutzerbezogene Abfragen kommen nie aus dem Cache', () => withCacheFile(async file => {
  const lastfm = createLastfm('key', file);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(await lastfm.userInfo('hoerer'), { name: 'hoerer', playcount: 42 });
    await lastfm.userTopTracks('hoerer');
    await lastfm.recentTracks('hoerer', 0);
  }
  assert.equal(calls.length, 6);
  assert.deepEqual(lastfm.cacheStats(), { hits: 0, total: 0 });
  lastfm.saveCache();
  assert.equal(fs.existsSync(file), false);
}));

test('userInfo: unbekannter Benutzer = null', async () => {
  assert.equal(await createLastfm('key').userInfo('niemand'), null);
});

test('Ungültiger API-Key: klare Meldung in der gewählten Sprache, als fatal markiert', async () => {
  const bad = e => e.fatal === true && e.errorCode === 'lastfm_key';
  await assert.rejects(createLastfm('falsch', undefined, { lang: 'de' }).similarTracks('A', 'B'),
    e => bad(e) && /^Der Last\.fm-API-Key ist ungültig/.test(e.message));
  await assert.rejects(createLastfm('falsch', undefined, { lang: 'en' }).similarTracks('A', 'B'),
    e => bad(e) && /^The Last\.fm API key is invalid/.test(e.message));
});

test('Gesperrter API-Key (Fehler 26): eigene Meldung, ebenfalls fatal', async () => {
  const bad = e => e.fatal === true && e.errorCode === 'lastfm_key';
  await assert.rejects(createLastfm('gesperrt', undefined, { lang: 'de' }).similarTracks('A', 'B'),
    e => bad(e) && /^Last.fm hat deinen API-Key gesperrt/.test(e.message));
  await assert.rejects(createLastfm('gesperrt', undefined, { lang: 'en' }).userInfo('hoerer'),
    e => bad(e) && /^Last.fm has suspended your API key/.test(e.message));
  assert.equal(calls.filter(m => m === 'track.getSimilar').length >= 1, true);
});

test('Ohne Cache-Datei: saveCache() schreibt nichts', async () => {
  const lastfm = createLastfm('key');
  await lastfm.similarArtists('X');
  assert.doesNotThrow(() => lastfm.saveCache());
});
