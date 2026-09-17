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
  test('the title menu without a save offers a new voyage, options, test shortcuts, credits and achievements', () => {
    const { g } = loadGame({ draw: false });
    assert.deepEqual(labels(g.Menu, 'main'), ['New voyage', 'Options', 'Test shortcuts', 'Credits', 'Achievements']);
  });

  test('the test shortcuts screen warns what it does and ends with Back', () => {
    const { g } = loadGame({ draw: false });
    const items = g.Menu.items('dev');
    assert.match(items[0].label, /replaces your Continue save/);
    assert.ok(items.some(i => i.id === 'devOldOne'));
    assert.equal(items[items.length - 1].label, 'Back');
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

describe('save slot screens', () => {
  const SLOT = n => 'deepsupper.slot' + n + '.v1';

  test('Load game appears on the title and pause menus only once a slot is used', () => {
    const { g } = loadGame({ draw: false });
    assert.ok(!labels(g.Menu, 'main').includes('Load game'));
    assert.ok(!labels(g.Menu, 'pause').includes('Load game'));
    assert.ok(labels(g.Menu, 'pause').includes('Save game'));
    g.SaveGame.saveSlot(2);
    assert.ok(labels(g.Menu, 'main').includes('Load game'));
    assert.ok(labels(g.Menu, 'pause').includes('Load game'));
  });

  test('both slot screens list three slots and Back, with empty ones marked', () => {
    const { g } = loadGame({ draw: false });
    g.SaveGame.saveSlot(2);
    for (const id of ['saveSlots', 'loadSlots']) {
      const items = g.Menu.items(id);
      assert.deepEqual(plain(items.filter(i => i.kind === 'slot').map(i => i.slot)), [1, 2, 3]);
      assert.match(items[0].label, /Slot 1 +— empty —/);
      assert.equal(items[0].empty, true);
      assert.match(items[1].label, /Bamboo Rod · 0§/);
      assert.ok(items[1].value.length > 0, 'shows when it was saved');
      assert.equal(items[items.length - 1].label, 'Back');
    }
  });

  test('saving to an empty slot saves straight away and says so', () => {
    const { h, g } = loadGame({ draw: false });
    g.Player.coins = 9;
    g.Menu.openPause();
    g.Menu.push('saveSlots');
    g.Menu.items('saveSlots')[0].run();
    assert.equal(JSON.parse(h.storage.get(SLOT(1))).coins, 9);
    assert.match(g.Menu.notice, /Saved to slot 1/);
    assert.equal(g.Menu.top(), 'saveSlots');
  });

  test('saving over a used slot asks first, and Overwrite replaces it', () => {
    const { h, g } = loadGame({ draw: false });
    g.Player.coins = 1; g.SaveGame.saveSlot(3);
    g.Player.coins = 2;
    g.Menu.openPause(); g.Menu.push('saveSlots');
    g.Menu.items('saveSlots')[2].run();
    assert.equal(g.Menu.top(), 'confirmOverwrite');
    assert.match(g.Menu.items('confirmOverwrite')[0].label, /Slot 3/);
    assert.equal(JSON.parse(h.storage.get(SLOT(3))).coins, 1, 'nothing written yet');
    g.Menu.items('confirmOverwrite').find(i => i.id === 'yes').run();
    assert.equal(JSON.parse(h.storage.get(SLOT(3))).coins, 2);
    assert.equal(g.Menu.top(), 'saveSlots');
  });

  test('Cancel on the overwrite question keeps the old save', () => {
    const { h, g } = loadGame({ draw: false });
    g.Player.coins = 1; g.SaveGame.saveSlot(1);
    g.Player.coins = 2;
    g.Menu.openPause(); g.Menu.push('saveSlots');
    g.Menu.items('saveSlots')[0].run();
    g.Menu.items('confirmOverwrite').find(i => i.id === 'no').run();
    assert.equal(JSON.parse(h.storage.get(SLOT(1))).coins, 1);
  });

  test('an empty slot cannot be loaded', () => {
    const { g } = loadGame({ draw: false });
    g.Menu.push('loadSlots');
    g.Menu.items('loadSlots')[1].run();
    assert.match(g.Menu.notice, /Slot 2 is empty/);
    assert.equal(g.Game.fade.dir, 0);
  });

  test('from the title, loading a slot starts right away', () => {
    const { g } = loadGame({ draw: false });
    g.SaveGame.saveSlot(1);
    g.Menu.push('loadSlots');
    g.Menu.items('loadSlots')[0].run();
    assert.equal(g.Game.fade.dir, 1);
  });

  test('mid-voyage, loading a slot asks first', () => {
    const { h, g } = loadGame({ draw: false });
    g.SaveGame.saveSlot(1);
    h.startVoyage();
    g.Game.pause();
    g.Menu.push('loadSlots');
    g.Menu.items('loadSlots')[0].run();
    assert.equal(g.Menu.top(), 'confirmLoad');
    assert.equal(g.Game.fade.dir, 0);
    g.Menu.items('confirmLoad').find(i => i.id === 'yes').run();
    assert.equal(g.Game.fade.dir, 1);
  });

  test('a full title menu still fits above the key hints', () => {
    const { h, g } = loadGame({ draw: false, storage: { 'deepsupper.save.v1': aSave }, native: { isApp: true, setFullscreen() {}, quit() {} } });
    g.SaveGame.saveSlot(1);
    g.Menu.draw(h.eval('bctx'));
    assert.ok(g.Menu.items('main').length >= 6);
    for (const hit of g.Menu.hits) assert.ok(hit.y >= 190 && hit.y + hit.h <= g.VIEW_H - 32, 'row at ' + hit.y);
    for (let i = 1; i < g.Menu.hits.length; i++) assert.ok(g.Menu.hits[i].y >= g.Menu.hits[i - 1].y + g.Menu.hits[i - 1].h, 'rows overlap');
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

describe('the fullscreen shortcut on the controls screen', () => {
  const shortcutLine = g => g.Menu.items('controls').find(i => i.kind === 'text' && /Fullscreen/.test(i.label)).label;

  test('on Windows it says F11', () => {
    const { h, g } = loadGame({ draw: false });
    h.sandbox.navigator.platform = 'Win32';
    assert.match(shortcutLine(g), /Fullscreen: F11$/);
  });

  test("on a Mac, where F11 belongs to the system, it says the window's own Ctrl+Cmd+F", () => {
    const { h, g } = loadGame({ draw: false });
    h.sandbox.navigator.platform = 'MacIntel';
    assert.ok(shortcutLine(g).endsWith('Fullscreen: CTRL+CMD+F'), shortcutLine(g));
    h.sandbox.navigator.platform = '';
    h.sandbox.navigator.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Electron';
    assert.ok(shortcutLine(g).includes('CTRL+CMD+F'), 'from the user agent when there is no platform');
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
  const screens = ['main', 'pause', 'options', 'graphics', 'audio', 'controls', 'gameplay', 'credits', 'confirmNew', 'confirmReset', 'confirmQuit', 'saveSlots', 'loadSlots', 'confirmOverwrite', 'confirmLoad', 'dev'];

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

});

describe('the mouse on the option screens', () => {
  // a screen drawn and ready for the mouse; clicks are a press, a frame, and the button let go
  function screen(id) {
    const { h, g } = loadGame({ draw: false });
    const M = g.Menu;
    M.push(id);
    const bctx = h.eval('bctx');
    const redraw = () => M.draw(bctx);
    const frame = () => { M.update(1 / 60); g.Input.endFrame(); redraw(); };
    redraw();
    const row = key => M.hits.find(x => { const it = M.items(id)[x.index]; return it.key === key || it.id === key; });
    const click = (x, y) => { h.click(x, y); frame(); h.emit('mouseup', { button: 0 }); frame(); };
    return { h, g, M, S: g.Settings, row, click, frame };
  }
  const mid = r => r.y + r.h / 2;

  test("clicking a slider's name selects it and leaves the value alone", () => {
    const { M, S, row, click } = screen('audio');
    const r = row('sfx');
    click(r.x + 20, mid(r));
    assert.equal(M.items('audio')[M.sel.audio].key, 'sfx');
    assert.equal(S.data.sfx, .8);
  });

  test('clicking along a slider sets it to that point: a segment, the far end, or just before the start for nothing', () => {
    const { S, row, click } = screen('audio');
    const bar = row('master').bar;
    click(bar.x0 + bar.seg * 2 + 2, mid(row('master')));
    assert.equal(S.data.master, .3, 'the third segment');
    click(bar.x1, mid(row('master')));
    assert.equal(S.data.master, 1);
    click(bar.x0 - 8, mid(row('master')));
    assert.equal(S.data.master, 0);
  });

  test('holding the button drags a slider along, over other rows too, and letting go stops it', () => {
    const { h, g, M, S, row, frame } = screen('audio');
    const r = row('music'), bar = r.bar;
    h.click(bar.x0 + 2, mid(r)); frame();
    assert.equal(S.data.music, .1);
    h.mouseMove(bar.x0 + bar.seg * 6 + 2, mid(row('master'))); frame();
    assert.equal(S.data.music, .7, 'dragged, though the pointer strayed onto another row');
    assert.equal(M.items('audio')[M.sel.audio].key, 'music', 'and the selection stayed put');
    assert.equal(S.data.master, .8);
    h.mouseMove(bar.x1 + 40, mid(r)); frame();
    assert.equal(S.data.music, 1, 'past the end is the end');
    h.emit('mouseup', { button: 0 }); frame();
    h.mouseMove(bar.x0, mid(r)); frame();
    assert.equal(S.data.music, 1, 'let go, it stays');
  });

  test('brightness keeps its own range under the mouse', () => {
    const { S, row, click } = screen('graphics');
    const r = row('brightness');
    click(r.bar.x1, mid(r));
    assert.equal(S.data.brightness, 1.3);
    click(r.bar.x0 - 8, mid(r));
    assert.equal(S.data.brightness, .7);
  });

  test("a choice's left arrow steps it back, its right arrow forward, and anywhere else on the row cycles on", () => {
    const { S, row, click } = screen('graphics');
    S.set('flashes', 'soft');
    let r = row('flashes');
    click(r.arrows.x0 + 2, mid(r));
    assert.equal(S.data.flashes, 'full', 'the ‹');
    r = row('flashes');
    click(r.arrows.x1 - 2, mid(r));
    assert.equal(S.data.flashes, 'soft', 'the ›');
    r = row('flashes');
    click(r.arrows.x1 - 2, mid(r));
    assert.equal(S.data.flashes, 'off');
    r = row('flashes');
    click(r.x + 20, mid(r));
    assert.equal(S.data.flashes, 'full', 'the name cycles round');
  });

  test('a toggle flips from a click anywhere on its row, and nothing is hit off the rows', () => {
    const { M, S, row, click } = screen('audio');
    const r = row('muted');
    click(r.x + 20, mid(r));
    assert.equal(S.data.muted, true);
    click(r.x + r.w - 10, mid(r));
    assert.equal(S.data.muted, false);
    assert.equal(M.hitAt(-50, -50), null);
  });
});
