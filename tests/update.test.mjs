// Unit-Tests für update.mjs: Versionsvergleich, Tages-Cache, Fehlerfälle und Abschalten,
// mit simuliertem fetch (kein Netzwerk) und temporärer package.json samt Cache-Datei (nie im Projektordner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkForUpdate, compareVersions, currentVersion, isUpdate, repoSlug } from '../update.mjs';

const HOUR = 3600_000;
const T0 = Date.parse('2026-10-01T08:00:00Z');
const PKG = { name: 'tweakable-dj', version: '1.2.0', repository: 'github:beispiel/tweakable-dj' };
const API = 'https://api.github.com/repos/beispiel/tweakable-dj/releases/latest';
const releaseUrl = tag => `https://github.com/beispiel/tweakable-dj/releases/tag/${tag}`;

// Temporärer Projektordner; fn bekommt die Optionen für checkForUpdate() (env leer, damit eine
// gesetzte TWEAKABLE_DJ_NO_UPDATE_CHECK der Testumgebung nicht stört).
function withProject(pkg, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweakable dj ü-'));
  const pkgFile = path.join(dir, 'package.json');
  if (pkg !== undefined) fs.writeFileSync(pkgFile, typeof pkg === 'string' ? pkg : JSON.stringify(pkg));
  const opts = { pkgFile, cacheFile: path.join(dir, 'update-check.json'), env: {}, now: T0 };
  return Promise.resolve(fn(opts, dir)).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

// Simuliertes fetch: merkt sich jede Anfrage; reply() liefert eine Response oder einen Error (= Netzfehler).
function fakeFetch(reply) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const r = await reply(url, init);
    if (r instanceof Error) throw r;
    return r;
  };
  return Object.assign(fetch, { calls });
}
const json = (body, status = 200) => () => new Response(JSON.stringify(body), { status });
const release = (tag, extra) => json({ tag_name: tag, html_url: releaseUrl(tag), ...extra });

test('compareVersions: Gleichstand, Patch/Minor/Major, v-Präfix, Build-Angabe', () => {
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('v1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.2.3+build.7', 'V1.2.3'), 0);
  assert.equal(compareVersions('v2.0', '2.0.0'), 0);
  assert.equal(compareVersions('1.2.4', '1.2.3'), 1);
  assert.equal(compareVersions('1.3.0', '1.2.9'), 1);
  assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
  assert.equal(compareVersions('1.2.3', 'v1.2.4'), -1);
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1, 'numerisch, nicht nach Text');
  assert.equal(compareVersions('kaputt', '1.0.0'), null);
  assert.equal(compareVersions('1.0.0', undefined), null);
});

test('compareVersions: Vorabversionen in der Reihenfolge von semver.org', () => {
  const order = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2',
    '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', 'v1.0.1-beta.1', '1.0.1'];
  for (let i = 0; i < order.length; i++) {
    for (let j = 0; j < order.length; j++) {
      assert.equal(compareVersions(order[i], order[j]), Math.sign(i - j), `${order[i]} vs. ${order[j]}`);
    }
  }
});

test('isUpdate: nur neuere fertige Versionen, Vorabversionen nie', () => {
  assert.equal(isUpdate('1.3.0', '1.2.0'), true);
  assert.equal(isUpdate('v1.2.1', '1.2.0'), true);
  assert.equal(isUpdate('1.2.0', '1.2.0'), false);
  assert.equal(isUpdate('1.1.0', '1.2.0'), false);
  assert.equal(isUpdate('1.3.0-beta.1', '1.2.0'), false);
  assert.equal(isUpdate('1.2.0', '1.2.0-beta.1'), true, 'fertige Version nach eigener Vorabversion');
  assert.equal(isUpdate(null, '1.2.0'), false);
  assert.equal(isUpdate('1.3.0', 'kaputt'), false);
});

