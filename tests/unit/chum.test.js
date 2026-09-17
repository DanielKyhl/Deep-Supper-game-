'use strict';
/* The Bucket of Chum: on sale once the Old One has beaten you, and the next
   bite after it goes over the side is the Old One, without waiting on luck. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');

function onDeck(player, opts) {
  const h = loadGame(Object.assign({ draw: false, seed: 12 }, opts));
  h.startVoyage();
  const g = h.g;
  Object.assign(g.Player, { introDone: true, totalKills: 3, girlMet: true, weapon: 5, rod: 3 }, player);
  return { h, g, P: g.Player };
}

// the Old One (or `id`) wins the fight
function loseTo(g, id) {
  g.Game.startBattle(g.monsterDef(id || 'leviathan'));
  g.Game.endBattle(false);
}

// every line waiting to be read, and the one showing
const said = g => g.Game.msgs.map(m => m.text).concat(g.Dialogue.full || []);
const goods = g => { g.Shop.open(); g.Shop.tab = 2; return g.Shop.rows(); };
const runTo = (F, phase, seconds) => { for (let i = 0; i < (seconds || 20) * 60 && F.phase !== phase; i++) F.update(1 / 60); return F.phase === phase; };

function atBow(g) {
  g.Player.x = g.FISH_X;
  g.Game.state = 'fish';
  g.Fishing.start();
  return g.Fishing;
}

describe('the bucket itself', () => {
  test("a one-off good at 250§, not on Dorran's stall on a new voyage", () => {
    const { g } = onDeck();
    const gd = g.GOODS.find(x => x.id === 'chum');
    assert.deepEqual(plain({ type: gd.type, price: gd.price, max: gd.max }), { type: 'chum', price: 250, max: 1 });
    assert.equal(g.Player.lostOldOne, false);
    assert.ok(!goods(g).some(r => r.id === 'chum'));
    assert.deepEqual(plain(goods(g).map(r => r.id)), ['bandage', 'locket', 'lantern', 'charm']);
  });

  test('losing to the Old One puts it on the stall, and Dorran waves it at you', () => {
    const { g, P } = onDeck({ coins: 400 });
    loseTo(g);
    assert.equal(P.lostOldOne, true);
    assert.ok(said(g).some(l => /bucket/.test(l)), 'the hint: ' + said(g).join(' | '));
    assert.ok(goods(g).some(r => r.id === 'chum'));
  });

  test('losing to anything else does not', () => {
    const { g, P } = onDeck();
    loseTo(g, 'gnashfin');
    assert.equal(P.lostOldOne, false);
    assert.ok(!goods(g).some(r => r.id === 'chum'));
    assert.ok(!said(g).some(l => /bucket/.test(l)));
  });

  test('bought, it costs 250§, and he only holds one bucket at a time', () => {
    const { g, P } = onDeck({ coins: 1000, lostOldOne: true });
    const S = g.Shop;
    goods(g);
    S.sel = S.rows().findIndex(r => r.id === 'chum');
    S.act();
    assert.equal(P.chum, true);
    assert.equal(P.coins, 750);
    assert.match(S.line, /in it|stand well back/);
    S.act();
    assert.equal(P.coins, 750, 'a second one is refused');
    assert.equal(S.rows()[S.sel].owned, true);
  });

  test('on the stall its whole description fits, with its price beside it', () => {
    const { h, g } = onDeck({ lostOldOne: true }, { draw: true });
    goods(g);
    g.Shop.sel = g.Shop.rows().findIndex(r => r.id === 'chum');
    const drawn = [], draw = g.Text.draw;
    g.Text.draw = function (ctx, t) { drawn.push(String(t)); return draw.apply(this, arguments); };
    try { g.Shop.draw(h.eval('bctx')); } finally { g.Text.draw = draw; }
    const desc = g.GOODS.find(x => x.id === 'chum').desc;
    assert.ok(drawn.includes('Bucket of Chum'));
    assert.ok(drawn.includes(desc), 'drawn whole, not trimmed: ' + drawn.filter(t => /bite/.test(t)).join(' | '));
    assert.ok(drawn.some(t => /250/.test(t)));
  });

  test('losing the fight the chum brought: the bucket is gone, and Dorran has another', () => {
    const { g, P } = onDeck({ lostOldOne: true, chum: true, coins: 2000 });
    loseTo(g);
    assert.equal(P.chum, false);
    assert.ok(said(g).some(l => /bucket/.test(l)));
    const row = goods(g).find(r => r.id === 'chum');
    assert.equal(row.owned, false, 'for sale again');
  });
});

describe('over the side', () => {
  test('the next bite is the Old One, every time, whatever the dice or the charm say', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { g } = onDeck({ chum: true, luck: seed % 2 === 0 }, { seed, rareCatches: true });
      const F = atBow(g);
      assert.equal(F.chummed, true);
      assert.equal(F.special, null, 'no bottle or sword on a chummed cast');
      assert.ok(runTo(F, 'bite', 20), 'seed ' + seed);
      assert.equal(F.target.id, 'leviathan', 'seed ' + seed);
    }
  });

  test('the tips say so while the line sinks and waits', () => {
    const { g } = onDeck({ chum: true });
    const F = atBow(g), said = [];
    F._tip = (gc, s) => said.push(s);
    runTo(F, 'sink', 3);
    F.drawUI(null);
    runTo(F, 'deep', 10);
    F.drawUI(null);
    assert.match(said[0], /chum goes over/);
    assert.match(said[1], /Chum in the water at \d+ fathoms/);
  });

  test("it does nothing on a rod that can't reach the Old One, or while Nerys is still to come, and is kept", () => {
    const short = onDeck({ chum: true, rod: 2 });
    const F = atBow(short.g);
    assert.equal(F.chummed, false);
    assert.ok(runTo(F, 'bite', 20));
    assert.notEqual(F.target.id, 'leviathan');
    assert.equal(short.P.chum, true);

    const girl = onDeck({ chum: true, girlMet: false });
    assert.equal(atBow(girl.g).chummed, false);
  });

  test('a missed bite keeps it in the water: the next bite is the Old One again', () => {
    const { g, P } = onDeck({ chum: true });
    const F = atBow(g);
    assert.ok(runTo(F, 'bite', 20));
    assert.ok(runTo(F, 'fail', 3), 'it spat the hook');
    assert.equal(P.chum, true);
    assert.ok(runTo(F, 'bite', 20));
    assert.equal(F.target.id, 'leviathan');
  });

  test('it is spent the moment the Old One fight begins, however that fight came about', () => {
    const { g, P } = onDeck({ chum: true });
    g.Game.startBattle(g.monsterDef('gnashfin'));
    assert.equal(P.chum, true, 'another fight leaves it be');
    g.Game.endBattle(true);
    g.Game.startBattle(g.monsterDef('leviathan'));
    assert.equal(P.chum, false);
  });
});

describe('saves', () => {
  test('a lost fight and a bucket in hand survive a save and a load; damaged values are dropped', () => {
    const { g } = onDeck({ lostOldOne: true, chum: true });
    const d = plain(g.SaveGame.snapshot());
    assert.equal(d.lostOldOne, true);
    assert.equal(d.chum, true);
    g.Player.reset();
    assert.equal(g.Player.chum, false);
    assert.equal(g.SaveGame.restore(g.SaveGame.sanitize(d)), true);
    assert.equal(g.Player.lostOldOne, true);
    assert.equal(g.Player.chum, true);
    const bad = g.SaveGame.sanitize(Object.assign({}, d, { chum: 'yes', lostOldOne: 1 }));
    assert.equal(bad.chum, false);
    assert.equal(bad.lostOldOne, false);
  });
});
