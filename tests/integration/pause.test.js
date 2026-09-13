'use strict';
/* The pause menu, reached from every part of the game. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

function playing(opts) {
  const h = loadGame(Object.assign({ draw: false, seed: 3 }, opts));
  h.startVoyage();
  h.g.Player.weapon = 0;
  return h;
}

describe('pausing', () => {
  test('ESC pauses on deck and ESC again resumes', () => {
    const h = playing();
    h.tap('Escape');
    assert.equal(h.g.Game.state, 'pause');
    h.tap('Escape');
    assert.equal(h.g.Game.state, 'play');
  });

  test('the Resume item resumes too', () => {
    const h = playing();
    h.tap('Escape');
    F.chooseMenu(h, 'resume');
    assert.equal(h.g.Game.state, 'play');
  });

  test('nothing moves on deck while paused', () => {
    const h = playing();
    h.g.Player.x = 1000;
    h.tap('Escape');
    h.keyDown('KeyD');
    h.frames(1);
    assert.equal(h.g.Player.x, 1000);
  });

  test('a paused reel does not lose the fish', () => {
    const h = playing();
    F.castLine(h);
    F.waitForBite(h);
    F.setHook(h);
    h.frames(.5);
    const Fi = h.g.Fishing;
    const snap = [Fi.phase, Fi.prog, Fi.t];
    h.tap('Escape');
    h.frames(5);
    assert.deepEqual([Fi.phase, Fi.prog, Fi.t], snap);
  });

  test('while paused the score underneath keeps playing', () => {
    const h = playing();
    h.g.Game.startBattle(h.g.MONSTERS[0]);
    h.frames(.5);
    h.tap('Escape');
    h.frames(.5);
    assert.equal(h.g.Music.themeName, 'battle');
  });

  test('the pause menu reports the voyage so far', () => {
    const h = playing();
    Object.assign(h.g.Player, { coins: 77, totalKills: 3 });
    h.g.Player.catches.push(h.g.makeTrophy(h.g.MONSTERS[0]));
    h.tap('Escape');
    const line = h.g.Menu.items('pause').find(i => i.kind === 'text').label;
    assert.equal(line, '77§ in pocket   ·   3 killed   ·   1 in the hold');
  });

  test('Save and return to title from a fight goes back to the title music', () => {
    const h = playing();
    h.g.Game.startBattle(h.g.MONSTERS[0]);
    h.frames(.5);
    h.tap('Escape');
    F.chooseMenu(h, 'title');
    h.until(() => h.g.Game.state === 'menu', 3);
    h.frame();
    assert.equal(h.g.Music.themeName, 'title');
    assert.equal(h.g.Cam.locked, false);
  });

  test('in the desktop app, Save and quit saves and closes the window', () => {
    let quits = 0;
    const h = playing({ native: { isApp: true, setFullscreen() {}, quit: () => quits++ } });
    h.g.Player.coins = 12;
    h.storage.clear();
    h.tap('Escape');
    F.chooseMenu(h, 'quit');
    assert.equal(quits, 1);
    assert.equal(JSON.parse(h.storage.get('deepsupper.save.v1')).coins, 12);
  });
});
