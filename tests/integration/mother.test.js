'use strict';
/* The bottom of the sea: Nerys at Lanthorne's gate, the Mother Below, and
   the end of part two. Played from the test shortcut on the title menu. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

function fromShortcut(seed) {
  const h = loadGame({ draw: false, seed: seed || 6 });
  F.chooseMenu(h, 'dev');
  F.chooseMenu(h, 'devMother');
  assert.ok(h.until(() => h.g.Dive.underwater && h.g.Game.fade.dir === 0, 3));
  // the rest of the sea stays out of this
  h.g.Dive.mobs.length = 0;
  return h;
}

function swimIntoGate(h) {
  h.keyDown('KeyD');
  const started = h.until(() => h.g.Dive.phase === 'scene', 10);
  h.keyUp('KeyD');
  assert.ok(started, 'her scene never started');
}

function readScene(h) {
  const lines = [];
  let title = null;
  for (let i = 0; i < 60 * 120 && h.g.Dive.phase === 'scene'; i++) {
    if (h.g.CUT.titleCard) title = h.g.CUT.titleCard.title;
    if (h.g.Dialogue.active && h.g.Dialogue.done && h.g.Dialogue.hold > .15) { lines.push(h.g.Dialogue.full); h.tap('Enter'); }
    else h.frame();
  }
  return { lines: [...new Set(lines)], title };
}

// get within reach of her side and ring the bell until she drops below `frac`
function beatDownTo(h, frac, seconds) {
  const D = h.g.Dive, B = D.boss, p = D.p;
  for (let i = 0; i < (seconds || 60) * 60 && !B.dead && B.hp > B.maxHp * frac && D.phase === 'swim'; i++) {
    p.invuln = 1; h.g.Player.hp = h.g.Player.maxHp; p.air = 999;    // this test is about her, not him
    if (F.answerSkill(h)) { for (const k of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) h.keyUp(k); h.frame(); continue; }
    const dx = B.x - p.x, dy = B.y - p.y, d = Math.hypot(dx, dy);
    const want = { KeyD: dx > 0 && d > 260, KeyA: dx < 0 && d > 260, KeyS: dy > 30, KeyW: dy < -30 };
    for (const k of Object.keys(want)) want[k] ? h.keyDown(k) : h.keyUp(k);
    if (d < 420 && i % 8 === 0) h.press('KeyJ');
    h.frame();
  }
  for (const k of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) h.keyUp(k);
}

describe('the Mother Below', () => {
  test('Nerys at the gate explains who she is, and the fight begins', () => {
    const h = fromShortcut();
    swimIntoGate(h);
    h.frame();
    assert.equal(h.g.Music.themeName, 'abyss');
    const { lines } = readScene(h);
    const all = lines.join(' ');
    assert.match(all, /I know it came for you first/);
    assert.match(all, /The Old One wasn't what was waking down here. It was her child./);
    assert.equal(h.g.Dive.phase, 'swim');
    assert.equal(h.g.Dive.boss.state, 'idle');
    assert.ok(h.g.Dive.girl.y > h.g.DIVE_FLOOR - 200, 'Nerys hides down by the gate');
  });

  test('through all three phases to the end of part two, and it is saved', () => {
    const h = fromShortcut(7);
    swimIntoGate(h);
    readScene(h);
    const D = h.g.Dive, B = D.boss;
    const phases = [];
    beatDownTo(h, .6); phases.push(B.phase);
    beatDownTo(h, .28); phases.push(B.phase);
    assert.deepEqual(phases, [2, 3]);
    beatDownTo(h, 0, 120);
    assert.equal(B.dead, true);
    const { lines, title } = readScene(h);
    assert.equal(title, 'END OF PART TWO');
    assert.match(lines.join(' '), /his grandfather's suit came home/);
    assert.equal(h.g.Player.beatMother, true);
    const save = JSON.parse(h.storage.get('deepsupper.save.v1'));
    assert.equal(save.beatMother, true);
    assert.equal(save.catches[save.catches.length - 1].id, 'mother');
    // and she is gone for good: the water in front of the gate stays quiet
    h.frames(2);
    assert.equal(D.boss, null);
    assert.equal(D.phase, 'swim');
  });

  test('losing to her sends you up, and next time she is waiting without the speech', () => {
    const h = fromShortcut(8);
    swimIntoGate(h);
    readScene(h);
    const D = h.g.Dive;
    h.g.Player.hp = 1; D.p.invuln = 0;
    D.hurtPlayer(1, D.p.x + 20, D.p.y);
    F.wakeOnDeck(h);
    // straight back down
    h.g.Game.state = 'dive'; D.start(); D.enterWater(); D.mobs.length = 0;
    Object.assign(D.p, { x: h.g.CITY_X - 1300, y: 3500 });
    swimIntoGate(h);
    let spoke = false;
    for (let i = 0; i < 300 && D.phase === 'scene'; i++) { spoke = spoke || h.g.Dialogue.active; h.frame(); }
    assert.equal(spoke, false);
    assert.equal(D.boss.state, 'idle');
  });

  test('her broodlings can be killed and sold like anything else', () => {
    const h = fromShortcut(9);
    swimIntoGate(h);
    readScene(h);
    const D = h.g.Dive;
    D._brood();
    const b = D.mobs.find(m => m.def.id === 'broodling');
    Object.assign(b, { x: D.p.x + 90, y: D.p.y, state: 'stun', stun: 99, hp: 1 });
    D.p.face = 1;
    h.tap('KeyJ'); h.frames(.8);
    assert.equal(b.dead, true);
    assert.ok(h.g.Player.catches.some(c => c.id === 'broodling'));
  });

  test('after part two, back aboard he is told to take the Margaret home, and the dive is free', () => {
    const h = fromShortcut(10);
    h.g.Player.beatMother = true;
    const D = h.g.Dive;
    Object.assign(D.p, { x: h.g.CITY_X, y: 3700 });
    h.frames(1);
    assert.equal(D.boss, null);
    Object.assign(D.p, { x: h.g.DIVE_LADDER_X, y: 30 });
    h.tap('KeyE');
    assert.ok(h.until(() => h.g.Game.state === 'play', 3));
    assert.equal(h.g.Dialogue.full, h.g.NARRATION.homeward[0]);
    F.readDialogue(h);
    h.g.Player.catches.length = 0;
    assert.match(h.g.Game.objective(), /Take the Margaret home/);
    h.g.Player.x = h.g.FINALE.helmX;
    assert.equal(h.g.Game.spotLabel(h.g.Game.nearestSpot()), 'Sail home');
  });
});

describe('part two, joined up', () => {
  test('the Old One shortcut, beaten, leads straight into diving', () => {
    const h = loadGame({ draw: false, seed: 3 });
    F.chooseMenu(h, 'dev');
    F.chooseMenu(h, 'devOldOne');
    assert.ok(h.until(() => h.g.Game.state === 'battle', 3));
    h.g.Battle.m.hp = 300;          // this is about what comes after the fight
    assert.equal(F.fightBot(h, 200), true);
    h.keyDown('Escape');
    assert.ok(h.until(() => h.g.Game.state === 'play', 12));
    h.keyUp('Escape');
    assert.equal(h.g.Player.suit, 0);
    F.walkTo(h, h.g.DIVE_X, 40);
    h.tap('KeyE');
    assert.ok(h.until(() => h.g.Dive.underwater, 6));
  });

  test('reading the opening with mouse clicks works as well as keys', () => {
    const h = loadGame({ draw: false, seed: 1 });
    F.newVoyageFromMenu(h);
    h.until(() => h.g.Dialogue.active, 10);
    const first = h.g.Dialogue.full;
    h.click(480, 300); h.frame();
    assert.equal(h.g.Dialogue.done, true);
    h.frame();
    h.click(480, 300); h.frame();
    assert.notEqual(h.g.Dialogue.full, first);
  });

  test('a rebound swim-down key, set in the Controls menu, works on the next dive', () => {
    const h = loadGame({ draw: false, seed: 4 });
    F.chooseMenu(h, 'options');
    F.chooseMenu(h, 'controls');
    F.selectMenu(h, 'down');
    h.tap('Enter');
    h.tap('KeyB');
    assert.equal(h.g.Settings.data.bindings.down[0], 'KeyB');
    h.g.Menu.openMain();
    h.startVoyage();
    Object.assign(h.g.Player, { beatBoss: true, suit: 1, diveWeapon: 0, x: h.g.DIVE_X });
    h.tap('KeyE');
    assert.ok(h.until(() => h.g.Dive.underwater && h.g.Game.fade.dir === 0, 6));
    h.g.Dive.mobs.length = 0;
    Object.assign(h.g.Dive.p, { x: 1500, y: 400 });
    h.keyDown('KeyB'); h.frames(.6);
    assert.ok(h.g.Dive.p.y > 460);
  });

  test('after meeting Nerys, Dorran notices the first time you visit', () => {
    const h = loadGame({ draw: false, seed: 8 });
    h.startVoyage();
    Object.assign(h.g.Player, { weapon: 1, rod: 2, totalKills: 9, introDone: true });
    h.g.Game.startGirlScene();
    h.keyDown('Escape');
    assert.ok(h.until(() => h.g.Game.state === 'play', 5));
    h.keyUp('Escape');
    F.openStall(h);
    assert.match(h.g.Shop.line, /met a girl/);
  });

  test('a save slot made while diving survives quitting the app and loads from the title', () => {
    let quits = 0;
    const native = { isApp: true, setFullscreen() {}, quit: () => quits++ };
    const h = loadGame({ draw: false, seed: 5, native });
    h.startVoyage();
    Object.assign(h.g.Player, { beatBoss: true, suit: 2, diveWeapon: 3, coins: 4321, x: h.g.DIVE_X });
    h.tap('KeyE');
    assert.ok(h.until(() => h.g.Dive.underwater && h.g.Game.fade.dir === 0, 6));
    h.tap('Escape');
    F.chooseMenu(h, 'save');
    F.chooseMenu(h, 'slot3');
    h.tap('Escape');
    F.chooseMenu(h, 'quit');
    assert.equal(quits, 1);
    const again = loadGame({ draw: false, storage: Object.fromEntries(h.storage), native });
    F.chooseMenu(again, 'load');
    F.chooseMenu(again, 'slot3');
    assert.ok(again.until(() => again.g.Game.state === 'play', 3));
    assert.deepEqual([again.g.Player.suit, again.g.Player.diveWeapon, again.g.Player.coins], [2, 3, 4321]);
    assert.equal(again.g.Game.spotLabel({ id: 'dive' }), 'Dive');
  });
});
