// Unit-Tests für die Auswahl- und Sortierregeln (lineup.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arrange, artistBlocker, artistNames, cacheEntry, cacheValue, candidateWeight, durationOf, followedFactor, followedMatcher, FOLLOWED_MAX,
  lineupDuration, norm, playableDurationMs, playableUri, sameTrack, searchAgain, SONG_MS, trackBlocker, trackKey, weightedOrder, windowViolations,
} from '../lineup.mjs';
import { VARIETY_LEVELS } from '../config.mjs';

// Reproduzierbarer Zufall (mulberry32), damit die Tests nicht flattern.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const track = (artist, via) => ({ artist, name: `${artist} ${via ?? ''}`, tags: [...new Set([norm(artist), ...(via ? [norm(via)] : [])])] });
const sorted = list => [...list].sort((a, b) => a.name.localeCompare(b.name) || a.artist.localeCompare(b.artist));
const gapViolations = (list, gap) =>
  list.filter((t, i) => list.slice(Math.max(0, i - gap), i).some(p => norm(p.artist) === norm(t.artist))).length;

test('norm: Zusätze, Groß-/Kleinschreibung, Akzente, "The"', () => {
  assert.equal(norm('Song (Remastered 2011)'), 'song');
  assert.equal(norm('Song - Remastered 2011'), 'song');
  assert.equal(norm('Song [Live]'), 'song');
  assert.equal(norm('Song feat. Someone'), 'song');
  assert.equal(norm('Song ft Someone'), 'song');
  assert.equal(norm('The Beatles'), 'beatles');
  assert.equal(norm('Beyoncé'), 'beyonce');
  assert.equal(norm('Björk'), 'bjork');
  assert.equal(norm('AC/DC'), 'ac dc');
  assert.equal(norm('  Hallo,   Welt!! '), 'hallo welt');
  // Nur Nicht-Latein: nicht leer werden lassen
  assert.equal(norm('東京事変'), '東京事変');
  assert.equal(norm(null), '');
});

test('trackKey: gleicher Schlüssel für Varianten desselben Songs', () => {
  assert.equal(trackKey('The Weeknd', 'Blinding Lights (Remastered)'), 'weeknd|blinding lights');
  assert.equal(trackKey('Queen', 'Bohemian Rhapsody - Remastered 2011'), trackKey('queen', 'Bohemian Rhapsody'));
  assert.notEqual(trackKey('Queen', 'Bohemian Rhapsody'), trackKey('Queen', 'Radio Ga Ga'));
});

test('sameTrack: Remastered/feat.-Varianten ja, falscher Künstler oder Titel nein', () => {
  const sp = (name, ...artists) => ({ name, artists: artists.map(n => ({ name: n })) });
  assert.equal(sameTrack(sp('Bohemian Rhapsody - Remastered 2011', 'Queen'), 'Queen', 'Bohemian Rhapsody'), true);
  assert.equal(sameTrack(sp('Song (feat. B)', 'A', 'B'), 'A', 'Song'), true);
  assert.equal(sameTrack(sp('Song', 'A', 'B'), 'A feat. B', 'Song (feat. B)'), true);
  assert.equal(sameTrack(sp('Nachtschicht', 'Miksu', 'Macloud'), 'Macloud', 'Nachtschicht'), true);
  assert.equal(sameTrack(sp('Nachtschicht', 'Miksu', 'Macloud'), 'Miksu / Macloud', 'Nachtschicht'), true);
  assert.equal(sameTrack(sp('Beyoncé Song', 'Beyoncé'), 'Beyonce', 'Beyonce Song'), true);
  assert.equal(sameTrack(sp('Bohemian Rhapsody', 'Coverband'), 'Queen', 'Bohemian Rhapsody'), false);
  assert.equal(sameTrack(sp('Radio Ga Ga', 'Queen'), 'Queen', 'Bohemian Rhapsody'), false);
  assert.equal(sameTrack(sp('Song'), 'A', 'Song'), false);
  // Nur ganze Wörter: "Rin" ist nicht "Karin", "Love" ist nicht "Lovely"
  assert.equal(sameTrack(sp('Nirvana', 'Karin'), 'Rin', 'Nirvana'), false);
  assert.equal(sameTrack(sp('Nirvana', 'Rin'), 'Karin', 'Nirvana'), false);
  assert.equal(sameTrack(sp('Nirvana', 'Miksu', 'Rin'), 'Rin', 'Nirvana'), true);
  assert.equal(sameTrack(sp('Lovely', 'A'), 'A', 'Love'), false);
});

