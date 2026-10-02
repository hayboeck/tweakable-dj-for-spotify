// Unit-Tests für die Auswahl- und Sortierregeln (lineup.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrange, artistBlocker, candidateWeight, norm, sameTrack, trackKey, weightedOrder, windowViolations } from '../lineup.mjs';

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
