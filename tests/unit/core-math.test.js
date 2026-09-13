'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain, near } = require('../helpers/harness');

const h = loadGame({ draw: false, seed: 7 });
const g = h.g;

describe('math helpers', () => {
  test('clamp keeps values inside an inclusive range', () => {
    assert.equal(g.clamp(-5, 0, 10), 0);
    assert.equal(g.clamp(15, 0, 10), 10);
    assert.equal(g.clamp(4, 0, 10), 4);
    assert.equal(g.clamp(0, 0, 10), 0);
    assert.equal(g.clamp(10, 0, 10), 10);
  });

  test('lerp hits both endpoints, the midpoint, and extrapolates', () => {
    assert.equal(g.lerp(10, 20, 0), 10);
    assert.equal(g.lerp(10, 20, 1), 20);
    assert.equal(g.lerp(10, 20, .5), 15);
    assert.equal(g.lerp(10, 20, 2), 30);
  });

  test('rand stays in range with one or two arguments', () => {
    for (let i = 0; i < 500; i++) {
      const a = g.rand(5);
      assert.ok(a >= 0 && a < 5, 'rand(5) gave ' + a);
      const b = g.rand(-3, 3);
      assert.ok(b >= -3 && b < 3, 'rand(-3,3) gave ' + b);
    }
  });

  test('randInt is inclusive at both ends', () => {
    const seen = new Set();
    for (let i = 0; i < 600; i++) {
      const v = g.randInt(1, 4);
      assert.ok(Number.isInteger(v) && v >= 1 && v <= 4);
      seen.add(v);
    }
    assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
  });

  test('chance(0) never fires and chance(1) always does', () => {
    for (let i = 0; i < 200; i++) {
      assert.equal(g.chance(0), false);
      assert.equal(g.chance(1), true);
    }
  });

  test('choice only returns members of the array', () => {
    const arr = h.eval('["a", "b", "c"]');
    for (let i = 0; i < 100; i++) assert.ok(['a', 'b', 'c'].includes(g.choice(arr)));
  });

  test('sign returns -1, 0 or 1', () => {
    assert.equal(g.sign(-12), -1);
    assert.equal(g.sign(0), 0);
    assert.equal(g.sign(.001), 1);
  });

  test('approach steps toward a target without overshooting it', () => {
    assert.equal(g.approach(0, 10, 3), 3);
    assert.equal(g.approach(9, 10, 3), 10);
    assert.equal(g.approach(10, 0, 4), 6);
    assert.equal(g.approach(1, 0, 4), 0);
    assert.equal(g.approach(5, 5, 1), 5);
  });

  test('ease and easeOut run 0 to 1 and never go backwards', () => {
    assert.equal(g.ease(0), 0);
    assert.equal(g.ease(1), 1);
    near(g.ease(.5), .5);
    assert.equal(g.easeOut(0), 0);
    assert.equal(g.easeOut(1), 1);
    let prevA = -1, prevB = -1;
    for (let t = 0; t <= 1.0001; t += .05) {
      assert.ok(g.ease(t) >= prevA);
      assert.ok(g.easeOut(t) >= prevB);
      prevA = g.ease(t); prevB = g.easeOut(t);
    }
  });

  test('overlaps: shared edges do not count, real overlap and containment do', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    assert.equal(g.overlaps(a, { x: 10, y: 0, w: 5, h: 5 }), false);
    assert.equal(g.overlaps(a, { x: 0, y: 10, w: 5, h: 5 }), false);
    assert.equal(g.overlaps(a, { x: 9, y: 9, w: 5, h: 5 }), true);
    assert.equal(g.overlaps(a, { x: 2, y: 2, w: 2, h: 2 }), true);
    assert.equal(g.overlaps({ x: 2, y: 2, w: 2, h: 2 }, a), true);
  });

  test('snap puts a coordinate on the pixel grid', () => {
    const PIX = g.PIX;
    assert.equal(PIX, 2);
    assert.equal(g.snap(0), 0);
    assert.equal(g.snap(2.9), 2);
    assert.equal(g.snap(3.1), 4);
    assert.equal(g.snap(101), 102);
    for (let v = -50; v < 50; v += .37) assert.equal(Math.abs(g.snap(v)) % PIX, 0);
  });
});

describe('colour helpers', () => {
  test('mix blends channel by channel and rounds', () => {
    assert.deepEqual(plain(g.mix([0, 0, 0], [255, 255, 255], 0)), [0, 0, 0]);
    assert.deepEqual(plain(g.mix([0, 0, 0], [255, 255, 255], 1)), [255, 255, 255]);
    assert.deepEqual(plain(g.mix([0, 100, 200], [100, 200, 0], .5)), [50, 150, 100]);
    assert.deepEqual(plain(g.mix([0, 0, 0], [3, 3, 3], .5)), [2, 2, 2]);
  });

  test('css writes rgb() or rgba() strings', () => {
    assert.equal(g.css([1, 2, 3]), 'rgb(1,2,3)');
    assert.equal(g.css([1, 2, 3], .5), 'rgba(1,2,3,0.5)');
    assert.equal(g.css([1, 2, 3], 0), 'rgba(1,2,3,0)');
  });

  test('shade lightens toward white and darkens toward black', () => {
    assert.deepEqual(plain(g.shade([100, 100, 100], 0)), [100, 100, 100]);
    assert.deepEqual(plain(g.shade([100, 100, 100], 1)), [255, 255, 255]);
    assert.deepEqual(plain(g.shade([100, 100, 100], -1)), [0, 0, 0]);
    const lite = plain(g.shade([100, 50, 0], .5));
    const dark = plain(g.shade([100, 50, 0], -.5));
    assert.ok(lite.every((c, i) => c >= [100, 50, 0][i]));
    assert.ok(dark.every((c, i) => c <= [100, 50, 0][i]));
  });

  test('hexRgb reads six-digit, three-digit and hash-less colours', () => {
    assert.deepEqual(plain(g.hexRgb('#ff8000')), [255, 128, 0]);
    assert.deepEqual(plain(g.hexRgb('#f80')), [255, 136, 0]);
    assert.deepEqual(plain(g.hexRgb('102030')), [16, 32, 48]);
  });
});

describe('world layout constants', () => {
  test('the view is 960x540 and the pixel buffer is exactly half that', () => {
    assert.equal(g.VIEW_W, 960);
    assert.equal(g.VIEW_H, 540);
    assert.equal(g.PW * g.PIX, g.VIEW_W);
    assert.equal(g.PH * g.PIX, g.VIEW_H);
  });

  test('the walkable deck sits inside the boat, and the water below the deck', () => {
    assert.ok(g.BOAT_L < g.WALK_L && g.WALK_L < g.WALK_R && g.WALK_R < g.BOAT_R);
    assert.ok(g.HORIZON_Y < g.DECK_Y && g.DECK_Y < g.WATER_Y && g.WATER_Y < g.WATER_TOP);
  });
});
