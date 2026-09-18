'use strict';
/* The people, what they carry, and the boat they stand on, drawn as pixel
   art through the rig and the sprite cache. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');

const h = loadGame({ seed: 13 });
const g = h.g;
const bctx = h.eval('bctx');
const rec = h.hires();
const Spr = g.Spr, Rig = g.Rig, MAT = g.MAT, PIX = g.PIX, Sprite = g.Sprite;
const Ship = h.eval('Ship');

const balanced = (label, fn) => {
  rec.reset();
  assert.doesNotThrow(fn, label);
  assert.equal(rec.depth(), 0, label + ' left save/restore unbalanced');
  assert.equal(rec.minDepth(), 0, label + ' restored more than it saved');
};

// run fn with the cache off, returning every sprite it baked (copied, as surfaces are pooled)
// and how many pixels fell off an edge
function raster(fn) {
  const baked = [], bake = Spr.bake, plot = Spr.plot;
  let clipped = 0;
  Spr.bake = function (...a) {
    const b = bake.apply(this, a);
    if (!b) { baked.push(null); return b; }
    const W = b.S.img.width, A = new Uint8Array(b.cw * b.ch);
    for (let y = 0; y < b.ch; y++) for (let x = 0; x < b.cw; x++) A[y * b.cw + x] = b.S.img.data[(y * W + x) * 4 + 3];
    baked.push({ cw: b.cw, ch: b.ch, ox: b.ox, oy: b.oy, A });
    return b;
  };
  Spr.plot = function (x, y, mat, lit) {
    const px = Math.round(x) + this.ox, py = Math.round(y + x * this.tilt) + this.oy;
    if (px < 1 || py < 1 || px >= this.w - 1 || py >= this.h - 1) clipped++;
    return plot.call(this, x, y, mat, lit);
  };
  Sprite.cache = false;
  try { fn(); } finally { Spr.bake = bake; Spr.plot = plot; Sprite.cache = true; }
  return { baked, clipped };
}
const alpha = (b, x, y) => {
  if (x < 0 || y < 0 || x >= b.cw || y >= b.ch) return 0;
  return b.A[y * b.cw + x];
};

// count what really gets rasterised: one Spr.begin per repaint
function repaints(fn) {
  const begin = Spr.begin;
  let n = 0;
  Spr.begin = function (...a) { n++; return begin.apply(this, a); };
  try { fn(); } finally { Spr.begin = begin; }
  return n;
}

describe('the rig', () => {
  test('translate, rotate and scale compose like a canvas transform', () => {
    Rig.begin();
    Rig.translate(10, 5);
    Rig.rotate(Math.PI / 2);
    const [x, y] = Rig.pt(1, 0);
    assert.ok(Math.abs(x - 10) < 1e-9 && Math.abs(y - 6) < 1e-9, x + ',' + y);
    Rig.scale(3, 3);
    assert.ok(Math.abs(Rig.k() - 3) < 1e-9);
    const [x2, y2] = Rig.pt(0, 1);
    assert.ok(Math.abs(x2 - 7) < 1e-9 && Math.abs(y2 - 5) < 1e-9, x2 + ',' + y2);
  });

  test('save and restore nest, and one restore too many leaves the identity', () => {
    Rig.begin();
    Rig.translate(4, 0);
    Rig.save();
    Rig.translate(0, 9);
    Rig.save();
    Rig.rotate(1);
    Rig.restore();
    assert.deepEqual(Array.from(Rig.pt(0, 0)), [4, 9]);
    Rig.restore();
    assert.deepEqual(Array.from(Rig.pt(0, 0)), [4, 0]);
    Rig.restore();
    assert.deepEqual(Array.from(Rig.pt(2, 3)), [2, 3]);
  });

  test('shapes land in the buffer where the transform puts them, and lines thicken with its scale', () => {
    Spr.begin(60, 60);
    Rig.begin();
    Rig.translate(10, -6);
    Rig.box(0, 0, 3, 2, MAT.METAL, .5);
    assert.equal(Spr.mat[(-6 + Spr.oy) * Spr.w + 11 + Spr.ox], MAT.METAL);
    assert.equal(Spr.mat[(-6 + Spr.oy) * Spr.w + 4 + Spr.ox], 0);
    const width = s => {
      Spr.begin(60, 60); Rig.begin(); Rig.scale(s, s);
      Rig.line([[-4, 0], [4, 0]], 1, 1, MAT.WOOD, .5);
      return Spr.y1 - Spr.y0 + 1;
    };
    assert.ok(width(3) > width(1), width(3) + ' vs ' + width(1));
  });
});

describe('the people', () => {
  // what is actually painted on his face, by material, in his own pixels
  function facePixels(o) {
    Spr.begin(110, 110);
    Rig.begin();
    g.Figures.boy(Object.assign({ state: 'idle', t: 0 }, o));
    const out = [];
    for (let y = 0; y < 110; y++) for (let x = 0; x < 110; x++) {
      const m = Spr.mat[y * 110 + x];
      if (m) out.push({ x, y, m });
    }
    return out;
  }

  test("his face is a boy's: two eyes a pixel wide with his face between them, and no band across it", () => {
    const eyes = facePixels().filter(p => p.m === MAT.DARK);
    assert.ok(eyes.length > 0 && eyes.length <= 4, 'a few dark pixels, not a visor: ' + eyes.length);
    const cols = [...new Set(eyes.map(p => p.x))].sort((a, b) => a - b);
    assert.equal(cols.length, 2, 'two of them, side by side: ' + cols.join(','));
    assert.ok(cols[1] - cols[0] >= 2, 'with his face showing between: ' + (cols[1] - cols[0]));
  });

  test('he shuts his eyes only when he is standing still, so his face never sticks mid-stride', () => {
    const shut = t => facePixels({ state: 'idle', t }).filter(p => p.m === MAT.DARK).length === 0;
    let blinked = 0, open = 0;
    for (let t = 0; t < 12; t += .05) (shut(t) ? blinked++ : open++);
    assert.ok(blinked > 0 && open > blinked * 8, 'a blink now and then: ' + blinked + ' of ' + (blinked + open));
    /* Walking, his eyes stay open: a blink there would never show anyway, since
       what his sprite is keyed on mid-stride does not carry one. */
    for (let t = 0; t < 12; t += .05) {
      assert.ok(facePixels({ state: 'walk', t }).some(p => p.m === MAT.DARK), 'eyes open at ' + t.toFixed(2));
    }
  });

  test("the sou'wester is its own colour, so the hat never reads as a mop of hair", () => {
    assert.notEqual(g.BOY_COLORS.SHELL, g.BOY_COLORS.BODY);
  });

  test('the boy facing left is the exact mirror of the boy facing right', () => {
    for (const o of [{ state: 'walk', t: 1 }, { hold: 'weapon', weapon: g.WEAPONS[2], weaponAngle: -1 }, { hold: 'rod', rodAngle: -.4, rodBend: 10 }]) {
      const [right] = raster(() => g.Art.boy(bctx, 400, g.DECK_Y, Object.assign({ face: 1 }, o))).baked;
      const [left] = raster(() => g.Art.boy(bctx, 400, g.DECK_Y, Object.assign({ face: -1 }, o))).baked;
      assert.equal(left.cw, right.cw);
      assert.equal(left.ch, right.ch);
      for (let y = 0; y < right.ch; y++) {
        const r = [], l = [];
        for (let x = 0; x < right.cw; x++) { r.push(alpha(right, x, y) ? 1 : 0); l.push(alpha(left, x, y) ? 1 : 0); }
        assert.deepEqual(l, r.reverse(), 'row ' + y);
      }
    }
  });

  test('no one is cut off by the edge of their sprite, in any pose or with anything in hand', () => {
    const cases = [];
    for (const state of ['idle', 'walk', 'jump', 'hurt', 'roll']) {
      for (const t of [0, .3, .7, 1.1]) cases.push(['boy ' + state, () => g.Art.boy(bctx, 400, 400, { state, t, rollT: t / 2 })]);
    }
    for (const w of g.WEAPONS.concat([g.EXCALIBUR])) {
      for (const p of [0, .35, .7, 1]) cases.push(['boy with ' + w.id, () => g.Art.boy(bctx, 400, 400, { hold: 'weapon', weapon: w, weaponAngle: -1.15, swingP: p, frontArm: .35 })]);
    }
    for (const phase of ['cast', 'sink', 'reel', 'pull', 'ambush']) {
      g.Fishing.phase = phase;
      for (const t of [0, .4, 2, 6]) {
        g.Fishing.t = t;
        const pose = g.Fishing.rodPose();
        cases.push(['boy fishing, ' + phase, () => g.Art.boy(bctx, 400, 400, Object.assign({ hold: 'rod', backArm: .5 }, pose))]);
      }
    }
    for (const t of [0, 3, 7.2, 8.4]) {
      cases.push(['dad', () => g.Art.dad(bctx, 400, 400, { t, state: t > 5 ? 'walk' : 'idle' })]);
      cases.push(['dorran', () => g.Art.dorran(bctx, 400, 400, { t })]);
    }
    for (const pose of ['stand', 'sit', 'rise', 'swim']) cases.push(['nerys ' + pose, () => g.Art.girl(bctx, 400, 400, { pose, t: 1, rot: .3 })]);
    for (const suit of g.SUITS) {
      cases.push(['standing in ' + suit.id, () => g.Art.diverStanding(bctx, 400, 400, { suit, state: 'walk', t: .4, rot: .2 })]);
      for (const weapon of g.DIVE_WEAPONS) {
        for (const aim of [0, -1.2, 1.2, Math.PI]) {
          cases.push(['diving in ' + suit.id + ' with ' + weapon.id, () => g.Art.diver(bctx, 400, 300, { suit, weapon, aim, t: 1, kick: 1, recoil: 1, tilt: .3 })]);
        }
      }
    }
    cases.push(['the drops', () => g.Art.drops(bctx, 400, 400, 1)]);
    for (const [label, fn] of cases) {
      const r = raster(fn);
      assert.ok(r.baked.length >= 1 && r.baked.every(Boolean), label + ' painted nothing');
      assert.equal(r.clipped, 0, label + ': ' + r.clipped + ' pixels fell off the edge');
    }
  });

  test('a pose already on screen is never painted twice, and a new one is', () => {
    const o = { hold: 'rod', rodAngle: -.4, rodBend: 10, t: 0 };
    g.Art.boy(bctx, 400, 400, o);
    assert.equal(repaints(() => { for (let i = 0; i < 30; i++) g.Art.boy(bctx, 400 + i, 400, o); }), 0, 'moving him is only a blit');
    assert.equal(repaints(() => g.Art.boy(bctx, 400, 400, Object.assign({}, o, { rodAngle: -1.4 }))), 1);
    assert.equal(repaints(() => g.Art.boy(bctx, 400, 400, Object.assign({}, o, { rodAngle: -1.4, face: -1 }))), 1, 'turning round is a new pose');
  });

  test('standing about, everyone repaints only a few times a second', () => {
    for (const [who, draw, most] of [
      ['the boy', t => g.Art.boy(bctx, 400, 400, { t, state: 'idle', hold: 'weapon', weapon: g.WEAPONS[1], weaponAngle: -1.15 + Math.sin(t * 2) * .04, frontArm: .35 }), 60],
      ['Dorran', t => g.Art.dorran(bctx, 400, 400, { t }), 60],
      ['Nerys', t => g.Art.girl(bctx, 400, 400, { t, pose: 'stand' }), 60]
    ]) {
      draw(0);
      const n = repaints(() => { for (let i = 1; i <= 600; i++) draw(i / 60); });
      assert.ok(n > 0, who + ' is not frozen');
      assert.ok(n <= most, who + ' repainted ' + n + ' times in ten seconds');
    }
  });

  test('the rod tip is where the fishing line is tied, in every phase of a cast, facing either way', () => {
    const F = g.Fishing, P = g.Player;
    for (const face of [1, -1]) {
      for (const phase of ['cast', 'sink', 'deep', 'bite', 'reel', 'pull', 'ambush', 'junk', 'fail']) {
        for (const t of [0, .25, .5, 1.5]) {
          Object.assign(F, { phase, t, eaten: false });
          const o = Object.assign({ face, t: 1.9, state: 'idle', hold: 'rod', backArm: .5 }, F.rodPose());
          const tip = g.Figures.rodTip(o);
          const [b] = raster(() => g.Art.boy(bctx, 400, 400, o)).baked;
          const cx = Math.round(tip.x / PIX) + b.ox, cy = Math.round(tip.y / PIX) + b.oy;
          let near = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near = Math.max(near, alpha(b, cx + dx, cy + dy));
          assert.ok(alpha(b, cx, cy) > 0 || near > 0, phase + ' at ' + t + ' facing ' + face + ': nothing painted at the tip');
        }
      }
    }
    // and the line itself starts there
    Object.assign(P, { x: g.FISH_X, face: 1, animT: 1.9, y: g.DECK_Y });
    g.Game.state = 'fish';
    F.start();
    F.t = .3;
    rec.reset(); rec.startLog();
    F.drawLine(bctx);
    const move = rec.stopLog().find(e => e.fn === 'moveTo');
    const tip = g.Figures.rodTip(Object.assign({ t: P.animT, face: P.face, squash: g.bodySquash(P) }, F.rodPose()));
    assert.deepEqual([move.args[0], move.args[1]], [P.x - g.Cam.x + tip.x, P.y + tip.y]);
  });
});

