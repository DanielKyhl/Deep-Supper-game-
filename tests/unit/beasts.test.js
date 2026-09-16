'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');

const h = loadGame({ seed: 5 });
const g = h.g;
const bctx = h.eval('bctx');
const rec = h.hires();
const Spr = g.Spr, MAT = g.MAT, PIX = g.PIX;
// these tests look at the raster itself, so every draw rasterises (the cache has its own tests at the end)
g.Beast.cache = false;

// what's in the buffer right now: [material, light] at a creature-space pixel
const at = (x, y) => {
  const i = (Math.round(y) + Spr.oy) * Spr.w + Math.round(x) + Spr.ox;
  return [Spr.mat[i], Spr.lit[i]];
};
const count = mat => { let n = 0; for (let i = 0; i < Spr.w * Spr.h; i++) if (Spr.mat[i] === mat) n++; return n; };
const filled = () => { let n = 0; for (let i = 0; i < Spr.w * Spr.h; i++) if (Spr.mat[i]) n++; return n; };

// draw with finish() and return the pixels it put on the frame, plus where
function finishAndRead(wx, wy, face, pal, flash) {
  rec.reset(); rec.startLog();
  Spr.finish(bctx, wx, wy, face, pal, flash);
  const call = rec.stopLog().find(e => e.fn === 'drawImage');
  const surface = [...Spr._pool.values()].find(s => s.cv === call.args[0]);
  const [, , , cw, ch, dx, dy, dw, dh] = call.args;
  const px = (x, y) => Array.from(surface.img.data.slice((y * surface.img.width + x) * 4, (y * surface.img.width + x) * 4 + 4));
  return { cw, ch, dx, dy, dw, dh, px };
}

const pal = () => g.beastPalette(g.monsterDef('gnashfin'), false);
const ALL = () => g.MONSTERS.concat(g.DIVE_MONSTERS, [g.MINNOW]);
const pose = (def, extra) => Object.assign({ x: 480, y: 270, face: 1, rot: 0, len: def.len, def, gape: .5, flash: 0, seed: 7, thrashAmt: 1, noShadow: true }, extra);

