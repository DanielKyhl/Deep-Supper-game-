'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');

const KEY = 'deepsupper.settings.v1';
const stored = h => JSON.parse(h.storage.get(KEY));

describe('Store', () => {
  test('round-trips strings through localStorage', () => {
    const { h, g } = loadGame({ draw: false });
    assert.equal(g.Store.set('k', 'v'), true);
    assert.equal(h.storage.get('k'), 'v');
    assert.equal(g.Store.get('k'), 'v');
    g.Store.remove('k');
    assert.equal(g.Store.get('k'), null);
  });

  test('readJSON returns null for missing or corrupt data', () => {
    const { g } = loadGame({ draw: false, storage: { bad: '{nope', good: '{"a":1}' } });
    assert.equal(g.Store.readJSON('missing'), null);
    assert.equal(g.Store.readJSON('bad'), null);
    assert.equal(g.Store.readJSON('good').a, 1);
  });

  test('falls back to memory when storage is blocked', () => {
    const { g } = loadGame({ draw: false, brokenStorage: true });
    assert.equal(g.Store.set('k', 'v'), false, 'reports it could not persist');
    assert.equal(g.Store.get('k'), 'v', 'but the value is still readable this session');
    g.Store.remove('k');
    assert.equal(g.Store.get('k'), null);
  });

  test('the game still boots with storage blocked', () => {
    const { h, g } = loadGame({ draw: false, brokenStorage: true });
    assert.equal(g.Game.state, 'menu');
    assert.doesNotThrow(() => h.frames(.2));
  });
});

describe('Settings: load, set, nudge', () => {
  test('load reads and sanitises what was stored', () => {
    const { g } = loadGame({ draw: false, storage: { [KEY]: JSON.stringify({ master: .25, textSpeed: 'warp' }) } });
    assert.equal(g.Settings.get('master'), .3);
    assert.equal(g.Settings.get('textSpeed'), 'normal');
  });

  test('set rejects unknown keys', () => {
    const { h, g } = loadGame({ draw: false });
    assert.equal(g.Settings.set('godMode', true), false);
    assert.equal(h.storage.has(KEY), false);
  });

  test('set sanitises, applies and saves immediately', () => {
    const { h, g } = loadGame({ draw: false });
    assert.equal(g.Settings.set('master', 5), true);
    assert.equal(g.Settings.get('master'), 1);
    assert.equal(stored(h).master, 1);
  });

  test('nudge flips booleans', () => {
    const { g } = loadGame({ draw: false });
    g.Settings.nudge('showFps', 1);
    assert.equal(g.Settings.get('showFps'), true);
    g.Settings.nudge('showFps', -1);
    assert.equal(g.Settings.get('showFps'), false);
  });

  test('nudge walks enums and stops at the ends', () => {
    const { g } = loadGame({ draw: false });
    g.Settings.nudge('textSpeed', 1);
    assert.equal(g.Settings.get('textSpeed'), 'fast');
    g.Settings.nudge('textSpeed', 1);
    g.Settings.nudge('textSpeed', 1);
    assert.equal(g.Settings.get('textSpeed'), 'instant');
    for (let i = 0; i < 6; i++) g.Settings.nudge('textSpeed', -1);
    assert.equal(g.Settings.get('textSpeed'), 'slow');
  });

  test('nudge steps numbers by their step and clamps', () => {
    const { g } = loadGame({ draw: false });
    g.Settings.nudge('music', 1);
    assert.equal(g.Settings.get('music'), .8);
    for (let i = 0; i < 20; i++) g.Settings.nudge('music', -1);
    assert.equal(g.Settings.get('music'), 0);
    g.Settings.nudge('brightness', 1);
    assert.equal(g.Settings.get('brightness'), 1.05);
  });

  test('nudge on an unknown key does nothing', () => {
    const { g } = loadGame({ draw: false });
    assert.doesNotThrow(() => g.Settings.nudge('warpDrive', 1));
    assert.equal(g.Settings.get('warpDrive'), undefined);
  });
});