describe('the boat', () => {
  test('the whole boat draws, stern to bow, by day, at dusk and at night', () => {
    for (const night of [0, .5, 1]) {
      for (let camX = -200; camX < g.BOAT_R; camX += 330) {
        balanced('back at ' + camX + ', ' + night, () => g.Art.boatBack(bctx, camX, 3.3, night, { crateOpen: camX > 500 }));
        balanced('front at ' + camX + ', ' + night, () => g.Art.boatFront(bctx, camX, 3.3, night));
      }
    }
  });

  test('none of its layers is cut off at the edge of its sprite', () => {
    const r = raster(() => {
      g.Art.boatBack(bctx, 400, 1, 1, { crateOpen: true });
      g.Art.boatFront(bctx, 400, 1, 1);
      for (const t of [0, .8, 2.1]) g.Art.boatBack(bctx, 400, t, 0, {});
    });
    assert.ok(r.baked.length >= 8, 'painted ' + r.baked.length + ' layers');
    assert.equal(r.clipped, 0, r.clipped + ' pixels fell off the edge');
  });

  test('what never moves is painted once, however long the voyage and wherever the camera goes', () => {
    const count = {};
    const orig = {};
    for (const k of ['wall', 'props', 'hull', 'counter', 'mast', 'bell', 'dryingLine', 'buoys']) {
      orig[k] = Ship[k];
      count[k] = 0;
      Ship[k] = function (...a) { count[k]++; return orig[k].apply(this, a); };
    }
    try {
      g.Art.boatBack(bctx, 0, 100, 1, {});
      g.Art.boatFront(bctx, 0, 100, 1);
      for (const k in count) count[k] = 0;
      for (let i = 0; i < 600; i++) {
        const t = 100 + i / 60;
        g.Art.boatBack(bctx, i * 2, t, 1, {});
        g.Art.boatFront(bctx, i * 2, t, 1);
      }
    } finally { Object.assign(Ship, orig); }
    for (const k of ['wall', 'props', 'hull', 'counter']) assert.equal(count[k], 0, k + ' was painted again');
    for (const k of ['mast', 'bell', 'dryingLine', 'buoys']) {
      assert.ok(count[k] > 0, k + ' never moved');
      assert.ok(count[k] < 150, k + ' repainted ' + count[k] + ' times in ten seconds');
    }
  });

  test('opening the crate repaints the deck once, with its lid up', () => {
    g.Art.boatBack(bctx, 0, 1, 1, { crateOpen: false });
    let lid = null;
    const crate = Ship.crate;
    Ship.crate = function (x, s, open) { if (x === 392) lid = open; return crate.call(this, x, s, open); };
    try {
      assert.equal(repaints(() => { for (let i = 0; i < 5; i++) g.Art.boatBack(bctx, 0, 1, 1, { crateOpen: false }); }), 0);
      g.Art.boatBack(bctx, 0, 1, 1, { crateOpen: true });
      assert.equal(lid, true);
      lid = null;
      g.Art.boatBack(bctx, 0, 1, 1, { crateOpen: true });
      assert.equal(lid, null, 'and only once');
    } finally { Ship.crate = crate; }
  });

  test('Dorran stands behind his counter, and the counter behind whoever walks past', () => {
    const order = [];
    const draw = Sprite.draw;
    Sprite.draw = function (gg, who, ...a) { order.push(who); return draw.call(this, gg, who, ...a); };
    try { g.Art.boatBack(bctx, 300, 1, 1, {}); } finally { Sprite.draw = draw; }
    assert.ok(order.indexOf('dorran') >= 0 && order.indexOf('dorran') < order.indexOf('ship-counter'), order.join(' '));
    assert.equal(order[order.length - 1], 'ship-counter', 'the counter is the last thing behind the crew');
  });

  test('the lanterns and strings of bulbs only glow after dark', () => {
    const glows = night => {
      rec.reset(); rec.startLog();
      g.Art.boatBack(bctx, 700, 2, night, {});
      return rec.stopLog().filter(e => e.fn === 'ellipse').length;
    };
    assert.equal(glows(0), 0);
    assert.ok(glows(1) > 20, 'night: ' + glows(1));
  });

  test('bulbs off the side of the screen are not drawn at all', () => {
    rec.reset(); rec.startLog();
    g.Art.boatBack(bctx, 5000, 2, 1, {});
    const log = rec.stopLog();
    assert.equal(log.filter(e => e.fn === 'fillRect' && e.args[0] > -40 && e.args[0] < g.VIEW_W + 40).length, 0);
  });
});
