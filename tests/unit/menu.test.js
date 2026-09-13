'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');

const SAVE = 'deepsupper.save.v1';
const aSave = JSON.stringify({ version: 1, coins: 12, weapon: 0, x: 700 });
const labels = (M, id) => plain(M.items(id).map(i => i.label));
// one Menu.update with the key tapped, then the frame's taps are cleared
const key = (h, code) => { h.press(code); h.g.Menu.update(1 / 60); h.g.Input.endFrame(); };

describe('menu screens', () => {
  test('the title menu without a save offers a new voyage, options and credits', () => {
    const { g } = loadGame({ draw: false });
    assert.deepEqual(labels(g.Menu, 'main'), ['New voyage', 'Options', 'Credits']);
  });

  test('with a save, Continue comes first', () => {
    const { g } = loadGame({ draw: false, storage: { [SAVE]: aSave } });
    assert.equal(labels(g.Menu, 'main')[0], 'Continue');
  });

  test('Quit only appears in the desktop app, on the title and pause menus', () => {
    const web = loadGame({ draw: false }).g.Menu;
    const app = loadGame({ draw: false, native: { isApp: true, setFullscreen() {}, quit() {} } }).g.Menu;
    assert.ok(!labels(web, 'main').includes('Quit'));
    assert.ok(labels(app, 'main').includes('Quit'));
    assert.ok(!labels(web, 'pause').includes('Save and quit game'));
    assert.ok(labels(app, 'pause').includes('Save and quit game'));
  });

  test('the pause menu shows how the voyage is going', () => {
    const { g } = loadGame({ draw: false });
    g.Player.coins = 321; g.Player.totalKills = 4;
    const text = g.Menu.items('pause').find(i => i.kind === 'text').label;
    assert.match(text, /321§/);
    assert.match(text, /4 killed/);
  });

  test('every options screen binds only real settings and ends with Back', () => {
    const { g } = loadGame({ draw: false });
    for (const id of ['options', 'graphics', 'audio', 'controls', 'gameplay', 'credits']) {
      const items = g.Menu.items(id);
      assert.ok(items.length > 1, id);
      assert.equal(items[items.length - 1].label, 'Back', id);
      for (const it of items) {
        if (it.key) assert.ok(g.SETTINGS_SPEC[it.key], id + ': ' + it.key);
        if (it.kind === 'bind') assert.ok(g.REBINDABLE.includes(it.action));
      }
      assert.ok(g.SCREEN_TITLES[id], 'title for ' + id);
    }
  });

  test('graphics, audio and gameplay cover every setting between them', () => {
    const { g } = loadGame({ draw: false });
    const keys = new Set(['graphics', 'audio', 'gameplay'].flatMap(id => plain(g.Menu.items(id).map(i => i.key)).filter(Boolean)));
    for (const k of Object.keys(g.SETTINGS_SPEC)) assert.ok(keys.has(k), 'no menu for ' + k);
  });

  test('the credits name the author', () => {
    const { g } = loadGame({ draw: false });
    assert.ok(labels(g.Menu, 'credits').includes('Made by Daniel Kyhl'));
  });
});

describe('cursor movement', () => {
  const { g } = loadGame({ draw: false });
  const M = g.Menu;

  test('skips gaps and text, and wraps at both ends', () => {
    const items = M.items('options');          // ... Gameplay, gap, Reset, Back
    const gameplay = items.findIndex(i => i.id === 'gameplay');
    assert.equal(items[gameplay + 1].kind, 'gap');
    assert.equal(M.step(items, gameplay, 1), gameplay + 2);
    assert.equal(M.step(items, items.length - 1, 1), 0);
    assert.equal(M.step(items, 0, -1), items.length - 1);
  });

  test('firstSelectable skips leading text', () => {
    const items = M.items('confirmNew');
    assert.equal(items[M.firstSelectable(items)].id, 'yes');
  });

  test('a list with nothing selectable stays put', () => {
    const items = h => h.eval('[{ kind: "text" }, { kind: "gap" }]');
    const list = items(loadGame({ draw: false }));
    assert.equal(M.step(list, 0, 1), 0);
  });
});