describe('the pixel workbench', () => {
  test('plot puts a material and a clamped light at a pixel, and grows the bounds', () => {
    Spr.begin(40, 30);
    Spr.plot(3, -2, MAT.BODY, 1.7);
    Spr.plot(-4, 5, MAT.FIN, -.3);
    assert.deepEqual(at(3, -2), [MAT.BODY, 1]);
    assert.deepEqual(at(-4, 5), [MAT.FIN, 0]);
    assert.deepEqual([Spr.x0 - Spr.ox, Spr.x1 - Spr.ox, Spr.y0 - Spr.oy, Spr.y1 - Spr.oy], [-4, 3, -2, 5]);
  });

  test('plot quietly ignores pixels off the edge, including the one-pixel border kept for the outline', () => {
    Spr.begin(20, 20);
    Spr.plot(-10, 0, MAT.BODY, .5);
    Spr.plot(0, 9, MAT.BODY, .5);
    Spr.plot(500, 500, MAT.BODY, .5);
    assert.equal(filled(), 0);
    assert.ok(Spr.x1 < Spr.x0, 'bounds stay empty');
  });

  test('begin wipes the last creature', () => {
    Spr.begin(30, 30);
    Spr.blob(0, 0, 5, 5, MAT.BODY, {});
    Spr.emit.push({ x: 0, y: 0, r: 1 });
    Spr.begin(30, 30);
    assert.equal(filled(), 0);
    assert.equal(Spr.emit.length, 0);
    assert.equal(Spr.tilt, 0);
  });

  test('tilt shears pixels up or down by how far along the creature they are', () => {
    Spr.begin(60, 60);
    Spr.tilt = .5;
    Spr.plot(10, 0, MAT.BODY, .5);
    Spr.tilt = 0;
    assert.equal(at(10, 5)[0], MAT.BODY);
    assert.equal(at(10, 0)[0], MAT.EMPTY);
  });

  test('blob fills an ellipse, lit from above, with its belly underneath', () => {
    Spr.begin(60, 60);
    Spr.blob(0, 0, 10, 6, MAT.BODY, { belly: MAT.BELLY, bellyFrom: .3 });
    const area = filled();
    assert.ok(Math.abs(area - Math.PI * 10 * 6) < 30, 'about pi*a*b pixels: ' + area);
    assert.equal(at(0, -5)[0], MAT.BODY);
    assert.equal(at(0, 5)[0], MAT.BELLY);
    assert.equal(at(11, 0)[0], MAT.EMPTY);
    assert.ok(at(0, -4)[1] > at(0, 4)[1], 'brighter on top');
  });

  test('oval turns its long axis to the given angle', () => {
    Spr.begin(80, 80);
    Spr.oval(0, 0, 20, 5, Math.PI / 4, MAT.BODY, {});
    assert.equal(at(12, 12)[0], MAT.BODY, 'along the axis');
    assert.equal(at(-12, -12)[0], MAT.BODY);
    assert.equal(at(12, -12)[0], MAT.EMPTY, 'across it');
    assert.equal(at(18, 0)[0], MAT.EMPTY);
  });

  test('tube follows its spine and tapers with it', () => {
    Spr.begin(80, 60);
    Spr.tube([{ x: -20, y: -8, r: 2 }, { x: 20, y: 8, r: 6 }], MAT.BODY, {});
    assert.equal(at(-20, -8)[0], MAT.BODY);
    assert.equal(at(20, 8)[0], MAT.BODY);
    assert.equal(at(-20, -4)[0], MAT.EMPTY, 'thin at the tail');
    assert.equal(at(20, 13)[0], MAT.BODY, 'thick at the head');
  });

  test('poly fills a triangle and nothing outside it', () => {
    Spr.begin(60, 60);
    Spr.poly([[-10, 10], [10, 10], [0, -10]], MAT.FIN, (x, y) => .5 + y * .01);
    assert.equal(at(0, 5)[0], MAT.FIN);
    assert.equal(at(-9, -8)[0], MAT.EMPTY);
    assert.ok(Math.abs(at(0, 8)[1] - .58) < 1e-6, 'light from the function');
  });

  test('stroke draws an unbroken line that tapers', () => {
    Spr.begin(80, 40);
    Spr.stroke([[-30, 0], [30, 0]], 3, .4, MAT.BONE, .6);
    for (let x = -30; x <= 30; x++) assert.equal(at(x, 0)[0], MAT.BONE, 'at ' + x);
    assert.equal(at(-30, 3)[0], MAT.BONE, 'thick at the start');
    assert.equal(at(30, 2)[0], MAT.EMPTY, 'thin at the end');
  });

  test('teeth are tooth-coloured and point the way they are told', () => {
    Spr.begin(60, 60);
    Spr.teeth(-10, 0, 10, 0, 4, 6, 0, 1, 3);
    assert.ok(count(MAT.TOOTH) > 10);
    for (let i = 0; i < Spr.w * Spr.h; i++) {
      if (Spr.mat[i]) assert.ok(Math.floor(i / Spr.w) - Spr.oy >= -2, 'nothing points up');
    }
  });

  test('a big eye has a socket, a pupil and a glint, and a soft glow', () => {
    Spr.begin(40, 40);
    Spr.eye(0, 0, 4, '#ff0', {});
    assert.ok(count(MAT.EYE) > 10);
    assert.ok(count(MAT.PUPIL) > 0);
    assert.equal(count(MAT.WHITE), 1);
    assert.ok(count(MAT.DARK) > 0, 'socket');
    assert.equal(Spr.emit.length, 1);
    assert.ok(Spr.emit[0].r < 10 && Spr.emit[0].a <= .25, 'a small, faint glow');
  });

  test('a slit eye has a line for a pupil; glow:false has no glow', () => {
    Spr.begin(40, 40);
    Spr.eye(0, 0, 4, '#ff0', { slit: true, glow: false });
    for (let y = -2; y <= 2; y++) assert.equal(at(0, y)[0], MAT.PUPIL);
    assert.equal(Spr.emit.length, 0);
  });

  test('a tiny eye is a pixel or two, and only glows if asked', () => {
    Spr.begin(40, 40);
    Spr.eye(0, 0, 1, '#ff0', {});
    assert.equal(count(MAT.EYE), 2);
    assert.equal(Spr.emit.length, 0);
    Spr.eye(10, 0, 1, '#ff0', { glow: true });
    assert.equal(Spr.emit.length, 1);
  });

  test('a blinking eye is just a dark line', () => {
    Spr.begin(40, 40);
    Spr.eye(0, 0, 4, '#ff0', { blink: .1 });
    assert.equal(count(MAT.EYE), 0);
    assert.ok(count(MAT.DARK) >= 7);
  });
});

