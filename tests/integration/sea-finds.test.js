'use strict';
/* What the sea gives back, played through: a bottle up on a line and read,
   kept in the journal and in a save; a relic swum to on the bottom; a sword
   that ends a fight in one blow; and what it costs to be fished out. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');
const F = require('../helpers/flows');

function veteran(opts, gear) {
  const h = loadGame(Object.assign({ draw: false, seed: 12 }, opts));
  h.startVoyage();
  F.readDialogue(h);
  Object.assign(h.g.Player, { weapon: 0, introDone: true, totalKills: 1, crateOpen: true }, gear);
  return h;
}
const rig = (g, what) => { g.SeaDice.chance = p => (what === 'excalibur' && p === g.EXCALIBUR_CHANCE) || (what === 'bottle' && p === g.BOTTLE_CHANCE); };

describe('what the sea gives back', () => {
  test('a bottle on the line: read it, put it away, find it in the journal, and still have it after a load', () => {
    const h = veteran();
    const g = h.g;
    rig(g, 'bottle');
    F.castLine(h);
    F.waitForBite(h);
    F.setHook(h);
    assert.ok(h.until(() => g.Lore.open === 'meg', 6), 'the letter never opened');
    h.frames(.5);
    h.tap('KeyE');
    assert.equal(g.Lore.open, null);
    assert.equal(g.Game.state, 'play');

    h.tap('Escape');
    F.chooseMenu(h, 'save');
    F.chooseMenu(h, 'slot3');
    h.tap('Escape');
    F.chooseMenu(h, 'journal');
    F.chooseMenu(h, 'lore-meg');
    assert.equal(g.Lore.open, 'meg');
    h.frames(.5);
    h.tap('Enter');
    assert.equal(g.Menu.top(), 'journal', 'back where you were reading it from');

    g.Player.lore.length = 0;
    h.tap('Escape');
    F.chooseMenu(h, 'load');
    F.chooseMenu(h, 'slot3');
    F.chooseMenu(h, 'yes');
    assert.ok(h.until(() => g.Game.state === 'play' && g.Game.fade.dir === 0, 3));
    assert.deepEqual(plain(g.Player.lore), ['meg']);
  });

  test('a relic on the bottom: swim to it with the keys, and read it where you found it', () => {
    const h = veteran({}, { beatBoss: true, suit: 3, diveWeapon: 0, weapon: 5 });
    const g = h.g, D = g.Dive;
    F.walkTo(h, g.FISH_X, 40);
    h.tap('KeyE');
    assert.ok(h.until(() => D.underwater && D.phase === 'swim' && g.Game.fade.dir === 0, 6));
    D.mobs.length = 0;
    const watch = g.loreDef('watch');
    Object.assign(D.p, { x: watch.x - 260, y: watch.y, vx: 0, vy: 0, air: 1e9 });
    D._camera(0, true);
    h.keyDown('KeyD');
    assert.ok(h.until(() => g.Lore.open === 'watch', 5), 'never reached it');
    h.keyUp('KeyD');
    const x = D.p.x;
    h.frames(1);
    assert.equal(D.p.x, x, 'the sea holds still while he reads');
    h.tap('Enter');
    assert.equal(g.Lore.open, null);
    assert.equal(D.phase, 'swim');
    assert.ok(g.Lore.unfound().every(l => l.id !== 'watch'));
  });

  test('Excalibur: up on the line, and the next thing on the boat dies to a single swing', () => {
    const h = veteran({ seed: 4 }, { weapon: 1, maxHp: 9, hp: 9 });
    const g = h.g;
    rig(g, 'excalibur');
    F.castLine(h);
    F.waitForBite(h);
    F.setHook(h);
    assert.ok(h.until(() => g.Game.state === 'play', 6));
    assert.equal(g.Player.excalibur, true);
    F.readDialogue(h);

    g.SeaDice.chance = () => false;
    g.Game.startBattle(g.monsterDef('penance'));
    let swings = 0;
    const swing = g.Battle._swing;
    g.Battle._swing = function () { swings++; return swing.apply(this, arguments); };
    assert.equal(F.fightBot(h, 60), true);
    assert.equal(g.Battle.m.hits, 1);
    assert.ok(swings >= 1 && swings <= 3, 'swung ' + swings + ' times');
  });

  test('drowning: back on deck, the haul gone, and a quarter of your coins with it', () => {
    const h = veteran({}, { beatBoss: true, suit: 0, diveWeapon: 0, weapon: 5, coins: 820 });
    const g = h.g, D = g.Dive;
    F.walkTo(h, g.FISH_X, 40);
    h.tap('KeyE');
    assert.ok(h.until(() => D.underwater && D.phase === 'swim' && g.Game.fade.dir === 0, 6));
    D.mobs.length = 0;
    g.Player.catches.push(g.makeTrophy(g.monsterDef('shelfcrab')));
    Object.assign(D.p, { x: 1500, y: 700, air: 0 });
    assert.ok(h.until(() => g.Game.state === 'play', 30));
    assert.equal(g.Player.coins, 615);
    assert.equal(g.Player.catches.length, 0);
    assert.match(g.Game.toastText, /Salvage fee: 205/);
  });
});
