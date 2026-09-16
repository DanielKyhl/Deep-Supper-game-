'use strict';
/* The first night, start to finish, the way a new player plays it: title
   menu, the opening, the crate, the first cast and the ambush, the first
   fight, and the first sale. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

const SAVE = 'deepsupper.save.v1';

describe('the first voyage', () => {
  test('New voyage fades from the title into the opening at the harbour', () => {
    const h = loadGame({ seed: 1 });
    F.newVoyageFromMenu(h);
    assert.equal(h.g.CUT.dad.visible, true);
    assert.ok(h.g.Game.night < .1, 'it starts in daylight');
    assert.equal(h.g.Music.themeName, 'title');
  });

  test('reading through every line of the opening ends in free play at night', () => {
    const h = loadGame({ seed: 1, draw: false });
    F.newVoyageFromMenu(h);
    let lines = 0;
    for (let i = 0; i < 60 * 240 && h.g.Game.state === 'cutscene'; i++) {
      if (h.g.Dialogue.active && h.g.Dialogue.done && h.g.Dialogue.hold > .3) { h.tap('Enter'); lines++; }
      else h.frame();
    }
    assert.ok(lines > 15, 'read ' + lines + ' lines');
    assert.equal(h.g.Game.state, 'play');
    assert.equal(h.g.Game.night, 1);
    assert.equal(h.g.CUT.dad.visible, false);
    assert.equal(h.g.Music.themeName, 'sea');
  });

  test('holding ESC skips to the same place, and the voyage is saved', () => {
    const h = loadGame({ seed: 1 });
    F.newVoyageFromMenu(h);
    h.frames(2);
    F.skipOpening(h);
    assert.equal(h.g.Game.night, 1);
    assert.equal(h.g.Player.x, 640);
    assert.ok(h.storage.has(SAVE));
    assert.equal(h.g.Dialogue.active, true, 'the boy says something first');
  });

  test('after reading his first lines, the boy can walk the deck', () => {
    const h = loadGame({ seed: 1 });
    F.newVoyageFromMenu(h);
    F.skipOpening(h);
    F.readDialogue(h);
    F.walkTo(h, 500);
    assert.ok(h.g.Player.x <= 520);
    assert.equal(h.g.Player.face, -1);
  });

  test('the bow refuses a line until he has something in his other hand', () => {
    const h = loadGame({ seed: 1 });
    h.startVoyage();
    F.walkTo(h, h.g.FISH_X, 40);
    h.tap('KeyE');
    assert.equal(h.g.Game.state, 'play');
    assert.match(h.g.Dialogue.full, /Empty hands/);
  });

  test('the crate holds the dip net; taking it is saved', () => {
    const h = loadGame({ seed: 1 });
    h.startVoyage();
    h.storage.clear();
    F.openCrate(h);
    assert.equal(h.g.Game.crateOpen, true);
    assert.equal(JSON.parse(h.storage.get(SAVE)).weapon, 0);
    assert.match(h.g.Game.objective(), /Cast/);
  });

  test('casting sends the line down and the view follows it into the dark', () => {
    const h = loadGame({ seed: 1 });
    h.startVoyage();
    F.openCrate(h);
    F.castLine(h);
    h.until(() => h.g.Fishing.phase === 'deep', 10);
    h.frames(1);
    assert.ok(h.g.Game.viewY > 60, 'viewY ' + h.g.Game.viewY);
    assert.equal(h.g.Cam.locked, true);
  });

  test('the first catch: a small fish, eaten underwater, and a Gnashfin to haul up and fight', () => {
    const h = loadGame({ seed: 1 });
    h.startVoyage();
    F.openCrate(h);
    F.castLine(h);
    F.waitForBite(h);
    assert.equal(h.g.Fishing.target.id, 'minnow');
    F.setHook(h);
    h.autoReel(30);
    assert.equal(h.g.Fishing.phase, 'ambush');
    h.until(() => h.g.Fishing.eaten, 4);
    assert.equal(h.g.Fishing.target.id, 'gnashfin');
    assert.ok(h.until(() => h.g.Fishing.phase === 'reel', 3));
    h.autoReel(60);
    assert.ok(h.until(() => h.g.Game.state === 'battle', 4));
    assert.equal(h.g.Battle.def.id, 'gnashfin');
    assert.equal(h.g.Player.introDone, true);
    h.frame();                        // the score changes on the next frame
    assert.equal(h.g.Music.themeName, 'battle');
  });

  test('the dip net is enough to beat the Gnashfin, and the win is saved', () => {
    const h = loadGame({ seed: 1 });
    h.startVoyage();
    F.openCrate(h);
    F.castLine(h);
    F.landIntroCatch(h);
    assert.equal(F.fightBot(h, 90), true);
    assert.equal(h.g.Game.state, 'play');
    assert.equal(h.g.Player.catches[0].id, 'gnashfin');
    const save = JSON.parse(h.storage.get(SAVE));
    assert.equal(save.totalKills, 1);
    assert.equal(save.catches.length, 1);
    assert.match(h.g.Game.objective(), /Sell/);
  });

  test('after the first kill, casts never replay the ambush', () => {
    const h = loadGame({ seed: 2, draw: false });
    h.startVoyage();
    Object.assign(h.g.Player, { weapon: 0, totalKills: 1, introDone: true });
    for (let k = 0; k < 3; k++) {
      F.castLine(h);
      assert.equal(h.g.Fishing.intro, false);
      F.waitForBite(h);
      assert.notEqual(h.g.Fishing.target.id, 'minnow');
      h.frames(2.8);                 // let it spit the hook
      h.tap('KeyE');                 // and put the rod down
      h.until(() => h.g.Game.state === 'play', 3);
    }
  });

  test('Dorran buys the first catch, and the coins are in the save', () => {
    const h = loadGame({ seed: 1, draw: false });
    h.startVoyage();
    h.g.Player.weapon = 0;
    h.g.Player.catches.push(h.g.makeTrophy(h.g.MONSTERS[0]));
    const value = h.g.Player.catches[0].value;
    F.openStall(h);
    assert.equal(h.g.Shop.tab, 0);
    h.tap('Enter');
    assert.equal(h.g.Player.coins, value);
    h.tap('Escape');
    assert.equal(JSON.parse(h.storage.get(SAVE)).coins, value);
  });

  test('saved-up coins buy the gaff, and the gaff hits harder in the next fight', () => {
    const h = loadGame({ seed: 3, draw: false });
    h.startVoyage();
    Object.assign(h.g.Player, { weapon: 0, coins: 130 });
    F.openStall(h);
    const S = h.g.Shop;
    S.sel = S.rows().findIndex(r => r.kind === 'weapon' && r.idx === 1);
    h.tap('Enter');
    h.tap('Escape');
    assert.equal(h.g.Player.weapon, 1);
    assert.equal(h.g.Player.coins, 10);
    h.eval('Math.random = () => 0.5');
    h.g.Game.startBattle(h.g.MONSTERS[3]);
    const B = h.g.Battle;
    Object.assign(B, { phase: 'fight' });
    Object.assign(B.m, { state: 'idle', cool: 1e9, x: h.g.Player.x + 110, y: B.restY });
    h.g.Player.face = 1;
    h.tap('KeyJ');
    h.frames(.4);
    assert.equal(B.m.hp, B.m.maxHp - 14);
  });
});
