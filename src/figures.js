'use strict';
/* ========================================================================
   figures.js — the people and what they carry, as pixel art.

   Everything here is drawn at the workbench in beasts.js, in whole buffer
   pixels, through a little transform rig so limbs can swing and turn. Each
   figure is posed from a handful of numbers, rounded into a pose key, and
   drawn through the sprite cache: the same pose is never rasterised twice
   in a row. Every figure faces +x; facing left is a mirror at the end.
   ======================================================================== */

/* ------------------------------- the rig ------------------------------- */

const Rig = {
  m: [1, 0, 0, 1, 0, 0], st: [],
  begin() { this.m = [1, 0, 0, 1, 0, 0]; this.st.length = 0; },
  save() { this.st.push(this.m.slice()); },
  restore() { this.m = this.st.pop() || [1, 0, 0, 1, 0, 0]; },
  translate(x, y) { const m = this.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; },
  rotate(a) {
    const c = Math.cos(a), s = Math.sin(a), m = this.m;
    const a0 = m[0], b0 = m[1], c0 = m[2], d0 = m[3];
    m[0] = a0 * c + c0 * s; m[1] = b0 * c + d0 * s;
    m[2] = c0 * c - a0 * s; m[3] = d0 * c - b0 * s;
  },
  scale(sx, sy) { const m = this.m; m[0] *= sx; m[1] *= sx; m[2] *= sy; m[3] *= sy; },
  pt(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
  k() { return Math.hypot(this.m[0], this.m[1]); },
  poly(pts, mat, lit) { Spr.poly(pts.map(p => this.pt(p[0], p[1])), mat, lit); },
  box(x, y, w, h, mat, lit) { this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], mat, lit); },
  line(pts, r0, r1, mat, lit) {
    const k = this.k();
    Spr.stroke(pts.map(p => this.pt(p[0], p[1])), r0 * k, (r1 === undefined ? r0 : r1) * k, mat, lit);
  },
  ell(x, y, rx, ry, mat, o) {
    const p = this.pt(x, y), k = this.k();
    Spr.oval(p[0], p[1], Math.max(.5, rx * k), Math.max(.5, ry * k), Math.atan2(this.m[1], this.m[0]), mat, o || {});
  },
  dot(x, y, mat, lit) { const p = this.pt(x, y); Spr.plot(p[0], p[1], mat, lit); },
  // an elliptical hoop, drawn as a line round it
  ring(x, y, rx, ry, r, mat, lit) {
    const pts = [];
    for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI * 2; pts.push([x + Math.cos(a) * rx, y + Math.sin(a) * ry]); }
    this.line(pts, r, r, mat, lit);
  },
  glow(x, y, r, col, a) { const p = this.pt(x, y); Spr.emit.push({ x: p[0], y: p[1], r, col, a }); }
};

// round a number into a pose key
const q = (v, step) => Math.round((v || 0) / step);

// a soft stepped shadow at someone's feet, in game pixels
function feetShadow(g, x, y, w) {
  g.fillStyle = 'rgba(0,0,0,.26)';
  g.fillRect(snap(x - w), snap(y - 2), snap(w * 2), 4);
  g.fillRect(snap(x - w * .7), snap(y), snap(w * 1.4), 2);
}

/* ------------------------------ the boy ------------------------------
   A sou'wester pulled so low you never quite see his face: one eye catches
   the light under the brim, and that is all. Feet at (0, 0).           */

const BOY_COLORS = {
  BODY: '#e2aa3a', BELLY: '#efc08e', FIN: '#34527a', SHELL: '#dca33a', GUM: '#b4464a',
  C1: '#5e3c24', DARK: '#1c141e', WOOD: '#6b4a2a', C2: '#26252e', EYE: '#fff1c0', METAL: '#9aa6b4', BONE: '#d9d2b8',
  outline: '#1a1018'
};

function boyPalette(w) {
  const key = 'boy:' + (w ? w.id : '-');
  return spritePalette(key, Object.assign({}, BOY_COLORS, w ? {
    METAL: w.metal, WOOD: w.grip, C3: w.accent, GLOW: w.id === 'excalibur' ? '#fff4c0' : w.metal, WHITE: '#fffcee'
  } : {}));
}

// his limbs: a leg from the hip, bending at the knee
function boyLeg(hx, hy, swing, knee, lit) {
  Rig.save();
  Rig.translate(hx, hy);
  Rig.rotate(swing);
  Rig.line([[0, 0], [0, 3.6]], 1.6, 1.5, MAT.FIN, lit);
  Rig.translate(0, 3.6);
  Rig.rotate(knee);
  Rig.line([[0, 0], [0, 3.2]], 1.5, 1.4, MAT.FIN, lit - .05);
  Rig.poly([[-1.6, 2.6], [2.6, 2.6], [3, 4.2], [-1.6, 4.2]], MAT.C2, lit - .1);
  Rig.restore();
}

function boyArm(sx, sy, angle, lit, hold) {
  Rig.save();
  Rig.translate(sx, sy);
  Rig.rotate(angle);
  Rig.line([[0, 0], [0, 6.6]], 1.7, 1.5, MAT.BODY, lit);
  Rig.ell(0, 7.4, 1.3, 1.2, MAT.BELLY, { lit: lit + .1 });
  if (hold) { Rig.translate(0, 8); hold(); }
  Rig.restore();
}

