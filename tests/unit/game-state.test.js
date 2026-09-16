'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');

describe('boot', () => {
  test('the game boots straight into the title menu', () => {
    const { g } = loadGame({ draw: false });
    assert.equal(g.Game.state, 'menu');
    assert.equal(g.Menu.context, 'main');
    assert.equal(g.Art.stars.length, 130);
  });

  test('the title menu picks the title theme', () => {
    const { h, g } = loadGame({ draw: false });
    h.frame();
    assert.equal(g.Music.themeName, 'title');
  });
});

describe('messages and toasts', () => {
  test('say queues lines and shows them one at a time', () => {
    const { g } = loadGame({ draw: false });
    g.Game.say(['Dad', 'One.'], ['You', 'Two.'], 'Three.');
    assert.equal(g.Dialogue.who, 'Dad');
    assert.equal(g.Game.msgs.length, 2);
    g.Game._nextMsg();
    assert.equal(g.Dialogue.full, 'Two.');
    g.Game._nextMsg();
    assert.equal(g.Dialogue.who, '');
    g.Game._nextMsg();
    assert.equal(g.Dialogue.active, false);
  });

  test('on deck, confirm advances a line once it is typed out', () => {
    const { h, g } = loadGame({ draw: false });
    h.startVoyage();
    g.Settings.set('textSpeed', 'instant');
    g.Game.say(['You', 'First.'], ['You', 'Second.']);
    h.frames(.3);
    h.tap('Enter');
    assert.equal(g.Dialogue.full, 'Second.');
  });

  test('lines on deck wait to be read, then a press finishes one and the next moves on', () => {
    const { h, g } = loadGame({ draw: false });
    h.startVoyage();
    g.Game.say(['You', 'A line long enough that it takes a good while to type out.'], ['You', 'Hmm.']);
    h.frame();
    h.tap('KeyE');
    assert.equal(g.Dialogue.done, true);
    assert.match(g.Dialogue.full, /A line long/);
    h.frames(10);
    assert.match(g.Dialogue.full, /A line long/, 'still there ten seconds later');
    h.tap('KeyE');
    assert.equal(g.Dialogue.full, 'Hmm.');
  });

  test('toasts last a few seconds', () => {
    const { h, g } = loadGame({ draw: false });
    h.startVoyage();
    g.Game.toast('Hello');
    h.frames(3);
    assert.ok(g.Game.toastT > 0);
    h.frames(1.5);
    assert.equal(g.Game.toastT, 0);
  });
});

describe('fades', () => {
  test('the fade callback runs at full black, then the fade clears', () => {
    const { h, g } = loadGame({ draw: false });
    let ran = 0;
    g.Game.fadeOut(() => ran++);
    h.frames(.3);
    assert.equal(ran, 0);
    h.frames(.2);
    assert.equal(ran, 1);
    h.frames(.6);
    assert.equal(g.Game.fade.a, 0);
    assert.equal(g.Game.fade.dir, 0);
    assert.equal(ran, 1);
  });
});

describe('pause', () => {
  test('pausing remembers where you were and opens the pause menu', () => {
    const { h, g } = loadGame({ draw: false });
    h.startVoyage();
    g.Game.state = 'battle';
    g.Game.pause();
    assert.equal(g.Game.state, 'pause');
    assert.equal(g.Game.pausedFrom, 'battle');
    assert.equal(g.Menu.context, 'pause');
    g.Game.resume();
    assert.equal(g.Game.state, 'battle');
  });

  test('the title menu cannot be paused, and resume outside pause does nothing', () => {
    const { g } = loadGame({ draw: false });
    g.Game.pause();
    assert.equal(g.Game.state, 'menu');
    g.Game.resume();
    assert.equal(g.Game.state, 'menu');
  });
});

describe('music follows the game', () => {
  test('each state picks its theme; pause keeps the one underneath', () => {
    const { g } = loadGame({ draw: false });
    const want = state => { g.Game.state = state; g.Game.syncMusic(); return g.Music.themeName; };
    assert.equal(want('menu'), 'title');
    assert.equal(want('play'), 'sea');
    g.Battle.def = g.MONSTERS[0];
    assert.equal(want('battle'), 'battle');
    g.Game.pausedFrom = 'battle';
    assert.equal(want('pause'), 'battle');
    g.Battle.def = g.MONSTERS.find(m => m.boss);
    assert.equal(want('battle'), 'boss');
    g.Game.endingRun = true;
    assert.equal(want('cutscene'), 'ending');
    g.Game.endingRun = false; g.Game.night = .2;
    assert.equal(want('cutscene'), 'title');
  });
});