describe('Settings: key bindings', () => {
  test('bind makes the new key primary and keeps the old one as secondary', () => {
    const { g } = loadGame({ draw: false });
    assert.equal(g.Settings.bind('attack', 'KeyL'), true);
    assert.deepEqual(plain(g.Settings.data.bindings.attack), ['KeyL', 'KeyJ']);
  });

  test('taking a key from another action swaps the two', () => {
    const { g } = loadGame({ draw: false });
    g.Settings.bind('attack', 'KeyE');       // KeyE belonged to interact
    const b = plain(g.Settings.data.bindings);
    assert.deepEqual(b.attack, ['KeyE', 'KeyX']);
    assert.deepEqual(b.interact, ['KeyJ', 'KeyF'], 'interact inherits attack\'s old primary');
  });

  test('regression: the key handed over in a swap does not stay behind as a second key', () => {
    const { g } = loadGame({ draw: false });
    g.Settings.bind('interact', 'KeyK');       // roll's key; interact's old primary was E
    const b = plain(g.Settings.data.bindings);
    assert.deepEqual(b.roll, ['KeyE', 'ShiftLeft']);
    assert.deepEqual(b.interact, ['KeyK', 'KeyF']);
  });

  test("binding an action to its own second key just swaps its two keys", () => {
    const { g } = loadGame({ draw: false });
    g.Settings.bind('attack', 'KeyX');
    assert.deepEqual(plain(g.Settings.data.bindings.attack), ['KeyX', 'KeyJ']);
    g.Settings.bind('attack', 'KeyX');
    assert.deepEqual(plain(g.Settings.data.bindings.attack), ['KeyX', 'KeyJ'], 'binding the current primary changes nothing');
  });

  test('no key ever ends up on two actions', () => {
    const { h, g } = loadGame({ draw: false, seed: 11 });
    const keys = ['KeyA', 'KeyD', 'Space', 'KeyJ', 'KeyK', 'KeyE', 'KeyQ', 'KeyL', 'ArrowLeft', 'KeyW', 'KeyF', 'ShiftLeft'];
    const rnd = h.eval('Math.random');
    for (let i = 0; i < 300; i++) {
      const a = g.REBINDABLE[Math.floor(rnd() * g.REBINDABLE.length)];
      g.Settings.bind(a, keys[Math.floor(rnd() * keys.length)]);
      const b = plain(g.Settings.data.bindings);
      const all = Object.values(b).flat();
      assert.equal(new Set(all).size, all.length, 'duplicate after step ' + i + ': ' + JSON.stringify(b));
      for (const list of Object.values(b)) assert.ok(list.length >= 1 && list.length <= 2);
    }
  });

  test('reserved keys and unknown actions are refused', () => {
    const { g } = loadGame({ draw: false });
    assert.equal(g.Settings.bind('attack', 'Escape'), false);
    assert.equal(g.Settings.bind('attack', 'F11'), false);
    assert.equal(g.Settings.bind('menuUp', 'KeyZ'), false);
    assert.equal(g.Settings.bind('attack', 42), false);
    assert.deepEqual(plain(g.Settings.data.bindings.attack), ['KeyJ', 'KeyX']);
  });

  test('bindings go live in Input and are saved', () => {
    const { h, g } = loadGame({ draw: false });
    g.Settings.bind('jump', 'KeyG');
    h.press('KeyG');
    assert.equal(g.Input.tap('jump'), true);
    assert.equal(stored(h).bindings.jump[0], 'KeyG');
  });

  test('resetBindings restores defaults but leaves other settings alone', () => {
    const { g } = loadGame({ draw: false });
    g.Settings.set('master', .2);
    g.Settings.bind('jump', 'KeyG');
    g.Settings.resetBindings();
    assert.deepEqual(plain(g.Settings.data.bindings.jump), ['Space', 'KeyW']);
    assert.equal(g.Settings.get('master'), .2);
  });

  test('resetAll restores everything', () => {
    const { h, g } = loadGame({ draw: false });
    g.Settings.set('master', .2);
    g.Settings.bind('jump', 'KeyG');
    g.Settings.resetAll();
    assert.deepEqual(plain(g.Settings.data), plain(g.defaultSettings()));
    assert.deepEqual(stored(h), plain(g.defaultSettings()));
  });
});

