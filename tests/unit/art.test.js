'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');

const h = loadGame({ seed: 21 });
const g = h.g;
const bctx = h.eval('bctx');
const rec = h.hires();
const balanced = (label, fn) => {
  rec.reset();
  assert.doesNotThrow(fn, label);
  assert.equal(rec.depth(), 0, label + ' left save/restore unbalanced');
  assert.equal(rec.minDepth(), 0, label + ' restored more than it saved');
};

describe('sky and colour ramps', () => {
  test('skyAt returns the key colours at day and night', () => {
    assert.deepEqual(plain(g.skyAt(0).top), plain(g.SKY_KEYS[0].top));
    assert.deepEqual(plain(g.skyAt(1).top), plain(g.SKY_KEYS[3].top));
    assert.deepEqual(plain(g.skyAt(-5)), plain(g.skyAt(0)));
  });

  test('the sky gets steadily darker toward night', () => {
    const lum = c => c[0] + c[1] + c[2];
    let prev = Infinity;
    for (let n = .42; n <= 1; n += .04) {
      const l = lum(g.skyAt(n).top);
      assert.ok(l <= prev, 'at ' + n);
      prev = l;
    }
  });

  test('nightKey quantises night into 33 cache buckets', () => {
    assert.equal(g.nightKey(0), 0);
    assert.equal(g.nightKey(1), 32);
    assert.equal(g.nightKey(2), 32);
    assert.equal(g.nightKey(.5), 16);
  });

  test('dithered strips are cached and use only quantised colours', () => {
    const stops = h.eval('[[0, [10, 40, 90]], [1, [200, 120, 30]]]');
    const a = g.ditherStrip('test-strip', 20, stops);
    assert.equal(g.ditherStrip('test-strip', 20, stops), a);
    assert.equal(a.width, g.PW);
    const put = a.getContext('2d').__fake;
    assert.equal(put.calls.putImageData, 1);
  });

  test('stepGlow draws hard rings and restores alpha', () => {
    rec.reset();
    rec.startLog();
    g.stepGlow(bctx, 100, 100, 50, '#fff', .9, { steps: 4 });
    const log = rec.stopLog();
    assert.equal(log.filter(e => e.fn === 'ellipse').length, 4);
    assert.equal(rec.depth(), 0);
  });
});

describe('drawing the world', () => {
  test('sky, sea, harbour and water column draw at any time of night', () => {
    for (const night of [0, .3, .74, 1]) {
      balanced('world at ' + night, () => {
        g.Art.sky(bctx, night, 3);
        g.Art.harbour(bctx, 300, night, 3);
        g.Art.sea(bctx, 400, 3, night);
        g.Art.seaFront(bctx, 400, 3, night);
        g.Art.shadows(bctx, 3, 400, 3);
        g.Art.underwater(bctx, { viewY: 300, t: 3, night, shapes: [{ x: 100, depth: 200, r: 40, dir: 1, ph: 0, a: .2, sp: 10 }], watcher: { x: 480, depth: 500, a: .8 } });
        g.Art.nightTint(bctx, night * .5);
        g.Art.vignette(bctx, night);
      });
    }
  });

  test('the boat draws with the crate open or shut', () => {
    for (const crateOpen of [false, true]) {
      balanced('boat ' + crateOpen, () => {
        g.Art.beginBoat(bctx, 2);
        g.Art.boatBack(bctx, 300, 2, 1, { crateOpen });
        g.Art.boatFront(bctx, 300, 2, 1);
        g.Art.endBoat(bctx);
      });
    }
  });
});

describe('drawing the sea below', () => {
  test('the dive draws at every depth, from the surface to Lanthorne', () => {
    const D = g.Dive;
    g.Player.suit = 3; g.Player.diveWeapon = 4;
    D.enterWater();
    for (const [x, y] of [[3200, 40], [1150, 820], [3300, 1900], [900, 2900], [2400, 3700], [300, 3980]]) {
      Object.assign(D.p, { x, y });
      D._camera(0, true);
      balanced('dive at ' + y, () => g.Art.diveScene(bctx, D, 4));
    }
    D.reset();
  });

  test('every creature below draws in the dive, in every state, with rings, ink and lightning about', () => {
    const D = g.Dive;
    g.Player.suit = 3;
    D.enterWater();
    D.mobs.length = 0;
    const states = ['drift', 'hunt', 'tele', 'bite', 'charge', 'ink', 'stun', 'dead'];
    g.DIVE_MONSTERS.forEach((def, i) => {
      const m = D.spawn(def.zone, null) || {};
      Object.assign(m, { def, x: D.p.x + 120 + (i % 4) * 60, y: D.p.y + ((i % 3) - 1) * 80, state: states[i % states.length], hp: def.hp / 2, maxHp: def.hp, t: .5, atk: 'bite', dead: states[i % states.length] === 'dead' });
    });
    D.rings.push({ x: D.p.x, y: D.p.y, r: 60, max: 200, from: 'player' }, { x: D.p.x, y: D.p.y, r: 90, max: 200, from: 'mob' });
    D.globs.push({ x: D.p.x + 40, y: D.p.y, r: 11 });
    D.zaps.push({ x1: D.p.x, y1: D.p.y, x2: D.p.x + 100, y2: D.p.y + 20, t: .05 });
    D.p.atk = { style: 'thrust', t: .1, dur: .3, ax: 1, ay: 0 };
    D._camera(0, true);
    balanced('crowded dive', () => g.Art.diveScene(bctx, D, 2));
    D.reset();
  });
});