test('weightedOrder: Permutation, höheres Gewicht eher vorne', () => {
  const rng = seeded(1);
  const items = ['a', 'b', 'c', 'd'];
  assert.deepEqual([...weightedOrder(items, () => 1, rng)].sort(), items);

  // Bei zwei Einträgen liegt a mit Wahrscheinlichkeit 9 / (9 + 1) vorne.
  let aFirst = 0;
  for (let i = 0; i < 2000; i++) if (weightedOrder(['a', 'b'], x => (x === 'a' ? 9 : 1), rng)[0] === 'a') aFirst++;
  assert.ok(aFirst / 2000 > 0.87 && aFirst / 2000 < 0.93, `a vorne: ${aFirst / 2000}`);

  // Gewicht 0 = praktisch immer ganz hinten
  for (let i = 0; i < 200; i++) assert.equal(weightedOrder(['x', 'y', 'z'], v => (v === 'x' ? 0 : 1), rng)[2], 'x');
});

test('candidateWeight: adventure 0 bevorzugt ähnliche, 1 entfernte Songs', () => {
  assert.ok(candidateWeight(0.9, 0) > candidateWeight(0.1, 0));
  assert.ok(candidateWeight(0.9, 1) < candidateWeight(0.1, 1));
  assert.ok(Math.abs(candidateWeight(0.9, 0.5) - candidateWeight(0.1, 0.5)) < 1e-12);
  for (const a of [0, 0.4, 1]) for (const m of [0, 0.5, 1]) assert.ok(candidateWeight(m, a) >= 0.05);
});

test('windowViolations zählt Fenster mit zu vielen Songs pro Tag', () => {
  const list = ['a', 'a', 'a', 'a', 'b'].map(tag => ({ tags: [tag] }));
  assert.equal(windowViolations(list, 4, 3), 1);
  assert.equal(windowViolations(list, 4, 4), 0);
  assert.equal(windowViolations(list, 2, 1), 3);
  assert.equal(windowViolations([], 20, 3), 0);
  // Beide Tags zählen: Interpret und "über"-Künstler
  const via = [track('A', 'X'), track('B', 'X'), track('X')];
  assert.equal(windowViolations(via, 3, 2), 1);
});

test('arrange: Fensterregel auch bei gehäuften Tags eingehalten', () => {
  // 6 Songs über Bonez MC (einer davon von ihm), 6 über RAF Camora, 8 weitere: 20 Songs, max. 3 aus 10
  const tracks = [
    track('Bonez MC'),
    ...['A1', 'A2', 'A3', 'A4', 'A5'].map(a => track(a, 'Bonez MC')),
    ...['B1', 'B2', 'B3', 'B4', 'B5', 'B6'].map(a => track(a, 'RAF Camora')),
    ...['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'].map(a => track(a)),
  ];
  const opts = { gap: 2, window: 10, maxPerWindow: 3 };
  for (let seed = 1; seed <= 20; seed++) {
    const out = arrange(tracks, opts, seeded(seed));
    assert.deepEqual(sorted(out), sorted(tracks), 'gleiche Songs, nur umsortiert');
    assert.equal(windowViolations(out, opts.window, opts.maxPerWindow), 0, `Seed ${seed}`);
  }
});

test('arrange: Mindestabstand zwischen Songs desselben Interpreten', () => {
  const tracks = ['A', 'B', 'C', 'D'].flatMap(a => [1, 2, 3].map(i => ({ ...track(a), name: `${a}${i}` })));
  for (let seed = 1; seed <= 10; seed++) {
    const out = arrange(tracks, { gap: 3, window: 12, maxPerWindow: 3 }, seeded(seed));
    assert.equal(gapViolations(out, 3), 0, `Seed ${seed}`);
  }
});

test('arrange: Fensterregel hat Vorrang vor dem Mindestabstand', () => {
  // 4 Songs über X, max. 2 aus 4: Nur "X X R R X X" hält die Fensterregel ein, dafür stehen die R-Songs direkt hintereinander.
  const tracks = [...['P', 'Q', 'S', 'T'].map(a => track(a, 'X')), { ...track('R'), name: 'R1' }, { ...track('R'), name: 'R2' }];
  for (let seed = 1; seed <= 5; seed++) {
    const out = arrange(tracks, { gap: 1, window: 4, maxPerWindow: 2 }, seeded(seed));
    assert.equal(windowViolations(out, 4, 2), 0, `Seed ${seed}`);
    assert.equal(gapViolations(out, 1), 1, `Seed ${seed}`);
  }
});

