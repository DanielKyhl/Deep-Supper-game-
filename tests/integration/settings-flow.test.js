'use strict';
/* Options changed through the menus, the way a player changes them, and
   their effects showing up in the actual game. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

const KEY = 'deepsupper.settings.v1';
const restart = (h, opts) => loadGame(Object.assign({ storage: Object.fromEntries(h.storage), draw: false }, opts));
const openScreen = (h, ...path) => { for (const id of path) F.chooseMenu(h, id); };

// a fight in progress with the monster in reach and holding still
function inReach(h, id) {
  h.startVoyage();
  const g = h.g;
  g.Player.weapon = 0;
  g.Game.startBattle(g.MONSTERS.find(m => m.id === (id || 'netbiter')));
  const B = g.Battle;
  B.phase = 'fight';
  Object.assign(B.m, { state: 'idle', cool: 1e9, x: g.Player.x + 110, y: B.restY });
  g.Player.face = 1;
  return B;
}

describe('the options menus', () => {
  test('Audio: arrow keys change the master volume, and the engine hears it', () => {
    const h = loadGame();
    openScreen(h, 'options', 'audio');
    assert.equal(h.g.Menu.top(), 'audio');
    F.selectMenu(h, 'master');
    h.tap('ArrowLeft'); h.tap('ArrowLeft'); h.tap('ArrowLeft');
    assert.equal(h.g.Settings.get('master'), .5);
    assert.ok(Math.abs(h.g.Sfx.level - .5 * .8) < 1e-9);
    assert.equal(JSON.parse(h.storage.get(KEY)).master, .5);
  });

  test('settings survive a restart and are applied before the first frame', () => {
    const h = loadGame({ draw: false });
    openScreen(h, 'options', 'gameplay');
    F.selectMenu(h, 'damageNumbers'); h.tap('Enter');
    h.tap('Escape');
    F.chooseMenu(h, 'graphics');
    F.selectMenu(h, 'shake'); h.tap('ArrowLeft'); h.tap('ArrowLeft');
    const again = restart(h);
    assert.equal(again.g.Prefs.damageNumbers, false);
    assert.equal(again.g.Prefs.shake, 0);
  });

  test('ESC walks back out of nested options to the title menu', () => {
    const h = loadGame({ draw: false });
    openScreen(h, 'options', 'controls');
    h.tap('Escape'); h.tap('Escape');
    assert.equal(h.g.Menu.top(), 'main');
    assert.equal(h.g.Game.state, 'menu');
  });

  test('Reset all settings asks, then puts everything back', () => {
    const h = loadGame({ draw: false });
    h.g.Settings.set('music', .1);
    h.g.Settings.bind('jump', 'KeyG');
    openScreen(h, 'options', 'reset', 'yes');
    assert.equal(h.g.Settings.get('music'), .7);
    assert.equal(h.g.Settings.data.bindings.jump[0], 'Space');
    assert.equal(h.g.Menu.top(), 'options');
  });
});

describe('rebinding through the Controls screen', () => {
  test('a new attack key swings in battle, and the menu shows it', () => {
    const h = loadGame({ draw: false });
    openScreen(h, 'options', 'controls');
    F.selectMenu(h, 'attack');
    h.tap('Enter');
    assert.equal(h.g.Menu.rebinding, 'attack');
    h.tap('KeyL');
    assert.equal(h.g.Menu.valueText(h.g.Menu.items('controls').find(i => i.action === 'attack')), 'L  /  J');
    h.g.Menu.openMain();
    const B = inReach(h);
    h.tap('KeyL');
    h.frames(.4);
    assert.ok(B.m.hp < B.m.maxHp, 'the new key landed a hit');
  });

  test('a new move-left key walks him left on deck and turns him to face it', () => {
    const h = loadGame({ draw: false });
    openScreen(h, 'options', 'controls');
    F.selectMenu(h, 'left');
    h.tap('Enter');
    h.tap('KeyH');
    h.g.Menu.openMain();
    h.startVoyage();
    h.g.Player.x = 1000;
    h.keyDown('KeyH');
    h.frames(.3);
    assert.ok(h.g.Player.x < 1000);
    assert.equal(h.g.Player.face, -1);
  });

  test('stealing a key swaps it, so both actions still work in play', () => {
    const h = loadGame({ draw: false });
    openScreen(h, 'options', 'controls');
    F.selectMenu(h, 'jump');
    h.tap('Enter');
    h.tap('KeyE');                             // interact's key
    h.g.Menu.openMain();
    h.startVoyage();
    h.g.Player.x = 1000;
    h.tap('KeyE');
    assert.ok(h.g.Player.vy < 0 || h.g.Player.y < h.g.DECK_Y, 'E jumps now');
    h.frames(1);
    h.g.Player.x = 392;
    h.tap('Space');                            // interact inherited jump's old key
    assert.equal(h.g.Player.weapon, 0, 'SPACE opens the crate now');
  });

  test('Reset controls from the menu brings the defaults back', () => {
    const h = loadGame({ draw: false });
    h.g.Settings.bind('right', 'KeyL');
    openScreen(h, 'options', 'controls', 'resetControls');
    assert.equal(h.g.Settings.data.bindings.right[0], 'KeyD');
    h.g.Menu.openMain();
    h.startVoyage();
    h.g.Player.x = 1000;
    h.keyDown('KeyD'); h.frames(.2);
    assert.ok(h.g.Player.x > 1000);
  });
});

describe('settings taking effect in play', () => {
  test('instant text makes the opening lines appear the moment they start', () => {
    const h = loadGame({ draw: false });
    h.g.Settings.set('textSpeed', 'instant');
    F.newVoyageFromMenu(h);
    h.until(() => h.g.Dialogue.active, 5);
    h.frame();
    assert.equal(h.g.Dialogue.done, true);
  });

  test('damage numbers off: a real hit leaves no numbers', () => {
    const h = loadGame({ draw: false });
    h.g.Settings.set('damageNumbers', false);
    const B = inReach(h);
    h.g.Floaters.clear();
    h.tap('KeyJ'); h.frames(.4);
    assert.ok(B.m.hp < B.m.maxHp);
    assert.equal(h.g.Floaters.list.length, 0);
  });

  test('low particles: the same hit throws fewer sparks', () => {
    const sparks = level => {
      const h = loadGame({ draw: false, seed: 8 });
      h.g.Settings.set('particles', level);
      inReach(h);
      h.eval('Math.random = () => 0.5');
      h.g.Particles.clear();
      h.tap('KeyJ'); h.frames(.25);
      return h.g.Particles.list.length;
    };
    assert.ok(sparks('low') < sparks('high') * .6);
  });

  test('screen shake off keeps the camera still through a monster slam', () => {
    const h = loadGame({ draw: false });
    h.g.Settings.set('shake', 0);
    const B = inReach(h);
    Object.assign(B.m, { state: 'slam', t: 0, target: B.m.x, y: B.restY - 140 });
    for (let i = 0; i < 40; i++) {
      h.frame();
      assert.ok(h.g.Cam.shakeX === 0 && h.g.Cam.shakeY === 0);
    }
    assert.ok(h.g.Cam.shake > 0 || B.waves.length, 'the slam did happen');
  });

  test('low render quality from the Graphics menu still draws every frame', () => {
    const h = loadGame();
    openScreen(h, 'options', 'graphics');
    F.selectMenu(h, 'quality');
    h.tap('ArrowRight'); h.tap('ArrowRight');
    assert.equal(h.g.Settings.get('quality'), 'low');
    assert.equal(h.eval('SS'), 1);
    const before = h.ctx.calls.drawImage;
    h.frames(.2);
    assert.ok(h.ctx.calls.drawImage > before);
  });

  test('fill scaling stretches the canvas to the window after a resize', () => {
    const h = loadGame({ draw: false, width: 1000, height: 700 });
    openScreen(h, 'options', 'graphics');
    F.selectMenu(h, 'scaling');
    h.tap('ArrowRight');
    h.sandbox.innerWidth = 1600; h.sandbox.innerHeight = 900;
    h.emit('resize', {});
    assert.equal(h.eval('canvas.width'), 1600);
  });

  test('M mutes in the middle of play and stays muted after a restart', () => {
    const h = loadGame({ draw: false });
    h.startVoyage();
    h.tap('KeyM');
    assert.equal(h.g.Sfx.muted, true);
    assert.equal(restart(h).g.Sfx.muted, true);
  });

  test('options opened from the pause menu apply at once and lead back to pause', () => {
    const h = loadGame({ draw: false });
    h.startVoyage();
    h.tap('Escape');
    openScreen(h, 'options', 'graphics');
    F.selectMenu(h, 'showFps');
    h.tap('Enter');
    assert.equal(h.g.Prefs.showFps, true);
    h.tap('Escape'); h.tap('Escape');
    assert.equal(h.g.Menu.top(), 'pause');
    h.tap('Escape');
    assert.equal(h.g.Game.state, 'play');
  });
});