const Figures = {

  boy(o) {
    const st = o.state || 'idle', t = o.t || 0;
    const w = o.hold === 'weapon' ? (o.weapon || WEAPONS[0]) : null;
    let legA = 0, legB = 0, kneeA = 0, kneeB = 0, bob = 0, lean = 0, armA = 0, armB = 0;
    if (st === 'walk') {
      const p = Math.sin(t * 12);
      legA = p * .55; legB = -p * .55;
      kneeA = Math.max(0, -p) * .7; kneeB = Math.max(0, p) * .7;
      armA = -p * .45; armB = p * .45;
      bob = Math.abs(Math.cos(t * 12)) > .7 ? 1 : 0;
      lean = .08;
    } else if (st === 'jump') {
      legA = -.55; kneeA = 1.1; legB = .35; kneeB = .6; armA = -1.9; armB = -1.4; lean = .05;
    } else if (st === 'hurt') {
      armA = -2.2; armB = -2.4; legA = .3; lean = -.25;
    } else {
      bob = Math.sin(t * 2.4) > .3 ? 1 : 0;
      armA = Math.sin(t * 2.4) * .08;
    }
    const sq = o.squash === undefined ? 1 : o.squash;

    // flat out on the deck, where Dorran dropped him
    if (st === 'lie') { Rig.translate(12, -3.5); Rig.rotate(-Math.PI / 2); }

    if (st === 'roll') {
      Rig.translate(0, -8.5);
      Rig.rotate((o.rollT || 0) * 6.9);
      Rig.ell(0, 0, 7.5, 7.5, MAT.BODY, {});
      Rig.poly([[-6, 1], [6, 1], [5, 5], [-5, 5]], MAT.FIN, .45);
      Rig.box(-6.5, 3, 4, 3, MAT.C2, .3); Rig.box(2.5, 3, 4, 3, MAT.C2, .3);
      Rig.poly([[-7, -3], [4, -6], [6, -4], [-6, -1]], MAT.SHELL, .7);
      Rig.box(-3, -2, 6, 1.4, MAT.GUM, .5);
      return;
    }

    Rig.translate(0, -bob);
    if (sq !== 1) Rig.scale(1 / sq, sq);
    Rig.rotate(lean);

    // behind him: the far arm and leg
    boyArm(-2.5, -16, o.backArm !== undefined ? o.backArm : armB, .28, null);
    boyLeg(-1.2, -8.5, legB, kneeB, .3);
    boyLeg(1.4, -8.5, legA, kneeA, .52);

    // the oilskin: a long coat, front lit, a row of toggles
    Rig.poly([[-4.4, -17.2], [4.2, -17.2], [5, -9.4], [5.6, -6.8], [-5.2, -6.8], [-4.8, -9.4]], MAT.BODY,
      (x, y) => .45 + clamp((x - Rig.pt(0, 0)[0]) / 10, -.2, .2));
    Rig.box(-5, -8, 10.6, 1.2, MAT.BODY, .3);
    Rig.dot(3, -14.5, MAT.C1, .4); Rig.dot(3, -11.5, MAT.C1, .4);
    Rig.box(-4.6, -10.6, 9.4, .9, MAT.C1, .35);

    // the red scarf, its loose end streaming when he moves
    Rig.box(-4, -18.6, 8, 1.8, MAT.GUM, .55);
    const flutter = st === 'walk' || st === 'jump' ? Math.round(Math.sin(t * 9)) : 0;
    if (st === 'walk' || st === 'jump') Rig.line([[-3.5, -18], [-6.5, -17.6 + flutter], [-9, -17 - flutter]], 1, .7, MAT.GUM, .45);
    else Rig.line([[-3.5, -17.8], [-4.2, -14 + (Math.sin(t * 3) > .6 ? 1 : 0)]], 1, .8, MAT.GUM, .42);

    // head: a face in the shade of the brim
    Rig.save();
    Rig.translate(0, -19);
    Rig.rotate(st === 'walk' ? Math.sin(t * 12 + 1) * .04 : 0);
    Rig.ell(.6, -3.2, 3.6, 3.4, MAT.BELLY, {});
    Rig.dot(4.2, -2.6, MAT.BELLY, .75);                       // nose
    Rig.poly([[-3.4, -6.2], [-.4, -6.2], [-.6, -.4], [-3.8, -1.2]], MAT.C1, .4);   // hair
    Rig.poly([[.4, -6], [4.6, -6], [4.4, -3.8], [.6, -3.4]], MAT.DARK, .1);        // the shade
    Rig.dot(2.8, -4.2, MAT.EYE, Math.sin(t * .7) > .95 ? .2 : 1);                  // an eye in it
    Rig.dot(3.2, -1.2, MAT.BELLY, .35);                       // mouth
    // the sou'wester: round crown, short front brim, long back brim
    Rig.ell(-.2, -7.4, 3.8, 2.4, MAT.SHELL, {});
    Rig.poly([[-4.4, -6.2], [5.6, -6.2], [5.2, -5.1], [-4.4, -5.1]], MAT.SHELL, .62);
    Rig.poly([[-5, -6.4], [-2.2, -6.4], [-3, -.6], [-6.4, -1.8]], MAT.SHELL, .45);
    Rig.dot(-1.2, -9, MAT.SHELL, .95);
    Rig.restore();

    // the near arm, and whatever it holds
    const fa = o.frontArm !== undefined ? o.frontArm : armA;
    boyArm(3, -16, fa, .58, () => {
      if (o.hold === 'rod') {
        Rig.rotate(o.rodAngle === undefined ? -.9 : o.rodAngle);
        Figures.rod(o.rodBend || 0);
      } else if (w) {
        Rig.rotate(o.weaponAngle === undefined ? -.5 : o.weaponAngle);
        Figures.weapon(w, t, o.swingP || 0);
      }
    });
  },

  // where the rod tip is, in game pixels from his feet, for a boy drawn with these options:
  // the fishing line is tied on here, so it follows the same joints the sprite does
  rodTip(o) {
    const t = o.t || 0, sq = o.squash === undefined ? 1 : o.squash, bend = q(o.rodBend, 2) * 2;
    Rig.begin();
    Rig.translate(0, -(Math.sin(t * 2.4) > .3 ? 1 : 0));
    if (sq !== 1) Rig.scale(1 / sq, sq);
    Rig.translate(3, -16); Rig.rotate(q(o.frontArm, .07) * .07);
    Rig.translate(0, 8); Rig.rotate(q(o.rodAngle, .025) * .025);
    const p = Rig.pt(39, -5 + bend * .5);
    return { x: Math.round(p[0]) * PIX * (o.face < 0 ? -1 : 1), y: Math.round(p[1]) * PIX };
  },

  // the rod, from the hand along +x: 39 pixels, bending toward its tip
  rod(bend) {
    const L = 39, b = bend * .5;
    Rig.line([[0, 0], [L * .35, -.8], [L * .7, -2 + b * .35], [L, -5 + b]], 1.1, .5, MAT.WOOD, (u) => .5 + u * .15);
    Rig.line([[-1, 0], [L * .2, -.3]], 1.4, 1.2, MAT.C1, .45);
    Rig.ell(4.5, 2.2, 1.9, 1.9, MAT.METAL, {});
    Rig.dot(4.5, 2.2, MAT.DARK, .1);
    Rig.dot(L, -5 + b, MAT.METAL, .8);
  },

  /* every deck weapon, from the grip with the business end toward +x */
  weapon(w, t, swingP) {
    const L = 23 * (w.reach || 1);
    switch (w.kind) {
      case 'net': {
        Rig.line([[-3, 0], [L * .62, 0]], 1.2, 1.1, MAT.WOOD, .5);
        const hx = L * .62, drag = swingP * 4;
        for (let i = 0; i < 4; i++) Rig.line([[hx, -7 + i * 4.6], [hx + 6 - drag, -3 + i * 2], [hx + 10 - drag, i - 1.5]], .45, .4, MAT.BONE, .55);
        Rig.line([[hx + 5 - drag * .5, -6], [hx + 5 - drag * .5, 6]], .4, .4, MAT.BONE, .5);
        Rig.ring(hx, 0, 2, 7.5, .8, MAT.METAL, .65);
        break;
      }
      case 'gaff': {
        Rig.line([[-3, 0], [L * .78, 0]], 1.3, 1.2, MAT.WOOD, .5);
        for (let i = 0; i < 3; i++) Rig.box(L * .5 + i * 2.6, -1.6, 1.2, 3.2, MAT.C3, .55);
        Rig.line([[L * .76, 0], [L * 1.02, -.6], [L * .98, 7], [L * .8, 10], [L * .74, 8]], 1.2, .6, MAT.METAL, (u) => .75 - u * .25);
        break;
      }
      case 'cleaver': {
        Rig.box(-4, -2, 9, 4, MAT.WOOD, .45);
        Rig.box(5, -3, 2, 6, MAT.C3, .5);
        const bw = L * .8;
        Rig.poly([[7, -3.5], [7 + bw * .82, -7], [7 + bw, -4], [7 + bw, 2], [7 + bw * .5, 5.5], [7, 3.5]], MAT.METAL, (x, y) => .62 - (y - Rig.pt(0, 0)[1]) * .02);
        Rig.line([[8, 3.2], [7 + bw * .5, 5], [7 + bw - .5, 1.8]], .45, .45, MAT.WHITE, 1);
        Rig.dot(7 + bw * .45, -1, MAT.C1, .3);
        break;
      }
      case 'harpoon': {
        Rig.line([[-7, 0], [L * .86, 0]], 1, 1, MAT.WOOD, .5);
        Rig.box(L * .66, -1.8, 2.4, 3.6, MAT.C3, .55);
        const hx = L * .84;
        Rig.poly([[hx, -2.2], [L * 1.14, 0], [hx, 2.2]], MAT.METAL, .7);
        Rig.poly([[hx + 1, -1.8], [hx - 4.5, -6], [hx + 2.5, -1]], MAT.METAL, .6);
        Rig.poly([[hx + 1, 1.8], [hx - 4.5, 6], [hx + 2.5, 1]], MAT.METAL, .45);
        Rig.line([[-7, 0], [-12, 3 + Math.sin(t * 6) * 1.5], [-16, 2]], .5, .4, MAT.BONE, .5);
        break;
      }
      case 'chain': {
        const p = swingP || .4, n = 10;
        for (let i = 0; i < n; i++) {
          const f = i / (n - 1);
          const x = f * L * 1.05, y = Math.sin(f * 2.6 + t * 3) * (1 - p) * 6 + f * p * 2;
          Rig.ell(x, y, 2.2, 1.5, i % 2 ? MAT.METAL : MAT.C3, { lit: .55 });
          Rig.ell(x, y, .9, .5, MAT.DARK, { lit: .1 });
        }
        const ex = L * 1.05, ey = Math.sin(2.6 + t * 3) * (1 - p) * 6 + p * 2;
        Rig.line([[ex, ey], [ex + 6, ey + 1], [ex + 5, ey + 7], [ex, ey + 8.5]], 1.2, .8, MAT.METAL, .65);
        Rig.box(-4, -2, 5, 4, MAT.WOOD, .4);
        break;
      }
      case 'excalibur': {
        // a crossguard of gold, a grip wound in blue, and a blade that will not stop shining
        Rig.box(-5, -1.3, 6, 2.6, MAT.WOOD, .45);
        Rig.ell(-6, 0, 1.6, 1.6, MAT.C3, { lit: .8 });
        Rig.box(1, -5, 2.4, 10, MAT.C3, .7);
        Rig.poly([[3.4, -2.2], [L * 1.18, -1], [L * 1.3, 0], [L * 1.18, 1], [3.4, 2.2]], MAT.METAL, (x, y) => .72);
        Rig.line([[4, -.4], [L * 1.2, -.2]], .5, .4, MAT.WHITE, 1);
        Rig.glow(L * .7, 0, 14, '#fff4c0', .22 + Math.sin(t * 4) * .06);
        break;
      }
      case 'tooth':
      default: {
        Rig.box(-4, -2.2, 8.5, 4.4, MAT.WOOD, .42);
        Rig.box(4.5, -4, 2.5, 8, MAT.C3, .55);
        const bl = L * 1.06;
        Rig.poly([[6.5, -2.7], [6.5 + bl * .3, -5.8], [6.5 + bl * .7, -5.6], [6.5 + bl, -1.5], [6.5 + bl * .6, 1], [6.5, 2.7]], MAT.BONE, (x, y) => .72);
        for (let i = 0; i < 5; i++) Rig.dot(6.5 + bl * (.18 + i * .14), -3 + i * .5, MAT.WHITE, .9);
        Rig.line([[6.5 + bl * .1, -1], [6.5 + bl * .8, -3.6]], .4, .3, MAT.C1, .5);
        break;
      }
    }
  }
};

