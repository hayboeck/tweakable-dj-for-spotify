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

test('Bekannte ID: Playlist direkt nehmen, auch wenn die Liste der Playlists unvollständig ist – nie doppelt anlegen', async () => {
  const { spotify, calls, done } = fakeSpotify({
    'GET /me': [[200, { id: 'ich' }]],
    'GET /playlists/alt1': [[200, { id: 'alt1', name: 'Tweakable DJ', owner: { id: 'ich' } }]],
    'GET /me/playlists': [[200, { items: [], next: null }]],
  });
  try {
    const r = await writePlaylist(spotify, { name: 'Tweakable DJ', uris: ['spotify:track:0123456789abcdefABCDEF'], description: 'd', lang: 'de', knownId: 'alt1' });
    assert.deepEqual([r.id, r.created], ['alt1', false]);
    assert.ok(!calls.includes('POST /me/playlists'));
    assert.ok(!calls.includes('GET /me/playlists'), 'ohne Suche in der Liste');
  } finally { done(); }
});

test('Bekannte ID gibt es nicht mehr bzw. heißt anders: Suche nach dem Namen wie bisher', async () => {
  const { spotify, done } = fakeSpotify({
    'GET /me': [[200, { id: 'ich' }]],
    'GET /playlists/weg': [[404, { error: { status: 404, message: 'Not found.' } }]],
    'GET /me/playlists': [[200, { items: [{ id: 'da2', name: 'Tweakable DJ', owner: { id: 'ich' } }], next: null }]],
  });
  try {
    const r = await writePlaylist(spotify, { name: 'Tweakable DJ', uris: ['spotify:track:0123456789abcdefABCDEF'], description: 'd', lang: 'de', knownId: 'weg' });
    assert.deepEqual([r.id, r.created], ['da2', false]);
  } finally { done(); }
});

// Abgelaufenes Zugangs-Token in tokens.json; Antworten wie bei fakeSpotify, dazu der Token-Endpunkt (zählt die Anfragen).
function expiredSpotify({ refreshDelay = 50 } = {}) {
  const calls = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdj spotify ü-'));
  const file = path.join(dir, 'tokens.json');
  fs.writeFileSync(file, JSON.stringify({ access_token: 'alt', refresh_token: 'r1', expires_at: Date.now() - 1000, authorized_at: 1 }));
  let n = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.hostname === 'accounts.spotify.com') {
      const body = new URLSearchParams(String(init.body));
      calls.push(`token ${body.get('refresh_token')}`);
      await new Promise(resolve => setTimeout(resolve, refreshDelay));
      // Spotify ersetzt das Refresh-Token beim Erneuern; das alte gilt danach nicht mehr.
      if (body.get('refresh_token') !== `r${n + 1}`) return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Refresh token revoked' }), { status: 400 });
      n++;
      return new Response(JSON.stringify({ access_token: `neu${n}`, refresh_token: `r${n + 1}`, expires_in: 3600 }), { status: 200 });
    }
    calls.push(`${init.headers?.Authorization} ${u.pathname}`);
    if (!/^Bearer neu\d$/.test(init.headers?.Authorization)) return new Response(JSON.stringify({ error: { status: 401 } }), { status: 401 });
    return new Response(JSON.stringify({ id: 'ich' }), { status: 200 });
  };
  return { file, calls, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('Abgelaufenes Token: mehrere Anfragen gleichzeitig erneuern es nur einmal (gemeinsam), tokens.json danach vollständig', async () => {
  const { file, calls, done } = expiredSpotify();
  try {
    const spotify = createSpotify('client', file, { lang: 'de' });
    const results = await Promise.all([spotify.me(), spotify.me(), spotify.me()]);
    assert.deepEqual(results.map(r => r.id), ['ich', 'ich', 'ich']);
    assert.deepEqual(calls.filter(c => c.startsWith('token')), ['token r1'], 'nur ein Erneuern');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual([saved.access_token, saved.refresh_token, saved.authorized_at], ['neu1', 'r2', 1]);
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['tokens.json'], 'keine Zwischendatei übrig');
  } finally { done(); }
});

test('Hat ein anderer Prozess das Token schon erneuert, gilt dessen Stand aus tokens.json (kein zweites Erneuern mit altem Refresh-Token)', async () => {
  const { file, calls, done } = expiredSpotify();
  try {
    const spotify = createSpotify('client', file, { lang: 'de' }); // liest das abgelaufene Token
    const other = createSpotify('client', file, { lang: 'de' });
    assert.equal((await other.me()).id, 'ich'); // anderer Prozess erneuert: neu1, Refresh-Token r2
    assert.equal((await spotify.me()).id, 'ich');
    assert.deepEqual(calls.filter(c => c.startsWith('token')), ['token r1'], 'das neue Token aus der Datei genommen');
    assert.ok(calls.includes('Bearer neu1 /v1/me'));
  } finally { done(); }
});

test('tokens.json kaputt bzw. mit BOM: nicht angemeldet bzw. lesbar', async () => {
  const { file, done } = expiredSpotify();
  try {
    fs.writeFileSync(file, '{ "access_token": ');
    await assert.rejects(createSpotify('client', file, { lang: 'de' }).me(), e => e.errorCode === 'not_logged_in');
    fs.writeFileSync(file, `﻿${JSON.stringify({ access_token: 'neu1', refresh_token: 'r2', expires_at: Date.now() + 3600_000 })}`);
    assert.equal((await createSpotify('client', file, { lang: 'de' }).me()).id, 'ich');
  } finally { done(); }
});