describe('Settings: pushing into the engine', () => {
  test('one broken listener does not stop the others', () => {
    const { g } = loadGame({ draw: false });
    let ran = false;
    g.Settings.onApply(() => { throw new Error('boom'); });
    g.Settings.onApply(() => { ran = true; });
    assert.doesNotThrow(() => g.Settings.apply());
    assert.equal(ran, true);
  });

  test('gameplay and graphics settings land in Prefs', () => {
    const { g } = loadGame({ draw: false });
    g.Settings.set('shake', 0);
    g.Settings.set('particles', 'low');
    g.Settings.set('damageNumbers', false);
    g.Settings.set('textSpeed', 'fast');
    g.Settings.set('showFps', true);
    assert.equal(g.Prefs.shake, 0);
    assert.equal(g.Prefs.particlesLow, true);
    assert.equal(g.Prefs.damageNumbers, false);
    assert.equal(g.Prefs.textCps, 84);
    assert.equal(g.Prefs.showFps, true);
  });

  test('brightness becomes a CSS filter, and 100% removes it', () => {
    const { h, g } = loadGame({ draw: false });
    g.Settings.set('brightness', 1.2);
    assert.equal(h.eval('canvas.style.filter'), 'brightness(1.2)');
    g.Settings.set('brightness', 1);
    assert.equal(h.eval('canvas.style.filter'), '');
  });

  test('scaling and quality changes refit the canvas and supersampling', () => {
    const { h, g } = loadGame({ draw: false, width: 1280, height: 720 });
    g.Settings.set('scaling', 'fill');
    assert.equal(h.eval('canvas.width'), 1280);
    g.Settings.set('quality', 'low');
    assert.equal(h.eval('SS'), 1);
  });

  test('volume settings multiply master into music and effects', () => {
    const { g } = loadGame({ draw: false });
    g.Settings.set('master', .5);
    g.Settings.set('sfx', .6);
    g.Settings.set('music', .4);
    assert.equal(g.Sfx.level, .3);
    assert.equal(g.Music.level, .2);
    g.Settings.set('muted', true);
    assert.equal(g.Sfx.muted, true);
    assert.equal(g.Music.muted, true);
    g.Settings.set('musicOff', true);
    assert.equal(g.Music.enabled, false);
  });

  test('mute-in-background silences on blur and restores on focus', () => {
    const { h, g } = loadGame({ draw: false });
    h.emit('blur', {});
    assert.equal(g.Sfx.muted, true);
    h.emit('focus', {});
    assert.equal(g.Sfx.muted, false);
    g.Settings.set('muteUnfocused', false);
    h.emit('blur', {});
    assert.equal(g.Sfx.muted, false);
  });

  test('fullscreen goes through the desktop bridge when there is one', () => {
    const calls = [];
    const { g } = loadGame({ draw: false, native: { isApp: true, setFullscreen: on => calls.push(on) } });
    g.Settings.set('fullscreen', true);
    g.Settings.set('master', .5);            // unrelated change: no extra call
    g.Settings.set('fullscreen', false);
    assert.deepEqual(calls, [false, true, false]);
  });

  test('in the app, the window going in or out of fullscreen by itself is written back to settings', () => {
    const calls = [];
    const { h, g } = loadGame({ draw: false, native: { isApp: true, setFullscreen: on => calls.push(on) } });
    g.Settings.set('fullscreen', true);
    const asked = calls.length;
    h.emit('nativefullscreenchange', { detail: false });      // a Mac's green button
    assert.equal(g.Settings.get('fullscreen'), false);
    assert.equal(stored(h).fullscreen, false);
    g.Settings.set('master', .4);
    assert.equal(calls.length, asked, 'and the game does not put the window back');
    h.emit('nativefullscreenchange', { detail: true });
    assert.equal(g.Settings.get('fullscreen'), true);
    assert.equal(stored(h).fullscreen, true);
  });

  test('in a browser, leaving fullscreen with ESC is written back to settings', () => {
    const { h, g } = loadGame({ draw: false });
    g.Settings.data.fullscreen = true;
    h.sandbox.document.fullscreenElement = null;
    h.emitDocument('fullscreenchange', {});
    assert.equal(g.Settings.get('fullscreen'), false);
    assert.equal(stored(h).fullscreen, false);
  });
});
