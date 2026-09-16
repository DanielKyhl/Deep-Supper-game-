'use strict';
/* What lingers after a hit: bleeding and stunned creatures, a poisoned or
   ink-blinded boy, on deck and below. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');

// a fight against `id`, past the intro, with the monster holding still
function fight(id, weapon, opts) {
  const h = loadGame(Object.assign({ draw: false, seed: 13 }, opts));
  h.startVoyage();
  const g = h.g;
  g.Player.weapon = g.WEAPONS.findIndex(w => w.id === (weapon || 'dipnet'));
  g.Player.x = 900;
  g.Cam.snap(900);
  g.Game.startBattle(g.monsterDef(id || 'gnashfin'));
  const B = g.Battle;
  B.phase = 'fight';
  Object.assign(B.m, { state: 'idle', cool: 1e9, t: 0, y: B.restY });
  return { h, g, B, m: B.m, P: g.Player, S: g.Status };
}
const always = g => { g.Status.roll = () => 0; };
const never = g => { g.Status.roll = () => .999; };

// in the water with one creature holding still
function below(id, gear) {
  const h = loadGame({ draw: false, seed: 7 });
  h.startVoyage();
  const g = h.g;
  Object.assign(g.Player, { beatBoss: true, suit: 3, diveWeapon: 0, weapon: 0, hp: 9, maxHp: 9 }, gear);
  g.Game.state = 'dive';
  g.Dive.start();
  g.Dive.enterWater();
  const D = g.Dive;
  D.mobs.length = 0;
  const def = g.monsterDef(id || 'kelpstrangler');
  const m = D.makeMob(def, D.p.x + 200, D.p.y, def.zone);
  Object.assign(m, { state: 'hunt', cool: 1e9, t: 0 });
  return { h, g, D, m, p: D.p, P: g.Player, S: g.Status };
}

describe('the rules', () => {
  test('a bleed ticks every half second for three seconds, for a fifth-ish of the weapon, and a fresh cut keeps the worse wound', () => {
    const { S, g } = fight();
    const share = g.STATUS.bleed.share, m = { hp: 500 };
    S.bleed(m, 100);
    let taken = 0, ticks = 0;
    for (let i = 0; i < 60 * 4; i++) S.tick(m, 1 / 60, d => { taken += d; ticks++; });
    assert.equal(ticks, 6);
    assert.equal(taken, 6 * Math.round(100 * share));
    assert.equal(S.bleeding(m), false, 'and it stops');
    S.bleed(m, 200);
    S.bleed(m, 50);
    assert.equal(m.fx.bleed.dmg, Math.round(200 * share));
  });

  test('a stun counts down, and a boss shrugs off most of it', () => {
    const { S, g } = fight();
    const m = { hp: 10, def: g.monsterDef('gnashfin') }, boss = { hp: 10, def: g.monsterDef('leviathan') };
    assert.equal(S.stun(m, 1), 1);
    assert.ok(Math.abs(S.stun(boss, 1) - .3) < 1e-9);
    for (let i = 0; i < 40; i++) S.tick(m, 1 / 60, () => {});
    assert.equal(S.stunned(m), true);
    for (let i = 0; i < 30; i++) S.tick(m, 1 / 60, () => {});
    assert.equal(S.stunned(m), false);
  });

  test("statuses roll their own dice: a weapon's chance never touches the game's Math.random", () => {
    const { h, g, S } = fight();
    h.sandbox.__rolls = 0;
    h.eval('(() => { const r = Math.random; Math.random = function () { __rolls++; return r(); }; })()');
    for (let i = 0; i < 50; i++) S.inflict({ hp: 100, def: g.monsterDef('gnashfin') }, g.WEAPONS[2]);
    assert.equal(h.sandbox.__rolls, 0);
  });

  test('a heavy blow always leaves what its weapon can; an ordinary one only by chance', () => {
    const { g, S } = fight();
    const cleaver = g.WEAPONS.find(w => w.id === 'cleaver');
    never(g);
    assert.deepEqual([...S.inflict({ hp: 9 }, cleaver)], []);
    assert.deepEqual([...S.inflict({ hp: 9 }, cleaver, true)], ['bleed']);
    always(g);
    assert.deepEqual([...S.inflict({ hp: 9 }, cleaver)], ['bleed']);
    assert.deepEqual([...S.inflict({ hp: 9, dead: true }, cleaver, true)], [], 'nothing on the dead');
    assert.deepEqual([...S.inflict({ hp: 9 }, g.WEAPONS[0], true)], [], 'a dip net cuts nothing');
  });

  test('which weapons bleed and stun, as the shop says', () => {
    const { g } = fight();
    const has = (list, id, k) => !!list.find(w => w.id === id)[k];
    assert.ok(has(g.WEAPONS, 'cleaver', 'bleed') && has(g.WEAPONS, 'harpoon', 'bleed') && has(g.WEAPONS, 'tooth', 'bleed'));
    assert.ok(has(g.WEAPONS, 'chain', 'stun'));
    assert.ok(has(g.DIVE_WEAPONS, 'tusk', 'bleed') && has(g.DIVE_WEAPONS, 'bell', 'stun'));
    assert.match(g.statusTags(g.WEAPONS.find(w => w.id === 'cleaver')), /bleeds/);
    assert.match(g.statusTags(g.DIVE_WEAPONS.find(w => w.id === 'eel')), /stuns/);
    assert.equal(g.statusTags(g.WEAPONS[0]), '');
  });
});

describe('on deck', () => {
  test('a cleaver hit that bleeds keeps hurting after the swing, and can finish the thing off', () => {
    const { g, B, m, P } = fight('gnashfin', 'cleaver');
    always(g);
    P.x = m.x - 90; P.face = 1;
    B._swing(0);
    for (let i = 0; i < 40 && !P.attackDone; i++) B.update(1 / 60);
    assert.equal(g.Status.bleeding(m), true);
    m.hp = 6;
    for (let i = 0; i < 60 * 3 && B.phase === 'fight'; i++) B.update(1 / 60);
    assert.equal(B.phase, 'win', 'it bled out');
  });

  test('a stunned creature drops its wind-up and cannot hurt him until the stars clear', () => {
    const { g, B, m, P } = fight('gnashfin', 'chain');
    Object.assign(m, { state: 'tele', atk: 'lunge', t: 0 });
    g.Status.stun(m, .9);
    P.x = m.x - 60;
    const hp = P.hp;
    for (let i = 0; i < 50; i++) B.update(1 / 60);
    assert.equal(m.state, 'recover');
    assert.equal(P.hp, hp);
    for (let i = 0; i < 60; i++) B.update(1 / 60);
    assert.equal(g.Status.stunned(m), false);
  });

  test('the Old One answering a skill check is never knocked out of it', () => {
    const { g, B, m } = fight('leviathan', 'chain');
    m.state = 'jaw';
    always(g);
    assert.deepEqual([...B._afflict(g.WEAPONS.find(w => w.id === 'chain'), true)], []);
    assert.equal(g.Status.stunned(m), false);
  });

  test("the Weeping Bell's curtains poison him: a heart when it runs its course, unless a bandage draws it out", () => {
    const { g, B, P } = fight('weepingbell', 'dipnet');
    P.hp = 5; P.invuln = 0; P.bandages = 1;
    B.curtains.push({ x: P.x, w: 200, t: .9, warn: .8, on: .55 });
    B.update(1 / 60);
    assert.equal(P.hp, 4);
    assert.equal(g.Status.poisoned(P), true);
    // a bandage would draw it out
    assert.equal(g.Status.cure(P), true);
    assert.equal(g.Status.poisoned(P), false);
    // left alone, it costs a heart
    g.Status.poison(P);
    P.invuln = 10;
    for (let i = 0; i < 60 * 3.5; i++) B.update(1 / 60);
    assert.equal(P.hp, 3);
    assert.equal(g.Status.poisoned(P), false);
  });

  test('pressing Q with a bandage cures the poison mid-fight', () => {
    const { h, g, B, P } = fight('nettlejack');
    g.Status.poison(P);
    P.hp = 3; P.bandages = 1; P.healT = 0;
    h.press('KeyQ');
    B.update(1 / 60);
    assert.equal(g.Status.poisoned(P), false);
    assert.equal(P.hp, 5);
  });

  test('a fight ends with nothing lingering on him', () => {
    const { g, B, P } = fight('nettlejack');
    g.Status.poison(P);
    g.Game.endBattle(true, null);
    assert.equal(g.Status.poisoned(P), false);
  });
});

describe('below', () => {
  test('the Sunken Bell stuns what its ring passes through', () => {
    const { g, D, m } = below('gatecrawler', { diveWeapon: 4 });
    D.hitMob(m, g.DIVE_WEAPONS[4], 1, 0);
    assert.equal(m.state, 'stun');
    assert.equal(g.Status.stunned(m), true);
  });

  test('a tusk bolt that bleeds keeps hurting, and a bleed can kill down here too', () => {
    const { g, D, m, P } = below('kelpstrangler', { diveWeapon: 3 });
    g.Status.roll = () => 0;
    m.hp = 200;
    D.hitMob(m, g.DIVE_WEAPONS[3], 1, 0);
    assert.equal(g.Status.bleeding(m), true);
    const kills = P.totalKills;
    m.hp = 5;
    for (let i = 0; i < 60 * 3 && !m.dead; i++) D._mob(m, 1 / 60);
    assert.equal(m.dead, true);
    assert.equal(P.totalKills, kills + 1);
  });

  test('a jelly pulse poisons the diver; ink blinds and slows him, then wears off', () => {
    const { g, D, p, P } = below('bladderjelly');
    p.invuln = 0;
    D.rings.push({ x: p.x, y: p.y, r: 0, max: 200, speed: 0, width: 22, from: 'mob', dmg: 1, hit: new Set(), t: 0, poison: true });
    D._projectiles(1 / 60);
    assert.equal(g.Status.poisoned(P), true);
    p.invuln = 0;
    D.globs.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 11, t: 0, dmg: 1, kind: 'ink' });
    D._projectiles(1 / 60);
    assert.equal(g.Status.inked(P), true);
    assert.ok(g.Status.speed(P) < .5);
    for (let i = 0; i < 60 * 2.5; i++) g.Status.tickPlayer(P, 1 / 60, () => {});
    assert.equal(g.Status.inked(P), false);
    assert.equal(g.Status.speed(P), 1);
  });

  test('climbing out leaves nothing lingering on him', () => {
    const { g, D, P } = below();
    g.Status.poison(P); g.Status.ink(P);
    D.reset();
    assert.equal(g.Status.poisoned(P) || g.Status.inked(P), false);
  });
});

describe('drawing it', () => {
  test('the signs over a creature and the bubbles off him draw balanced', () => {
    const h = loadGame({ seed: 3 });
    const g = h.g, rec = h.hires(), bctx = h.eval('bctx');
    rec.reset();
    g.Status.drawIcons(bctx, 300, 200, { bleed: { t: 0 }, stun: .5 }, 1.2);
    g.Status.drawPoison(bctx, 300, 400, 2.1);
    assert.equal(rec.depth(), 0);
    assert.ok((rec.calls.fillRect || 0) > 10);
  });
});

