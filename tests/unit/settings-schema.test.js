'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');

const h = loadGame({ draw: false });
const g = h.g;
const SPEC = g.SETTINGS_SPEC;
const fromHost = v => h.eval('(' + JSON.stringify(v) + ')');

describe('sanitizeValue', () => {
  test('booleans must really be booleans', () => {
    assert.equal(g.sanitizeValue(SPEC.showFps, true), true);
    assert.equal(g.sanitizeValue(SPEC.showFps, 'true'), false);
    assert.equal(g.sanitizeValue(SPEC.showFps, 1), false);
    assert.equal(g.sanitizeValue(SPEC.muteUnfocused, null), true, 'falls back to the default');
  });

  test('enums accept listed values only', () => {
    assert.equal(g.sanitizeValue(SPEC.quality, 'low'), 'low');
    assert.equal(g.sanitizeValue(SPEC.quality, 'ultra'), 'auto');
    assert.equal(g.sanitizeValue(SPEC.shake, .5), .5);
    assert.equal(g.sanitizeValue(SPEC.shake, '0.5'), 1, 'numeric enums are not strings');
  });

  test('numbers snap to their step and clamp to their range', () => {
    assert.equal(g.sanitizeValue(SPEC.master, .43), .4);
    assert.equal(g.sanitizeValue(SPEC.master, .46), .5);
    assert.equal(g.sanitizeValue(SPEC.master, 7), 1);
    assert.equal(g.sanitizeValue(SPEC.master, -1), 0);
    assert.equal(g.sanitizeValue(SPEC.brightness, 1.12), 1.1);
    assert.equal(g.sanitizeValue(SPEC.brightness, .2), .7);
  });

  test('numbers come out free of float noise', () => {
    for (let v = 0; v <= 1; v += .1) {
      const s = g.sanitizeValue(SPEC.music, v);
      assert.equal(s, Math.round(s * 100) / 100);
    }
  });

  test('non-finite numbers fall back to the default', () => {
    assert.equal(g.sanitizeValue(SPEC.sfx, NaN), .8);
    assert.equal(g.sanitizeValue(SPEC.sfx, Infinity), .8);
    assert.equal(g.sanitizeValue(SPEC.sfx, '0.3'), .8);
  });

  test('every default already passes its own spec', () => {
    for (const k of Object.keys(SPEC)) assert.equal(g.sanitizeValue(SPEC[k], SPEC[k].def), SPEC[k].def, k);
  });
});

describe('sanitizeBinding', () => {
  const fb = fromHost(['KeyA', 'ArrowLeft']);

  test('keeps a valid list of one or two keys', () => {
    assert.deepEqual(plain(g.sanitizeBinding(fromHost(['KeyZ']), fb)), ['KeyZ']);
    assert.deepEqual(plain(g.sanitizeBinding(fromHost(['KeyZ', 'Digit1']), fb)), ['KeyZ', 'Digit1']);
  });

  test('anything that is not an array becomes the fallback', () => {
    assert.deepEqual(plain(g.sanitizeBinding('KeyZ', fb)), ['KeyA', 'ArrowLeft']);
    assert.deepEqual(plain(g.sanitizeBinding(null, fb)), ['KeyA', 'ArrowLeft']);
  });

  test('drops malformed, reserved and duplicate codes, and stops at two', () => {
    const out = plain(g.sanitizeBinding(fromHost(['Key Z', 5, 'Escape', 'KeyQ', 'KeyQ', '<script>', 'KeyR', 'KeyT']), fb));
    assert.deepEqual(out, ['KeyQ', 'KeyR']);
  });

  test('a list with nothing usable left becomes the fallback', () => {
    assert.deepEqual(plain(g.sanitizeBinding(fromHost(['Enter', 'F11', '']), fb)), ['KeyA', 'ArrowLeft']);
  });

  test('the fallback is copied, never shared', () => {
    const out = g.sanitizeBinding(null, fb);
    out.push('X');
    assert.equal(fb.length, 2);
  });
});