test('arrange: Abstand 0 (aus) verteilt trotzdem nach der Fensterregel', () => {
  // A dreimal, 10 andere, max. 1 aus 5: geht nur, wenn A nicht ans Ende geschoben wird.
  const tracks = [...[1, 2, 3].map(i => ({ ...track('A'), name: `A${i}` })), ...Array.from({ length: 10 }, (_, i) => track(`S${i}`))];
  for (let seed = 1; seed <= 10; seed++) {
    assert.equal(windowViolations(arrange(tracks, { gap: 0, window: 5, maxPerWindow: 1 }, seeded(seed)), 5, 1), 0, `Seed ${seed}`);
  }
});

test('arrange: unerfüllbare Regeln liefern trotzdem alle Songs', () => {
  const tracks = Array.from({ length: 8 }, (_, i) => ({ artist: `K${i}`, name: `S${i}`, tags: ['x'] }));
  const out = arrange(tracks, { gap: 1, window: 4, maxPerWindow: 1 }, seeded(5));
  assert.equal(out.length, 8);
  assert.ok(windowViolations(out, 4, 1) > 0);
  assert.deepEqual(arrange([], { gap: 4, window: 20, maxPerWindow: 3 }), []);
});

test('artistBlocker: ganze Wörter, auch bei mehreren Künstlern', () => {
  const blocked = artistBlocker(['Macloud', 'Rin', 'The Weeknd', 'Beyoncé', 'RAF Camora']);
  for (const artist of ['Macloud', 'MACLOUD', 'Miksu / Macloud', 'Macloud & Miksu', 'Miksu, Macloud', 'Miksu feat. Macloud',
    'Miksu ft. Macloud', 'Miksu (feat. Macloud)', 'Rin', 'Rin & Bausa', 'The Weeknd', 'Weeknd', 'Beyonce', 'Bonez MC & RAF Camora']) {
    assert.equal(blocked(artist), true, artist);
  }
  for (const artist of ['Karin', 'Rinaldo', 'Karin / Tina', 'Maclouds', 'Miksu', 'RAF', 'Camora Band X', '', undefined]) {
    assert.equal(blocked(artist), false, String(artist));
  }
});

test('artistBlocker: leere Sperrliste sperrt nichts', () => {
  assert.equal(artistBlocker([])('Macloud'), false);
  assert.equal(artistBlocker(['', '  '])('Macloud'), false);
});

test('artistNames: einzelne Namen aus "feat.", "/", ",", "&", "x" – und der ganze Text', () => {
  assert.deepEqual(artistNames('A feat. B'), ['A feat. B', 'A', 'B']);
  assert.deepEqual(artistNames('A (feat. B)'), ['A (feat. B)', 'A', 'B']);
  assert.deepEqual(artistNames('Miksu / Macloud'), ['Miksu / Macloud', 'Miksu', 'Macloud']);
  assert.deepEqual(artistNames('A, B & C'), ['A, B & C', 'A', 'B', 'C']);
  assert.deepEqual(artistNames('A x B'), ['A x B', 'A', 'B']);
  assert.deepEqual(artistNames('A ft. B'), ['A ft. B', 'A', 'B']);
  assert.deepEqual(artistNames('Malcolm X'), ['Malcolm X']);
  assert.deepEqual(artistNames('X Ambassadors'), ['X Ambassadors']);
  assert.deepEqual(artistNames(''), []);
  assert.deepEqual(artistNames(undefined), []);
});

test('followedMatcher: Vergleich über norm(), nur ganze Namen, Haupt- und Gastkünstler', () => {
  const followed = followedMatcher(['Queen', 'THE Stadtkind', 'Beyoncé', 'Simon & Garfunkel']);
  for (const artists of ['Queen', 'queen', 'A feat. Queen', 'Miksu / Queen', ['Miksu', 'Queen'], 'Stadtkind', 'The Stadtkind', 'Beyonce',
    'Simon & Garfunkel']) {
    assert.equal(followed(artists), true, String(artists));
  }
  for (const artists of ['Queen Latifah', 'Queens', 'Karin', 'Simon', ['Miksu', 'Macloud'], '', undefined, []]) {
    assert.equal(followed(artists), false, String(artists));
  }
  assert.equal(followedMatcher([])('Queen'), false, 'leere Liste');
  assert.equal(followedMatcher(['', '  '])('Queen'), false);
});