/* ----------------------------- drawn by Art ----------------------------- */

Object.assign(Art, {
  // the boy; the same options as ever: face, t, state, squash, air, rollT, lunge,
  // hold ('rod' | 'weapon'), weapon, weaponAngle, frontArm, backArm, swingP, rodAngle, rodBend
  boy(g, x, y, o) {
    o = o || {};
    const f = o.face === undefined ? 1 : o.face, t = o.t || 0, st = o.state || 'idle';
    feetShadow(g, x, y + (o.air || 0), 16);
    const w = o.hold === 'weapon' ? (o.weapon || WEAPONS[0]) : null;
    const walkStep = st === 'walk' ? q((t * 12) % (Math.PI * 2), Math.PI / 4) : 0;
    const pose = [
      st, walkStep, st === 'idle' ? (Math.sin(t * 2.4) > .3 ? 1 : 0) + (Math.sin(t * .7) > .95 ? 2 : 0) : 0,
      st === 'roll' ? q(o.rollT, .02) : 0, q(o.squash === undefined ? 1 : o.squash, .03),
      o.hold || '-', w ? w.id : '-', q(o.weaponAngle, .07), q(o.frontArm, .07), q(o.backArm, .07),
      q(o.swingP, .12), q(o.rodAngle, .025), q(o.rodBend, 2),
      (w && (w.kind === 'chain' || w.kind === 'harpoon' || w.kind === 'excalibur')) || st === 'walk' || st === 'jump' ? q(t % 6.3, .15) : 0
    ].join(',');
    Sprite.draw(g, 'boy', pose, x + (o.lunge || 0) * f, y, {
      w: 110, h: 110, face: f, pal: boyPalette(w),
      paint: () => { Rig.begin(); Figures.boy(o); }
    });
  },

  // a deck weapon on its own, from the grip (for the shop and the like)
  weapon(g, w, t, swingP) {
    if (!w) return;
    Sprite.draw(g, 'weapon:' + w.id, [q(t % 6.3, .15), q(swingP, .12)].join(','), 0, 0, {
      w: 90, h: 50, face: 1, pal: boyPalette(w),
      paint: () => { Rig.begin(); Rig.translate(-20, 0); Figures.weapon(w, t || 0, swingP || 0); }
    });
  }
});

/* ------------------------------- everyone else ------------------------------- */

const DAD_COLORS = {
  BODY: '#40536b', FIN: '#3a3f4d', C2: '#23242c', BELLY: '#e0b083', SHELL: '#26303f', C1: '#8d8f9b',
  WOOD: '#5a3f28', METAL: '#c9a44c', DARK: '#1a1620', outline: '#12101a'
};
const DORRAN_COLORS = {
  BODY: '#3e5a4a', FIN: '#2f3a35', BELLY: '#dcae86', C2: '#c96a5c', SHELL: '#2c3632', GUM: '#7d4a3a',
  C1: '#8a7c70', METAL: '#a8b0b8', DARK: '#1a1620', outline: '#12101a'
};
const NERYS_COLORS = {
  BELLY: '#b9d4cc', C2: '#17313d', C3: '#2c5866', BODY: '#35604a', BONE: '#e6dbbf', GLOW: '#9ff0ff',
  FIN: '#7fb3ad', EYE: '#9ff0ff', DARK: '#0e2a34', outline: '#0a1418'
};