describe('defaultSettings and sanitizeSettings', () => {
  test('defaults cover every spec key plus a binding for every rebindable action', () => {
    const d = plain(g.defaultSettings());
    for (const k of Object.keys(SPEC)) assert.equal(d[k], SPEC[k].def, k);
    assert.deepEqual(Object.keys(d.bindings).sort(), plain(g.REBINDABLE).sort());
  });

  test('default bindings are fresh copies each time', () => {
    const a = g.defaultSettings();
    a.bindings.left.push('KeyZ');
    assert.deepEqual(plain(g.defaultSettings().bindings.left), ['KeyA', 'ArrowLeft']);
    assert.deepEqual(plain(g.DEFAULT_BINDINGS.left), ['KeyA', 'ArrowLeft']);
  });

  test('garbage in gives defaults out', () => {
    for (const raw of [null, undefined, 42, 'settings', []]) {
      assert.deepEqual(plain(g.sanitizeSettings(raw)), plain(g.defaultSettings()));
    }
  });

  test('a partial file keeps what it has and defaults the rest', () => {
    const s = plain(g.sanitizeSettings(fromHost({ master: .3, quality: 'low' })));
    assert.equal(s.master, .3);
    assert.equal(s.quality, 'low');
    assert.equal(s.music, .7);
    assert.deepEqual(s.bindings.jump, ['Space', 'KeyW']);
  });

  test('unknown keys are dropped and bad values replaced', () => {
    const s = plain(g.sanitizeSettings(fromHost({ hacked: true, scaling: 'blurry', bindings: { attack: ['KeyL'], fly: ['KeyG'], use: 'nope' } })));
    assert.equal('hacked' in s, false);
    assert.equal(s.scaling, 'sharp');
    assert.deepEqual(s.bindings.attack, ['KeyL']);
    assert.deepEqual(s.bindings.use, ['KeyQ']);
    assert.equal('fly' in s.bindings, false);
  });

  test('menus and shortcuts own their keys: none of them are rebindable defaults', () => {
    for (const a of g.REBINDABLE) {
      for (const k of g.DEFAULT_BINDINGS[a]) assert.ok(!g.RESERVED_KEYS.includes(k), a + ' uses reserved ' + k);
    }
  });

  test('every rebindable action has a label for the controls screen', () => {
    for (const a of g.REBINDABLE) assert.ok(typeof g.ACTION_LABELS[a] === 'string' && g.ACTION_LABELS[a].length);
  });
});

describe('keyLabel', () => {
  test('names letters, digits and numpad keys briefly', () => {
    assert.equal(g.keyLabel('KeyJ'), 'J');
    assert.equal(g.keyLabel('Digit7'), '7');
    assert.equal(g.keyLabel('Numpad4'), 'NUM 4');
  });

  test('names the special keys the menus show', () => {
    assert.equal(g.keyLabel('Space'), 'SPACE');
    assert.equal(g.keyLabel('ShiftLeft'), 'L-SHIFT');
    assert.equal(g.keyLabel('Escape'), 'ESC');
    assert.equal(g.keyLabel('ArrowLeft'), '←');
    assert.equal(g.keyLabel('Backslash'), '\\');
  });

  test('uppercases anything else and dashes out nothing', () => {
    assert.equal(g.keyLabel('F5'), 'F5');
    assert.equal(g.keyLabel('PageDown'), 'PAGEDOWN');
    assert.equal(g.keyLabel(''), '—');
    assert.equal(g.keyLabel(undefined), '—');
  });

  test('every label is printable in the bitmap font', () => {
    const codes = ['Space', 'Enter', 'Escape', 'Backspace', 'Tab', 'ShiftLeft', 'ControlRight', 'AltLeft', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'CapsLock', 'Comma', 'Period', 'Slash', 'Semicolon', 'Quote', 'BracketLeft', 'Minus', 'Equal', 'Backquote', 'Backslash', 'BracketRight', 'KeyA', 'Digit0', 'Numpad9'];
    for (const c of codes) {
      for (const ch of g.keyLabel(c)) assert.ok(g.GLYPHS[ch] !== undefined || g.GLYPHS[ch.toUpperCase()] !== undefined, c + ' -> ' + JSON.stringify(ch));
    }
  });
});
