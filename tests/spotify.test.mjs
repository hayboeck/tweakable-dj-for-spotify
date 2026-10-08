// Unit-Tests für spotify.mjs: Wiederholen bei vorübergehenden Störungen von Spotify (5xx), mit simuliertem fetch (kein Netzwerk).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.TWEAKABLE_DJ_FAST_RETRY = '1';
const { createSpotify } = await import('../spotify.mjs');
const { writePlaylist } = await import('../playlist.mjs');

// Antworten der Reihe nach je "METHODE Pfad"; was fehlt, ist 200 mit {}. calls: alle Anfragen.
function fakeSpotify(script) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method ?? 'GET'} ${u.pathname.replace(/^\/v1/, '')}`;
    calls.push(key);
    const next = script[key]?.shift() ?? [200, {}];
    return new Response(JSON.stringify(next[1]), { status: next[0] });
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdj spotify ü-'));
  const file = path.join(dir, 'tokens.json');
  fs.writeFileSync(file, JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: Date.now() + 3600_000 }));
  return { spotify: createSpotify('client', file, { lang: 'de' }), calls, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const BAD = [502, { error: { status: 502, message: 'An unexpected error occurred. Please try again later.' } }];

test('Lesen bei 502 wiederholen, danach klappt es', async () => {
  const { spotify, calls, done } = fakeSpotify({ 'GET /me': [BAD, BAD, [200, { id: 'ich' }]] });
  try {
    assert.equal((await spotify.me()).id, 'ich');
    assert.equal(calls.length, 3);
  } finally { done(); }
});

test('Bleibt Spotify gestört, kommt der Fehler nach drei Wiederholungen', async () => {
  const { spotify, calls, done } = fakeSpotify({ 'GET /me': [BAD, BAD, BAD, BAD, BAD] });
  try {
    await assert.rejects(spotify.me(), e => e.status === 502);
    assert.equal(calls.length, 4);
  } finally { done(); }
});

test('Anlegen bei 502: erst nachsehen – hat Spotify sie doch angelegt, nicht doppelt anlegen', async () => {
  const { spotify, calls, done } = fakeSpotify({
    'GET /me': [[200, { id: 'ich' }]],
    'GET /me/playlists': [[200, { items: [], next: null }], [200, { items: [{ id: 'neu1', name: 'Tweakable DJ', owner: { id: 'ich' } }], next: null }]],
    'POST /me/playlists': [BAD],
  });
  try {
    const r = await writePlaylist(spotify, { name: 'Tweakable DJ', uris: ['spotify:track:0123456789abcdefABCDEF'], description: 'd', lang: 'de' });
    assert.deepEqual([r.id, r.created], ['neu1', true]);
    assert.equal(calls.filter(c => c === 'POST /me/playlists').length, 1);
  } finally { done(); }
});

test('Anlegen bei 502 und noch nicht da: noch einmal anlegen', async () => {
  const { spotify, calls, done } = fakeSpotify({
    'GET /me': [[200, { id: 'ich' }]],
    'GET /me/playlists': [[200, { items: [], next: null }], [200, { items: [], next: null }]],
    'POST /me/playlists': [BAD, [201, { id: 'neu2' }]],
  });
  try {
    const r = await writePlaylist(spotify, { name: 'Tweakable DJ', uris: ['spotify:track:0123456789abcdefABCDEF'], description: 'd', lang: 'de' });
    assert.equal(r.id, 'neu2');
    assert.equal(calls.filter(c => c === 'POST /me/playlists').length, 2);
  } finally { done(); }
});
