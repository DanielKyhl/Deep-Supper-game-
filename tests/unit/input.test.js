'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');

function setup() {
  const h = loadGame({ draw: false });
  return { h, Input: h.g.Input };
}

describe('Input: keyboard', () => {
  test('held is true only while the key is down', () => {
    const { h, Input } = setup();
    h.keyDown('KeyA');
    assert.equal(Input.held('left'), true);
    h.keyUp('KeyA');
    assert.equal(Input.held('left'), false);
  });

  test('tap lasts exactly until the end of the frame', () => {
    const { h, Input } = setup();
    h.press('KeyJ');
    assert.equal(Input.tap('attack'), true);
    assert.equal(Input.anyTap(), true);
    Input.endFrame();
    assert.equal(Input.tap('attack'), false);
    assert.equal(Input.anyTap(), false);
  });

  test('every default key of an action works', () => {
    const { h, Input } = setup();
    for (const [code, action] of [['ArrowLeft', 'left'], ['KeyD', 'right'], ['KeyW', 'jump'], ['KeyX', 'attack'], ['ShiftLeft', 'roll'], ['KeyF', 'interact']]) {
      h.keyDown(code);
      assert.equal(Input.held(action), true, code + ' -> ' + action);
      h.keyUp(code);
    }
  });

  test('auto-repeat keydowns do not count as fresh taps', () => {
    const { h, Input } = setup();
    h.emit('keydown', { code: 'KeyE', repeat: true, preventDefault() {} });
    assert.equal(Input.tap('interact'), false);
    assert.equal(Input.held('interact'), false);
  });

  test('losing window focus releases every held key', () => {
    const { h, Input } = setup();
    h.keyDown('KeyA'); h.keyDown('Space');
    h.emit('blur', {});
    assert.equal(Input.held('left'), false);
    assert.equal(Input.held('jump'), false);
  });

  test('keys the browser would act on have their default prevented', () => {
    const { h } = setup();
    const hit = code => { let p = false; h.emit('keydown', { code, repeat: false, preventDefault() { p = true; } }); return p; };
    assert.equal(hit('Space'), true);
    assert.equal(hit('ArrowDown'), true);
    assert.equal(hit('F11'), true);
    assert.equal(hit('KeyJ'), false);
  });

  test('an unknown action is never held or tapped', () => {
    const { h, Input } = setup();
    h.press('KeyA');
    assert.equal(Input.held('teleport'), false);
    assert.equal(Input.tap('teleport'), false);
  });
});

describe('Input: key capture for rebinding', () => {
  test('the next key goes to the capture callback and nowhere else', () => {
    const { h, Input } = setup();
    let got = null;
    Input.captureNext(code => { got = code; });
    assert.equal(Input.capturing(), true);
    h.keyDown('KeyP');
    assert.equal(got, 'KeyP');
    assert.equal(Input.capturing(), false);
    assert.equal(Input.anyTap(), false);
    // the key after that is ordinary input again
    h.press('KeyJ');
    assert.equal(Input.tap('attack'), true);
  });

  test('cancelCapture drops a pending capture', () => {
    const { h, Input } = setup();
    let got = null;
    Input.captureNext(code => { got = code; });
    Input.cancelCapture();
    h.press('KeyJ');
    assert.equal(got, null);
    assert.equal(Input.tap('attack'), true);
  });
});

describe('Input: bindings', () => {
  test('setBindings replaces an action and ignores empty or broken lists', () => {
    const { h, Input } = setup();
    Input.setBindings(h.eval('({ attack: ["KeyL"], jump: [], roll: "KeyR" })'));
    h.press('KeyL');
    assert.equal(Input.tap('attack'), true);
    Input.endFrame();
    h.press('KeyJ');
    assert.equal(Input.tap('attack'), false, 'old key no longer attacks');
    h.press('Space');
    assert.equal(Input.tap('jump'), true, 'empty list leaves jump alone');
    h.press('KeyK');
    assert.equal(Input.tap('roll'), true, 'non-array leaves roll alone');
  });

  test('rebinding a gameplay action never touches the fixed menu keys', () => {
    const { h, Input } = setup();
    Input.setBindings(h.eval('({ left: ["KeyZ"] })'));
    h.keyDown('ArrowLeft');
    assert.equal(Input.held('menuLeft'), true);
    assert.equal(Input.held('left'), false);
  });

  test('setBindings releases anything held under the old keys', () => {
    const { h, Input } = setup();
    h.keyDown('KeyZ');
    Input.setBindings(h.eval('({ left: ["KeyZ"] })'));
    assert.equal(Input.held('left'), false);
  });
});

describe('Input: mouse', () => {
  test('client coordinates map onto 960x540 game space', () => {
    const { h, Input } = setup();
    h.eval('canvas').getBoundingClientRect = () => ({ left: 100, top: 50, width: 480, height: 270 });
    h.mouseMove(340, 185);
    const m = Input.mouse();
    assert.equal(m.x, 480);
    assert.equal(m.y, 270);
    assert.equal(m.inside, true);
    assert.equal(m.moved, true);
    h.mouseMove(20, 20);
    assert.equal(Input.mouse().inside, false);
  });

  test('only the left button clicks, and clicks clear at the end of the frame', () => {
    const { h, Input } = setup();
    const down = h.eval('canvas').__listeners.mousedown[0];
    down({ clientX: 10, clientY: 10, button: 2 });
    assert.equal(Input.mouse().click, false);
    down({ clientX: 10, clientY: 10, button: 0 });
    assert.equal(Input.mouse().click, true);
    Input.endFrame();
    assert.equal(Input.mouse().click, false);
    assert.equal(Input.mouse().moved, false);
  });
});