test('repoSlug: alle Schreibweisen von "repository", sonst null', async () => {
  const cases = [
    ['github:beispiel/tweakable-dj', 'beispiel/tweakable-dj'],
    ['beispiel/tweakable-dj', 'beispiel/tweakable-dj'],
    [{ type: 'git', url: 'https://github.com/beispiel/tweakable-dj.git' }, 'beispiel/tweakable-dj'],
    [{ type: 'git', url: 'https://github.com/beispiel/tweakable-dj' }, 'beispiel/tweakable-dj'],
    [{ type: 'git', url: 'git+https://github.com/beispiel/tweakable.dj.git' }, 'beispiel/tweakable.dj'],
    ['git@github.com:beispiel/tweakable-dj.git', 'beispiel/tweakable-dj'],
    [undefined, null],
    ['', null],
    ['gitlab:beispiel/tweakable-dj', null],
    [{ type: 'git', url: 'https://gitlab.com/beispiel/tweakable-dj.git' }, null],
    ['beispiel/../x', null],
    // Platzhalter aus package.json, solange das Repository noch nicht veröffentlicht ist
    [{ type: 'git', url: 'git+https://github.com/OWNER/tweakable-dj-for-spotify.git' }, null],
    ['github:OWNER/tweakable-dj-for-spotify', null],
  ];
  for (const [repository, slug] of cases) {
    await withProject({ ...PKG, repository }, ({ pkgFile }) => assert.equal(repoSlug(pkgFile), slug, JSON.stringify(repository)));
  }
  await withProject(undefined, ({ pkgFile }) => assert.equal(repoSlug(pkgFile), null, 'ohne package.json'));
  await withProject('{ kaputt', ({ pkgFile }) => assert.equal(repoSlug(pkgFile), null, 'kaputte package.json'));
});

test('currentVersion: liest "version", auch mit BOM; sonst null', async () => {
  await withProject(PKG, ({ pkgFile }) => assert.equal(currentVersion(pkgFile), '1.2.0'));
  await withProject(`﻿${JSON.stringify(PKG)}`, ({ pkgFile }) => assert.equal(currentVersion(pkgFile), '1.2.0'));
  await withProject({ name: 'x' }, ({ pkgFile }) => assert.equal(currentVersion(pkgFile), null));
  await withProject(undefined, ({ pkgFile }) => assert.equal(currentVersion(pkgFile), null));
});

test('Neue Version: eine GET-Anfrage ohne persönliche Daten, v-Präfix entfernt, Link aufs Release', () => withProject(PKG, async opts => {
  const fetch = fakeFetch(release('v1.3.0'));
  const r = await checkForUpdate({ ...opts, fetch });
  assert.deepEqual(r, {
    enabled: true, current: '1.2.0', latest: '1.3.0', updateAvailable: true,
    url: releaseUrl('v1.3.0'), checkedAt: '2026-10-01T08:00:00.000Z', error: null,
  });
  assert.equal(fetch.calls.length, 1);
  const { url, init } = fetch.calls[0];
  assert.equal(url, API);
  assert.equal(init.method ?? 'GET', 'GET');
  assert.equal(init.body, undefined);
  assert.deepEqual(Object.keys(init).sort(), ['headers', 'signal']);
  assert.deepEqual(init.headers, { Accept: 'application/vnd.github+json', 'User-Agent': 'tweakable-dj', 'X-GitHub-Api-Version': '2022-11-28' });
  assert.ok(init.signal instanceof AbortSignal, 'mit Zeitlimit');
}));

test('Gleiche, ältere oder Vorabversion: kein Update', () => withProject(PKG, async opts => {
  for (const tag of ['v1.2.0', '1.1.9', 'v1.3.0-beta.1']) {
    const r = await checkForUpdate({ ...opts, force: true, fetch: fakeFetch(release(tag)) });
    assert.equal(r.updateAvailable, false, tag);
    assert.equal(r.latest, tag.replace(/^v/, ''));
    assert.equal(r.error, null);
  }
  // als Vorabversion markiertes Release (liefert /releases/latest eigentlich nie) wird ignoriert
  const r = await checkForUpdate({ ...opts, force: true, fetch: fakeFetch(release('v2.0.0', { prerelease: true })) });
  assert.equal(r.updateAvailable, false);
  assert.equal(r.latest, null);
}));