test('followedFactor: −1 = gar nicht, 0 = egal, +1 = FOLLOWED_MAX-fach, dazwischen exponentiell und symmetrisch', () => {
  assert.equal(FOLLOWED_MAX, 10);
  assert.equal(followedFactor(-1), 0);
  assert.equal(followedFactor(0), 1);
  assert.equal(followedFactor(1), 10);
  assert.ok(Math.abs(followedFactor(0.5) - Math.sqrt(10)) < 1e-12);
  assert.ok(Math.abs(followedFactor(-0.5) * followedFactor(0.5) - 1) < 1e-12, 'weniger und mehr spiegelbildlich');
  // Streng steigend, und kurz vor −1 schon fast 0 (stetiger Übergang zum Filter)
  const steps = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map(followedFactor);
  steps.slice(1).forEach((f, i) => assert.ok(f > steps[i], `Stufe ${i + 1}`));
  assert.ok(followedFactor(-0.99) < 0.11);
});

test('Gefolgte Künstler bei der Auslosung: mehr bzw. weniger oft, bei +1 aber nicht ausschließlich', () => {
  // 100 Kandidaten, 20 davon von gefolgten Künstlern; gezogen werden 20 (wie candidateWeight × Faktor in dj.mjs).
  const isFollowed = followedMatcher(Array.from({ length: 20 }, (_, i) => `Gefolgt ${i}`));
  const pool = Array.from({ length: 100 }, (_, i) => ({ artist: i < 20 ? `Gefolgt ${i}` : `Andere ${i}`, match: (i % 10) / 10 }));
  const share = setting => {
    const rng = seeded(42);
    let hits = 0;
    for (let round = 0; round < 200; round++) {
      const drawn = weightedOrder(pool, c => candidateWeight(c.match, 0.4) * (isFollowed(c.artist) ? followedFactor(setting) : 1), rng).slice(0, 20);
      hits += drawn.filter(c => isFollowed(c.artist)).length;
    }
    return hits / (200 * 20);
  };
  const shares = [-0.5, 0, 0.5, 1].map(share);
  assert.ok(Math.abs(shares[1] - 0.2) < 0.03, `egal: ${shares[1]}`);
  shares.slice(1).forEach((s, i) => assert.ok(s > shares[i] + 0.05, `${shares}`));
  assert.ok(shares[3] > 0.55 && shares[3] < 0.95, `stark bevorzugt, aber nicht nur: ${shares[3]}`);
});

test('Abwechslung bei Künstlern: jede Stufe ist mit 50 Songs erfüllbar (Auswahl wie in dj.mjs, Reihenfolge mit arrange)', () => {
  // Typische Bibliothek: 400 Lieblingssongs von 120 Künstlern (wenige mit vielen Songs), 20 Ausgangspunkte mit je 30 ähnlichen
  // Songs aus 15 verwandten Künstlern. Auswahl wie in dj.mjs: maxPerArtist pro Interpret, je Tag höchstens
  // ceil(size × maxPerWindow / artistWindow), 15 % Favoriten, dann neue Songs, dann mit Favoriten auffüllen.
  const size = 50;
  for (const { id, values: v } of VARIETY_LEVELS) {
    for (let seed = 1; seed <= 3; seed++) {
      const rng = seeded(seed);
      const artistOf = () => `Fav ${Math.floor(120 * rng() ** 2)}`;
      const favorites = Array.from({ length: 400 }, (_, i) => ({ artist: artistOf(), name: `Lied ${i}` }));
      const related = new Map();
      const candidates = weightedOrder(favorites, () => 1, rng).slice(0, 20).flatMap(seedTrack => {
        if (!related.has(seedTrack.artist)) related.set(seedTrack.artist, Array.from({ length: 15 }, () => `Neu ${Math.floor(rng() * 400)}`));
        return Array.from({ length: 30 }, (_, j) => ({ artist: related.get(seedTrack.artist)[Math.floor(rng() * 15)], name: `${seedTrack.name} ${j}`, via: seedTrack.artist }));
      });
      const tagLimit = Math.ceil((size * v.maxPerWindow) / v.artistWindow);
      const perArtist = new Map();
      const perTag = new Map();
      const out = [];
      const add = (t, tags) => {
        const a = norm(t.artist);
        if (out.length >= size || (perArtist.get(a) ?? 0) >= v.maxPerArtist || tags.some(g => (perTag.get(g) ?? 0) >= tagLimit)) return;
        perArtist.set(a, (perArtist.get(a) ?? 0) + 1);
        tags.forEach(g => perTag.set(g, (perTag.get(g) ?? 0) + 1));
        out.push({ ...t, tags });
      };
      for (const f of weightedOrder(favorites, () => 1, rng)) if (out.length < Math.round(size * 0.15)) add(f, [norm(f.artist)]);
      for (const c of weightedOrder(candidates, () => 1, rng)) add(c, [...new Set([norm(c.artist), norm(c.via)])]);
      for (const f of weightedOrder(favorites, () => 1, rng)) add(f, [norm(f.artist)]);
      const lineup = arrange(out, { gap: v.artistGap, window: v.artistWindow, maxPerWindow: v.maxPerWindow }, rng);
      assert.equal(lineup.length, size, `${id}, Seed ${seed}: zu wenige Songs`);
      assert.equal(windowViolations(lineup, v.artistWindow, v.maxPerWindow), 0, `${id}, Seed ${seed}: Fensterregel`);
      assert.equal(gapViolations(lineup, v.artistGap), 0, `${id}, Seed ${seed}: Mindestabstand`);
    }
  }
});

