'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, near } = require('../helpers/harness');

describe('Cam', () => {
  test('snap centres on a point and clamps to the boat', () => {
    const { g } = loadGame({ draw: false });
    g.Cam.snap(1000);
    assert.equal(g.Cam.x, 520);
    g.Cam.snap(0);
    assert.equal(g.Cam.x, 0);
    g.Cam.snap(99999);
    assert.equal(g.Cam.x, g.BOAT_R - g.VIEW_W);
  });

  test('follow eases toward the target unless locked', () => {
    const { g } = loadGame({ draw: false });
    g.Cam.x = 0; g.Cam.locked = false;
    g.Cam.follow(1000, .1, 5);
    assert.ok(g.Cam.x > 0 && g.Cam.x < 520);
    const at = g.Cam.x;
    g.Cam.locked = true;
    g.Cam.follow(1500, .1, 5);
    assert.equal(g.Cam.x, at);
  });

  test('kick keeps the strongest shake and update decays it', () => {
    const { g } = loadGame({ draw: false });
    g.Cam.shake = 0;
    g.Cam.kick(8); g.Cam.kick(3);
    assert.equal(g.Cam.shake, 8);
    g.Cam.update(.1);
    near(g.Cam.shake, 8 - 2.6, 1e-9);
    g.Cam.update(10);
    assert.equal(g.Cam.shake, 0);
  });

  test('shake offsets and camera position land on the pixel grid', () => {
    const { g } = loadGame({ draw: false, seed: 3 });
    g.Cam.x = 101.3;
    for (let i = 0; i < 40; i++) {
      g.Cam.kick(12);
      g.Cam.update(1 / 60);
      assert.equal(Math.abs(g.Cam.shakeX) % 2, 0);
      assert.equal(Math.abs(g.Cam.shakeY) % 2, 0);
      assert.equal(Math.abs(g.Cam.x) % 2, 0);
    }
  });

  test('screen shake set to off produces no offset at all', () => {
    const { g } = loadGame({ draw: false, seed: 3 });
    g.Prefs.shake = 0;
    for (let i = 0; i < 30; i++) {
      g.Cam.kick(20);
      g.Cam.update(1 / 60);
      assert.ok(g.Cam.shakeX === 0 && g.Cam.shakeY === 0);
    }
  });
});

describe('Particles', () => {
  test('burst adds the requested number of particles', () => {
    const { g } = loadGame({ draw: false });
    g.Particles.clear();
    g.Particles.burst(0, 0, 25, { color: '#fff' });
    assert.equal(g.Particles.list.length, 25);
  });

  test('low particle setting cuts bursts to 40%, rounding up', () => {
    const { g } = loadGame({ draw: false });
    g.Particles.clear();
    g.Prefs.particlesLow = true;
    g.Particles.burst(0, 0, 25);
    assert.equal(g.Particles.list.length, 10);
    g.Particles.burst(0, 0, 1);
    assert.equal(g.Particles.list.length, 11);
  });

  test('update applies gravity and removes particles past their life', () => {
    const { g } = loadGame({ draw: false });
    g.Particles.clear();
    g.Particles.add(0, 0, { vx: 0, vy: 0, g: 100, life: .5 });
    g.Particles.update(.1);
    const p = g.Particles.list[0];
    near(p.vy, 10, 1e-9);
    assert.ok(p.y > 0);
    g.Particles.update(.5);
    assert.equal(g.Particles.list.length, 0);
  });

  test('water particles are screen-fixed and only draw in the water layer', () => {
    const { h, g } = loadGame({ draw: false });
    g.Particles.clear();
    g.Particles.add(10, 10, { water: true, life: 1 });
    g.Particles.add(10, 10, { life: 1 });
    assert.equal(g.Particles.list[0].fixed, true);
    const rec = h.hires();
    rec.startLog();
    g.Particles.draw(h.eval('bctx'), 0, 'water');
    assert.equal(rec.stopLog().filter(e => e.fn === 'fillRect').length, 1);
    rec.startLog();
    g.Particles.draw(h.eval('bctx'), 0);
    assert.equal(rec.stopLog().filter(e => e.fn === 'fillRect').length, 1);
  });

  test('particles draw as whole-pixel squares, never smaller than a pixel', () => {
    const { h, g } = loadGame({ draw: false });
    g.Particles.clear();
    g.Particles.add(33.3, 47.7, { size: .5, life: 1 });
    g.Particles.add(33.3, 47.7, { size: 7, life: 1 });
    const rec = h.hires();
    rec.startLog();
    g.Particles.draw(h.eval('bctx'), 0);
    for (const e of rec.stopLog().filter(e => e.fn === 'fillRect')) {
      assert.ok(e.args[2] >= 2 && e.args[2] % 2 === 0);
      assert.equal(e.args[0] % 2, 0);
    }
  });
});

describe('Floaters', () => {
  test('float upward and expire after their life', () => {
    const { g } = loadGame({ draw: false });
    g.Floaters.clear();
    g.Floaters.add(100, 100, '12', { life: .5 });
    g.Floaters.update(.1);
    assert.ok(g.Floaters.list[0].y < 100);
    g.Floaters.update(.5);
    assert.equal(g.Floaters.list.length, 0);
  });

  test('screen-fixed floaters ignore the camera', () => {
    const { h, g } = loadGame({ draw: false });
    g.Floaters.clear();
    g.Floaters.add(200, 100, 'I', { fixed: true, size: 18 });
    const rec = h.hires();
    rec.startLog();
    g.Floaters.draw(h.eval('bctx'), 5000);
    const xs = rec.stopLog().filter(e => e.fn === 'rect').map(e => e.args[0]);
    assert.ok(xs.length && Math.min(...xs) > 150 && Math.max(...xs) < 250);
  });
});

describe('bodySquash', () => {
  test('squashes on landing, stretches in the air, rests at 1', () => {
    const { g } = loadGame({ draw: false });
    const DECK_Y = g.DECK_Y;
    near(g.bodySquash({ landT: .2, y: DECK_Y, vy: 0 }), .8, 1e-9);
    assert.equal(g.bodySquash({ landT: 0, y: DECK_Y, vy: 0 }), 1);
    const air = g.bodySquash({ landT: 0, y: DECK_Y - 50, vy: -600 });
    assert.ok(air > 1 && air <= 1.13);
    assert.equal(g.bodySquash({ landT: 0, y: DECK_Y - 50, vy: -99999 }), 1.13);
  });
});