describe('global shortcuts', () => {
  test('M mutes and unmutes, with a flash message', () => {
    const { h, g } = loadGame({ draw: false });
    h.tap('KeyM');
    assert.equal(g.Settings.get('muted'), true);
    assert.equal(g.Game.muteMsg, 'sound off');
    h.tap('KeyM');
    assert.equal(g.Settings.get('muted'), false);
  });

  test('N turns the music off and on', () => {
    const { h, g } = loadGame({ draw: false });
    h.tap('KeyN');
    assert.equal(g.Settings.get('musicOff'), true);
    assert.equal(g.Music.enabled, false);
    assert.equal(g.Game.muteMsg, 'music off');
  });

  test('F11 toggles fullscreen through settings', () => {
    const calls = [];
    const { h, g } = loadGame({ draw: false, native: { isApp: true, setFullscreen: on => calls.push(on), quit() {} } });
    h.tap('F11');
    assert.equal(g.Settings.get('fullscreen'), true);
    assert.equal(calls[calls.length - 1], true);
  });

  test('ESC pauses mid-fishing and mid-battle', () => {
    for (const state of ['fish', 'battle']) {
      const { h, g } = loadGame({ draw: false });
      h.startVoyage();
      g.Player.weapon = 0;
      if (state === 'fish') { g.Game.state = 'fish'; g.Fishing.start(); } else g.Game.startBattle(g.MONSTERS[0]);
      h.tap('Escape');
      assert.equal(g.Game.state, 'pause', state);
      assert.equal(g.Game.pausedFrom, state);
    }
  });
});

describe('ending a battle', () => {
  test('losing restores health, returns to deck and autosaves', () => {
    const { h, g } = loadGame({ draw: false });
    h.startVoyage();
    g.Game.startBattle(g.MONSTERS[0]);
    g.Player.hp = 0;
    h.storage.clear();
    g.Game.endBattle(false);
    assert.equal(g.Player.hp, g.Player.maxHp);
    assert.equal(g.Game.state, 'play');
    assert.ok(h.storage.has('deepsupper.save.v1'));
  });

  test('winning against anything but the boss is a toast and back to work', () => {
    const { h, g } = loadGame({ draw: false });
    h.startVoyage();
    g.Game.startBattle(g.MONSTERS[2]);
    g.Game.endBattle(true, { name: 'Palefinger', weight: 120 });
    assert.equal(g.Game.state, 'play');
    assert.equal(g.Game.toastText, 'Hauled aboard: Palefinger (120 lb)');
  });

  test('beating the boss a second time does not replay the ending', () => {
    const { h, g } = loadGame({ draw: false });
    h.startVoyage();
    g.Player.beatBoss = true;
    g.Game.startBattle(g.MONSTERS.find(m => m.boss));
    g.Game.endBattle(true, { name: 'The Old One', weight: 400 });
    assert.equal(g.Game.state, 'play');
  });
});

describe('quitting', () => {
  test('quitting the app from play saves first and asks the shell to close', () => {
    let quit = 0;
    const { h, g } = loadGame({ draw: false, native: { isApp: true, setFullscreen() {}, quit: () => quit++ } });
    h.startVoyage();
    h.storage.clear();
    g.Game.quitApp();
    assert.equal(quit, 1);
    assert.ok(h.storage.has('deepsupper.save.v1'));
  });

  test('quitting from the title menu does not write a save', () => {
    let quit = 0;
    const { h, g } = loadGame({ draw: false, native: { isApp: true, setFullscreen() {}, quit: () => quit++ } });
    g.Game.quitApp();
    assert.equal(quit, 1);
    assert.equal(h.storage.has('deepsupper.save.v1'), false);
  });

  test('closing the window mid-voyage autosaves', () => {
    const { h, g } = loadGame({ draw: false });
    h.startVoyage();
    g.Player.coins = 55;
    h.storage.clear();
    h.emit('beforeunload', {});
    assert.equal(JSON.parse(h.storage.get('deepsupper.save.v1')).coins, 55);
  });
});

describe('frame bookkeeping', () => {
  test('the FPS estimate follows the real frame time', () => {
    const { g } = loadGame({ draw: false });
    for (let i = 0; i < 200; i++) g.Game.frame(1 / 30, 1 / 30);
    assert.ok(Math.abs(g.Game.fps - 30) < 1);
  });
});