Object.assign(Figures, {

  // Dad: pea coat, cap, a grey beard, and a pipe that never goes out. Feet at (0, 0).
  dad(o) {
    const t = o.t || 0, walk = o.state === 'walk';
    const p = walk ? Math.sin(t * 9) : 0;
    Rig.translate(0, walk && Math.abs(Math.cos(t * 9)) > .7 ? -1 : 0);
    const leg = (hx, a, lit) => {
      Rig.save(); Rig.translate(hx, -12.5); Rig.rotate(a);
      Rig.line([[0, 0], [0, 11]], 2.3, 2.1, MAT.FIN, lit);
      Rig.poly([[-2.4, 10], [4, 10], [4.4, 12.6], [-2.4, 12.6]], MAT.C2, lit - .1);
      Rig.restore();
    };
    const arm = (sx, a, lit) => {
      Rig.save(); Rig.translate(sx, -26); Rig.rotate(a);
      Rig.line([[0, 0], [0, 10]], 2.3, 2, MAT.BODY, lit);
      Rig.ell(0, 11, 1.8, 1.7, MAT.BELLY, { lit: lit + .1 });
      Rig.restore();
    };
    arm(-5, p * .35, .28);
    leg(-2.4, -p * .45, .3);
    leg(2.6, p * .45, .52);
    Rig.poly([[-7, -28.5], [7, -28.5], [7.8, -12], [-7.8, -12]], MAT.BODY, (x) => .45 + clamp((x - Rig.pt(0, 0)[0]) / 16, -.18, .18));
    Rig.box(-7.8, -17.5, 15.6, 1.4, MAT.DARK, .15);
    Rig.box(-.8, -18, 1.8, 2.2, MAT.METAL, .7);
    Rig.dot(3.5, -24, MAT.METAL, .6); Rig.dot(3.5, -21, MAT.METAL, .6);
    Rig.box(-6.8, -30.6, 13.6, 2.6, MAT.BODY, .62);
    // head: weathered, bearded, with the cap pulled down
    Rig.ell(.6, -34.5, 5, 4.8, MAT.BELLY, {});
    Rig.ell(5.8, -34, 1.5, 1.3, MAT.BELLY, { lit: .72 });
    Rig.poly([[-4.2, -32.2], [-1, -32.4], [1, -31], [5.4, -31.4], [5, -29], [.5, -28], [-3.4, -29]], MAT.C1, .45);
    Rig.box(2.6, -32.8, 3.4, .9, MAT.C1, .55);
    Rig.dot(4.4, -31.8, MAT.DARK, .2);
    Rig.box(1.8, -37.8, 3.8, 1, MAT.C1, .6);
    Rig.dot(3.6, -36.2, MAT.DARK, .05);
    Rig.poly([[-5.6, -38.2], [5.2, -38.2], [5.6, -42], [-5, -42.6]], MAT.SHELL, .45);
    Rig.poly([[1, -38.6], [9.2, -38], [9.2, -36.9], [1, -37.4]], MAT.SHELL, .3);
    Rig.box(-5, -41.4, 10, .9, MAT.SHELL, .7);
    if (o.pipe !== false) {
      Rig.line([[5, -31], [9.4, -30.6]], .7, .7, MAT.WOOD, .5);
      Rig.box(8.6, -33.6, 2.4, 3.2, MAT.WOOD, .55);
      Rig.dot(9.6, -33.8, MAT.C2 === undefined ? MAT.DARK : MAT.DARK, .1);
    }
    arm(5, -p * .35, .56);
  },

  // Dorran behind his counter: long coat, hat, a nose like a plum, a flask. Feet at (0, 0).
  dorran(o) {
    const t = o.t || 0;
    const hic = (t % 3.7) < .12 ? 1 : 0;
    // every so often, a drink: the arm comes up with the flask
    const cyc = t % 9, drink = cyc > 6.5 && cyc < 8 ? Math.sin((cyc - 6.5) / 1.5 * Math.PI) : 0;
    const sway = Math.round(Math.sin(t * 1.3) * 1);
    Rig.translate(sway * .5, -hic);
    Rig.line([[-2.5, -12], [-2.5, 0]], 2, 2, MAT.FIN, .3);
    Rig.line([[2.5, -12], [2.5, 0]], 2, 2, MAT.FIN, .45);
    // far arm, on the counter
    Rig.save(); Rig.translate(-5, -27); Rig.rotate(.7);
    Rig.line([[0, 0], [0, 10]], 2.2, 2, MAT.BODY, .28);
    Rig.restore();
    Rig.poly([[-7, -29.5], [7, -29.5], [8, -5], [-8, -5]], MAT.BODY, (x) => .42 + clamp((x - Rig.pt(0, 0)[0]) / 16, -.16, .16));
    Rig.box(-6, -18, 12, 1.2, MAT.DARK, .2);
    Rig.box(-6.6, -32, 13.2, 3, MAT.GUM, .5);
    Rig.line([[-4.5, -30], [-6, -24 + Math.round(Math.sin(t * 2))]], 1.2, 1, MAT.GUM, .42);
    // head: a red nose, stubble, eyes half shut
    Rig.save(); Rig.translate(0, -36); Rig.rotate(Math.sin(t * 1.3) * .05);
    Rig.ell(0, 0, 5, 5, MAT.BELLY, {});
    Rig.poly([[-4, 1.4], [4.6, 1.4], [3.6, 4.6], [-3, 4.6]], MAT.C1, .45);
    Rig.ell(5.4, .8, 2.4, 2, MAT.C2, {});
    Rig.dot(2.8, 2, MAT.C2, .5);
    Rig.box(1.2, -1.8, 2.6, .9, MAT.DARK, .1);
    Rig.box(3.5, 3.4, 1.8, .8, MAT.DARK, .15);
    // the hat: wide, soft, dented
    Rig.ell(0, -4.6, 8.6, 1.8, MAT.SHELL, { lit: .4 });
    Rig.poly([[-4.6, -4.8], [4.2, -4.8], [3.8, -10], [-4.2, -9.4]], MAT.SHELL, .5);
    Rig.box(-4.6, -6, 8.8, 1, MAT.GUM, .45);
    Rig.restore();
    // near arm: on the counter, or bringing the flask up
    Rig.save(); Rig.translate(5, -27); Rig.rotate(lerp(.9, -2.5, drink));
    Rig.line([[0, 0], [0, 9]], 2.3, 2.1, MAT.BODY, .55);
    Rig.ell(0, 10, 1.8, 1.7, MAT.BELLY, { lit: .6 });
    if (drink > .05) { Rig.box(-1.6, 9, 3.2, 5, MAT.METAL, .7); Rig.dot(0, 14.4, MAT.METAL, .9); }
    Rig.restore();
  },

  // Nerys, from Lanthorne: stand, sit, rise (hauled up by her hair), swim. Feet at (0, 0);
  // swimming, (0, 0) is her middle.
  nerys(o) {
    const t = o.t || 0, pose = o.pose || 'stand';
    const swim = pose === 'swim', sit = pose === 'sit', rise = pose === 'rise';
    if (swim) { Rig.rotate(Math.PI / 2 + (o.rot || 0)); Rig.translate(0, 15); }
    else if (o.rot) { Rig.translate(0, -15); Rig.rotate(o.rot); Rig.translate(0, 15); }
    const low = sit ? 7 : 0;
    const kick = swim ? Math.sin(t * 9) * .35 : 0;
    const drift = Math.sin(t * 2.2);
    // hair: long, behind everything, pulled up or streaming
    if (rise) Rig.poly([[-3.4, -27], [1, -28], [2, -38], [-1.5, -39]], MAT.C2, .3);
    else Rig.poly([[-4.2, -28 + low], [-.6, -29 + low], [-2 + drift * .4, -12 + low + (swim ? -4 : 0)], [-6 + drift, -10 + low + (swim ? 6 : 0)]], MAT.C2, (x, y) => .3 + ((x + y) & 1) * .08);
    // arms, far side first
    const arm = (sx, a, lit) => {
      Rig.save(); Rig.translate(sx, -19 + low); Rig.rotate(a);
      Rig.line([[0, 0], [0, 7.5]], 1.3, 1.1, MAT.BELLY, lit);
      Rig.restore();
    };
    arm(-2, rise ? Math.PI - .15 : sit ? .5 : .15 + drift * .05, .3);
    // legs
    if (sit) {
      Rig.line([[-1, -6], [9, -5]], 1.5, 1.3, MAT.BELLY, .35);
      Rig.line([[-1, -4], [10, -3]], 1.5, 1.3, MAT.BELLY, .55);
      Rig.poly([[9.5, -6.5], [12.5, -7.5], [12, -2], [9.5, -2]], MAT.FIN, .5);
    } else {
      Rig.save(); Rig.translate(-1, -8); Rig.rotate(-kick);
      Rig.line([[0, 0], [0, 7.5]], 1.4, 1.2, MAT.BELLY, .35);
      Rig.poly([[-1.5, 7], [2.5, 7], [3, 9], [-1.5, 9]], MAT.FIN, .4);
      Rig.restore();
      Rig.save(); Rig.translate(1.5, -8); Rig.rotate(kick);
      Rig.line([[0, 0], [0, 7.5]], 1.4, 1.2, MAT.BELLY, .55);
      Rig.poly([[-1.5, 7], [2.5, 7], [3, 9], [-1.5, 9]], MAT.FIN, .55);
      Rig.restore();
    }
    // tunic of woven kelp with a ragged hem, and a belt of shells
    Rig.poly([[-4.4, -21 + low], [4.4, -21 + low], [5, -8 + low], [2.5, -6.8 + low], [.5, -8.4 + low], [-2, -6.6 + low], [-5, -8 + low]], MAT.BODY,
      (x, y) => .42 + ((x ^ y) & 3 ? 0 : .08));
    Rig.box(-4.8, -14 + low, 9.8, 1.2, MAT.BONE, .6);
    Rig.dot(-2, -13.5 + low, MAT.BONE, .9); Rig.dot(2, -13.5 + low, MAT.BONE, .9);
    Rig.ell(2, -18 + low, 1, 1, MAT.GLOW, { lit: .9 });
    Rig.glow(2, -18 + low, 4, '#9ff0ff', .18);
    // neck with gills, and her head
    Rig.box(-1.4, -23 + low, 3, 2.4, MAT.BELLY, .4);
    Rig.dot(-1.2, -22.2 + low, MAT.DARK, .2);
    Rig.ell(.4, -27 + low, 3.4, 3.4, MAT.BELLY, {});
    Rig.dot(3.8, -26.8 + low, MAT.BELLY, .72);
    Rig.dot(2.4, -27.6 + low, MAT.EYE, .9);
    Rig.poly([[-2.4, -27 + low], [-5.5, -31 + low], [-3.6, -24.6 + low]], MAT.FIN, .5);
    Rig.poly([[-4, -29.5 + low], [3.6, -31 + low], [4, -29.6 + low], [-.5, -29 + low], [-4.4, -25 + low]], MAT.C2, .38);
    Rig.box(-2.6, -31 + low, 3.4, 1, MAT.C3, .5);
    Rig.dot(-3.2, -29.5 + low, MAT.BONE, .85);
    arm(2.4, rise ? Math.PI + .2 : sit ? -.2 : -.12 - drift * .05, .55);
  },

  /* ------------------------------ the diving suit ------------------------------
     Four tiers, four helmets. Each helmet is drawn round (0, 0), window toward +x. */

  helmet(id, t) {
    if (id === 'riveted') {
      Rig.poly([[-5, -4], [-3, -6.2], [3.6, -6.2], [5.8, -4], [5.8, 4], [3.6, 5.8], [-3, 5.8], [-5, 4]], MAT.SHELL, (x, y) => .52 - (y - Rig.pt(0, 0)[1]) * .03);
      for (const [x, y] of [[-3.8, -3.6], [-3.8, 3.4], [4.6, -4.8], [4.6, 4.6], [0, -5.2], [0, 4.8]]) Rig.dot(x, y, MAT.BONE, .8);
      Rig.box(.8, -2.6, 4.2, 4.6, MAT.C1, .3);
      Rig.line([[2.9, -2.6], [2.9, 2]], .35, .35, MAT.DARK, .1);
      Rig.line([[.8, -.3], [5, -.3]], .35, .35, MAT.DARK, .1);
      Rig.dot(1.6, -1.8, MAT.WHITE, 1);
      Rig.line([[-5, 1], [-7.4, 2.4]], .8, .8, MAT.SHELL, .35);
    } else if (id === 'trench') {
      Rig.ell(0, 0, 6.2, 6, MAT.SHELL, {});
      Rig.line([[-4.6, -3.6], [-1, -5.6]], .35, .35, MAT.DARK, .15);
      Rig.line([[-5.6, 1.8], [-2.6, 5]], .35, .35, MAT.DARK, .15);
      Rig.box(1.2, -1.4, 5, 2.6, MAT.GLOW, .75 + Math.sin(t * 3) * .1);
      Rig.glow(3.6, 0, 5, '#8fe8ff', .14);
      Rig.ell(.6, -6.2, 1.8, 1.2, MAT.SHELL, { lit: .55 });
      Rig.dot(1.8, -6.4, MAT.EYE, 1);
      Rig.glow(2.2, -6.4, 6, '#fff0b0', .14);
      Rig.box(-5.6, 4.4, 10.6, 1.8, MAT.SHELL, .3);
    } else {
      const brass = id === 'brass';
      Rig.ell(0, 0, brass ? 5.6 : 5.2, brass ? 5.6 : 5.2, MAT.SHELL, {});
      Rig.box(-4.6, 4, 9, 1.8, MAT.SHELL, .3);
      Rig.box(-1, -6.4, 2.2, 1.4, MAT.SHELL, .6);
      Rig.ell(2.3, .2, 2.8, 2.8, MAT.C1, { lit: .3 });
      Rig.ring(2.3, .2, 3, 3, .45, MAT.SHELL, .72);
      if (brass) {
        for (const dx of [-1, 0, 1]) Rig.line([[2.3 + dx * 1.2, -2.2], [2.3 + dx * 1.2, 2.6]], .3, .3, MAT.SHELL, .5);
        Rig.ell(-2.8, -1.8, 1.1, 1.1, MAT.C1, { lit: .3 });
        for (let i = 0; i < 5; i++) Rig.dot(-4 + i * 2, 4.8, MAT.BONE, .8);
      } else {
        Rig.line([[2.3, -2.4], [2.3, 2.8]], .35, .35, MAT.SHELL, .5);
        Rig.dot(-3, -1, MAT.C5, .5); Rig.dot(-2, 2.4, MAT.C5, .45); Rig.dot(-3.8, 1, MAT.DARK, .2);
      }
      Rig.dot(1.2, -1.2, MAT.WHITE, 1);
      Rig.dot(-2.4, -3.6, MAT.SHELL, .95);
    }
  },

  // plates and patches on the body, by tier
  suitTrim(id, horizontal) {
    if (id === 'drowned') {
      Rig.box(horizontal ? -6 : -3, horizontal ? -1 : -13, 3, 2.2, MAT.C5, .45);
      Rig.box(horizontal ? 1 : 1, horizontal ? 1.4 : -8, 2.4, 2, MAT.C5, .4);
    } else if (id === 'brass') {
      Rig.box(horizontal ? 3 : -4.6, horizontal ? -4 : -16, horizontal ? 3.6 : 9.4, horizontal ? 8 : 2.6, MAT.SHELL, .55);
    } else if (id === 'riveted') {
      Rig.box(horizontal ? -3 : -3.6, horizontal ? -3.5 : -15, horizontal ? 8 : 7.4, horizontal ? 7 : 7, MAT.SHELL, .48);
      for (let i = 0; i < 3; i++) Rig.dot(horizontal ? -2 + i * 3 : -2.5 + i * 2.6, horizontal ? -2.6 : -14, MAT.BONE, .8);
    } else {
      Rig.box(horizontal ? -8 : -4.6, horizontal ? -4.5 : -16.5, horizontal ? 15 : 9.4, horizontal ? 3 : 4, MAT.SHELL, .45);
      Rig.box(horizontal ? -8 : -4.4, horizontal ? 2 : -9, horizontal ? 15 : 9, horizontal ? 2.4 : 2.4, MAT.SHELL, .35);
    }
  },

  // standing on deck in the suit, for suiting up and going over. Feet at (0, 0).
  diverStanding(o, suit) {
    const t = o.t || 0, walk = o.state === 'walk' ? Math.sin(t * 12) : 0;
    if (o.rot) { Rig.translate(0, -15); Rig.rotate(o.rot); Rig.translate(0, 15); }
    Rig.box(-9, -22, 5, 13, MAT.C2, .5);
    Rig.box(-8, -24, 3, 2, MAT.C2, .7);
    const leg = (hx, a, lit) => {
      Rig.save(); Rig.translate(hx, -9); Rig.rotate(a);
      Rig.line([[0, 0], [0, 7.4]], 1.9, 1.8, MAT.BODY, lit);
      Rig.poly([[-2, 6.8], [8.6, 7.2], [9, 9.2], [-2, 9]], MAT.FIN, lit);
      Rig.restore();
    };
    leg(-1.5, -walk * .5, .3);
    leg(1.8, walk * .5, .5);
    Rig.poly([[-5, -21], [5, -21], [5.4, -8.6], [-5.4, -8.6]], MAT.BODY, (x) => .44 + clamp((x - Rig.pt(0, 0)[0]) / 12, -.16, .16));
    Rig.box(-5.4, -12.6, 10.8, 1.4, MAT.SHELL, .6);
    this.suitTrim(suit.id, false);
    Rig.save(); Rig.translate(-4, -19); Rig.rotate(walk * .4); Rig.line([[0, 0], [0, 7]], 1.8, 1.6, MAT.BODY, .28); Rig.restore();
    Rig.save(); Rig.translate(0, -26.5); this.helmet(suit.id, t); Rig.restore();
    Rig.save(); Rig.translate(4, -19); Rig.rotate(-walk * .4); Rig.line([[0, 0], [0, 7]], 1.9, 1.7, MAT.BODY, .56); Rig.restore();
  },

  /* The boy swimming: stretched out, helmet leading, long flippers trailing.
     (0, 0) is his middle. The legs flutter from the hips — a small, lazy beat,
     the knee following a moment behind the thigh, the way a diver really kicks
     — and the arm and launcher follow his aim. */
  diver(o, suit, w) {
    const t = o.t || 0, kick = o.kick || 0;
    Rig.rotate(o.tilt || 0);
    // the stroke runs at its own pace, so speeding up never jumps the legs
    const ph = o.stroke !== undefined ? o.stroke : t * (3.2 + kick * 3.4);
    const amp = .09 + kick * .15;
    // the far leg, then the tank and body, then the near leg
    const leg = (off, lit, dy) => {
      const hip = Math.sin(ph + off), knee = Math.sin(ph + off - .8);
      Rig.save(); Rig.translate(-7.5, dy); Rig.rotate(Math.PI / 2 + hip * amp);
      Rig.line([[0, 0], [0, 6]], 2, 1.8, MAT.BODY, lit);
      Rig.translate(0, 6); Rig.rotate(knee * amp * .8);
      Rig.line([[0, 0], [0, 5.2]], 1.8, 1.5, MAT.BODY, lit - .04);
      // the flipper: a long blade, wider at the tip, with a rib down it
      Rig.translate(0, 5); Rig.rotate(knee * amp * .9);
      Rig.poly([[-1.5, -.6], [1.5, -.6], [2.6, 8], [1.8, 11.2], [-.9, 11.4], [-2.2, 8.2]], MAT.FIN, lit + .06);
      Rig.line([[.2, .4], [.5, 10.4]], .45, .3, MAT.C1, lit - .12);
      Rig.restore();
    };
    leg(Math.PI, .28, -1.2);
    Rig.box(-9, -8, 15, 3.8, MAT.C2, .55);
    Rig.box(5, -7.8, 2, 2, MAT.C2, .75);
    Rig.ell(-.5, 0, 9, 4.6, MAT.BODY, {});
    Rig.box(-3, -4.4, 1.6, 8.8, MAT.SHELL, .6);
    this.suitTrim(suit.id, true);
    leg(0, .52, 1.6);
    // the back arm, sculling
    Rig.save(); Rig.translate(2, 3); Rig.rotate(.9 + Math.sin(ph) * .12); Rig.line([[0, 0], [0, 6]], 1.6, 1.4, MAT.BODY, .3); Rig.restore();
    // the near arm and the launcher, pointing wherever he aims
    Rig.save();
    Rig.translate(6, 2.5);
    Rig.rotate((o.localAim || 0) - (o.tilt || 0));
    Rig.line([[0, 0], [7, 0]], 1.8, 1.6, MAT.BODY, .58);
    Rig.translate(7.5, 0);
    Rig.translate(-Math.round((o.recoil || 0) * 1.5), 0);
    this.launcher(w, t, o.loaded === undefined ? true : o.loaded);
    Rig.restore();
    Rig.save(); Rig.translate(10, -1.2); this.helmet(suit.id, t); Rig.restore();
  },

  // the underwater launchers, from the grip, muzzle toward +x
  launcher(w, t, loaded) {
    if (!w) return;
    switch (w.kind) {
      case 'dharpoon':
        Rig.box(-4, -1.6, 10, 3.6, MAT.WOOD, .45);
        Rig.box(-2, 2, 2.6, 3, MAT.WOOD, .35);
        Rig.box(6, -2, 9, 4, MAT.C3, .55);
        for (let x = 7; x < 15; x += 2) Rig.line([[x, -2], [x, 2]], .3, .3, MAT.DARK, .15);
        if (loaded) {
          Rig.line([[14, 0], [21, 0]], .6, .6, MAT.WOOD, .55);
          Rig.poly([[20.5, -2], [25, 0], [20.5, 2]], MAT.METAL, .75);
          Rig.line([[20.5, -2.4], [20.5, 2.4]], .4, .4, MAT.METAL, .6);
        }
        break;
      case 'trident':
        Rig.box(-4, -1.6, 9, 3.6, MAT.WOOD, .45);
        for (const dy of [-3.2, 0, 3.2]) Rig.line([[5, dy], [15, dy]], .9, .9, MAT.METAL, .6);
        Rig.box(6, -4.6, 1.6, 9.2, MAT.C3, .55); Rig.box(12, -4.6, 1.6, 9.2, MAT.C3, .5);
        if (loaded) for (const dy of [-3.2, 0, 3.2]) Rig.poly([[15, dy - 1.4], [19, dy], [15, dy + 1.4]], MAT.METAL, .8);
        break;
      case 'eel': {
        const sway = Math.sin(t * 7) * 1;
        Rig.box(-4, -1.6, 8, 3.6, MAT.WOOD, .45);
        Rig.box(3, -3, 5, 6, MAT.METAL, .55);
        Rig.line([[-6, -4 + sway], [-2, -5.5 + sway], [3, -3], [8, 0], [14, 0 + sway * .5], [17, -.5]], 1.6, 1.3, MAT.C4, .5);
        Rig.line([[9, -.8], [15, -.6]], .4, .4, MAT.C3, .8);
        Rig.dot(16.6, -1.4, MAT.WHITE, 1);
        if (loaded) { Rig.ell(20, -.4, 1.4, 1.4, MAT.EYE, { lit: .9 }); Rig.glow(20, -.4, 8, w.metal, .45); }
        break;
      }
      case 'tusk':
        Rig.box(-4, -1.4, 18, 3, MAT.WOOD, .45);
        Rig.box(-2, 1.6, 2.8, 3.4, MAT.WOOD, .35);
        Rig.line([[12, -8], [13, 0], [12, 8]], .9, .9, MAT.C4, .45);
        Rig.line([[12.5, -8], [loaded ? 2 : 11, 0], [12.5, 8]], .35, .35, MAT.BONE, .7);
        if (loaded) {
          Rig.poly([[1, -1.4], [24, -.5], [26, 0], [24, .5], [1, 1.4]], MAT.BONE, .75);
          for (let i = 0; i < 4; i++) Rig.line([[5 + i * 5, -1.2], [6 + i * 5, 1.2]], .3, .3, MAT.C3, .45);
        }
        break;
      case 'bell':
      default:
        Rig.box(-4, -1.6, 9, 3.6, MAT.WOOD, .45);
        Rig.box(4, -1, 3, 2, MAT.SHELL, .4);
        Rig.poly([[7, -3.4], [18, -7.5], [18, 7.5], [7, 3.4]], MAT.METAL, (x, y) => .6 - Math.abs(y - Rig.pt(0, 0)[1]) * .02);
        Rig.box(17, -7.5, 2, 15, MAT.C3, .7);
        Rig.box(8, 1, 9, 1.4, MAT.DARK, .2);
        if (loaded) Rig.glow(19, 0, 10, '#f0cf8a', .3);
        break;
    }
  },


  /* ------------------------------- portraits -------------------------------
     Who is talking, drawn as a bust for the box beside the dialogue: 46x46,
     (0, 0) in the middle of the frame, the shoulders running off the bottom.
     `blink` shuts the eyes; `mouth` opens it, a word at a time.            */

  portraitDad(blink, mouth) {
    Rig.poly([[-22, 23], [-15, 11], [15, 11], [22, 23]], MAT.BODY, .42);        // coat
    Rig.box(-7, 8, 14, 5, MAT.SHELL, .3);                                       // collar
    Rig.box(-4.5, 2, 9, 8, MAT.BELLY, .34);                                     // neck
    Rig.ell(0, -3, 10, 11, MAT.BELLY, {});                                      // face
    Rig.ell(1.5, 0, 3, 2.6, MAT.BELLY, { lit: .66 });                           // nose
    Rig.poly([[-9.5, 1], [9.5, 1], [8, 9], [3, 12.5], [-4, 12.5], [-8.5, 8]], MAT.C1, .5);   // beard
    Rig.box(-3.5, 3, 7, mouth ? 2.6 : 1.4, MAT.DARK, .18);                      // mouth in the beard
    if (blink) { Rig.box(-7.5, -4.4, 5, 1.4, MAT.DARK, .2); Rig.box(2.5, -4.4, 5, 1.4, MAT.DARK, .2); }
    else {
      Rig.ell(-5, -4, 2.2, 2.2, MAT.WHITE, { lit: .9 }); Rig.ell(5, -4, 2.2, 2.2, MAT.WHITE, { lit: .9 });
      Rig.ell(-4.6, -4, 1.2, 1.4, MAT.DARK, { lit: .12 }); Rig.ell(5.4, -4, 1.2, 1.4, MAT.DARK, { lit: .12 });
    }
    Rig.box(-8.5, -8, 6, 1.8, MAT.C1, .36); Rig.box(2.5, -8, 6, 1.8, MAT.C1, .36);   // brows
    Rig.poly([[-11, -11], [11, -11], [9, -19], [-8, -18]], MAT.SHELL, .45);     // cap
    Rig.box(-11.5, -12.5, 23, 3, MAT.C1, .3);
    Rig.poly([[4, -12.5], [17, -11.5], [17, -9], [4, -9.5]], MAT.SHELL, .52);   // the brim
    Rig.line([[7, 6], [13, 8]], 1.2, 1.2, MAT.WOOD, .5);                        // the pipe
    Rig.box(12, 4, 4.5, 4.5, MAT.WOOD, .42);
    Rig.box(12.5, 3.4, 3.5, 1, MAT.DARK, .1);
  },

  portraitDorran(blink, mouth) {
    Rig.poly([[-23, 23], [-16, 12], [16, 12], [23, 23]], MAT.BODY, .4);         // coat
    Rig.box(-5, 4, 10, 9, MAT.BELLY, .3);                                       // neck
    Rig.ell(0, -2, 10, 10.5, MAT.BELLY, {});                                    // face
    Rig.poly([[-9.5, 2.5], [9.5, 2.5], [7.5, 10], [-7, 10]], MAT.C1, .4);       // stubble
    Rig.box(-3.5, 5.5, 8, mouth ? 3 : 1.4, MAT.DARK, .15);                      // mouth
    Rig.ell(2.5, .5, 4.4, 3.6, MAT.C2, {});                                     // a nose like a plum
    Rig.dot(1, -.6, MAT.C2, .75); Rig.dot(4, 1.6, MAT.C2, .32);
    if (blink || !mouth) { Rig.box(-8, -5, 5.5, 1.6, MAT.DARK, .2); Rig.box(2, -5.4, 5.5, 1.6, MAT.DARK, .2); }
    else {
      Rig.ell(-5.4, -5, 2, 2, MAT.WHITE, { lit: .85 }); Rig.ell(4.6, -5.4, 2, 2, MAT.WHITE, { lit: .85 });
      Rig.dot(-5, -5, MAT.DARK, .12); Rig.dot(5, -5.4, MAT.DARK, .12);
    }
    Rig.ell(0, -11.5, 18, 3.4, MAT.SHELL, { lit: .38 });                        // the hat, wide and soft
    Rig.poly([[-9, -11], [9, -11], [7, -21], [-6.5, -20]], MAT.SHELL, .5);
    Rig.box(-9, -13.5, 18, 2.6, MAT.GUM, .45);
    Rig.box(14, 13, 6.5, 10, MAT.METAL, .62);                                   // the flask, never far
    Rig.box(15.5, 11, 3.5, 2.4, MAT.METAL, .8);
  },

  portraitNerys(blink, mouth) {
    Rig.poly([[-14, -13], [14, -13], [17, 10], [12, 23], [-13, 23], [-17, 9]], MAT.C2, .3);  // hair, behind
    Rig.poly([[-18, 23], [-13, 13], [13, 13], [18, 23]], MAT.BODY, .42);        // kelp tunic
    Rig.box(-4.6, 5, 9.2, 9, MAT.BELLY, .34);                                   // neck
    Rig.box(-6.5, 8, 5, 1.2, MAT.DARK, .2); Rig.box(1.5, 8, 5, 1.2, MAT.DARK, .2);   // gills
    Rig.poly([[-8, -4], [-17, -9], [-14.5, 4]], MAT.FIN, .5);                   // ear fins
    Rig.poly([[8, -4], [16, -8], [13.5, 4]], MAT.FIN, .4);
    Rig.ell(0, -3, 9.6, 10.6, MAT.BELLY, {});                                   // face
    Rig.ell(0, 1.4, 2, 1.6, MAT.BELLY, { lit: .62 });                           // nose
    Rig.box(-2.5, 5, 5, mouth ? 2.8 : 1.2, MAT.DARK, .18);                      // mouth
    if (blink) { Rig.box(-6.6, -4, 4.6, 1.4, MAT.DARK, .25); Rig.box(2, -4, 4.6, 1.4, MAT.DARK, .25); }
    else {
      Rig.ell(-4.2, -4, 3, 2.8, MAT.BONE, { lit: .92 }); Rig.ell(4.2, -4, 3, 2.8, MAT.BONE, { lit: .92 });
      Rig.ell(-3.8, -4, 1.7, 1.8, MAT.EYE, { lit: .95 }); Rig.ell(4.6, -4, 1.7, 1.8, MAT.EYE, { lit: .95 });
      Rig.dot(-3.8, -4, MAT.DARK, .1); Rig.dot(4.6, -4, MAT.DARK, .1);
      Rig.glow(0, -4, 12, '#9ff0ff', .12);
    }
    Rig.poly([[-10.5, -9], [10.5, -9], [9, -14], [-9.5, -13]], MAT.C2, .36);    // a fringe, wet through
    Rig.box(-7.5, -11, 15, 1.6, MAT.C3, .5);                                    // a circlet of shell
    Rig.ell(0, -11, 1.8, 1.8, MAT.GLOW, { lit: .95 });
    Rig.glow(0, -11, 7, '#9ff0ff', .2);
  },

  // what the Old One leaves on the deck: the suit, flat and empty, and the harpoon
  drops(t) {
    Rig.box(-22, -5, 22, 5, MAT.BODY, .42);
    Rig.box(-29, -4, 8, 3, MAT.BODY, .38);
    Rig.box(-2, -3, 11, 2.6, MAT.BODY, .45);
    Rig.dot(-14, -3, MAT.C5, .5);
    Rig.box(-18, -10, 13, 5, MAT.C2, .55);
    Rig.save(); Rig.translate(15, -6); Rig.rotate(1.5); this.helmet('drowned', t); Rig.restore();
    Rig.save(); Rig.translate(-38, -2.5); Rig.rotate(-.05); this.launcher(DIVE_WEAPONS[0], t, true); Rig.restore();
  }
});