describe('values and changes', () => {
  test('value text for toggles, choices, sliders and bindings', () => {
    const { g } = loadGame({ draw: false });
    const M = g.Menu;
    assert.equal(M.valueText({ kind: 'toggle', key: 'showFps' }), 'OFF');
    assert.equal(M.valueText({ kind: 'choice', key: 'scaling' }), '‹ Sharp pixels ›');
    assert.equal(M.valueText({ kind: 'choice', key: 'shake' }), '‹ Full ›');
    assert.equal(M.valueText({ kind: 'slider', key: 'master' }), '80%');
    assert.equal(M.valueText({ kind: 'bind', action: 'roll' }), 'K  /  L-SHIFT');
    M.rebinding = 'roll';
    assert.equal(M.valueText({ kind: 'bind', action: 'roll' }), 'press a key…');
  });

  test('left and right adjust the selected setting', () => {
    const { h, g } = loadGame({ draw: false });
    g.Menu.push('audio');
    key(h, 'ArrowRight');                     // master 80% -> 90%
    assert.equal(g.Settings.get('master'), .9);
    key(h, 'ArrowLeft'); key(h, 'ArrowLeft');
    assert.equal(g.Settings.get('master'), .7);
  });

  test('ENTER cycles a choice forward and wraps round', () => {
    const { g } = loadGame({ draw: false });
    const it = { kind: 'choice', key: 'quality' };
    g.Menu.activate(it, 0);
    assert.equal(g.Settings.get('quality'), 'high');
    g.Menu.activate(it, 0);
    g.Menu.activate(it, 0);
    assert.equal(g.Settings.get('quality'), 'auto');
  });

  test('ENTER flips a toggle and a click on a value steps it that way', () => {
    const { g } = loadGame({ draw: false });
    g.Menu.activate({ kind: 'toggle', key: 'damageNumbers' }, 0);
    assert.equal(g.Settings.get('damageNumbers'), false);
    g.Menu.activate({ kind: 'choice', key: 'textSpeed' }, -1);
    assert.equal(g.Settings.get('textSpeed'), 'slow');
    g.Menu.activate({ kind: 'slider', key: 'sfx' }, -1);
    assert.equal(g.Settings.get('sfx'), .7);
  });

  test('text and gaps cannot be activated', () => {
    const { g } = loadGame({ draw: false });
    assert.doesNotThrow(() => { g.Menu.activate({ kind: 'text', label: 'x' }, 0); g.Menu.activate({ kind: 'gap' }, 0); g.Menu.activate(null, 0); });
  });
});

describe('navigation stack', () => {
  test('push opens a screen on its first item; ESC goes back one level', () => {
    const { h, g } = loadGame({ draw: false });
    const M = g.Menu;
    M.push('options');
    M.push('graphics');
    assert.equal(M.top(), 'graphics');
    assert.equal(M.sel.graphics, 0);
    key(h, 'Escape');
    assert.equal(M.top(), 'options');
    key(h, 'Escape');
    assert.equal(M.top(), 'main');
    key(h, 'Escape');
    assert.equal(M.top(), 'main', 'the title menu has nowhere further back');
  });

  test('ESC at the top of the pause menu resumes the game', () => {
    const { h, g } = loadGame({ draw: false });
    h.startVoyage();
    g.Game.pause();
    key(h, 'Escape');
    assert.equal(g.Game.state, 'play');
  });

  test('the menu ignores input once a fade out has started', () => {
    const { h, g } = loadGame({ draw: false });
    g.Game.fade.dir = 1;
    key(h, 'ArrowDown');
    key(h, 'Enter');
    assert.equal(g.Menu.top(), 'main');
    assert.equal(g.Menu.sel.main, undefined);
  });

  test('New voyage over an existing save asks first, and Yes wipes the save', () => {
    const { h, g } = loadGame({ draw: false, storage: { [SAVE]: aSave } });
    const M = g.Menu;
    M.sel.main = M.items('main').findIndex(i => i.id === 'new');
    key(h, 'Enter');
    assert.equal(M.top(), 'confirmNew');
    key(h, 'Enter');                           // cursor starts on "Yes"
    assert.equal(h.storage.has(SAVE), false);
    assert.equal(g.Game.fade.dir, 1);
  });

  test('Reset all settings, confirmed, restores defaults with a notice', () => {
    const { g } = loadGame({ draw: false });
    g.Settings.set('master', .1);
    g.Menu.push('options');
    g.Menu.push('confirmReset');
    g.Menu.items('confirmReset').find(i => i.id === 'yes').run();
    assert.equal(g.Settings.get('master'), .8);
    assert.equal(g.Menu.top(), 'options');
    assert.match(g.Menu.notice, /reset/);
  });
});