test('Fremder oder fehlender Link: Ersatzlink auf die Release-Seite', () => withProject(PKG, async opts => {
  const r = await checkForUpdate({ ...opts, fetch: fakeFetch(release('v1.3.0', { html_url: 'javascript:alert(1)' })) });
  assert.equal(r.url, 'https://github.com/beispiel/tweakable-dj/releases/latest');
}));

test('Cache: innerhalb von 24 h keine neue Abfrage, danach wieder; force fragt sofort', () => withProject(PKG, async opts => {
  const fetch = fakeFetch(release('v1.3.0'));
  const first = await checkForUpdate({ ...opts, fetch });
  assert.equal(fs.existsSync(opts.cacheFile), true);

  assert.deepEqual(await checkForUpdate({ ...opts, fetch, now: T0 + 23 * HOUR }), first, 'aus dem Cache');
  assert.equal(fetch.calls.length, 1);

  const later = await checkForUpdate({ ...opts, fetch, now: new Date(T0 + 25 * HOUR) });
  assert.equal(fetch.calls.length, 2, 'nach Ablauf neu abgefragt');
  assert.equal(later.checkedAt, new Date(T0 + 25 * HOUR).toISOString());

  const forced = await checkForUpdate({ ...opts, fetch, now: T0 + 26 * HOUR, force: true });
  assert.equal(fetch.calls.length, 3, 'force übergeht den Cache');
  assert.equal(forced.checkedAt, new Date(T0 + 26 * HOUR).toISOString());

  await checkForUpdate({ ...opts, fetch, now: T0 + 49 * HOUR });
  assert.equal(fetch.calls.length, 3, '24 h ab der letzten (auch erzwungenen) Abfrage');
}));

test('Cache: nach eigenem Update verschwindet der Hinweis sofort, ohne neue Abfrage', () => withProject(PKG, async opts => {
  const fetch = fakeFetch(release('v1.3.0'));
  assert.equal((await checkForUpdate({ ...opts, fetch })).updateAvailable, true);
  fs.writeFileSync(opts.pkgFile, JSON.stringify({ ...PKG, version: '1.3.0' }));
  const r = await checkForUpdate({ ...opts, fetch, now: T0 + HOUR });
  assert.equal(r.current, '1.3.0');
  assert.equal(r.updateAvailable, false);
  assert.equal(fetch.calls.length, 1);
}));

test('Cache: kaputte Datei oder Stand eines anderen Repositorys wird ignoriert und ersetzt', () => withProject(PKG, async opts => {
  const fetch = fakeFetch(release('v1.3.0'));
  fs.writeFileSync(opts.cacheFile, '{ kaputt');
  await checkForUpdate({ ...opts, fetch });
  assert.equal(JSON.parse(fs.readFileSync(opts.cacheFile, 'utf8')).repo, 'beispiel/tweakable-dj');

  fs.writeFileSync(opts.pkgFile, JSON.stringify({ ...PKG, repository: 'github:anderes/projekt' }));
  await checkForUpdate({ ...opts, fetch, now: T0 + HOUR });
  assert.equal(fetch.calls.length, 2);
  assert.equal(fetch.calls[1].url, 'https://api.github.com/repos/anderes/projekt/releases/latest');
}));

test('Ohne Cache-Datei (cacheFile: null): jede Abfrage geht raus, nichts wird geschrieben', () => withProject(PKG, async (opts, dir) => {
  const fetch = fakeFetch(release('v1.3.0'));
  await checkForUpdate({ ...opts, cacheFile: null, fetch });
  await checkForUpdate({ ...opts, cacheFile: null, fetch });
  assert.equal(fetch.calls.length, 2);
  assert.deepEqual(fs.readdirSync(dir), ['package.json']);
}));