function suitPalette(suit, w) {
  return spritePalette('suit:' + suit.id + ':' + (w ? w.id : '-'), Object.assign({
    BODY: suit.rubber, SHELL: suit.brass, C1: '#16303c', WHITE: '#dff6ff', C2: '#7d868c', FIN: '#2f5f6a',
    C5: suit.id === 'drowned' ? '#8a7a56' : suit.rubber, GLOW: suit.id === 'trench' ? '#8fe8ff' : '#fff0b0',
    EYE: '#fff0b0', BONE: '#d8d0b8', DARK: '#10161c', outline: '#0a0e12'
  }, w ? { METAL: w.metal, WOOD: w.grip, C3: w.accent, C4: w.kind === 'eel' ? '#3f5a2e' : '#6b4a2a', EYE: w.kind === 'eel' ? '#bff4ff' : '#fff0b0' } : {}));
}

/* Who is talking, drawn big: a bust for the box beside the dialogue. Each
   one is the same figure as on deck, scaled up and shifted so the head sits in
   the middle of the frame, with the shoulders running off the bottom of it. */
const PORTRAITS = {
  Dad:    { pal: () => spritePalette('portrait-dad', Object.assign({ WHITE: '#efe6d4' }, DAD_COLORS)), paint: (b, m) => Figures.portraitDad(b, m) },
  Dorran: { pal: () => spritePalette('portrait-dorran', Object.assign({ WHITE: '#efe6d4' }, DORRAN_COLORS)), paint: (b, m) => Figures.portraitDorran(b, m) },
  Nerys:  { pal: () => spritePalette('portrait-nerys', NERYS_COLORS), paint: (b, m) => Figures.portraitNerys(b, m) }
};

