'use strict';
/* The second half, made kinder: reading a find is safe, the suit has flippers
   and kicks like a diver, drowning is a scene rather than a toast, her water
   is hers alone, and the ladder is not the fishing spot. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');
const F = require('../helpers/flows');

// in the water with the given gear, nothing else swimming about
function inWater(player, opts) {
  const h = loadGame(Object.assign({ draw: false, seed: 15 }, opts));
  h.startVoyage();
  const g = h.g;
  g.Dialogue.hide(); g.Game.msgs = [];
  Object.assign(g.Player, { beatBoss: true, suit: 3, diveWeapon: 0, weapon: 5, maxHp: 9, hp: 9, introDone: true, totalKills: 4, girlMet: true }, player);
  g.Game.state = 'dive';
  g.Dive.start(); g.Dive.enterWater();
  g.Dive.mobs.length = 0;
  return { h, g, D: g.Dive, P: g.Player };
}

// a creature at the boy's shoulder, already lunging
function lunging(D, g, atk) {
  const p = D.p;
  const m = D.makeMob(g.DIVE_MONSTERS.find(x => x.zone === 1 && !x.boss && !x.spawnOnly), p.x + 70, p.y, 1);
  Object.assign(m, { state: atk || 'tele', atk: atk ? undefined : 'bite', t: 0, cool: 0 });
  return m;
}

describe('reading what he finds down there', () => {
  test('the sea stands still while the page is open: no creature moves, no air goes', () => {
    const { h, g, D, P } = inWater();
    const L = g.loreDef('tin');
    Object.assign(D.p, { x: L.x, y: L.y, invuln: 0 });
    const m = lunging(D, g);
    h.frame();
    assert.equal(g.Lore.open, 'tin', 'he is reading it');
    const before = { hp: P.hp, air: Math.round(D.p.air), x: Math.round(m.x), state: m.state };
    h.frames(3);
    assert.deepEqual(plain({ hp: P.hp, air: Math.round(D.p.air), x: Math.round(m.x), state: m.state }), before);
  });

  test('a stray click cannot shut it straight away, but a key can', () => {
    const { h, g, D } = inWater();
    const L = g.loreDef('tin');
    Object.assign(D.p, { x: L.x, y: L.y });
    h.frame();
    h.click(400, 300); h.frame();
    assert.equal(g.Lore.open, 'tin', 'the fire button does not close it');
    h.frames(1.2);
    h.click(400, 300); h.frame();
    assert.equal(g.Lore.open, null, 'a moment later it does');

    const again = inWater();
    Object.assign(again.D.p, { x: g.loreDef('log').x, y: g.loreDef('log').y });
    again.g.Player.lore.length = 0;
    again.h.frame();
    again.h.frames(.4);
    again.h.tap('KeyE');
    assert.equal(again.g.Lore.open, null, 'E closes it at once');
  });

  test('coming back from it, whatever was lunging has to start again, and nothing lands for a moment', () => {
    const { h, g, D, P } = inWater();
    const L = g.loreDef('tin');
    Object.assign(D.p, { x: L.x, y: L.y, invuln: 0 });
    const m = lunging(D, g);
    D.globs.push({ x: D.p.x + 30, y: D.p.y, vx: 0, vy: 0, r: 10, t: 0, dmg: 1, kind: 'ink' });
    h.frame();
    h.frames(.5);
    h.tap('KeyE');
    assert.equal(g.Lore.open, null);
    assert.equal(m.state, 'recover', 'it thinks again');
    assert.equal(D.globs.length, 0, 'what was already in the water is gone');
    assert.ok(D.p.invuln > 1, 'and he cannot be hit for a moment');
    h.frames(1);
    assert.equal(P.hp, 9);
  });
});

describe('the suit in the water', () => {
  test('his legs beat at their own pace: faster when he swims, and never jumping when he speeds up', () => {
    const { h, D } = inWater();
    const p = D.p;
    p.vx = 0; p.vy = 0;
    h.frames(1);
    const drifting = p.stroke;
    h.keyDown('KeyD');
    h.frames(1);
    h.keyUp('KeyD');
    const swimming = p.stroke - drifting;
    assert.ok(drifting > 2.5 && drifting < 4, 'a slow flutter when still: ' + drifting);
    assert.ok(swimming > drifting + .5, 'quicker when swimming: ' + swimming);
  });

  test('the flippers are drawn from his stroke, in smooth steps', () => {
    const { h, g, D } = inWater({}, { draw: true });
    const poses = new Set();
    const draw = g.Sprite.draw;
    g.Sprite.draw = function (ctx, who, pose) { if (who === 'diver') poses.add(pose); return draw.apply(this, arguments); };
    try { h.frames(2); } finally { g.Sprite.draw = draw; }
    assert.ok(poses.size >= 6, 'the kick reads as a kick: ' + poses.size + ' poses');
    assert.ok(poses.size <= 40, 'without a new drawing every frame: ' + poses.size);
  });
});

describe('drowning', () => {
  test('the suit gives out: he goes limp, sinks, and the screen says so before anything else happens', () => {
    const { h, g, D, P } = inWater({ hp: 1 });
    D.p.invuln = 0;
    D.hurtPlayer(1, D.p.x + 5, D.p.y);
    assert.equal(D.phase, 'blackout');
    assert.equal(P.hp, 0);
    const y = D.p.y;
    h.frames(1.2);
    assert.ok(D.p.limp > .5, 'limp in the water');
    assert.ok(D.p.y > y, 'and sinking');
    assert.equal(g.Game.state, 'dive', 'still down there, for now');
    h.frames(3);
    assert.equal(g.Game.state === 'cutscene' || g.Game.fade.dir !== 0, true, 'then it fades out of it');
  });

  test('he comes round on the deck by the ladder, with Dorran over him and a word about the fee', () => {
    const { h, g, D, P } = inWater({ hp: 1, coins: 400 });
    D.p.invuln = 0;
    D.hurtPlayer(1, D.p.x + 5, D.p.y);
    const said = F.wakeOnDeck(h);
    assert.equal(g.Game.state, 'play');
    assert.equal(P.x, g.DIVE_X);
    assert.equal(P.hp, P.maxHp);
    assert.equal(P.coins, 300);
    assert.ok(said.some(l => /100/.test(l)), 'the salvage fee, from his own mouth: ' + said.join(' | '));
    assert.equal(g.CUT.dorran.visible, false, 'and he goes back to his stall');
    assert.equal(g.Game.viewY, 0);
    assert.equal(h.eval('SaveGame.read()').hp, P.maxHp, 'saved as he came round');
  });

  test('the screen draws it soundly, and says YOU DIED', () => {
    const { h, g, D } = inWater({ hp: 1 }, { draw: true });
    D.p.invuln = 0;
    D.hurtPlayer(1, D.p.x + 5, D.p.y);
    h.frames(1.4);
    const said = [], rec = h.hires(), draw = g.Text.draw;
    g.Text.draw = function (ctx, s) { said.push(String(s)); return draw.apply(this, arguments); };
    rec.reset();
    try { D.drawUI(h.eval('bctx')); } finally { g.Text.draw = draw; }
    assert.equal(rec.depth(), 0);
    assert.ok(said.includes('YOU DIED'), said.join(', '));
  });
});

describe("the Mother's water", () => {
  function atTheGate(player) {
    const t = inWater(Object.assign({ suit: 3, diveWeapon: 4 }, player));
    Object.assign(t.D.p, { x: t.g.CITY_X - 1200, y: 3400, air: 1e9 });
    return t;
  }

  test('when she comes up, whatever was in front of the gate is gone from it', () => {
    const { g, D } = atTheGate();
    const inside = D.makeMob(g.DIVE_MONSTERS.find(x => x.zone === 4 && !x.boss && !x.spawnOnly), g.CITY_X, 3600, 4);
    const outside = D.makeMob(g.DIVE_MONSTERS.find(x => x.zone === 4 && !x.boss && !x.spawnOnly), 400, 3600, 4);
    D.p.x = g.CITY_X; D.p.y = g.MOTHER_ARENA.top + 200;
    D.startMother();
    assert.equal(inside.gone, true, 'out of her water');
    assert.equal(outside.gone, undefined, 'the rest of the sea is as it was');
  });

  test('while she lives, nothing else swims in after him or picks a fight across the line', () => {
    const { h, g, D, P } = atTheGate();
    D.p.x = g.CITY_X; D.p.y = g.MOTHER_ARENA.top + 200;
    D.startMother();
    D.phase = 'swim';
    g.CUT.stop();
    const m = D.makeMob(g.DIVE_MONSTERS.find(x => x.zone === 4 && !x.boss && !x.spawnOnly), g.CITY_X + 200, g.MOTHER_ARENA.top + 300, 4);
    m.state = 'hunt';
    D.boss.state = 'idle'; D.boss.cool = 1e9;
    P.hp = 9; D.p.invuln = 0;
    h.frames(2);
    assert.equal(D._inArena(m, 0), false, 'pushed back out of her water');
    assert.equal(m.state, 'drift', 'and it has lost interest');
    assert.equal(P.hp, 9, 'nothing else touched him');
  });
});

describe('the deck, after the suit', () => {
  test('the ladder and the bow are two stations: one dives, one still fishes', () => {
    const { g } = inWater();
    g.Dive.reset();
    g.Game.state = 'play';
    assert.deepEqual(plain(g.SPOTS.map(s => s.id)), ['helm', 'crate', 'stall', 'dive', 'fish']);
    assert.ok(Math.abs(g.DIVE_X - g.FISH_X) > 200, 'and they are not the same place');
    assert.equal(g.Game.spotLabel({ id: 'dive' }), 'Dive');
    assert.equal(g.Game.spotLabel({ id: 'fish' }), 'Cast your line');
    g.Player.x = g.FISH_X;
    g.Game.useSpot({ id: 'fish' });
    assert.equal(g.Game.state, 'fish', 'a diver can still cast a line');
  });

  test('before the suit there is nothing at the ladder', () => {
    const h = loadGame({ draw: false, seed: 3 });
    h.startVoyage();
    assert.equal(h.g.Game.spotLabel({ id: 'dive' }), null);
    h.g.Player.x = h.g.DIVE_X;
    assert.equal(h.g.Game.nearestSpot(), null);
  });
});

describe('answering her', () => {
  test('a check that is answered says SUCCESS, and a missed one says FAIL', () => {
    const h = loadGame({ draw: true, seed: 4 });
    h.startVoyage();
    const g = h.g, said = [], bctx = h.eval('bctx');
    const draw = g.Text.draw;
    g.Text.draw = function (ctx, s) { said.push(String(s)); return draw.apply(this, arguments); };
    g.Skill._drawRing = () => {};                 // the ring itself is drawn elsewhere
    try {
      for (const result of [true, false]) {
        g.Skill.active = { kind: 'ring', label: 'HOLD ON', t: 1, result, endT: .1, ringT: 0, ring: 1 };
        g.Skill.draw(bctx);
      }
    } finally { g.Text.draw = draw; }
    assert.ok(said.includes('SUCCESS'), said.join(', '));
    assert.ok(said.includes('FAIL'));
    assert.ok(!said.includes('YES') && !said.includes('NO'));
  });
});