test('404 (noch kein Release): kein Update, kein Fehler, ebenfalls einen Tag gemerkt', () => withProject(PKG, async opts => {
  const fetch = fakeFetch(json({ message: 'Not Found' }, 404));
  const r = await checkForUpdate({ ...opts, fetch });
  assert.deepEqual(r, {
    enabled: true, current: '1.2.0', latest: null, updateAvailable: false,
    url: null, checkedAt: '2026-10-01T08:00:00.000Z', error: null,
  });
  await checkForUpdate({ ...opts, fetch, now: T0 + 23 * HOUR });
  assert.equal(fetch.calls.length, 1);
}));

// Fehlertexte sind technisch und sprachneutral (die Oberfläche zeigt sie nicht an).
test('Fehler werfen nie: Netzfehler, 403, 429, 500, kaputtes JSON, unerwartete Antwort, Zeitlimit', () => withProject(PKG, async opts => {
  const cases = [
    [() => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }), /^GitHub: ENOTFOUND$/],
    [json({ message: 'API rate limit exceeded' }, 403), /^GitHub: HTTP 403$/],
    [json({}, 429), /^GitHub: HTTP 429$/],
    [json({}, 500), /^GitHub: HTTP 500$/],
    [() => new Response('{ kaputt', { status: 200 }), /^GitHub: invalid tag_name$/],
    [json({ name: 'ohne tag_name' }), /^GitHub: invalid tag_name$/],
    [() => undefined, /.+/],
  ];
  for (const [reply, error] of cases) {
    const r = await checkForUpdate({ ...opts, cacheFile: null, fetch: fakeFetch(reply) });
    assert.equal(r.enabled, true);
    assert.equal(r.updateAvailable, false);
    assert.equal(r.latest, null);
    assert.match(r.error, error);
  }
  // Antwortet nie: bricht nach dem Zeitlimit ab (der Timer hält die Ereignisschleife bis dahin am Leben).
  const hang = (url, init) => new Promise((resolve, reject) => {
    const keepAlive = setTimeout(resolve, 10_000);
    init.signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(init.signal.reason); });
  });
  const r = await checkForUpdate({ ...opts, cacheFile: null, fetch: fakeFetch(hang), timeout: 30 });
  assert.equal(r.error, 'GitHub: TimeoutError');
  // null, nicht undefined: sonst nähme checkForUpdate() das echte fetch
  assert.match((await checkForUpdate({ ...opts, cacheFile: null, fetch: null })).error, /^GitHub: /, 'auch ohne fetch');
}));

test('Fehler mit Cache: letzter erfolgreicher Stand bleibt, neuer Versuch frühestens nach 1 h', () => withProject(PKG, async opts => {
  await checkForUpdate({ ...opts, fetch: fakeFetch(release('v1.3.0')) });
  const fail = fakeFetch(json({}, 403));
  const r = await checkForUpdate({ ...opts, fetch: fail, now: T0 + 25 * HOUR });
  assert.equal(r.latest, '1.3.0');
  assert.equal(r.updateAvailable, true);
  assert.equal(r.url, releaseUrl('v1.3.0'));
  assert.equal(r.error, 'GitHub: HTTP 403');

  assert.deepEqual(await checkForUpdate({ ...opts, fetch: fail, now: T0 + 25.5 * HOUR }), r, 'nicht bei jedem Aufruf neu');
  assert.equal(fail.calls.length, 1);

  const ok = await checkForUpdate({ ...opts, fetch: fakeFetch(release('v1.4.0')), now: T0 + 26.5 * HOUR });
  assert.equal(ok.latest, '1.4.0');
  assert.equal(ok.error, null);
}));

