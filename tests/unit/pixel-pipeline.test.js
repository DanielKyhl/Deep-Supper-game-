'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, near } = require('../helpers/harness');

describe('computeCanvasSize', () => {
  const h = loadGame({ draw: false });
  const size = (w, hh, dpr, mode) => h.g.computeCanvasSize(w, hh, dpr, mode || 'sharp');

  test('an exact 2x window gets a 2x canvas', () => {
    const s = size(960, 540, 1);
    assert.equal(s.scale, 2);
    assert.equal(s.w, 960);
    assert.equal(s.h, 540);
  });

  test('a slightly bigger window keeps the whole-number scale', () => {
    const s = size(1280, 720, 1);
    assert.equal(s.scale, 2);
    assert.equal(s.w, 960);
    assert.equal(s.cssW, 960);
  });

  test('falls back to a fractional scale when whole numbers would waste too much window', () => {
    const s = size(900, 506, 1);
    assert.ok(!Number.isInteger(s.scale), 'scale ' + s.scale);
    assert.ok(Math.abs(s.w - 900) <= 1);
  });

  test("'fill' always uses the largest scale that fits", () => {
    const s = size(1280, 720, 1, 'fill');
    near(s.scale, 1280 / 480, 1e-9);
    assert.equal(s.w, 1280);
    assert.equal(s.h, 720);
  });

  test('works in device pixels on high-DPI screens', () => {
    const s = size(960, 540, 2);
    assert.equal(s.scale, 4);
    assert.equal(s.w, 1920);
    assert.equal(s.cssW, 960);
    const t = size(1280, 720, 1.5);
    assert.equal(t.w, 1920);
    assert.equal(t.cssW, 1280);
  });

  test('never collapses on a tiny window', () => {
    const s = size(40, 20, 1);
    assert.ok(s.w >= 160 && s.h >= 90);
  });

  test('keeps the 16:9 shape at every size', () => {
    for (const [w, hh] of [[800, 600], [1920, 1080], [2560, 1440], [1000, 1000], [640, 360]]) {
      for (const mode of ['sharp', 'fill']) {
        const s = size(w, hh, 1, mode);
        near(s.w / s.h, 16 / 9, .01, w + 'x' + hh + ' ' + mode);
        assert.ok(s.cssW <= Math.max(160, w) + .5 && s.cssH <= Math.max(90, hh) + .5);
      }
    }
  });
});

describe('fitCanvas', () => {
  test('sizes the visible canvas from the window and writes CSS size', () => {
    const h = loadGame({ draw: false, width: 1920, height: 1080 });
    const c = h.eval('canvas');
    assert.equal(c.width, 1920);
    assert.equal(c.height, 1080);
    assert.equal(c.style.width, '1920px');
    h.sandbox.innerWidth = 1000; h.sandbox.innerHeight = 600;
    h.g.fitCanvas();
    assert.equal(c.width, 960);
    assert.equal(c.style.height, '540px');
  });

  test('follows the window when it is resized', () => {
    const h = loadGame({ draw: false, width: 960, height: 540 });
    h.sandbox.innerWidth = 1440; h.sandbox.innerHeight = 810;
    h.emit('resize', {});
    assert.equal(h.eval('canvas.width'), 1440);
  });
});

describe('supersampling and quality', () => {
  test('setSupersample resizes the hires canvas and keeps smoothing off', () => {
    const h = loadGame({ draw: false });
    h.g.setSupersample(1);
    assert.equal(h.eval('hires.width'), 960);
    assert.equal(h.eval('bctx.imageSmoothingEnabled'), false);
    h.g.setSupersample(2);
    assert.equal(h.eval('hires.width'), 1920);
    assert.equal(h.eval('hires.height'), 1080);
  });

  test("setQuality pins 'low' to 1x and 'high' to 2x", () => {
    const h = loadGame({ draw: false });
    h.g.setQuality('low');
    assert.equal(h.eval('SS'), 1);
    assert.equal(h.g.Prefs.quality, 'low');
    h.g.setQuality('high');
    assert.equal(h.eval('SS'), 2);
  });

  test('resetTransform goes back to game space at the supersample scale', () => {
    const h = loadGame({ draw: false });
    const rec = h.hires();
    rec.startLog();
    h.g.resetTransform(h.eval('bctx'));
    const call = rec.stopLog().find(c => c.fn === 'setTransform');
    assert.deepEqual([...call.args], [2, 0, 0, 2, 0, 0]);
  });

  test('present blits hires into the buffer and the buffer onto the screen', () => {
    const h = loadGame({ draw: false });
    const before = h.ctx.calls.drawImage || 0;
    h.g.present();
    assert.equal((h.ctx.calls.drawImage || 0) - before, 1);
    assert.equal(h.eval('ctx.imageSmoothingEnabled'), false);
  });
});

describe('watchFrames', () => {
  const feed = (h, n, dt) => { for (let i = 0; i < n; i++) h.g.watchFrames(dt); };

  test('drops to 1x once more than a third of frames run long', () => {
    const h = loadGame({ draw: false });
    feed(h, 60, .016); feed(h, 30, .03);        // exactly 30 slow: not yet
    assert.equal(h.eval('SS'), 2);
    feed(h, 59, .016); feed(h, 31, .03);        // 31 slow of 90
    assert.equal(h.eval('SS'), 1);
  });

  test('ignores hitches from switching tabs', () => {
    const h = loadGame({ draw: false });
    feed(h, 200, .5);
    assert.equal(h.eval('SS'), 2);
    assert.equal(h.eval('_frameLog.length'), 0);
  });

  test('does nothing while the page is hidden', () => {
    const h = loadGame({ draw: false });
    h.sandbox.document.visibilityState = 'hidden';
    feed(h, 90, .05);
    assert.equal(h.eval('SS'), 2);
  });

  test("never steps down when quality is pinned to 'high'", () => {
    const h = loadGame({ draw: false });
    h.g.setQuality('high');
    feed(h, 180, .05);
    assert.equal(h.eval('SS'), 2);
  });
});