describe('rebinding from the controls screen', () => {
  test('ENTER on a binding waits for the next key, which becomes the new binding', () => {
    const { h, g } = loadGame({ draw: false });
    const M = g.Menu;
    M.push('options'); M.push('controls');
    M.sel.controls = g.REBINDABLE.indexOf('attack');
    key(h, 'Enter');
    assert.equal(M.rebinding, 'attack');
    assert.equal(g.Input.capturing(), true);
    h.keyDown('KeyL'); h.keyUp('KeyL');
    assert.equal(M.rebinding, null);
    assert.equal(g.Settings.data.bindings.attack[0], 'KeyL');
    assert.match(M.notice, /Attack: L/);
  });

  test('while waiting, the menu itself ignores arrows', () => {
    const { h, g } = loadGame({ draw: false });
    g.Menu.push('controls');
    g.Menu.beginRebind('jump');
    g.Menu.sel.controls = 2;
    g.Menu.update(1 / 60);
    assert.equal(g.Menu.sel.controls, 2);
    h.keyDown('Escape');
  });

  test('ESC while waiting leaves the binding alone', () => {
    const { h, g } = loadGame({ draw: false });
    g.Menu.beginRebind('jump');
    h.keyDown('Escape');
    assert.deepEqual(plain(g.Settings.data.bindings.jump), ['Space', 'KeyW']);
    assert.match(g.Menu.notice, /as it was/);
  });

  test('reserved keys are refused with an explanation', () => {
    const { h, g } = loadGame({ draw: false });
    g.Menu.beginRebind('jump');
    h.keyDown('KeyM');
    assert.deepEqual(plain(g.Settings.data.bindings.jump), ['Space', 'KeyW']);
    assert.match(g.Menu.notice, /M is kept/);
  });
});

describe('drawing and the mouse', () => {
  const screens = ['main', 'pause', 'options', 'graphics', 'audio', 'controls', 'gameplay', 'credits', 'confirmNew', 'confirmReset', 'confirmQuit'];

  test('every screen draws with balanced state and registers a hit row per selectable item', () => {
    const { h, g } = loadGame({ draw: false });
    const bctx = h.eval('bctx'), rec = h.hires();
    for (const id of screens) {
      g.Menu.stack = [id];
      g.Menu.context = id === 'pause' ? 'pause' : 'main';
      rec.reset();
      g.Menu.draw(bctx);
      assert.equal(rec.depth(), 0, id);
      const selectable = g.Menu.items(id).filter(i => g.Menu.selectable(i)).length;
      assert.equal(g.Menu.hits.length, selectable, id);
    }
  });

  test('panels always fit on screen, even the longest one', () => {
    const { h, g } = loadGame({ draw: false });
    for (const id of screens.slice(1)) {
      g.Menu.stack = [id];
      g.Menu.draw(h.eval('bctx'));
      for (const hit of g.Menu.hits) assert.ok(hit.y >= 0 && hit.y + hit.h <= g.VIEW_H, id + ' row at ' + hit.y);
    }
  });

  test('hovering a row selects it and clicking activates it', () => {
    const { h, g } = loadGame({ draw: false });
    const M = g.Menu;
    M.draw(h.eval('bctx'));
    const opts = M.hits[M.items('main').findIndex(i => i.id === 'options')];
    h.mouseMove(opts.x + 10, opts.y + 10);
    M.update(1 / 60); g.Input.endFrame();
    assert.equal(M.items('main')[M.sel.main].id, 'options');
    h.click(opts.x + 10, opts.y + 10);
    M.update(1 / 60); g.Input.endFrame();
    assert.equal(M.top(), 'options');
  });

  test('clicking the left or right half of a value steps it down or up', () => {
    const { h, g } = loadGame({ draw: false });
    const M = g.Menu;
    M.push('audio');
    M.draw(h.eval('bctx'));
    const row = M.hits[0];
    assert.equal(M.hitAt(row.valueX + 2, row.y + 5).side, -1);
    assert.equal(M.hitAt(row.x + row.w - 2, row.y + 5).side, 1);
    assert.equal(M.hitAt(row.x + 2, row.y + 5).side, 0);
    assert.equal(M.hitAt(-50, -50), null);
  });
});