Object.assign(Art, {
  // a speaker's face, drawn round (x, y). `talk` moves his mouth with the words
  portrait(g, who, x, y, t, talk) {
    const P = PORTRAITS[who];
    if (!P) return false;
    const blink = (t % 4.6) < .15;
    const mouth = talk && Math.sin(t * 13) > 0;
    Sprite.draw(g, 'portrait:' + who, (blink ? 1 : 0) + ',' + (mouth ? 1 : 0), x, y, {
      w: 46, h: 46, face: 1, pal: P.pal(),
      paint: () => { Rig.begin(); P.paint(blink, mouth); }
    });
    return true;
  },

  dad(g, x, y, o) {
    o = o || {};
    const f = o.face === undefined ? 1 : o.face, t = o.t || 0, walk = o.state === 'walk';
    feetShadow(g, x, y, 20);
    Sprite.draw(g, 'dad', [walk ? q((t * 9) % 6.2832, Math.PI / 4) : 0, o.pipe === false ? 0 : 1].join(','), x, y, {
      w: 70, h: 110, face: f, pal: spritePalette('dad', DAD_COLORS),
      paint: () => { Rig.begin(); Figures.dad(o); }
    });
    // his pipe, smoking
    if (o.pipe !== false) {
      g.fillStyle = 'rgba(214,218,226,.35)';
      for (let i = 0; i < 3; i++) {
        const k = (t * .5 + i * .33) % 1, s = Math.round(1 + k * 3) * 2;
        g.fillRect(snap(x + f * (20 + Math.sin(t + i) * 6 * k) - s / 2), snap(y - 70 - k * 34), s, s);
      }
    }
  },

  dorran(g, x, y, o) {
    o = o || {};
    const t = o.t || 0, cyc = t % 9;
    const pose = [(t % 3.7) < .12 ? 1 : 0, cyc > 6.5 && cyc < 8 ? q(Math.sin((cyc - 6.5) / 1.5 * Math.PI), .1) : 0, q(Math.sin(t * 1.3), .5), Math.round(Math.sin(t * 2))].join(',');
    Sprite.draw(g, 'dorran', pose, x, y, {
      w: 70, h: 110, face: o.face === undefined ? -1 : o.face, pal: spritePalette('dorran', DORRAN_COLORS),
      paint: () => { Rig.begin(); Figures.dorran(o); }
    });
  },

  girl(g, x, y, o) {
    o = o || {};
    const f = o.face === undefined ? 1 : o.face, t = o.t || 0, pose = o.pose || 'stand';
    g.save();
    if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
    if (pose !== 'swim' && !o.noShadow) feetShadow(g, x, y, pose === 'sit' ? 22 : 14);
    Sprite.draw(g, 'nerys', [pose, q(o.rot, .1), pose === 'swim' ? q((t * 9) % 6.2832, .5) : 0, q(Math.sin(t * 2.2), .5)].join(','), x, y, {
      w: 90, h: 100, face: f, pal: spritePalette('nerys', NERYS_COLORS),
      paint: () => { Rig.begin(); Figures.nerys(o); }
    });
    g.restore();
  },

  diverStanding(g, x, y, o) {
    o = o || {};
    const suit = o.suit || SUITS[0], t = o.t || 0;
    feetShadow(g, x, y, 16);
    Sprite.draw(g, 'diver-standing', [suit.id, o.state === 'walk' ? q((t * 12) % 6.2832, Math.PI / 4) : 0, q(o.rot, .08), suit.id === 'trench' ? q(Math.sin(t * 3), .5) : 0].join(','), x, y, {
      w: 70, h: 90, face: o.face === undefined ? 1 : o.face, pal: suitPalette(suit, null),
      paint: () => { Rig.begin(); Figures.diverStanding(o, suit); }
    });
  },

  diver(g, x, y, o) {
    o = o || {};
    const f = o.face === undefined ? 1 : o.face, suit = o.suit || SUITS[0], w = o.weapon || DIVE_WEAPONS[0], t = o.t || 0;
    const localAim = Math.atan2(Math.sin(o.aim || 0), Math.cos(o.aim || 0) * f);
    const kick = o.kick || 0;
    const opts = Object.assign({}, o, { localAim });
    g.save();
    if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
    const ph = o.stroke !== undefined ? o.stroke : t * (3.2 + kick * 3.4);
    Sprite.draw(g, 'diver', [suit.id, w.id, q(ph % 6.2832, Math.PI / 6), q(kick, .25), q(localAim, .06), q(o.tilt, .06),
      q(o.recoil, .34), o.loaded === false ? 0 : 1, w.kind === 'eel' ? q((t * 7) % 6.2832, .8) : 0, suit.id === 'trench' ? q(Math.sin(t * 3), .5) : 0].join(','), x, y, {
      w: 110, h: 100, face: f, pal: suitPalette(suit, w),
      paint: () => { Rig.begin(); Figures.diver(opts, suit, w); }
    });
    g.restore();
  },

  diveWeapon(g, w, t, recoil, loaded) {
    if (!w) return;
    Sprite.draw(g, 'launcher:' + w.id, [q(recoil, .34), loaded === false ? 0 : 1, q((t || 0) % 6.2832, .8)].join(','), 0, 0, {
      w: 70, h: 40, face: 1, pal: suitPalette(SUITS[0], w),
      paint: () => { Rig.begin(); Rig.translate(-10, 0); Rig.translate(-Math.round((recoil || 0) * 1.5), 0); Figures.launcher(w, t || 0, loaded === undefined ? true : loaded); }
    });
  },

  drops(g, x, y, t) {
    feetShadow(g, x, y, 60);
    Sprite.draw(g, 'drops', '0', x, y, {
      w: 110, h: 50, face: 1, pal: suitPalette(SUITS[0], DIVE_WEAPONS[0]),
      paint: () => { Rig.begin(); Figures.drops(t || 0); }
    });
    g.fillStyle = 'rgba(160,210,230,.6)';
    g.fillRect(snap(x - 20 + ((t * 30) % 40)), snap(y - 1), 2, 2);
  }
});
