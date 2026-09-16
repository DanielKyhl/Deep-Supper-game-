'use strict';
/* The bestiary: meeting and studying creatures, the heaviest of each landed,
   chapters that pay when they are filled in, and the book itself. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');

function onDeck(opts) {
  const h = loadGame(Object.assign({ draw: false, seed: 5 }, opts));
  h.startVoyage();
  return { h, g: h.g, B: h.g.Bestiary, P: h.g.Player };
}
const trophy = (g, id, weight) => ({ id, name: g.monsterDef(id).name, weight, value: 10 });

describe('the book', () => {
  test('eight chapters, four up the line and four below, holding every creature in the sea exactly once', () => {
    const { g, B } = onDeck();
    const chapters = B.chapters();
    assert.equal(chapters.length, 8);
    const ids = B.all().map(d => d.id);
    assert.equal(new Set(ids).size, ids.length, 'nothing twice');
    assert.deepEqual(plain(ids.slice().sort()), plain(g.allMonsters().map(d => d.id).sort()), 'and nothing missing');
    assert.ok(chapters.every(c => c.reward > 0 && c.title && c.list().length));
    for (let i = 1; i < 4; i++) assert.ok(chapters[i].reward > chapters[i - 1].reward, 'deeper pays more: ' + chapters[i].id);
  });

  test('met after one kill, studied after five (a boss after one), and a studied creature is hit harder', () => {
    const { g, B, P } = onDeck();
    const fin = g.monsterDef('gnashfin'), old = g.monsterDef('leviathan');
    assert.equal(B.met(fin), false);
    assert.equal(B.edge(fin), 1);
    P.kills.gnashfin = 1;
    assert.equal(B.met(fin), true);
    assert.equal(B.studied(fin), false);
    P.kills.gnashfin = g.STUDY_KILLS;
    assert.equal(B.studied(fin), true);
    assert.equal(B.edge(fin), g.STUDY_EDGE);
    P.beatBoss = true;
    assert.equal(B.studied(old), true, 'beating the Old One is enough, even in an old save with no kill counted');
  });

  test('every creature has a note on what it does, and deck and diving notes differ', () => {
    const { B } = onDeck();
    for (const d of B.all()) assert.ok(B.note(d).length > 20, d.id);
    const deckEel = B.all().find(d => d.plan === 'eel' && !d.zone), diveEel = B.all().find(d => d.plan === 'eel' && d.zone);
    assert.notEqual(B.note(deckEel), B.note(diveEel));
  });
});

describe('records', () => {
  test('the heaviest of each kind is kept; a new record is announced, the first catch is not', () => {
    const { g, B, P } = onDeck();
    assert.equal(B.landed(trophy(g, 'gnashfin', 120)), 'first');
    assert.equal(P.records.gnashfin, 120);
    assert.equal(g.Game.toastT, 0);
    assert.equal(B.landed(trophy(g, 'gnashfin', 90)), null);
    assert.equal(P.records.gnashfin, 120);
    assert.equal(B.landed(trophy(g, 'gnashfin', 151)), 'record');
    assert.equal(P.records.gnashfin, 151);
    assert.match(g.Game.toastText, /New record: Gnashfin, 151 lb \(was 120\)/);
  });

  test('winning a fight on deck and killing something below both record the catch', () => {
    const { g, B, P } = onDeck();
    g.Player.weapon = 0;
    g.Game.startBattle(g.monsterDef('netbiter'));
    g.Battle.phase = 'fight';
    g.Battle._die();
    assert.equal(P.records.netbiter, g.Battle.reward.weight);

    Object.assign(P, { beatBoss: true, suit: 0, diveWeapon: 0 });
    g.Game.state = 'dive'; g.Dive.start(); g.Dive.enterWater();
    const m = g.Dive.makeMob(g.monsterDef('shelfcrab'), 500, 500, 1);
    g.Dive.killMob(m);
    assert.equal(P.records.shelfcrab, P.catches[P.catches.length - 1].weight);
  });
});

describe('chapters', () => {
  test('filling in a chapter pays its reward once, and says so', () => {
    const { g, B, P } = onDeck();
    const c = B.chapters()[0];
    for (const d of c.list().slice(1)) P.kills[d.id] = 1;
    assert.equal(B.settle().length, 0, 'not yet');
    P.kills[c.list()[0].id] = 1;
    const coins = P.coins;
    const paid = B.settle();
    assert.deepEqual(plain(paid.map(p => p.id)), [c.id]);
    assert.equal(P.coins, coins + c.reward);
    assert.match(g.Game.toastText, new RegExp(c.title));
    assert.equal(B.settle().length, 0, 'and only once');
    assert.equal(P.coins, coins + c.reward);
  });

  test('the last kill of a chapter, in a real fight, pays for it', () => {
    const { g, B, P } = onDeck();
    const c = B.chapters()[1];
    for (const d of c.list()) P.kills[d.id] = 1;
    P.kills[c.list()[0].id] = 0;
    const coins = P.coins;
    g.Player.weapon = 0;
    g.Game.startBattle(c.list()[0]);
    g.Battle.phase = 'fight';
    g.Battle._die();
    assert.ok(P.chapters.includes(c.id));
    assert.equal(P.coins, coins + c.reward);
  });

  test('a full book makes every catch worth more from then on', () => {
    const { g, B, P } = onDeck();
    h_all(g, P);
    assert.equal(B.complete(), true);
    assert.equal(B.valueBonus(), g.NOTES_BONUS);
    const vals = n => { let s = 0; for (let i = 0; i < 400; i++) s += g.makeTrophy(g.monsterDef('tidemaw')).value; return s / 400; };
    const full = vals();
    P.kills = {}; P.beatBoss = false; P.beatMother = false;
    const plainValue = vals();
    assert.ok(full > plainValue * 1.08, full + ' vs ' + plainValue);
  });
});

describe('saving it', () => {
  test('records and paid chapters are saved, and a hand-edited save is cleaned up', () => {
    const { h, g, P } = onDeck();
    P.records = { gnashfin: 150, tidemaw: 210 };
    P.chapters = ['depth1'];
    const S = h.eval('SaveGame');
    const snap = JSON.parse(JSON.stringify(S.snapshot()));
    assert.deepEqual(snap.records, { gnashfin: 150, tidemaw: 210 });
    assert.deepEqual(snap.chapters, ['depth1']);
    const d = S.sanitize(Object.assign(snap, {
      records: { gnashfin: 150.4, nothing: 99, tidemaw: -3, choir: 1e9, penance: 'heavy' },
      chapters: ['depth1', 'depth1', 'made-up', 'shelf']
    }));
    assert.deepEqual(plain(d.records), { gnashfin: 150, choir: 100000 });
    assert.deepEqual(plain(d.chapters), ['depth1', 'shelf']);
    S.restore(d);
    assert.equal(P.records.gnashfin, 150);
    assert.deepEqual(plain(P.chapters), ['depth1', 'shelf']);
  });
});

describe('reading it', () => {
  test('from the pause menu: arrows turn chapters and choose, ENTER reads a page, ESC goes back and then closes', () => {
    const { h, g, B, P } = onDeck();
    P.kills.gnashfin = 2;
    g.Game.pause();
    const item = g.Menu.items('pause').find(i => i.id === 'bestiary');
    assert.match(item.label, /Bestiary {2}\(1\/35\)/);
    item.run();
    assert.ok(B.book);
    h.tap('ArrowRight');
    assert.equal(B.book.chapter, 1);
    h.tap('ArrowLeft'); h.tap('ArrowLeft');
    assert.equal(B.book.chapter, 7, 'wraps round');
    h.tap('ArrowRight');
    h.tap('ArrowDown');
    assert.equal(B.book.sel, 1);
    h.tap('Enter');
    assert.equal(B.book.page, true);
    h.tap('Escape');
    assert.equal(B.book.page, false);
    assert.equal(g.Game.state, 'pause', 'the pause menu waited underneath');
    h.tap('Escape');
    assert.equal(B.book, null);
    assert.equal(g.Game.state, 'pause');
  });

  test('every chapter and every page draws balanced, met or not', () => {
    const { h, g, B, P } = onDeck({ draw: true });
    const rec = h.hires(), bctx = h.eval('bctx');
    P.kills = { gnashfin: 9, tidemaw: 1, mother: 1 };
    P.records = { gnashfin: 180 };
    B.open();
    B.book.t = 1;
    for (let c = 0; c < 8; c++) {
      B.book.chapter = c;
      for (const page of [false, true]) {
        for (let s = 0; s < B.chapters()[c].list().length; s++) {
          Object.assign(B.book, { page, sel: s });
          rec.reset();
          assert.doesNotThrow(() => B.draw(bctx), 'chapter ' + c + ' ' + s);
          assert.equal(rec.depth(), 0, 'chapter ' + c + ' page ' + page + ' ' + s);
          if (!page) break;
        }
      }
    }
  });
});

// every creature met
function h_all(g, P) { for (const d of g.allMonsters()) P.kills[d.id] = 1; }