describe('putting a creature on the frame', () => {
  test('nothing drawn, nothing put on the frame', () => {
    Spr.begin(30, 30);
    rec.reset(); rec.startLog();
    Spr.finish(bctx, 100, 100, 1, pal(), 0);
    assert.equal(rec.stopLog().filter(e => e.fn === 'drawImage').length, 0);
  });

  test('it lands at whole game pixels, scaled by PIX, centred on its middle', () => {
    Spr.begin(40, 40);
    Spr.blob(0, 0, 4, 3, MAT.BODY, {});
    const f = finishAndRead(200, 100, 1, pal(), 0);
    assert.equal(f.dw, f.cw * PIX);
    assert.equal(f.dh, f.ch * PIX);
    // the ellipse is 9 wide plus an outline pixel either side
    assert.equal(f.cw, 11);
    assert.equal(f.dx, 200 - 5 * PIX);
  });

  test('a one-pixel outline goes round the silhouette, and the rest is see-through', () => {
    Spr.begin(40, 40);
    Spr.blob(0, 0, 4, 3, MAT.BODY, {});
    const P = pal();
    const f = finishAndRead(200, 100, 1, P, 0);
    assert.deepEqual(f.px(0, 4), Array.from(P.outline).concat(255), 'left edge');
    assert.deepEqual(f.px(5, 0), Array.from(P.outline).concat(255), 'top edge');
    assert.equal(f.px(0, 0)[3], 0, 'corner is empty');
    assert.equal(f.px(5, 4)[3], 255);
  });

  test('every body pixel comes from its material\'s five shades', () => {
    Spr.begin(40, 40);
    Spr.blob(0, 0, 8, 6, MAT.BODY, {});
    const P = pal();
    const shades = P[MAT.BODY].map(c => Array.from(c).join());
    const f = finishAndRead(200, 100, 1, P, 0);
    for (let y = 2; y < f.ch - 2; y++) {
      const c = f.px(Math.floor(f.cw / 2), y);
      assert.ok(shades.includes(c.slice(0, 3).join()), 'row ' + y + ': ' + c);
    }
  });

  test('facing the other way mirrors it about its middle', () => {
    Spr.begin(40, 40);
    Spr.poly([[0, -3], [6, 0], [0, 3]], MAT.BODY, .5);
    const right = finishAndRead(200, 100, 1, pal(), 0);
    const row = f => Array.from({ length: f.cw }, (_, x) => f.px(x, 4)[3] ? 1 : 0);
    const r = row(right);
    const left = finishAndRead(200, 100, -1, pal(), 0);
    assert.deepEqual(row(left), r.slice().reverse());
    assert.equal(right.dx, 200 - PIX);                   // one outline pixel behind x=0
    assert.equal(left.dx + left.dw, 200 + 2 * PIX);      // and the mirror of that
  });

  test('a hit flashes it nearly white', () => {
    Spr.begin(40, 40);
    Spr.blob(0, 0, 5, 5, MAT.BODY, {});
    const calm = finishAndRead(200, 100, 1, pal(), 0).px(6, 6);
    Spr.begin(40, 40);
    Spr.blob(0, 0, 5, 5, MAT.BODY, {});
    const hit = finishAndRead(200, 100, 1, pal(), 1).px(6, 6);
    assert.ok(hit[0] + hit[1] + hit[2] > calm[0] + calm[1] + calm[2] + 200, hit + " vs " + calm);
    assert.ok(hit.slice(0, 3).every(c => c > 200));
  });

  test('where one material sits on another the join is darker', () => {
    const P = pal();
    const draw = under => {
      Spr.begin(40, 40);
      Spr.poly([[-5, -5], [5, -5], [5, 1], [-5, 1]], MAT.BODY, .5);      // rows -5..0
      Spr.poly([[-5, 1], [5, 1], [5, 5], [-5, 5]], under, .5);         // rows 1..4
      return finishAndRead(200, 100, 1, P, 0).px(6, 6);
    };
    const same = draw(MAT.BODY), other = draw(MAT.FIN);
    const lum = c => c[0] + c[1] + c[2];
    assert.ok(lum(other) < lum(same), 'crease: ' + other + ' vs ' + same);
  });

  test('glows are drawn after the pixels, mirrored with the creature', () => {
    Spr.begin(40, 40);
    Spr.blob(0, 0, 3, 3, MAT.BODY, {});
    Spr.emit.push({ x: 5, y: 0, r: 3, col: '#fff', a: .5 });
    rec.reset(); rec.startLog();
    Spr.finish(bctx, 200, 100, -1, pal(), 0);
    const log = rec.stopLog();
    const draw = log.findIndex(e => e.fn === 'drawImage'), ring = log.findIndex(e => e.fn === 'ellipse');
    assert.ok(draw >= 0 && ring > draw);
    assert.equal(log[ring].args[0], 200 - 5 * PIX);
  });
});

