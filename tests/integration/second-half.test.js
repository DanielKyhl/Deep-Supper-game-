'use strict';
/* Part two on deck and below it, played with real keys and whole frames: two
   stations at the rail, a stall with a diving counter, a find read in peace,
   and what drowning looks like from the inside. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

function diver(player, opts) {
  const h = loadGame(Object.assign({ draw: false, seed: 19 }, opts));
  h.startVoyage();
  F.readDialogue(h);
  Object.assign(h.g.Player, { beatBoss: true, suit: 0, diveWeapon: 0, weapon: 5, rod: 3, introDone: true, totalKills: 6, girlMet: true, maxHp: 9, hp: 9 }, player);
  return h;
}

function goUnder(h) {
  F.walkTo(h, h.g.DIVE_X, 40);
  h.tap('KeyE');
  assert.equal(h.g.Game.state, 'dive');
  assert.ok(h.until(() => h.g.Dive.underwater && h.g.Dive.phase === 'swim' && h.g.Game.fade.dir === 0, 8), 'never got in');
  h.g.Dive.mobs.length = 0;
}

describe('two stations at the rail', () => {
  test('the ladder amidships goes over the side, and the bow still casts a line afterwards', () => {
    const h = diver();
    const g = h.g;
    F.walkTo(h, g.DIVE_X, 40);
    assert.equal(g.Game.spotLabel(g.Game.nearestSpot()), 'Dive');
    h.tap('KeyE');
    assert.ok(h.until(() => g.Dive.underwater && g.Dive.phase === 'swim' && g.Game.fade.dir === 0, 8));
    g.Dive.mobs.length = 0;

    // straight back up the ladder, and along the deck to the bow
    Object.assign(g.Dive.p, { x: g.DIVE_LADDER_X, y: 40, vx: 0, vy: 0 });
    h.frame();
    h.tap('KeyE');
    assert.ok(h.until(() => g.Game.state === 'play' && g.Game.fade.dir === 0, 6), 'back aboard');
    assert.equal(g.Player.x, g.DIVE_X);

    F.walkTo(h, g.FISH_X, 40);
    assert.equal(g.Game.spotLabel(g.Game.nearestSpot()), 'Cast your line');
    F.castLine(h);
    assert.equal(g.Game.state, 'fish');
    assert.ok(h.until(() => g.Fishing.phase === 'sink' || g.Fishing.phase === 'deep', 6), 'the line goes down');
  });

  test("Dorran's counter has a diving section of its own, reached with the arrow keys", () => {
    const h = diver({ coins: 4000 });
    const g = h.g, S = g.Shop;
    F.openStall(h);
    const ids = [];
    for (let i = 0; i < 4; i++) { ids.push(S.tabId()); h.tap('ArrowRight'); }
    assert.deepEqual(ids.sort(), ['dive', 'gear', 'goods', 'sell']);
    while (S.tabId() !== 'dive') h.tap('ArrowRight');
    for (let i = 0; i < 8 && !(S.rows()[S.sel].kind === 'suit' && S.rows()[S.sel].idx === 1); i++) h.tap('ArrowDown');
    h.tap('KeyE');
    assert.equal(g.Player.suit, 1, 'the brass rig, bought at the diving counter');
    while (S.tabId() !== 'gear') h.tap('ArrowRight');
    assert.ok(S.rows().some(r => r.kind === 'rod'), 'and the rods are still on their own tab');
  });
});

describe('down there', () => {
  test('a find is read with the sea held still, and nothing lands while he looks up from it', () => {
    const h = diver({ suit: 3 });
    const g = h.g, D = g.Dive;
    goUnder(h);
    const L = g.loreDef('tin');
    Object.assign(D.p, { x: L.x - 30, y: L.y, invuln: 0, air: 1e9 });
    const m = D.makeMob(g.DIVE_MONSTERS.find(x => x.zone === 1 && !x.boss && !x.spawnOnly), L.x + 80, L.y, 1);
    Object.assign(m, { state: 'tele', atk: 'bite', t: 0 });
    h.keyDown('KeyD');
    assert.ok(h.until(() => g.Lore.open === 'tin', 4), 'he swims onto it and reads it');
    h.keyUp('KeyD');
    const hp = g.Player.hp;
    h.frames(3);
    assert.equal(g.Lore.open, 'tin', 'still reading');
    assert.equal(g.Player.hp, hp, 'and untouched while he does');
    h.tap('KeyE');
    h.frames(1);
    assert.equal(g.Player.hp, hp, 'and for a moment after');
    assert.ok(g.Player.lore.indexOf('tin') >= 0, 'the journal has it');
  });

  test('drowning: he sinks with YOU DIED over him, then comes round on deck with Dorran, and it is saved', () => {
    const h = diver({ coins: 1000 }, { draw: true });
    const g = h.g, D = g.Dive;
    goUnder(h);
    Object.assign(D.p, { x: 1500, y: 700, air: 0 });
    g.Player.hp = 1; D.p.invuln = 0;
    assert.ok(h.until(() => D.phase === 'blackout', 20), 'the air runs out');
    const said = [], draw = g.Text.draw;
    g.Text.draw = function (ctx, s) { said.push(String(s)); return draw.apply(this, arguments); };
    try { h.frames(1.5); } finally { g.Text.draw = draw; }
    assert.ok(said.includes('YOU DIED'), 'the screen says it');
    assert.ok(D.p.limp > .4, 'he is limp in the water');

    const lines = F.wakeOnDeck(h);
    assert.ok(lines.some(l => /deck/.test(l)), lines.join(' | '));
    assert.ok(lines.some(l => /250/.test(l)), 'and what it cost: ' + lines.join(' | '));
    assert.equal(g.Player.coins, 750);
    assert.equal(g.Player.x, g.DIVE_X);
    assert.equal(g.Game.state, 'play');
    assert.equal(JSON.parse(h.storage.get('deepsupper.save.v1')).coins, 750, 'saved as he came round');
  });
});