describe('drawing characters and monsters', () => {
  test('the boy draws in every state, both ways round, with every held item', () => {
    for (const face of [1, -1]) {
      for (const state of ['idle', 'walk', 'jump', 'roll', 'hurt']) {
        balanced('boy ' + state + ' ' + face, () => g.Art.boy(bctx, 400, g.DECK_Y, { face, state, t: 1.3, rollT: .1 }));
      }
      balanced('boy with rod', () => g.Art.boy(bctx, 400, g.DECK_Y, { face, hold: 'rod', rodAngle: -.4, rodBend: 10 }));
      for (const w of g.WEAPONS) balanced('boy with ' + w.id, () => g.Art.boy(bctx, 400, g.DECK_Y, { face, hold: 'weapon', weapon: w, weaponAngle: -1, swingP: .5 }));
    }
  });

  test('the boy is mirrored by his facing, so A really does turn him left', () => {
    const mirror = face => {
      rec.reset(); rec.startLog();
      g.Art.boy(bctx, 400, g.DECK_Y, { face, state: 'walk', t: 1 });
      return rec.stopLog().filter(e => e.fn === 'scale').map(e => e.args[0]);
    };
    assert.ok(mirror(-1).includes(-1), 'facing left scales x by -1');
    assert.ok(!mirror(1).includes(-1), 'facing right is never mirrored');
  });

  test('every weapon draws through a full swing', () => {
    for (const w of g.WEAPONS) {
      for (const p of [0, .3, .7, 1]) balanced(w.id + ' at ' + p, () => g.Art.weapon(bctx, w, 1, p));
    }
  });

  test('Nerys draws in every pose, both ways round', () => {
    for (const face of [1, -1]) {
      for (const pose of ['stand', 'sit', 'rise', 'swim']) {
        balanced('nerys ' + pose, () => g.Art.girl(bctx, 400, g.DECK_Y, { face, pose, t: 2, rot: .3, alpha: .8, scale: .9 }));
      }
    }
  });

  test('the diving suit draws on every tier, standing and swimming, with every weapon', () => {
    for (const suit of g.SUITS) {
      for (const face of [1, -1]) {
        balanced('standing ' + suit.id, () => g.Art.diverStanding(bctx, 400, g.DECK_Y, { face, suit, t: 1, state: 'walk', rot: .2 }));
        for (const weapon of g.DIVE_WEAPONS) {
          balanced('swimming ' + suit.id + ' ' + weapon.id, () => g.Art.diver(bctx, 300, 200, { face, suit, weapon, t: 1.3, kick: .8, aim: -.7, tilt: .2, attackP: .4, thrust: 6, alpha: .5 }));
        }
      }
    }
  });

  test('every underwater weapon draws idle and mid-attack', () => {
    for (const w of g.DIVE_WEAPONS) for (const p of [0, .3, .9]) balanced(w.id + ' ' + p, () => g.Art.diveWeapon(bctx, w, 2, p));
  });

  test("the Old One's leavings draw on the deck", () => {
    balanced('drops', () => g.Art.drops(bctx, 500, g.DECK_Y, 3));
  });

  test('Dad and Dorran draw', () => {
    balanced('dad', () => g.Art.dad(bctx, 300, g.DECK_Y, { face: -1, t: 1, state: 'walk' }));
    balanced('dorran', () => g.Art.dorran(bctx, 700, g.DECK_Y, { t: 1 }));
  });

  test('every monster draws in every pose, including underwater with no shadow', () => {
    for (const def of g.MONSTERS.concat([g.MINNOW])) {
      for (const pose of [{ gape: 0, flash: 0 }, { gape: .9, flash: 1, rage: true, thrashAmt: 3 }, { gape: .3, noShadow: true, face: -1 }]) {
        balanced(def.id, () => g.Art.monster(bctx, Object.assign({ x: 480, y: 300, face: 1, rot: .1, len: def.len, def, seed: 7 }, pose), 2.5));
      }
    }
  });

  test('noShadow really skips the deck shadow', () => {
    const def = g.MONSTERS[0];
    const shadows = noShadow => {
      rec.reset(); rec.startLog();
      g.Art.monster(bctx, { x: 480, y: 300, face: 1, len: def.len, def, noShadow }, 1);
      return rec.stopLog().filter(e => e.set === 'fillStyle' && e.value === 'rgba(0,0,0,.32)').length;
    };
    assert.equal(shadows(false), 1);
    assert.equal(shadows(true), 0);
  });

  test('HUD icons draw', () => {
    balanced('icons', () => {
      g.Art.heart(bctx, 10, 10, true);
      g.Art.heart(bctx, 30, 10, false);
      g.Art.coin(bctx, 50, 10, 1);
      g.Art.fishIcon(bctx, 70, 10, 1, [1, 2, 3], [4, 5, 6]);
    });
  });
});