describe('palettes', () => {
  test('five shades run from dark to light, shadows leaning cold', () => {
    const t = g.tones([150, 120, 60]);
    assert.equal(t.length, 5);
    const lum = c => c[0] + c[1] + c[2];
    for (let i = 1; i < 5; i++) assert.ok(lum(t[i]) > lum(t[i - 1]), 'shade ' + i);
    assert.ok(t[0][2] - t[0][0] > 60 - 150, 'the darkest shade is bluer than the colour');
  });

  test('each creature has one palette, and another when enraged', () => {
    const def = g.monsterDef('mother');
    const calm = g.beastPalette(def, false);
    assert.equal(g.beastPalette(def, false), calm);
    const rage = g.beastPalette(def, true);
    assert.notEqual(rage, calm);
    assert.ok(rage[g.MAT.EYE][2][0] > 200 && rage[g.MAT.EYE][2][1] < 100, 'red eyes');
    for (const m of ['BODY', 'BELLY', 'FIN', 'SHELL', 'MOUTH', 'TOOTH', 'BONE', 'EYE', 'GLOW', 'PUPIL', 'WHITE', 'DARK', 'GUM', 'METAL', 'WOOD']) {
      assert.equal(calm[g.MAT[m]].length, 5, m);
    }
  });
});

describe('every creature in the sea', () => {
  test('there is a body plan for every creature', () => {
    for (const def of ALL()) assert.equal(typeof g.Plans[def.plan], 'function', def.id + ' -> ' + def.plan);
  });

  test('none of them is cut off by its drawing buffer, in any pose, at any size', () => {
    for (const def of ALL()) {
      for (const extra of [{}, { gape: 1.2, thrashAmt: 3, rot: .6, rage: true }, { gape: 0, rot: -.6, face: -1, thrashAmt: 3, len: def.len * .5 }]) {
        for (const t of [0, 1.9]) {
          for (const len of [extra.len || def.len]) {
            g.Beast.draw(bctx, pose(def, Object.assign({ len }, extra)), t);
            const where = `${def.id} t=${t} len=${len} ${JSON.stringify(extra)}`;
            assert.ok(Spr.x1 >= Spr.x0, 'drew something: ' + where);
            assert.ok(Spr.x0 > 1 && Spr.y0 > 1 && Spr.x1 < Spr.w - 2 && Spr.y1 < Spr.h - 2, 'clipped: ' + where);
          }
        }
      }
    }
  });

  test('each is about as long as its length says', () => {
    for (const def of ALL()) {
      g.Beast.draw(bctx, pose(def), 1.3);
      const span = (Spr.x1 - Spr.x0 + 1) * PIX;
      assert.ok(span > def.len * .6 && span < def.len * 1.7, `${def.id}: ${span} for len ${def.len}`);
    }
  });

  test('they move: two moments apart, the pixels differ', () => {
    for (const def of ALL()) {
      g.Beast.draw(bctx, pose(def), 1);
      const a = Spr.mat.slice(0, Spr.w * Spr.h);
      g.Beast.draw(bctx, pose(def), 1.4);
      const b = Spr.mat.slice(0, Spr.w * Spr.h);
      assert.notDeepEqual(a, b, def.id);
    }
  });

  test('the ones that have eyes show them', () => {
    const t = 1.3, seed = 7;
    assert.ok(!(Math.sin(t * 1.7 + seed) > .93 || Math.sin(t * .7 + seed * 2) > .97), 'not mid-blink');
    for (const def of ALL().filter(d => d.eyes !== 0)) {
      g.Beast.draw(bctx, pose(def, { seed }), t);
      assert.ok(count(MAT.EYE) > 0, def.id);
    }
  });

  test('the biters open their mouths wider when they gape', () => {
    for (const def of ALL().filter(d => ['eel', 'angler', 'maw', 'leviathan', 'mother'].includes(d.plan))) {
      g.Beast.draw(bctx, pose(def, { gape: 0 }), 1);
      const shut = count(MAT.MOUTH);
      g.Beast.draw(bctx, pose(def, { gape: 1 }), 1);
      assert.ok(count(MAT.MOUTH) > shut, def.id);
    }
  });

  test('bosses light up when enraged', () => {
    for (const id of ['leviathan', 'mother']) {
      const def = g.monsterDef(id);
      g.Beast.draw(bctx, pose(def, { rage: false }), 1);
      const calm = count(MAT.GLOW);
      g.Beast.draw(bctx, pose(def, { rage: true }), 1);
      assert.ok(count(MAT.GLOW) > calm + 20, id);
    }
  });

  test('turning a creature tilts its pixels', () => {
    const def = g.monsterDef('ropethroat');
    g.Beast.draw(bctx, pose(def, { rot: 0, thrashAmt: 0 }), 1);
    const flat = Spr.y1 - Spr.y0;
    g.Beast.draw(bctx, pose(def, { rot: .6, thrashAmt: 0 }), 1);
    assert.ok(Spr.y1 - Spr.y0 > flat * 2);
  });

  test('glows stay small: no creature is lost in its own halo', () => {
    for (const def of ALL()) {
      g.Beast.draw(bctx, pose(def), 1.3);
      const H = Math.max(2, def.len / PIX * (def.girth || .27));
      for (const e of Spr.emit) assert.ok(e.r <= Math.max(10, H * 1.1), `${def.id}: glow r ${e.r} vs H ${H}`);
    }
  });

  test('on deck a creature has a stepped shadow; underwater it has none', () => {
    const def = g.monsterDef('gnashfin');
    rec.reset(); rec.startLog();
    g.Beast.draw(bctx, pose(def, { noShadow: false }), 1);
    const withShadow = rec.stopLog().filter(e => e.fn === 'fillRect').length;
    rec.reset(); rec.startLog();
    g.Beast.draw(bctx, pose(def, { noShadow: true }), 1);
    assert.equal(rec.stopLog().filter(e => e.fn === 'fillRect').length, withShadow - 3);
    assert.equal(rec.depth(), 0);
  });

  test('Art.monster is the pixel artist now', () => {
    const def = g.monsterDef('choir');
    rec.reset(); rec.startLog();
    g.Art.monster(bctx, pose(def), 2);
    const log = rec.stopLog();
    assert.equal(log.filter(e => e.fn === 'drawImage').length, 1);
    assert.equal(log.filter(e => e.fn === 'quadraticCurveTo' || e.fn === 'bezierCurveTo').length, 0, 'no vector curves');
    assert.equal(plain(g.Spr._pool.size > 0), true);
  });
});

