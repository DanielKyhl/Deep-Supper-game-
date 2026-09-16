'use strict';
/* The pixel-art boat and the people on it, through whole frames of the
   real renderer, driven with real keys: walking the deck, casting from the
   bow, and swimming below. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

// counts every rasterisation (one Spr.begin each) while fn runs
function countRepaints(h, fn) {
  const Spr = h.g.Spr, begin = Spr.begin;
  let n = 0;
  Spr.begin = function (...a) { n++; return begin.apply(this, a); };
  try { fn(); } finally { Spr.begin = begin; }
  return n;
}

function frameIsSound(h, label) {
  const rec = h.hires();
  rec.reset();
  assert.doesNotThrow(() => h.frame(), label);
  assert.equal(rec.depth(), 0, label + ': unbalanced save/restore');
}

describe('the boat and its crew, frame by frame', () => {
  test('walking the deck stern to bow and back, every frame is sound and repaints stay few', () => {
    const h = loadGame({ seed: 3 });
    h.startVoyage();
    F.readDialogue(h);
    const P = h.g.Player;
    P.x = 120;
    const n = countRepaints(h, () => {
      h.keyDown('KeyD');
      for (let i = 0; i < 60 * 30 && P.x < h.g.FISH_X - 20; i++) frameIsSound(h, 'walking right at ' + Math.round(P.x));
      h.keyUp('KeyD');
      h.keyDown('KeyA');
      for (let i = 0; i < 60 * 30 && P.x > 600; i++) frameIsSound(h, 'walking left at ' + Math.round(P.x));
      h.keyUp('KeyA');
    });
    assert.ok(P.x <= 600, 'he got back to the stall');
    const seconds = h.g.Game.t;
    assert.ok(n / seconds < 45, Math.round(n / seconds) + ' repaints a second');
  });

  test('casting from the bow with real keys, the line leaves from a painted pixel of the rod on every frame', () => {
    const h = loadGame({ seed: 4 });
    h.startVoyage();
    F.readDialogue(h);
    const g = h.g, rec = h.hires();
    g.Player.weapon = 0;
    F.walkTo(h, g.FISH_X, 40);

    let boy = null, start = null;
    const draw = g.Sprite.draw;
    g.Sprite.draw = function (ctx, who, pose, wx, wy, o) {
      const r = draw.call(this, ctx, who, pose, wx, wy, o);
      if (who === 'boy') boy = { x: g.snap(wx), y: g.snap(wy), b: this._held.get('boy').baked };
      return r;
    };
    const line = g.Fishing.drawLine;
    g.Fishing.drawLine = function (ctx) {
      rec.startLog();
      const r = line.call(this, ctx);
      const m = rec.stopLog().find(e => e.fn === 'moveTo');
      start = m && [m.args[0], m.args[1]];
      return r;
    };
    try {
      h.tap('KeyE');
      assert.equal(g.Game.state, 'fish');
      let checked = 0;
      for (let i = 0; i < 90 && (g.Fishing.phase === 'cast' || g.Fishing.phase === 'sink'); i++) {
        boy = null; start = null;
        h.frame();
        if (!boy || !start) continue;
        const { b } = boy, S = b.S;
        const cx = Math.round((start[0] - boy.x) / g.PIX) + b.ox, cy = Math.round((start[1] - boy.y) / g.PIX) + b.oy;
        let hit = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = cx + dx, y = cy + dy;
            if (x >= 0 && y >= 0 && x < b.cw && y < b.ch && S.img.data[(y * S.img.width + x) * 4 + 3]) hit = true;
          }
        }
        assert.ok(hit, g.Fishing.phase + ' frame ' + i + ': the line starts at ' + start + ', off the rod');
        checked++;
      }
      assert.ok(checked > 20, 'checked ' + checked + ' frames');
    } finally {
      g.Sprite.draw = draw;
      g.Fishing.drawLine = line;
    }
  });

  test('swimming about with real keys, the diver kicks through his poses without repainting every frame', () => {
    const h = loadGame({ seed: 6 });
    h.startVoyage();
    F.readDialogue(h);
    Object.assign(h.g.Player, { beatBoss: true, suit: 1, diveWeapon: 2, weapon: 5 });
    F.walkTo(h, h.g.FISH_X, 40);
    h.tap('KeyE');
    assert.ok(h.until(() => h.g.Dive.underwater && h.g.Game.fade.dir === 0, 6), 'never got into the water');
    const D = h.g.Dive;
    D.mobs.length = 0;
    const poses = new Set();
    const draw = h.g.Sprite.draw;
    h.g.Sprite.draw = function (ctx, who, pose, ...a) { if (who === 'diver') poses.add(pose); return draw.call(this, ctx, who, pose, ...a); };
    let n;
    try {
      n = countRepaints(h, () => {
        for (const [key, s] of [['KeyD', 1.5], ['KeyS', 1], ['KeyA', 1.5], ['KeyW', 1]]) {
          h.keyDown(key);
          for (let i = 0; i < s * 60; i++) frameIsSound(h, 'swimming ' + key);
          h.keyUp(key);
        }
      });
    } finally { h.g.Sprite.draw = draw; }
    assert.ok(poses.size > 8, 'only ' + poses.size + ' poses: he is not kicking');
    assert.ok(n < 200, n + ' repaints in 300 frames');
  });
});
