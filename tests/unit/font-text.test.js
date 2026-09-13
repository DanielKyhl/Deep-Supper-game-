'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, fakeCanvas } = require('../helpers/harness');

const h = loadGame({ draw: false });
const { Font, Text, GLYPHS, FONT_H, PIX } = { Font: h.g.Font, Text: h.g.Text, GLYPHS: h.g.GLYPHS, FONT_H: h.g.FONT_H, PIX: h.g.PIX };

function recorder() {
  const c = fakeCanvas(10, 10).getContext('2d');
  const rec = c.__fake;
  rec.startLog();
  return { c, rec };
}
const rects = log => log.filter(e => e.fn === 'rect').map(e => e.args);

describe('Font glyphs', () => {
  test('every glyph is seven rows of one consistent width, written in 0s and 1s', () => {
    for (const ch of Object.keys(GLYPHS)) {
      const rows = GLYPHS[ch].split('/');
      assert.equal(rows.length, FONT_H, JSON.stringify(ch));
      assert.ok(rows.every(r => r.length === rows[0].length && /^[01]+$/.test(r)), JSON.stringify(ch));
    }
  });

  test('the whole printable ASCII alphabet and digits are present', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?:;\'"-+/()[]') {
      assert.ok(GLYPHS[ch] !== undefined, 'missing ' + JSON.stringify(ch));
    }
  });

  test('advance widths come from the bitmap, so the font sets proportionally', () => {
    assert.equal(Font.glyph('M').w, 5);
    assert.equal(Font.glyph('I').w, 3);
    assert.equal(Font.glyph('!').w, 1);
  });

  test('glyph bits read left to right as the most significant bit first', () => {
    const t = Font.glyph('T');
    assert.equal(t.bits[0], 0b11111);
    assert.equal(t.bits[1], 0b00100);
  });

  test("Q has a closed bowl and a tail outside it, so it can't read as W", () => {
    const q = Font.glyph('Q'), w = Font.glyph('W');
    assert.equal(q.bits[5], 0b01110, 'bowl closes on row 6');
    assert.equal(q.bits[6], 0b00011, 'tail hangs below to the right');
    assert.notDeepEqual([...q.bits], [...w.bits]);
    assert.equal(q.bits[6] & 0b10000, 0, 'nothing in the bottom-left corner');
  });

  test('characters the font lacks fall back to the question mark', () => {
    assert.equal(Font.glyph('¤'), Font.glyph('¤'));
    assert.deepEqual([...Font.glyph('¤').bits], [...Font.glyph('?').bits]);
  });

  test('glyphs are cached', () => {
    assert.equal(Font.glyph('A'), Font.glyph('A'));
  });
});

describe('Font measuring and drawing', () => {
  test('width sums advances with a one-pixel gap and no trailing gap', () => {
    assert.equal(Font.width('I', 2), 6);
    assert.equal(Font.width('AI', 2), 18);
    assert.equal(Font.width('A A', 2), 6 * 2 + 3 * 2 + 6 * 2 - 2);
    assert.equal(Font.width('AI', 4), 36);
  });

  test('height is seven font pixels', () => {
    assert.equal(Font.height(2), 14);
    assert.equal(Font.height(6), 42);
  });

  test('path merges each row of lit pixels into single rectangles', () => {
    const { c, rec } = recorder();
    Font.path(c, 'I', 0, 0, 2);
    const r = rects(rec.stopLog());
    assert.equal(r.length, 7, 'one run per row of I');
    assert.deepEqual([...r[0]], [0, 0, 6, 2]);
    assert.deepEqual([...r[1]], [2, 2, 2, 2]);
  });

  test('path advances past spaces without drawing them', () => {
    const { c, rec } = recorder();
    const end = Font.path(c, ' ', 10, 0, 2);
    assert.equal(rects(rec.stopLog()).length, 0);
    assert.equal(end, 10 + 6 - 2);
  });

  test('draw fills the whole string in one fill with the given colour', () => {
    const { c, rec } = recorder();
    Font.draw(c, 'HELLO', 0, 0, 2, '#abcdef');
    const log = rec.stopLog();
    assert.equal(log.filter(e => e.fn === 'fill').length, 1);
    assert.equal(log.filter(e => e.fn === 'beginPath').length, 1);
    assert.equal(log.find(e => e.fn === 'fill').fillStyle, '#abcdef');
  });
});