test('Abschalten mit TWEAKABLE_DJ_NO_UPDATE_CHECK=1: keine Abfrage, keine Datei', () => withProject(PKG, async (opts, dir) => {
  const fetch = fakeFetch(release('v1.3.0'));
  const off = {
    enabled: false, current: '1.2.0', latest: null, updateAvailable: false, url: null, checkedAt: null, error: null,
  };
  assert.deepEqual(await checkForUpdate({ ...opts, fetch, env: { TWEAKABLE_DJ_NO_UPDATE_CHECK: '1' } }), off);
  assert.deepEqual(await checkForUpdate({ ...opts, fetch, force: true, env: { TWEAKABLE_DJ_NO_UPDATE_CHECK: 'true' } }), off);
  assert.equal((await checkForUpdate({ ...opts, fetch, env: { TWEAKABLE_DJ_NO_UPDATE_CHECK: '0' } })).enabled, true, '0 = nicht abgeschaltet');
  fs.rmSync(opts.cacheFile);

  // ohne env-Option gilt process.env
  const { env, ...rest } = opts;
  const before = process.env.TWEAKABLE_DJ_NO_UPDATE_CHECK;
  process.env.TWEAKABLE_DJ_NO_UPDATE_CHECK = '1';
  try {
    assert.equal((await checkForUpdate({ ...rest, fetch })).enabled, false);
  } finally {
    if (before === undefined) delete process.env.TWEAKABLE_DJ_NO_UPDATE_CHECK;
    else process.env.TWEAKABLE_DJ_NO_UPDATE_CHECK = before;
  }
  assert.equal(fetch.calls.length, 1);
  assert.deepEqual(fs.readdirSync(dir), ['package.json']);
}));

test('Ohne "repository" oder "version" in package.json: abgeschaltet, keine Abfrage', async () => {
  const fetch = fakeFetch(release('v1.3.0'));
  await withProject({ name: 'tweakable-dj', version: '1.2.0' }, async (opts, dir) => {
    const r = await checkForUpdate({ ...opts, fetch });
    assert.equal(r.enabled, false);
    assert.equal(r.current, '1.2.0');
    assert.equal(r.error, null);
    assert.deepEqual(fs.readdirSync(dir), ['package.json']);
  });
  await withProject({ name: 'tweakable-dj', repository: PKG.repository }, async opts => {
    const r = await checkForUpdate({ ...opts, fetch });
    assert.equal(r.enabled, false);
    assert.equal(r.current, null);
    assert.match(r.error, /version/);
  });
  await withProject(undefined, async opts => assert.equal((await checkForUpdate({ ...opts, fetch })).enabled, false));
  assert.equal(fetch.calls.length, 0);
});

test('Platzhalter OWNER in package.json: abgeschaltet, keine Abfrage, keine Datei', async () => {
  const fetch = fakeFetch(release('v1.3.0'));
  const pkg = { ...PKG, repository: { type: 'git', url: 'git+https://github.com/OWNER/tweakable-dj-for-spotify.git' } };
  await withProject(pkg, async (opts, dir) => {
    const r = await checkForUpdate({ ...opts, fetch, force: true });
    assert.deepEqual(r, {
      enabled: false, current: '1.2.0', latest: null, updateAvailable: false, url: null, checkedAt: null, error: null,
    });
    assert.deepEqual(fs.readdirSync(dir), ['package.json']);
  });
  assert.equal(fetch.calls.length, 0);
});

test('Schreibgeschützter bzw. fehlender Cache-Ordner: kein Fehler', () => withProject(PKG, async (opts, dir) => {
  const r = await checkForUpdate({ ...opts, cacheFile: path.join(dir, 'gibt-es-nicht', 'update-check.json'), fetch: fakeFetch(release('v1.3.0')) });
  assert.equal(r.updateAvailable, true);
  assert.equal(r.error, null);
}));