describe('drawing on twos', () => {
  const begins = fn => {
    const orig = Spr.begin;
    let n = 0;
    Spr.begin = function (...a) { n++; return orig.apply(this, a); };
    try { fn(); } finally { Spr.begin = orig; }
    return n;
  };
  const blits = fn => { rec.reset(); rec.startLog(); fn(); return rec.stopLog().filter(e => e.fn === 'drawImage'); };
  const withCache = fn => { g.Beast.cache = true; g.Beast._held.clear(); try { fn(); } finally { g.Beast.cache = false; } };

  test('within one animation step a creature is put down again without re-drawing it', () => {
    withCache(() => {
      const def = g.monsterDef('trenchmaw');
      const t = 2 / g.Beast.STEPS + .001;
      let first, second;
      const n = begins(() => {
        first = blits(() => g.Beast.draw(bctx, pose(def), t));
        second = blits(() => g.Beast.draw(bctx, pose(def, { x: 520, y: 300 }), t + .3 / g.Beast.STEPS));
      });
      assert.equal(n, 1, 'rasterised once');
      assert.equal(first.length, 1);
      assert.equal(second.length, 1, 'and still drawn the second time');
      assert.equal(second[0].args[5] - first[0].args[5], 40, 'where it has swum to');
      assert.equal(second[0].args[6] - first[0].args[6], 30);
      assert.equal(second[0].args[0], first[0].args[0], 'from the same pixels');
    });
  });

  test('the next step, a bite, a hit, a turn or rage all draw it afresh', () => {
    withCache(() => {
      const def = g.monsterDef('leviathan');
      const t = 1;
      g.Beast.draw(bctx, pose(def), t);
      for (const change of [[{}, t + 1 / g.Beast.STEPS], [{ gape: 1 }, t], [{ flash: 1 }, t], [{ rot: .3 }, t], [{ face: -1 }, t], [{ rage: true }, t], [{ thrashAmt: 3 }, t]]) {
        assert.equal(begins(() => g.Beast.draw(bctx, pose(def, change[0]), change[1])), 1, JSON.stringify(change));
        g.Beast.draw(bctx, pose(def), t);
      }
    });
  });

  test('two of the same creature keep their own pixels', () => {
    withCache(() => {
      const def = g.monsterDef('shelfcrab');
      const n = begins(() => {
        for (let i = 0; i < 4; i++) {
          g.Beast.draw(bctx, pose(def, { seed: 3, gape: 0 }), 1);
          g.Beast.draw(bctx, pose(def, { seed: 9, gape: 1 }), 1);
        }
      });
      assert.equal(n, 2);
    });
  });

  test('the cached drawing is exactly what a fresh one would be', () => {
    const def = g.monsterDef('penance');
    const draw = () => blits(() => g.Beast.draw(bctx, pose(def, { rot: .123, gape: .37, flash: .3 }), 1.2345))[0].args.slice(1);
    const fresh = draw();
    let cached;
    withCache(() => { draw(); cached = draw(); });
    assert.deepEqual(cached, fresh);
  });

  test('a third of them change on each frame, so they do not all redraw at once', () => {
    withCache(() => {
      const def = g.monsterDef('shelfcrab');
      const redraws = [];
      for (let f = 0; f < 15; f++) {
        const t = 1 + f / 60;
        redraws.push(begins(() => { for (const seed of [3, 4, 5]) g.Beast.draw(bctx, pose(def, { seed }), t); }));
      }
      assert.deepEqual(redraws.slice(3), new Array(12).fill(1), 'one of the three each frame: ' + redraws);
    });
  });

  test('leaning or biting a little keeps the step; leaning or biting a lot ends it', () => {
    withCache(() => {
      const def = g.monsterDef('gulperwidow');
      const t = 3 + .1 / g.Beast.STEPS;
      g.Beast.draw(bctx, pose(def, { rot: .1, gape: .3 }), t);
      assert.equal(begins(() => g.Beast.draw(bctx, pose(def, { rot: .12, gape: .35 }), t)), 0, 'a little');
      assert.equal(begins(() => g.Beast.draw(bctx, pose(def, { rot: .2, gape: .35 }), t)), 1, 'a lean');
      assert.equal(begins(() => g.Beast.draw(bctx, pose(def, { rot: .2, gape: .6 }), t)), 1, 'a bite');
    });
  });

  test('creatures that stop being drawn are let go', () => {
    withCache(() => {
      const gone = g.monsterDef('gnashfin'), stays = g.MINNOW;
      g.Beast.draw(bctx, pose(gone), 1);
      for (let i = 0; i < 1300; i++) g.Beast.draw(bctx, pose(stays), 1);
      assert.equal(g.Beast._held.size, 1);
    });
  });
});