describe('Text', () => {
  test('scaleFor maps font sizes onto whole font-pixel multiples of PIX', () => {
    const cases = [[undefined, 1], [12, 1], [24, 1], [25, 2], [40, 2], [41, 3], [56, 3], [57, 4], [70, 4], [71, 5], [120, 5]];
    for (const [size, units] of cases) assert.equal(Text.scaleFor(size), units * PIX, 'size ' + size);
  });

  test('width agrees with the font at the scaled size', () => {
    assert.equal(Text.width(null, 'Deep Supper', { size: 18 }), Font.width('Deep Supper', 2));
    assert.equal(Text.width(null, 'Deep Supper', { size: 78 }), Font.width('Deep Supper', 10));
    assert.equal(Text.width(null, 42, { size: 18 }), Font.width('42', 2));
  });

  test('wrap breaks between words and keeps every line inside the width', () => {
    const str = 'Far too many teeth for a thing that size. They keep going back.';
    const lines = Text.wrap(null, str, 120, { size: 18 });
    assert.ok(lines.length > 1);
    assert.equal(lines.join(' '), str);
    for (const l of lines) {
      assert.ok(Text.width(null, l, { size: 18 }) <= 120 || !l.includes(' '), 'too wide: ' + l);
    }
  });

  test('wrap leaves a single overlong word on its own line', () => {
    assert.deepEqual([...Text.wrap(null, 'a Supercalifragilistic b', 30, { size: 18 })], ['a', 'Supercalifragilistic', 'b']);
  });

  test('draw treats y as the baseline and snaps the glyph box to the pixel grid', () => {
    const { c, rec } = recorder();
    Text.draw(c, 'I', 101, 51, { size: 18 });
    const r = rects(rec.stopLog());
    const minX = Math.min(...r.map(a => a[0])), minY = Math.min(...r.map(a => a[1]));
    assert.equal(minX, 102);
    assert.equal(minY, h.g.snap(51 - 14));
    for (const a of r) { assert.equal(a[0] % 2, 0); assert.equal(a[1] % 2, 0); }
  });

  test('center and right alignment measure from the string width', () => {
    const w = Text.width(null, 'ABC', { size: 18 });
    for (const [align, expect] of [['center', h.g.snap(200 - w / 2)], ['right', h.g.snap(200 - w)]]) {
      const { c, rec } = recorder();
      Text.draw(c, 'ABC', 200, 100, { size: 18, align });
      assert.equal(Math.min(...rects(rec.stopLog()).map(a => a[0])), expect, align);
    }
  });

  test("'top' and 'middle' baselines move the box", () => {
    const top = recorder();
    Text.draw(top.c, 'I', 0, 40, { size: 18, baseline: 'top' });
    assert.equal(Math.min(...rects(top.rec.stopLog()).map(a => a[1])), 40);
    const mid = recorder();
    Text.draw(mid.c, 'I', 0, 40, { size: 18, baseline: 'middle' });
    assert.equal(Math.min(...rects(mid.rec.stopLog()).map(a => a[1])), 34);
  });

  test('small text gets a one-pixel shadow below, made opaque', () => {
    const { c, rec } = recorder();
    Text.draw(c, 'I', 0, 20, { size: 16, outline: 'rgba(0,0,0,.6)' });
    const log = rec.stopLog();
    const fills = log.filter(e => e.fn === 'fill');
    assert.equal(fills.length, 2, 'shadow then text');
    assert.equal(fills[0].fillStyle, 'rgb(0,0,0)');
    assert.equal(rects(log).length, 14, 'one offset copy + the text');
  });

  test('large text gets a four-way outline', () => {
    const { c, rec } = recorder();
    Text.draw(c, 'I', 0, 60, { size: 40, outline: '#000' });
    assert.equal(rects(rec.stopLog()).length, 7 * 5);
  });

  test('draw always leaves the context state balanced', () => {
    const { c, rec } = recorder();
    Text.draw(c, 'Hello', 0, 20, { size: 20, alpha: .5, outline: '#000', shadow: '#111' });
    assert.equal(rec.depth(), 0);
    assert.ok(rec.stopLog().some(e => e.set === 'globalAlpha' && e.value === .5));
  });
});