test('trackBlocker: gleiche URI oder gleicher trackKey (andere Versionen), kaputte Einträge zählen nicht', () => {
  const blocked = trackBlocker([
    { uri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa', artist: 'Nordlicht', name: 'Eisblau' },
    { artist: 'The Fernweh', name: 'Horizont (Remastered 2011)' },
    null, 'Text', { artist: '', name: 'Leer' }, { uri: 42 },
  ]);
  assert.equal(blocked({ uri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa', artist: 'Ganz', name: 'Anders' }), true, 'URI');
  assert.equal(blocked({ uri: 'spotify:track:bbbbbbbbbbbbbbbbbbbbbb', artist: 'Nordlicht', name: 'Eisblau - Live' }), true, 'andere Version');
  assert.equal(blocked({ artist: 'Fernweh', name: 'Horizont' }), true, 'ohne URI (Last.fm), "The" und Klammer egal');
  assert.equal(blocked({ artist: 'Fernweh feat. Gast', name: 'Horizont' }), true, 'Gast im Künstler-Text');
  assert.equal(blocked({ artist: 'Nordlicht', name: 'Polarnacht' }), false);
  assert.equal(blocked({ artist: 'Leer', name: 'Leer' }), false);
  assert.equal(blocked({}), false);
  assert.equal(trackBlocker(undefined)({ artist: 'A', name: 'B' }), false);
});

test('Such-Cache: Einträge von 0.1.1 (nur URI) bleiben lesbar, explicit unbekannt → nur mit Filter neu suchen', () => {
  const uri = 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa';
  const clean = 'spotify:track:cccccccccccccccccccccc';
  const none = { durationMs: null, cleanDurationMs: null };
  // altes Format
  assert.deepEqual(cacheEntry(uri), { uri, explicit: null, clean: null, ...none });
  assert.equal(cacheEntry(null), null, 'nicht gefunden bleibt nicht gefunden');
  for (const broken of [undefined, '', 42, {}, { uri: 1 }, []]) assert.equal(cacheEntry(broken), undefined, JSON.stringify(broken));
  // neues Format
  assert.deepEqual(cacheValue({ uri, explicit: false, artists: ['A'] }), { uri, explicit: false });
  assert.deepEqual(cacheValue({ uri, explicit: true, clean: { uri: clean } }), { uri, explicit: true, clean });
  assert.deepEqual(cacheValue({ uri, explicit: true, clean: null }), { uri, explicit: true, clean: null });
  assert.equal(cacheValue(null), null);
  assert.deepEqual(cacheEntry(cacheValue({ uri, explicit: true, clean: { uri: clean } })), { uri, explicit: true, clean, ...none });
  assert.deepEqual(cacheEntry({ uri, explicit: false, clean }), { uri, explicit: false, clean: null, ...none }, 'clean nur bei explicit');
  // Neu suchen?
  assert.equal(searchAgain(undefined, false), true, 'nicht im Cache');
  assert.equal(searchAgain(cacheEntry(uri), false), false, 'alter Eintrag ohne Filter: bleibt');
  assert.equal(searchAgain(cacheEntry(uri), true), true, 'alter Eintrag mit Filter: neu suchen');
  assert.equal(searchAgain(null, true), false, 'nicht gefunden: nicht jedes Mal neu suchen');
  assert.equal(searchAgain(cacheEntry({ uri, explicit: false }), true), false);
  // URI für die Playlist
  assert.equal(playableUri(cacheEntry({ uri, explicit: true, clean }), false), uri, 'ohne Filter: der Treffer');
  assert.equal(playableUri(cacheEntry({ uri, explicit: true, clean }), true), clean, 'mit Filter: die nicht explizite Version');
  assert.equal(playableUri(cacheEntry({ uri, explicit: true, clean: null }), true), null, 'keine: auslassen');
  assert.equal(playableUri(cacheEntry({ uri, explicit: false }), true), uri);
  assert.equal(playableUri(cacheEntry(uri), true), null, 'unbekannt mit Filter: lieber auslassen');
  assert.equal(playableUri(null, false), null);
});

test('Such-Cache mit Spieldauer: neue Einträge speichern sie, alte bleiben lesbar und werden deshalb nicht neu gesucht', () => {
  const uri = 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa';
  const clean = 'spotify:track:cccccccccccccccccccccc';
  // Neuer Eintrag: Dauer des Treffers und der nicht expliziten Version
  assert.deepEqual(cacheValue({ uri, explicit: false, durationMs: 201_500 }), { uri, explicit: false, durationMs: 201_500 });
  assert.deepEqual(cacheValue({ uri, explicit: true, durationMs: 200_000, clean: { uri: clean, durationMs: 199_000 } }),
    { uri, explicit: true, durationMs: 200_000, clean, cleanDurationMs: 199_000 });
  assert.deepEqual(cacheValue({ uri, explicit: false, durationMs: null }), { uri, explicit: false }, 'ohne Dauer kein Feld');
  const entry = cacheEntry({ uri, explicit: true, durationMs: 200_000, clean, cleanDurationMs: 199_000 });
  assert.deepEqual(entry, { uri, explicit: true, clean, durationMs: 200_000, cleanDurationMs: 199_000 });
  // Dauer passend zur URI aus playableUri
  assert.equal(playableDurationMs(entry, false), 200_000);
  assert.equal(playableDurationMs(entry, true), 199_000, 'mit Filter: Dauer der nicht expliziten Version');
  assert.equal(playableDurationMs(cacheEntry({ uri, explicit: true, durationMs: 200_000, clean: null }), true), null);
  assert.equal(playableDurationMs(null, false), null);
  // Alte Einträge (bis 0.1.4 ohne Dauer, 0.1.1 nur URI): Dauer unbekannt, kein neues Suchen deswegen
  for (const old of [uri, { uri, explicit: false }, { uri, explicit: true, clean }]) {
    const e = cacheEntry(old);
    assert.equal(e.durationMs, null);
    assert.equal(playableDurationMs(e, false), null);
    assert.equal(searchAgain(e, false), false, JSON.stringify(old));
  }
  assert.equal(searchAgain(cacheEntry({ uri, explicit: false }), true), false, 'auch mit Filter nicht wegen der Dauer');
  // Kaputte Werte zählen als unbekannt
  for (const bad of [0, -1, '200000', NaN, Infinity, null, undefined]) {
    assert.equal(durationOf(bad), null, String(bad));
    assert.equal(cacheEntry({ uri, explicit: false, durationMs: bad }).durationMs, null, String(bad));
  }
  assert.equal(durationOf(200_000.4), 200_000);
});

test('lineupDuration: Summe; fehlende Dauer mit dem Durchschnitt der bekannten geschätzt, ohne bekannte 3,5 Minuten', () => {
  assert.deepEqual(lineupDuration([{ durationMs: 180_000 }, { durationMs: 240_000 }]), { durationMs: 420_000, durationEstimated: false });
  // Ein Song ohne Dauer (alter Cache-Eintrag) → Durchschnitt der beiden bekannten
  assert.deepEqual(lineupDuration([{ durationMs: 180_000 }, { durationMs: 240_000 }, { durationMs: null }]),
    { durationMs: 630_000, durationEstimated: true });
  assert.deepEqual(lineupDuration([{ durationMs: 200_000 }, {}, { durationMs: 0 }]), { durationMs: 600_000, durationEstimated: true });
  // Keine Dauer bekannt
  assert.equal(SONG_MS, 210_000);
  assert.deepEqual(lineupDuration([{}, { durationMs: null }]), { durationMs: 420_000, durationEstimated: true });
  assert.deepEqual(lineupDuration([]), { durationMs: 0, durationEstimated: false });
});
