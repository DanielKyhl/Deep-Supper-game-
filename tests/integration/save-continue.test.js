'use strict';
/* Saving and coming back: autosaves, Continue, starting over, and what
   happens when the save file is damaged, tampered with or unwritable. A
   "restart" is a fresh load of the game against the same storage. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

const SAVE = 'deepsupper.save.v1';
const restart = (h, opts) => loadGame(Object.assign({ storage: Object.fromEntries(h.storage), draw: false }, opts));
const mainLabels = h => h.g.Menu.items('main').map(i => i.label);

describe('saving and continuing', () => {
  test('a fresh install has nothing to continue', () => {
    const h = loadGame({ draw: false });
    assert.ok(!mainLabels(h).includes('Continue'));
  });

  test('once the voyage has started, a restart offers Continue first', () => {
    const h = loadGame({ draw: false });
    h.startVoyage();
    const again = restart(h);
    assert.equal(mainLabels(again)[0], 'Continue');
  });

  test('Continue puts you back aboard with your gear, hold, coins and position', () => {
    const h = loadGame({ draw: false, seed: 4 });
    h.startVoyage();
    Object.assign(h.g.Player, { coins: 333, rod: 2, weapon: 3, bandages: 2, lockets: 1, maxHp: 6, hp: 2, lantern: true, x: 1234, totalKills: 5, introDone: true });
    h.g.Player.catches.push(h.g.makeTrophy(h.g.MONSTERS[8]));
    h.g.Game.crateOpen = true;
    h.g.Game.autosave();

    const again = restart(h, { seed: 4 });
    F.chooseMenu(again, 'continue');
    assert.ok(again.until(() => again.g.Game.state === 'play', 3));
    const P = again.g.Player;
    assert.deepEqual([P.coins, P.rod, P.weapon, P.bandages, P.maxHp, P.lantern, P.x, P.totalKills, P.introDone],
      [333, 2, 3, 2, 6, true, 1234, 5, true]);
    assert.equal(P.hp, 6, 'a night\'s rest heals you');
    assert.equal(P.catches[0].id, 'tidemaw');
    assert.equal(again.g.Game.crateOpen, true);
    assert.match(again.g.Game.toastText, /Back aboard/);
  });

  test('Continue goes straight to sea at night, with no opening', () => {
    const h = loadGame({ draw: false });
    h.startVoyage();
    const again = restart(h);
    F.chooseMenu(again, 'continue');
    again.frames(1);
    assert.equal(again.g.Game.state, 'play');
    assert.equal(again.g.Game.night, 1);
    assert.equal(again.g.CUT.dad.visible, false);
    assert.equal(again.g.CUT.harbourX, -1400);
  });

  test('Save and return to title writes the save and shows Continue', () => {
    const h = loadGame({ seed: 6 });
    h.startVoyage();
    h.g.Player.coins = 91;
    h.tap('Escape');
    F.chooseMenu(h, 'title');
    assert.ok(h.until(() => h.g.Game.state === 'menu', 3));
    assert.equal(JSON.parse(h.storage.get(SAVE)).coins, 91);
    assert.equal(mainLabels(h)[0], 'Continue');
    assert.equal(h.g.Menu.context, 'main');
  });

  test('closing the window mid-fight keeps everything earned before it', () => {
    const h = loadGame({ draw: false });
    h.startVoyage();
    Object.assign(h.g.Player, { weapon: 0, coins: 40, totalKills: 2 });
    h.g.Game.startBattle(h.g.MONSTERS[1]);
    h.emit('beforeunload', {});
    const again = restart(h);
    assert.equal(again.g.SaveGame.read().coins, 40);
    assert.equal(again.g.SaveGame.read().totalKills, 2);
  });

  test('buying from Dorran is saved when you leave the stall', () => {
    const h = loadGame({ draw: false });
    h.startVoyage();
    Object.assign(h.g.Player, { weapon: 0, coins: 200 });
    F.openStall(h);
    h.g.Shop.tab = 2;
    h.g.Shop.sel = 1;                          // heart locket
    h.tap('Enter');
    h.tap('Escape');
    const s = restart(h).g.SaveGame.read();
    assert.equal(s.lockets, 1);
    assert.equal(s.maxHp, 6);
    assert.equal(s.coins, 50);
  });
});

describe('save slots', () => {
  test('save to a slot from the pause menu, play on, then load back to that moment', () => {
    const h = loadGame({ seed: 2 });
    h.startVoyage();
    Object.assign(h.g.Player, { coins: 100, weapon: 0, x: 900 });
    h.tap('Escape');
    F.chooseMenu(h, 'save');
    F.chooseMenu(h, 'slot2');
    assert.match(h.g.Menu.notice, /slot 2/);
    h.tap('Escape'); h.tap('Escape');
    assert.equal(h.g.Game.state, 'play');

    Object.assign(h.g.Player, { coins: 5, weapon: 3 });
    h.tap('Escape');
    F.chooseMenu(h, 'load');
    F.chooseMenu(h, 'slot2');
    F.chooseMenu(h, 'yes');
    assert.ok(h.until(() => h.g.Game.state === 'play', 3));
    assert.equal(h.g.Player.coins, 100);
    assert.equal(h.g.Player.weapon, 0);
    assert.equal(h.g.Player.x, 900);
    assert.match(h.g.Game.toastText, /slot 2/);
  });

  test('slots survive a restart and load from the title menu', () => {
    const h = loadGame({ draw: false });
    h.startVoyage();
    h.g.Player.coins = 777;
    h.g.SaveGame.saveSlot(3);
    const again = restart(h);
    F.chooseMenu(again, 'load');
    F.chooseMenu(again, 'slot3');
    assert.ok(again.until(() => again.g.Game.state === 'play', 3));
    assert.equal(again.g.Player.coins, 777);
  });

  test('loading a slot in the middle of a fight puts you back on deck, fight over', () => {
    const h = loadGame({ draw: false });
    h.startVoyage();
    h.g.Player.weapon = 0;
    h.g.SaveGame.saveSlot(1);
    h.g.Game.startBattle(h.g.MONSTERS[4]);
    h.frames(1);
    h.tap('Escape');
    F.chooseMenu(h, 'load');
    F.chooseMenu(h, 'slot1');
    F.chooseMenu(h, 'yes');
    assert.ok(h.until(() => h.g.Game.state === 'play', 3));
    assert.equal(h.g.Cam.locked, false);
    h.keyDown('KeyD'); h.frames(.3);
    assert.equal(h.g.Player.face, 1, 'free to walk again');
  });

  test('the autosave and the slots never overwrite each other', () => {
    const h = loadGame({ draw: false });
    h.startVoyage();
    h.g.Player.coins = 11; h.g.SaveGame.saveSlot(1);
    h.g.Player.coins = 22; h.g.Game.autosave();
    assert.equal(h.g.SaveGame.readSlot(1).coins, 11);
    assert.equal(h.g.SaveGame.read().coins, 22);
  });
});

describe('starting over', () => {
  test('New voyage over a save asks first; No keeps the save', () => {
    const h = loadGame({ draw: false });
    h.startVoyage();
    h.g.Player.coins = 70; h.g.Game.autosave();
    const again = restart(h);
    F.chooseMenu(again, 'new');
    assert.equal(again.g.Menu.top(), 'confirmNew');
    F.chooseMenu(again, 'no');
    assert.equal(again.g.Menu.top(), 'main');
    assert.equal(again.g.SaveGame.read().coins, 70);
  });

  test('Yes wipes the save and starts the opening from nothing', () => {
    const h = loadGame({ draw: false });
    h.startVoyage();
    Object.assign(h.g.Player, { coins: 70, weapon: 2 }); h.g.Game.autosave();
    const again = restart(h);
    F.newVoyageFromMenu(again);
    assert.equal(again.g.Player.coins, 0);
    assert.equal(again.g.Player.weapon, -1);
    assert.equal(again.g.Game.crateOpen, false);
  });
});

describe('damaged saves', () => {
  test('a half-written save file is ignored, and New voyage needs no confirmation', () => {
    const h = loadGame({ draw: false, storage: { [SAVE]: '{"version":1,"coins":' } });
    assert.ok(!mainLabels(h).includes('Continue'));
    F.newVoyageFromMenu(h);
    assert.equal(h.g.Game.state, 'cutscene');
  });

  test('a tampered save loads, but only with values the game allows', () => {
    const bad = { version: 1, coins: -500, weapon: 99, rod: -3, hp: 1000, maxHp: 1, x: 1e9, catches: [{ id: 'gnashfin', value: 1e12, weight: 1 }], kills: { gnashfin: 1, god: 99 } };
    const h = loadGame({ draw: false, storage: { [SAVE]: JSON.stringify(bad) } });
    F.chooseMenu(h, 'continue');
    h.until(() => h.g.Game.state === 'play', 3);
    const P = h.g.Player;
    assert.equal(P.coins, 0);
    assert.equal(P.weapon, h.g.WEAPONS.length - 1);
    assert.equal(P.rod, 0);
    assert.equal(P.maxHp, 5);
    assert.equal(P.hp, 5);
    assert.equal(P.x, h.g.WALK_R);
    assert.equal(P.catches[0].value, 1000000);
    assert.deepEqual(Object.keys(P.kills), ['gnashfin']);
    assert.doesNotThrow(() => h.frames(1));
  });

  test('with storage blocked the whole game still plays, it just cannot be continued later', () => {
    const h = loadGame({ brokenStorage: true, seed: 1 });
    F.newVoyageFromMenu(h);
    F.skipOpening(h);
    F.readDialogue(h);
    F.openCrate(h);
    assert.equal(h.g.Player.weapon, 0);
    const again = loadGame({ brokenStorage: true, draw: false });
    assert.ok(!mainLabels(again).includes('Continue'));
  });
});
