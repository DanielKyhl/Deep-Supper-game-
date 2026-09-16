'use strict';
/* ========================================================================
   beasts.js — every creature in the sea, as real pixel art.

   Each frame a creature is rasterised here at the game's true pixel size.
   Its shapes are laid down as materials with a light level; then every
   pixel is resolved through a shaded palette for its material (shadows
   lean cold and purple, highlights warm), creases are darkened where one
   material sits on another, a touch of ordered dither softens the turns,
   and a single dark outline goes round the whole silhouette. Nothing is
   antialiased, so nothing is mushy, and nothing is a sprite sheet, so
   everything still breathes, swims and gapes.
   ======================================================================== */

const MAT = {
  EMPTY: 0, BODY: 1, BELLY: 2, FIN: 3, MOUTH: 4, TOOTH: 5, EYE: 6, PUPIL: 7,
  GLOW: 8, GUM: 9, BONE: 10, METAL: 11, SHELL: 12, DARK: 13, WOOD: 14, WHITE: 15,
  // spare materials for people and things, coloured by their own palettes
  C1: 16, C2: 17, C3: 18, C4: 19, C5: 20, C6: 21, C7: 22, C8: 23
};
const EMISSIVE = new Uint8Array(32);
EMISSIVE[MAT.EYE] = EMISSIVE[MAT.GLOW] = EMISSIVE[MAT.WHITE] = EMISSIVE[MAT.PUPIL] = 1;
const BAYER16 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// a stable pseudo-random number for a pixel position: texture that doesn't crawl
function hash3(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ------------------------------ the workbench ------------------------------ */

const Spr = {
  w: 0, h: 0, ox: 0, oy: 0, tilt: 0,
  mat: new Uint8Array(0), lit: new Float32Array(0),
  x0: 0, x1: 0, y0: 0, y1: 0,
  emit: [],

  begin(w, h) {
    w |= 0; h |= 0;
    if (this.mat.length < w * h) { this.mat = new Uint8Array(w * h); this.lit = new Float32Array(w * h); }
    else this.mat.fill(0, 0, w * h);
    this.w = w; this.h = h; this.ox = w >> 1; this.oy = h >> 1;
    this.x0 = w; this.x1 = -1; this.y0 = h; this.y1 = -1;
    this.emit.length = 0;
    this.tilt = 0;
  },

  // one pixel, in creature space: (0, 0) is its middle, +x is where its head is
  plot(x, y, mat, lit) {
    const px = Math.round(x) + this.ox;
    const py = Math.round(y + x * this.tilt) + this.oy;
    if (px < 1 || py < 1 || px >= this.w - 1 || py >= this.h - 1) return;
    const i = py * this.w + px;
    this.mat[i] = mat;
    this.lit[i] = lit < 0 ? 0 : (lit > 1 ? 1 : lit);
    if (px < this.x0) this.x0 = px;
    if (px > this.x1) this.x1 = px;
    if (py < this.y0) this.y0 = py;
    if (py > this.y1) this.y1 = py;
  },

  // a filled ellipse, lit like a ball from above; `o.belly` takes over its underside
  blob(cx, cy, rx, ry, mat, o) {
    o = o || {};
    rx = Math.max(.5, rx); ry = Math.max(.5, ry);
    const fixed = o.lit, bellyFrom = o.bellyFrom === undefined ? .3 : o.bellyFrom;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const dy = (y - cy) / ry;
      if (dy < -1 || dy > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      for (let x = Math.ceil(cx - half - .01); x <= Math.floor(cx + half + .01); x++) {
        const nx = (x - cx) / rx;
        let L = fixed;
        if (L === undefined) {
          const z = Math.sqrt(Math.max(0, 1 - nx * nx - dy * dy));
          L = .5 - dy * .38 + nx * .06 + z * .16;
          if (o.tex) L += o.tex(x, y, nx, dy);
        }
        this.plot(x, y, o.belly && dy > bellyFrom ? o.belly : mat, L);
      }
    }
  },

  // an ellipse turned by `ang` (its rx axis points along ang), lit from above
  oval(cx, cy, rx, ry, ang, mat, o) {
    o = o || {};
    const c = Math.cos(ang), s = Math.sin(ang), R = Math.ceil(Math.max(rx, ry));
    const tall = Math.hypot(rx * s, ry * c), bellyFrom = o.bellyFrom === undefined ? .3 : o.bellyFrom;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x - cx, dy = y - cy;
        const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry, d = u * u + v * v;
        if (d > 1) continue;
        const ny = dy / tall;
        let L = o.lit !== undefined ? o.lit : .5 - ny * .38 + Math.sqrt(1 - d) * .16;
        if (o.tex) L += o.tex(x, y, u, v);
        this.plot(x, y, o.belly && ny > bellyFrom ? o.belly : mat, L);
      }
    }
  },

  /* a body along a spine, column by column. pts: [{x, y, r}], in x order.
     `o.tex(x, y, n)` nudges the light for texture (n is -1 top, +1 bottom). */
  tube(pts, mat, o) {
    o = o || {};
    const bellyFrom = o.bellyFrom === undefined ? .25 : o.bellyFrom;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const xa = Math.ceil(a.x), xb = k === pts.length - 2 ? Math.floor(b.x) : Math.ceil(b.x) - 1;
      for (let x = xa; x <= xb; x++) {
        const f = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
        const cy = a.y + (b.y - a.y) * f, r = Math.max(.5, a.r + (b.r - a.r) * f);
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
          const n = (y - cy) / r;
          if (n < -1.05 || n > 1.05) continue;
          let L = .56 - n * .4 + (n < -.72 ? .14 : 0) - (n > .8 ? .12 : 0);
          if (o.tex) L += o.tex(x, y, n);
          this.plot(x, y, o.belly && n > bellyFrom ? o.belly : mat, L);
        }
      }
    }
  },

  // a filled polygon: [[x, y], ...]; lit is a number or fn(x, y)
  poly(pts, mat, lit) {
    let ymin = Infinity, ymax = -Infinity;
    for (const p of pts) { if (p[1] < ymin) ymin = p[1]; if (p[1] > ymax) ymax = p[1]; }
    const xs = [];
    for (let y = Math.floor(ymin); y <= Math.ceil(ymax); y++) {
      const sy = y + .01;
      xs.length = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > sy) !== (yj > sy)) xs.push(xi + (sy - yi) / (yj - yi) * (xj - xi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) {
          this.plot(x, y, mat, typeof lit === 'function' ? lit(x, y) : lit);
        }
      }
    }
  },

  // a thick line along points, tapering from r0 to r1: limbs, tendrils, spines
  stroke(pts, r0, r1, mat, lit) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const byU = typeof lit === 'function';
    let run = 0;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
      const seg = Math.hypot(bx - ax, by - ay);
      // a thin line needs a dot at every pixel; a fat one only every so often
      const ra = r0 + (r1 - r0) * (total ? run / total : 0), rb = r0 + (r1 - r0) * (total ? (run + seg) / total : 0);
      const steps = Math.max(1, Math.ceil(seg / Math.max(.6, Math.min(ra, rb) * .7)));
      for (let s = i === 1 ? 0 : 1; s <= steps; s++) {
        const f = s / steps, x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
        const u = total ? (run + seg * f) / total : 0;
        const r = r0 + (r1 - r0) * u;
        const L = byU ? lit(u) : lit;
        if (r < .8) { this.plot(x, y, mat, L); continue; }
        const ri = Math.ceil(r), rr = r * r + .3;
        for (let dy = -ri; dy <= ri; dy++) {
          const span = rr - dy * dy;
          if (span < 0) continue;
          const hw = Math.floor(Math.sqrt(span)), Ly = L - dy / r * .18;
          for (let dx = -hw; dx <= hw; dx++) this.plot(x + dx, y + dy, mat, Ly);
        }
      }
      run += seg;
    }
  },

  // an eye: a dark socket, a lit iris, a pupil, a glint, and a glow around it
  eye(x, y, r, col, o) {
    o = o || {};
    if (o.blink && o.blink < .5) { this.stroke([[x - r, y], [x + r, y]], .6, .6, MAT.DARK, .1); return; }
    if (r < 1.4) {
      this.plot(x, y, MAT.EYE, 1);
      if (r >= 1) this.plot(x + 1, y, MAT.EYE, .7);
      if (o.glow) this.emit.push({ x, y, r: 3, col, a: .25 });
      return;
    }
    this.blob(x, y, r + 1, r + .8, MAT.DARK, { lit: .15 });
    this.blob(x, y, r, r * .92, MAT.EYE, { lit: .72, tex: (px, py, nx, ny) => -ny * .2 });
    if (o.slit) {
      for (let yy = Math.round(y - r * .8); yy <= Math.round(y + r * .8); yy++) this.plot(x, yy, MAT.PUPIL, 0);
    } else if (!o.blank) {
      this.blob(x + r * .15, y + r * .1, Math.max(.6, r * .38), Math.max(.6, r * .42), MAT.PUPIL, { lit: 0 });
    }
    if (o.lid) this.stroke([[x - r, y - r * .4], [x + r, y - r * .4]], r * .45, r * .45, MAT.BODY, .35);
    this.plot(x - r * .4, y - r * .45, MAT.WHITE, 1);
    if (o.glow !== false) this.emit.push({ x, y, r: r * 1.5 + 2, col, a: .2 });
  },

  // a row of teeth along a jaw line, pointing along (nx, ny)
  teeth(ax, ay, bx, by, n, len, nx, ny, seed, lit) {
    for (let i = 0; i < n; i++) {
      const f = (i + .5) / n;
      const x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
      const l = len * (.55 + hash3(i, n, seed) * .7);
      this.stroke([[x, y], [x + nx * l, y + ny * l]], Math.min(1.4, len * .22 + .3), .2, MAT.TOOTH, lit === undefined ? .78 : lit);
    }
  },

  /* ---- resolve the pixels through the palette and put them on the frame ---- */

  _pool: new Map(),
  _surface(cw, ch) {
    const kw = Math.ceil(cw / 64) * 64, kh = Math.ceil(ch / 64) * 64, key = kw * 10000 + kh;
    let s = this._pool.get(key);
    if (!s) this._pool.set(key, s = this._fit(null, cw, ch));
    return s;
  },
  // a canvas at least cw x ch (in steps of 64), reusing `s` if it is big enough
  _fit(s, cw, ch) {
    if (s && s.img.width >= cw && s.img.height >= ch) return s;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(cw / 64) * 64; cv.height = Math.ceil(ch / 64) * 64;
    const c = cv.getContext('2d');
    const img = c.createImageData(cv.width, cv.height);
    return { cv, c, img, px: new Uint32Array(img.data.buffer) };
  },

  // a palette as packed pixels (little-endian ABGR), washed toward white by a hit
  _packed(pal, flash) {
    const q = Math.round(Math.min(1, Math.max(0, flash)) * 8);
    const cache = pal.packed || (pal.packed = []);
    if (cache[q]) return cache[q];
    const fl = q / 8 * .85;
    const pack = c => ((255 << 24) | (Math.round(c[2] + (240 - c[2]) * fl) << 16) |
      (Math.round(c[1] + (250 - c[1]) * fl) << 8) | Math.round(c[0] + (255 - c[0]) * fl)) >>> 0;
    const t = [];
    for (let k = 1; k < pal.length; k++) if (pal[k]) t[k] = pal[k].map(pack);
    t.outline = pack(pal.outline);
    return (cache[q] = t);
  },

  /* Resolve the buffer into pixels on a canvas (the shared pool's, or `into`'s
     own), and return everything needed to put them on a frame later. */
  bake(face, pal, flash, into) {
    const { w, mat, lit } = this;
    if (this.x1 < this.x0) return null;
    const x0 = this.x0 - 1, x1 = this.x1 + 1, y0 = this.y0 - 1, y1 = this.y1 + 1;
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const S = into === undefined ? this._surface(cw, ch) : this._fit(into, cw, ch);
    const px = S.px, W = S.img.width;
    const tbl = this._packed(pal, flash > 0 ? flash : 0), out = tbl.outline;
    const step = face > 0 ? 1 : -1;

    // clear the block, then visit only the filled pixels, outlining any empty side
    px.fill(0, 0, ch * W);
    for (let y = this.y0; y <= this.y1; y++) {
      const dith = (y & 3) << 2;
      const row = (y - y0) * W;
      for (let x = this.x0, i = y * w + this.x0; x <= this.x1; x++, i++) {
        const m = mat[i];
        if (!m) continue;
        const o = row + (face > 0 ? x - x0 : x1 - x);
        if (!mat[i - 1]) px[o - step] = out;
        if (!mat[i + 1]) px[o + step] = out;
        if (!mat[i - w]) px[o - W] = out;
        const below = mat[i + w];
        if (!below) px[o + W] = out;
        let v = lit[i] * 4;
        // where one material lies on another, the join reads as a crease
        if (below && below !== m && !EMISSIVE[m] && !EMISSIVE[below]) v -= 1;
        let base = v | 0;
        if (v - base > .38 + BAYER16[dith | (x & 3)] * .016) base++;
        px[o] = tbl[m][base < 0 ? 0 : (base > 4 ? 4 : base)];
      }
    }
    S.c.putImageData(S.img, 0, 0, 0, 0, cw, ch);
    return {
      S, cw, ch, face,
      ox: face > 0 ? this.ox - x0 : x1 - this.ox, oy: this.oy - y0,
      emit: this.emit.slice(), tilt: this.tilt,
      fade: 1 - Math.min(1, Math.max(0, flash || 0)) * .85
    };
  },

  // put baked pixels on the frame with their middle at (wx, wy), then their glows
  blit(g, wx, wy, b) {
    g.drawImage(b.S.cv, 0, 0, b.cw, b.ch, wx - b.ox * PIX, wy - b.oy * PIX, b.cw * PIX, b.ch * PIX);
    for (const e of b.emit) {
      const ex = wx + (b.face > 0 ? e.x : -e.x) * PIX, ey = wy + (e.y + e.x * b.tilt) * PIX;
      stepGlow(g, ex, ey, e.r * PIX, e.col, e.a * b.fade, { steps: 2, op: 'lighter' });
    }
  },

  finish(g, wx, wy, face, pal, flash) {
    const b = this.bake(face, pal, flash);
    if (b) this.blit(g, wx, wy, b);
  }
};

/* -------------------------------- palettes -------------------------------- */

// five tones for a colour: shadows cool and purple, highlights warm
function tones(c) {
  return [
    mix(shade(c, -.72), [34, 16, 62], .32),
    mix(shade(c, -.44), [36, 28, 80], .18),
    c,
    mix(shade(c, .2), [255, 236, 190], .1),
    mix(shade(c, .42), [255, 246, 220], .2)
  ];
}
// lights don't shade; they only get a little brighter where they're lit
function lights(c) { return [shade(c, -.4), shade(c, -.18), c, shade(c, .28), shade(c, .55)]; }
function flat(c) { return [c, c, c, c, c]; }

const _palettes = new Map();
function beastPalette(def, rage) {
  const key = def.id + (rage ? '!' : '');
  let P = _palettes.get(key);
  if (P) return P;
  const body = def.body, belly = def.belly || shade(def.body, .3), fin = def.fin || shade(def.body, -.2);
  const eye = rage ? [255, 58, 64] : hexRgb(def.eye || '#ffd76a');
  const glow = rage ? [255, 72, 72] : (def.glow ? hexRgb(def.glow) : eye);
  P = [];
  P[MAT.BODY] = tones(body);
  P[MAT.BELLY] = tones(belly);
  P[MAT.FIN] = tones(fin);
  P[MAT.SHELL] = tones(mix(body, belly, .22));
  P[MAT.MOUTH] = tones([96, 22, 42]);
  P[MAT.GUM] = tones([178, 80, 98]);
  P[MAT.TOOTH] = tones([238, 230, 206]);
  P[MAT.BONE] = tones([204, 194, 168]);
  P[MAT.METAL] = tones([124, 112, 104]);
  P[MAT.WOOD] = tones([128, 92, 58]);
  P[MAT.DARK] = tones([24, 14, 34]);
  P[MAT.EYE] = lights(eye);
  P[MAT.GLOW] = lights(glow);
  P[MAT.PUPIL] = flat([10, 4, 14]);
  P[MAT.WHITE] = flat([255, 252, 238]);
  P.outline = mix(shade(body, -.86), [10, 4, 20], .45);
  P.eyeCss = css(eye);
  P.glowCss = css(glow);
  _palettes.set(key, P);
  return P;
}

/* ------------------------------- body plans --------------------------------
   Every plan works in pixels, head toward +x. It gets S:
     L, H     length, and half-height (girth), in pixels
     t        time      thr  how hard it is thrashing (1 calm, 3 furious)
     gape     jaw open 0..1      seed  per-creature variety
     eyes     how many           def   the creature                        */

const Plans = {

  /* ------------------------------ eel ------------------------------ */
  eel(S) {
    const { L, H, t, thr, gape, seed, def } = S;
    const N = Math.max(10, Math.round(L / 5));
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, x = -L / 2 + u * L;
      const amp = (1 + (1 - u) * (H * .8 + 2)) * thr * (1 - u * .6);
      const y = Math.sin((1 - u) * 5 - t * 5.4) * amp;
      let r;
      if (u < .1) r = H * (.12 + u * 2.8);
      else if (u < .7) r = H * lerp(.4, .95, (u - .1) / .6);
      else if (u < .88) r = H * (.95 - (u - .7) * .2);
      else r = H * lerp(.9, .45, (u - .88) / .12);
      pts.push({ x, y, r: Math.max(1, r) });
    }
    const at = u => pts[Math.max(0, Math.min(N, Math.round(u * N)))];
    const head = pts[N], tail = pts[0], hy = head.y;

    // tail fin, and a ragged dorsal fin running down the back
    const wag = Math.sin(t * 5.4 + 1) * H * .5 * thr;
    Spr.poly([[tail.x + 2, tail.y], [tail.x - H * 1.3, tail.y - H * 1.15 + wag], [tail.x - H * .55, tail.y + wag * .3], [tail.x - H * 1.3, tail.y + H * 1.05 + wag]], MAT.FIN, .42);
    for (let i = Math.round(N * .18); i <= Math.round(N * .78); i++) {
      const p = pts[i], u = i / N;
      const fh = H * .65 * Math.sin((u - .18) / .6 * Math.PI) * (.75 + hash3(i, 1, seed) * .5);
      for (let y = p.y - p.r - fh; y <= p.y - p.r + 1; y++) Spr.plot(p.x, y, MAT.FIN, i % 3 ? .42 : .7);
    }
    const pf = at(.7);
    Spr.poly([[pf.x, pf.y], [pf.x - H * 1.2, pf.y + pf.r + H * .5], [pf.x - H * .3, pf.y + pf.r * .5]], MAT.FIN, .16);

    Spr.tube(pts, MAT.BODY, {
      belly: MAT.BELLY, bellyFrom: .32,
      tex: (x, y, n) => ((x + seed) % 7 < 2 && n < -.1 ? -.12 : 0) + (hash3(x, y, seed) > .92 && n < .2 ? .14 : 0)
    });
    // gills
    const gl = at(.8);
    for (let k = 0; k < 3; k++) for (let y = gl.y - gl.r * .25; y <= gl.y + gl.r * .45; y++) Spr.plot(gl.x + k * 2 - Math.round((y - gl.y) * .3), y, MAT.DARK, .2);
    Spr.poly([[pf.x + 2, pf.y + pf.r * .3], [pf.x - H * 1.1, pf.y + pf.r + H * .7 + Math.sin(t * 6) * 2], [pf.x - H * .2, pf.y + pf.r * .8]], MAT.FIN, .55);

    // jaws, and far too many teeth
    const hinge = [head.x - H * 1.3, hy + H * .12];
    const upper = [head.x + 1, hy + H * .04];
    const lower = [head.x - 1 - gape * H * .2, hy + H * .2 + gape * H * 1.2];
    if (gape > .06) {
      Spr.poly([hinge, upper, lower], MAT.MOUTH, .2);
      Spr.poly([hinge, lower, [lower[0] - H * .3, lower[1] + H * .35], [hinge[0] - 1, hinge[1] + H * .45]], MAT.BELLY, .5);
    }
    if (!def.gentle) {
      const tn = Math.max(2, Math.round(H * .8));
      Spr.teeth(hinge[0] + 2, hinge[1], upper[0] - 1, upper[1], tn, Math.max(1.5, H * .3), .2, 1, seed);
      Spr.teeth(hinge[0] + 2, hinge[1] + 1, lower[0], lower[1] - 1, tn, Math.max(1.5, H * .28), -.1, -1, seed + 3);
    }
    const er = Math.max(1, Math.min(3, H * .16));
    Spr.eye(head.x - H * .85, hy - H * .4, er, S.pal.eyeCss, { blink: S.blink });
    for (let e = 1; e < S.eyes; e++) Spr.eye(head.x - H * (.85 + e * .55), hy - H * (.55 + (e % 2) * .12), Math.max(1, er * .6), S.pal.eyeCss);
    if (def.glow) for (let i = 2; i < N * .72; i += 3) Spr.plot(pts[i].x, pts[i].y + pts[i].r * .15, MAT.GLOW, .55 + Math.sin(t * 3 + i) * .35);
  },

  /* ----------------------------- angler ----------------------------- */
  angler(S) {
    const { L, H, t, thr, gape, seed } = S;
    const bob = Math.round(Math.sin(t * 2));
    const rx = L * .31, ry = H * 1.08, bx = -L * .06, by = bob;
    const sway = Math.sin(t * 5) * H * .3 * thr;

    Spr.tube([{ x: -L * .5, y: sway, r: H * .14 }, { x: -L * .38, y: sway * .5, r: H * .32 }, { x: -L * .26, y: 0, r: H * .6 }], MAT.BODY, { belly: MAT.BELLY });
    Spr.poly([[-L * .47, sway], [-L * .6, sway - H * .9], [-L * .55, sway], [-L * .6, sway + H * .9]], MAT.FIN, .45);
    Spr.poly([[bx, by + ry * .3], [bx - rx * .7, by + ry * 1.1], [bx - rx * .2, by + ry * .7]], MAT.FIN, .18);

    // the body, lumpy and warted
    Spr.blob(bx, by, rx, ry, MAT.BODY, {
      belly: MAT.BELLY, bellyFrom: .42,
      tex: (x, y) => { const q = hash3(x >> 1, y >> 1, seed); return q > .9 ? .2 : (q < .05 ? -.18 : 0); }
    });
    Spr.blob(L * .17, by - ry * .2, rx * .42, ry * .58, MAT.BODY, { tex: (x, y) => hash3(x >> 1, y >> 1, seed + 1) > .9 ? .18 : 0 });
    for (let k = 0; k < 4; k++) {
      const sx = bx - rx * (.1 + k * .22), sy = by - ry * (.95 - k * .05);
      Spr.stroke([[sx, sy], [sx - H * .15, sy - H * (.45 - k * .06)]], .9, .3, MAT.FIN, .6);
    }

    // the underbite: a lower jaw that hangs open, needle teeth far too long
    const hinge = [L * .02, by + ry * .12];
    const tip = [L * .45, by + ry * .08 + gape * ry * .9];
    Spr.poly([hinge, [L * .38, by - ry * .05], tip], MAT.MOUTH, .2);
    Spr.poly([hinge, tip, [tip[0] - 2, tip[1] + ry * .32], [hinge[0] - rx * .25, by + ry * .9]], MAT.BELLY, (x, y) => .55 - (y - by) / ry * .2);
    const n = Math.max(3, Math.round(L * .045));
    Spr.teeth(L * .12, by - ry * .08, L * .38, by - ry * .03, n, Math.max(2, H * .42), .1, 1, seed);
    Spr.teeth(hinge[0] + 3, hinge[1] + 1, tip[0] - 1, tip[1] - 1, n + 1, Math.max(2.5, H * .5), .2, -1, seed + 7);

    // the lure
    const lx = L * .47 + Math.sin(t * 1.3) * 2, ly = by - ry * 1.4 + Math.sin(t * 1.9) * 3;
    Spr.stroke([[L * .12, by - ry * .75], [L * .22, by - ry * 1.35], [L * .38, by - ry * 1.6], [lx, ly]], .8, .5, MAT.FIN, .55);
    const bulb = Math.max(1.5, H * .11);
    Spr.blob(lx, ly + 1, bulb, bulb, MAT.GLOW, { lit: .95 });
    Spr.emit.push({ x: lx, y: ly + 1, r: bulb * 2.5 + 2, col: S.pal.glowCss, a: .4 });

    // small mean eyes, or one great glass one
    if (S.eyes === 1) Spr.eye(L * .2, by - ry * .38, Math.max(3, H * .26), S.pal.eyeCss, { blink: S.blink, glow: false });
    else {
      Spr.eye(L * .22, by - ry * .42, Math.max(1.4, H * .1), S.pal.eyeCss, { blink: S.blink, glow: false });
      for (let e = 1; e < S.eyes; e++) Spr.eye(L * (.22 - e * .06), by - ry * (.55 + e * .05), 1, S.pal.eyeCss);
    }
    Spr.poly([[bx + rx * .1, by + ry * .25], [bx - rx * .45, by + ry * .95 + Math.sin(t * 4) * 2], [bx, by + ry * .7]], MAT.FIN, .5);
  },

  /* ---------------------------- tentacle ---------------------------- */
  tentacle(S) {
    const { L, H, t, thr, gape, seed, def } = S;
    const r0 = Math.max(1.2, H * .13);
    const breathe = Math.sin(t * 1.8) * .05;
    const fx = L * .2, fy = -H * .05;

    // arms hang from under the face and curl as they trail back
    const arm = (k, lit) => {
      let x = fx - L * .02 - k * L * .018, y = fy + H * .45;
      let a = Math.PI * (.52 + k * .045);
      const len = L * (.5 + hash3(k, 1, seed) * .2), step = len / 11;
      const curl = (k % 2 ? 1 : -1) * .06;
      const pts = [];
      for (let s = 0; s < 12; s++) {
        pts.push([x, y]);
        a += Math.sin(t * 2.2 * (.6 + thr * .4) - s * .6 + k * 1.9) * .2 + (s > 6 ? curl * (s - 6) : 0);
        x += Math.cos(a) * step; y += Math.sin(a) * step;
      }
      Spr.stroke(pts, r0, .4, MAT.BODY, lit);
      for (let j = 2; j < pts.length - 2; j += 2) Spr.plot(pts[j][0] + 1, pts[j][1] + Math.max(1, r0 * (1 - j / 12)), MAT.BONE, lit + .3);
      const [ex, ey] = pts[pts.length - 1];
      if (def.id === 'palefinger') for (let f = -1; f <= 1; f++) Spr.stroke([[ex, ey], [ex - 2 + f, ey + 2 + Math.abs(f)]], .5, .3, MAT.BELLY, lit + .2);
      if (def.id === 'hookhand' && k % 2 === 0) Spr.stroke([[ex, ey], [ex - 2, ey + 2], [ex - 1, ey + 4], [ex + 1, ey + 3]], .6, .5, MAT.BONE, .75);
      if (def.glow && k % 2) Spr.plot(ex, ey, MAT.GLOW, .9);
    };

    for (let k = 1; k < 8; k += 2) arm(k, .18);
    // the mantle: a heavy sac swelling up and back from the head
    const sway = Math.sin(t * 1.3) * .06;
    Spr.oval(-L * .07, -H * .6, L * .31 * (1 + breathe * .5), H * .64 * (1 + breathe), .42 + sway, MAT.BODY, {
      belly: MAT.BELLY, bellyFrom: .7,
      tex: (x, y, u, v) => { const q = hash3(x >> 1, y >> 1, seed); return (q > .88 ? -.15 : 0) + (q < .05 ? .15 : 0) + (Math.abs(Math.sin(u * 9)) < .12 && v < 0 ? -.1 : 0); }
    });
    // a siphon under the mantle
    Spr.stroke([[fx - L * .12, fy + H * .1], [fx - L * .2, fy + H * .3], [fx - L * .24, fy + H * .28]], Math.max(1, H * .1), Math.max(1, H * .08), MAT.BODY, .3);
    // the face
    Spr.blob(fx, fy, L * .14, H * .52, MAT.BODY, { belly: MAT.BELLY, bellyFrom: .35, tex: (x, y) => hash3(x >> 1, y >> 1, seed + 2) > .9 ? -.14 : 0 });
    for (let k = 0; k < 8; k += 2) arm(k, .5);

    // a hooked beak between the arms
    const bxp = fx + L * .06, byp = fy + H * .5;
    Spr.blob(bxp, byp, H * .2, H * .12 + gape * H * .16, MAT.MOUTH, { lit: .2 });
    Spr.poly([[bxp - H * .15, byp - 1], [bxp + H * .28, byp + 1], [bxp - H * .08, byp + 2]], MAT.BONE, .75);
    Spr.poly([[bxp - H * .12, byp + 2 + gape * H * .25], [bxp + H * .2, byp + 2 + gape * H * .25], [bxp - H * .06, byp + 4 + gape * H * .25]], MAT.BONE, .5);

    // a heavy brow over the main eye, and smaller eyes scattered over the head
    const ex = fx + L * .03, ey = fy - H * .2;
    Spr.blob(ex - 1, ey - 1, H * .22, H * .19, MAT.BODY, {});
    Spr.eye(ex, ey, Math.max(1.5, H * .13), S.pal.eyeCss, { blink: S.blink, slit: true, lid: true, glow: false });
    for (let e = 1; e < S.eyes; e++) {
      const a = e * 2.4 + seed;
      Spr.eye(fx - L * .06 + Math.cos(a) * L * .06, fy - H * .35 + Math.sin(a) * H * .3, 1, S.pal.eyeCss);
    }
    if (def.glow) for (let v = 0; v < 6; v++) Spr.plot(-L * .12 + v * L * .045, -H * .95 + Math.sin(v * 1.7) * H * .2, MAT.GLOW, .65 + Math.sin(t * 4 + v) * .3);
  },

  /* ------------------------------- ray ------------------------------ */
  ray(S) {
    const { L, H, t, thr, gape, seed, def } = S;
    // seen from a little above: the far wing rises over the body, the near one sweeps under
    const flap = Math.sin(t * 2.2 * (.8 + thr * .25));
    const farTip = -H * (1.5 + flap * .9), nearTip = H * (1.5 - flap * .9);

    const wing = (tip, mat, lit) => {
      const s = Math.sign(tip);
      Spr.poly([
        [L * .2, s * H * .1], [L * .12, tip * .45], [-L * .02, tip * .88], [-L * .1, tip],
        [-L * .14, tip * .8], [-L * .2, tip * .45], [-L * .3, s * H * .1]
      ], mat, (x, y) => lit - Math.abs(y) / (Math.abs(tip) + 1) * .15 + (hash3(x >> 1, y >> 1, seed) > .94 ? .12 : 0));
      Spr.stroke([[L * .2, s * H * .1], [L * .12, tip * .45], [-L * .02, tip * .88], [-L * .1, tip]], Math.max(.8, H * .08), .5, mat, lit + .15);
      for (let k = 1; k < 4; k++) Spr.stroke([[-L * .02 + k * L * .03, s * H * .3], [-L * .1 + k * L * .02, tip * (.75 - k * .08)]], .4, .4, MAT.DARK, lit * .5);
    };

    const tail = [];
    for (let s = 0; s <= 1.0001; s += .1) tail.push([-L * .28 - s * L * .55, Math.sin(s * 4 - t * 3) * H * .45 * s]);
    Spr.stroke(tail, Math.max(1, H * .12), .3, MAT.FIN, .45);
    Spr.stroke([[-L * .32, 0], [-L * .37, -H * .4]], .7, .3, MAT.BONE, .7);

    wing(farTip, MAT.BODY, .3);
    Spr.blob(0, 0, L * .3, H * .48, MAT.BODY, { belly: MAT.BELLY, bellyFrom: .2, tex: (x, y) => hash3(x >> 1, y >> 1, seed + 3) > .92 ? .15 : 0 });
    wing(nearTip, flap > .3 ? MAT.BELLY : MAT.BODY, .62);

    // curled horns either side of the mouth
    Spr.stroke([[L * .26, -H * .18], [L * .36, -H * .42], [L * .43, -H * .35], [L * .41, -H * .18]], Math.max(1, H * .13), .6, MAT.FIN, .55);
    Spr.stroke([[L * .27, H * .14], [L * .37, H * .36 + gape * H * .3], [L * .43, H * .28 + gape * H * .3]], Math.max(1, H * .11), .5, MAT.FIN, .4);
    if (gape > .1) Spr.blob(L * .34, H * .04, H * .18, H * (.08 + gape * .18), MAT.MOUTH, { lit: .2 });
    if (def.id === 'gallowsgill') for (let y = -H * .45; y <= H * .45; y++) Spr.plot(L * .16 + Math.round(y * .2), y, MAT.BONE, .62);
    for (let e = 0; e < Math.max(1, S.eyes); e++) Spr.eye(L * (.22 - e * .045), -H * (.2 + e * .07), Math.max(1, H * .1), S.pal.eyeCss, { blink: S.blink, glow: false });
    // the cathedral rays are lit from inside, like stained glass
    if (def.glow) {
      for (let k = 0; k < 9; k++) {
        const u = (k % 3 + 1) / 4, v = (Math.floor(k / 3) + 1) / 4;
        Spr.plot(lerp(L * .1, -L * .16, v), farTip * u, MAT.GLOW, .7 + Math.sin(t * 2 + k) * .25);
        Spr.plot(lerp(L * .1, -L * .16, v), nearTip * u, MAT.GLOW, .7 + Math.sin(t * 2 + k + 1) * .25);
      }
    }
    if (def.id === 'sootwing') for (let k = 0; k < 5; k++) Spr.blob(-L * .45 - k * 4, Math.sin(t * 2 + k) * 3, 1.5 + k * .4, 1.5 + k * .4, MAT.DARK, { lit: .2 });
  },

  /* --------------------------- crustacean --------------------------- */
  crustacean(S) {
    const { L, H, t, thr, gape, seed, def } = S;
    const walk = t * 7 * (thr > 1.5 ? 1.8 : 1);
    const legR = Math.max(.7, H * .07);

    // jointed legs splayed fore and aft, stepping in turn
    const leg = (k, lit, side) => {
      const hx = -L * .1 + k * L * .085, hy = H * .5;
      const ph = walk + k * 1.4 + side;
      const lift = Math.max(0, Math.sin(ph)) * H * .3;
      const out = (k - 1.5) * H * .5;
      const kx = hx + out + Math.cos(ph) * H * .12, ky = H * .3 - lift * .4;
      const fx = kx + out * .5 + Math.cos(ph) * H * .25, fy = H * 1.55 - lift;
      Spr.stroke([[hx, hy], [kx, ky], [fx, fy]], legR * 1.4, legR * .5, MAT.SHELL, lit);
      Spr.plot(kx, ky - legR, MAT.BONE, lit + .25);
    };
    // a heavy claw on a jointed arm; the lower finger drops open
    const claw = (dx, dy, lit, big) => {
      const sway = Math.sin(t * 2 + dx) * H * .12;
      const sh = [L * .2 + dx, H * .3 + dy], el = [L * .3 + dx, H * .75 + dy + sway], wr = [L * .38 + dx, H * .35 + dy + sway];
      Spr.stroke([sh, el, wr], Math.max(1, H * .12), Math.max(1, H * .1), MAT.SHELL, lit);
      const s = H * (big ? .6 : .48);
      const px = wr[0] + s * .45, py = wr[1];
      Spr.blob(px, py, s * .62, s * .44, MAT.SHELL, { tex: (x, y, nx, ny) => lit - .5 - ny * .15 + (hash3(x, y, seed) > .9 ? .15 : 0) });
      Spr.poly([[px + s * .25, py - s * .4], [px + s * 1.5, py - s * .16], [px + s * 1.55, py - s * .02], [px + s * .45, py + s * .02]], MAT.SHELL, lit + .1);
      const drop = gape * s * .7;
      Spr.poly([[px + s * .35, py + s * .12], [px + s * 1.3, py + s * .2 + drop], [px + s * 1.25, py + s * .34 + drop], [px + s * .3, py + s * .4]], MAT.SHELL, lit - .1);
      Spr.teeth(px + s * .5, py, px + s * 1.4, py - s * .05, 4, Math.max(1, s * .16), 0, 1, seed + (dx | 0), lit + .25);
    };

    for (let k = 0; k < 4; k++) leg(k, .15, 2.1);
    claw(-L * .05, -H * .2, .2, false);
    for (let a = 0; a < 2; a++) {
      const pts = [];
      for (let s = 0; s <= 1.0001; s += .1) pts.push([L * .3 - s * L * .75, -H * (.7 + a * .1) - Math.sin(s * 2.2) * H * .45 + s * s * H * .3 + Math.sin(s * 6 - t * 3 + a) * H * .1 * s]);
      Spr.stroke(pts, .5, .3, MAT.FIN, .5 - a * .2);
    }
    // the tail: plated, with a fan on the end
    const tw = Math.sin(t * 2) * H * .12;
    Spr.poly([[-L * .45, H * .1 + tw], [-L * .57, -H * .35 + tw], [-L * .61, H * .15 + tw], [-L * .55, H * .6 + tw]], MAT.SHELL, .45);
    const seg = Math.max(4, Math.round(L * .06));
    Spr.tube([
      { x: -L * .47, y: H * .12 + tw, r: H * .28 }, { x: -L * .36, y: tw * .6, r: H * .45 },
      { x: -L * .24, y: -H * .05 + tw * .3, r: H * .58 }, { x: -L * .12, y: -H * .1, r: H * .68 }
    ], MAT.SHELL, {
      belly: MAT.BODY, bellyFrom: .5,
      tex: (x, y, n) => ((((x | 0) % seg) + seg) % seg === 0 ? -.4 : 0) + (n < -.7 ? .1 : 0)
    });
    // the carapace, a ridge of spines, and a horn over the eyes
    Spr.blob(L * .06, -H * .12, L * .23, H * .88, MAT.SHELL, {
      belly: MAT.BODY, bellyFrom: .45,
      tex: (x, y, nx, ny) => (Math.abs(nx + .15) < .05 && ny < .35 ? -.3 : 0) + (hash3(x, y, seed) > .94 ? .16 : 0)
    });
    for (let k = 0; k < 5; k++) {
      const sx = -L * .1 + k * L * .06, sy = -H * (.92 - Math.abs(k - 2) * .07);
      Spr.poly([[sx - 1.5, sy + 2], [sx - H * .18, sy - H * .28], [sx + 1.5, sy + 1]], MAT.SHELL, .8);
    }
    Spr.poly([[L * .2, -H * .72], [L * .36, -H * .66], [L * .24, -H * .52]], MAT.SHELL, .75);
    for (let k = 0; k < 6; k++) Spr.blob(-L * .1 + hash3(k, 3, seed) * L * .3, -H * (.15 + hash3(k, 4, seed) * .55), .8, .8, MAT.BONE, { lit: .65 });
    if (def.id === 'netbiter') {
      for (let k = 0; k < 6; k++) Spr.stroke([[-L * .14 + k * L * .06, -H * .85], [-L * .08 + k * L * .06, H * .2]], .3, .3, MAT.BONE, .5);
      for (let k = 0; k < 3; k++) Spr.stroke([[-L * .16, -H * (.6 - k * .3)], [L * .24, -H * (.5 - k * .3)]], .3, .3, MAT.BONE, .5);
    }
    if (def.glow || def.id === 'hollowshell') for (let y = -H * .6; y < H * .2; y++) Spr.plot(L * .08 + Math.round(Math.sin(y * .8) * 1.5), y, MAT.GLOW, .8);
    // eyes on short stalks, more of them on the worse ones
    for (let e = 0; e < Math.max(2, S.eyes); e++) {
      const ex = L * (.26 + (e % 3) * .025), ey = -H * (.95 + (e % 2) * .16 + Math.floor(e / 3) * .1);
      Spr.stroke([[L * .23, -H * .6], [ex, ey]], .5, .5, MAT.SHELL, .45);
      Spr.eye(ex, ey, 1, S.pal.eyeCss, { glow: true });
    }
    for (let k = 0; k < 4; k++) leg(k, .55, 0);
    claw(0, 0, .6, true);
  },

  /* ------------------------------ bloom ----------------------------- */
  bloom(S) {
    const { L, H, t, thr, seed, def } = S;
    const pulse = Math.sin(t * 3.2 * (thr > 1.5 ? 1.6 : 1));
    const cx = L * .06, rx = L * .3 * (1 - pulse * .06), ry = H * .95 * (1 + pulse * .06);
    const rim = cx - rx * .28;                        // the open back of the bell

    // stinging threads trailing from the rim
    for (let k = 0; k < 11; k++) {
      const y0 = -ry * .8 + k / 10 * ry * 1.6, len = L * (.45 + hash3(k, 5, seed) * .4);
      const pts = [];
      for (let s = 0; s <= 1.0001; s += .1) pts.push([rim - s * len, y0 * (1 - s * .25) + Math.sin(s * 6 - t * 2.4 + k) * H * .2 * s]);
      Spr.stroke(pts, .5, .4, MAT.FIN, .3 + (k % 3) * .1);
      if (def.glow) for (let j = 3; j < pts.length; j += 3) Spr.plot(pts[j][0], pts[j][1], MAT.GLOW, .45 + Math.sin(t * 5 + j + k) * .35);
    }
    // frilled mouth-arms from the middle of the bell
    for (let k = 0; k < 4; k++) {
      const pts = [];
      const y0 = (k - 1.5) * ry * .2;
      for (let s = 0; s <= 1.0001; s += .125) pts.push([rim + 3 - s * L * .38, y0 + Math.sin(s * 4 - t * 2 + k * 1.7) * H * .25 * s]);
      Spr.stroke(pts, Math.max(1.5, H * .13), .6, MAT.BELLY, (u) => .5 + Math.sin(u * 28 + t * 3) * .22);
    }
    // the bell: a dome with its rounded top leading, canals running out from the crown
    for (let y = Math.floor(-ry); y <= Math.ceil(ry); y++) {
      const dy = y / ry;
      if (dy < -1 || dy > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      for (let x = Math.ceil(rim); x <= Math.floor(cx + half); x++) {
        const nx = (x - cx) / rx;
        const canal = Math.abs(Math.sin(Math.atan2(dy, nx + .5) * 4.5)) < .1 && nx < .75;
        Spr.plot(x, y, MAT.BODY, .38 + nx * .2 - dy * .16 + (canal ? .16 : 0) + (hash3(x >> 1, y >> 1, seed) > .95 ? .1 : 0));
      }
    }
    // a scalloped skirt round the open back
    for (let k = 0; k <= 9; k++) Spr.blob(rim - 1, -ry * .9 + k / 9 * ry * 1.8, 1.3, 1.9, MAT.BODY, { lit: .6 });
    // what glows inside it
    for (let k = 0; k < 3; k++) Spr.blob(cx + rx * (.05 + (k % 2) * .12), (k - 1) * ry * .36, Math.max(1, H * .11), Math.max(1, H * .08), MAT.GLOW, { lit: .55 + Math.sin(t * 3 + k) * .3 });
    Spr.emit.push({ x: cx + rx * .1, y: 0, r: Math.max(4, H * .5), col: S.pal.glowCss, a: .2 });
    for (let a = -1.35; a < -.3; a += .08) Spr.plot(cx + Math.cos(a) * rx * .82, Math.sin(a) * ry * .86, MAT.WHITE, 1);

    for (let e = 0; e < S.eyes; e++) Spr.eye(rim + 2, -ry * .8 + (e + .5) / S.eyes * ry * 1.6, 1, S.pal.eyeCss, { glow: true });
    if (def.id === 'choir') {
      for (let k = 0; k < 5; k++) {
        const fx = cx + rx * (.08 + (k % 2) * .26), fy = (k - 2) * ry * .3;
        Spr.blob(fx, fy, 2.2, 2.8, MAT.BONE, { lit: .72 });
        Spr.plot(fx - 1, fy - 1, MAT.DARK, 0); Spr.plot(fx + 1, fy - 1, MAT.DARK, 0); Spr.plot(fx, fy + 1, MAT.DARK, .1);
      }
    }
    if (def.id === 'weepingbell') for (let k = 0; k < 7; k++) Spr.plot(rim - 2, -ry * .75 + k * ry * .25 + ((t * 14 + k * 5) % 9), MAT.GLOW, .9);
  },

  /* ------------------------------- husk ------------------------------ */
  husk(S) {
    const { L, H, t, thr, gape, seed, def } = S;
    const N = Math.max(10, Math.round(L / 7));
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pts.push({
        x: -L * .46 + u * L * .72,
        y: Math.sin((1 - u) * 3 - t * 2.4) * (1 + (1 - u) * H * .3) * thr * .6,
        r: H * (u < .15 ? .25 + u * 3.5 : .85 - Math.abs(u - .55) * .3)
      });
    }
    // nets and chain trailing off it
    for (let k = 0; k < 3; k++) {
      const p = pts[2 + k * 2], line = [];
      for (let s = 0; s <= 1.0001; s += .125) line.push([p.x - s * H * 1.2, p.y + p.r + s * H * (1.4 + k * .4) + Math.sin(s * 4 - t * 2 + k) * 3]);
      Spr.stroke(line, .4, .4, def.id === 'hollow' ? MAT.METAL : MAT.BONE, .35);
    }
    const tail = pts[0];
    for (let k = -2; k <= 2; k++) Spr.stroke([[tail.x, tail.y], [tail.x - H * 1.1, tail.y + k * H * .38 + Math.sin(t * 3) * 2]], .6, .3, MAT.BONE, .5);

    // what is left of its hide: a strip along the back and one along the belly
    Spr.tube(pts, MAT.BODY, { tex: (x, y, n) => (hash3(x >> 1, y >> 1, seed) > .85 ? -.2 : 0) });
    // the hollow inside, and the light still burning in it
    const core = pts[Math.round(N * .5)];
    const beat = .5 + Math.sin(t * 3.5) * .3;
    for (let i = 1; i < N; i++) {
      const p = pts[i], open = p.r * (.55 + hash3(i, 12, seed) * .28);
      for (let y = Math.round(p.y - open); y <= Math.round(p.y + open); y++) {
        Spr.plot(p.x, y, MAT.DARK, .05 + Math.max(0, .35 - Math.hypot(p.x - core.x, y - core.y) / H * .3));
      }
    }
    if (def.id === 'hollow') {
      for (let i = 3; i < N - 3; i += 3) Spr.poly([[pts[i].x - 2, pts[i].y - pts[i].r * .5], [pts[i].x + 2, pts[i].y - pts[i].r * .5], [pts[i].x + 2, pts[i].y + pts[i].r * .4], [pts[i].x - 2, pts[i].y + pts[i].r * .4]], MAT.WOOD, .38);
    }
    Spr.blob(core.x, core.y, H * .24, H * .22, MAT.GLOW, { lit: beat });
    Spr.emit.push({ x: core.x, y: core.y, r: H * .7, col: S.pal.glowCss, a: .3 });
    // ribs: thin curved bones with the dark between them
    const ribR = Math.max(.45, H * .022);
    for (let i = 2; i < N - 1; i += 2) {
      const p = pts[i];
      Spr.stroke([[p.x, p.y - p.r * .95], [p.x - H * .26, p.y - p.r * .45], [p.x - H * .24, p.y + p.r * .3], [p.x + H * .02, p.y + p.r * .88]], ribR * 1.5, ribR, MAT.BONE, (u) => .58 - u * .3);
    }
    // spine, rags of flesh, barnacles
    for (let i = 1; i < N; i++) Spr.blob(pts[i].x, pts[i].y - pts[i].r, 1.2, 1, MAT.BONE, { lit: .8 });
    for (let i = 3; i < N - 1; i += 3) Spr.stroke([[pts[i].x + 2, pts[i].y + pts[i].r * .7], [pts[i].x + 1, pts[i].y + pts[i].r + 3 + Math.sin(t * 3 + i) * 2]], .7, .3, MAT.BODY, .3);
    for (let k = 0; k < 8; k++) { const p = pts[Math.floor(hash3(k, 6, seed) * N)]; Spr.blob(p.x, p.y - p.r + 1, .8, .8, MAT.BONE, { lit: .5 }); }

    // the skull: long, cracked, with a jaw full of needles
    const head = pts[N];
    const sx = head.x + L * .05, sy = head.y;
    Spr.blob(sx - L * .02, sy - H * .12, L * .11, H * .62, MAT.BONE, { tex: (x, y) => hash3(x, y, seed) > .93 ? -.3 : 0 });
    Spr.poly([[sx, sy - H * .55], [sx + L * .2, sy - H * .05], [sx + L * .19, sy + H * .1], [sx, sy + H * .18]], MAT.BONE, (x, y) => .64 - (y - sy) / H * .28);
    const hinge = [sx - L * .05, sy + H * .26], jt = [sx + L * .18, sy + H * .2 + gape * H * .8];
    if (gape > .06) Spr.poly([hinge, [sx + L * .18, sy + H * .08], jt], MAT.DARK, .05);
    Spr.poly([hinge, jt, [jt[0] - 2, jt[1] + H * .16], [hinge[0], hinge[1] + H * .28]], MAT.BONE, .45);
    Spr.teeth(sx - L * .01, sy + H * .12, sx + L * .17, sy + H * .08, 7, Math.max(1.5, H * .2), 0, 1, seed);
    Spr.teeth(hinge[0] + 2, hinge[1], jt[0] - 1, jt[1], 7, Math.max(1.5, H * .18), 0, -1, seed + 2);
    Spr.blob(sx + L * .01, sy - H * .24, H * .2, H * .18, MAT.DARK, { lit: .02 });
    Spr.eye(sx + L * .01, sy - H * .24, 1, S.pal.eyeCss, { glow: true });
    for (let e = 1; e < S.eyes; e++) Spr.eye(pts[N - e * 2].x, pts[N - e * 2].y - H * .1, 1, S.pal.eyeCss, { glow: true });
    Spr.stroke([[sx - L * .07, sy - H * .5], [sx - L * .04, sy - H * .34], [sx - L * .06, sy - H * .2]], .4, .4, MAT.DARK, .1);
  },

  /* ------------------------------- maw ------------------------------- */
  maw(S) {
    const { L, H, t, thr, gape, seed, def } = S;
    const bob = Math.round(Math.sin(t * 2));
    const bx = -L * .04, by = bob, rx = L * .33, ry = H * .95;
    const sw = Math.sin(t * 4) * H * .25 * thr;

    Spr.poly([[-L * .34, by], [-L * .5, by - H * .6 + sw], [-L * .44, by + sw * .3], [-L * .5, by + H * .6 + sw]], MAT.FIN, .45);
    Spr.poly([[bx - rx * .3, by + ry * .7], [bx - rx * .52, by + ry * 1.2], [bx - rx * .05, by + ry * .88]], MAT.FIN, .22);
    // lumps along the back
    for (let k = 0; k < 5; k++) Spr.blob(bx - rx * .6 + k * rx * .28, by - ry * .9 + Math.abs(k - 2) * ry * .07, H * .15, H * .12, MAT.BODY, {});

    Spr.blob(bx, by, rx, ry, MAT.BODY, {
      belly: MAT.BELLY, bellyFrom: .55,
      tex: (x, y, nx, ny) => (Math.abs(Math.sin(nx * 8 + ny * 2.5 + seed)) < .06 && nx < .2 ? -.2 : 0) + (hash3(x, y, seed) > .95 ? .14 : 0)
    });
    if (def.id === 'gulperwidow') {
      for (let k = 0; k < 6; k++) Spr.stroke([[bx - rx * .85 + k * rx * .22, by - ry * .9], [bx - rx * .98 + k * rx * .22, by + ry * .35]], .3, .3, MAT.BONE, .45);
      for (let k = 0; k < 3; k++) Spr.stroke([[bx - rx * .95, by - ry * (.6 - k * .35)], [bx + rx * .1, by - ry * (.75 - k * .35)]], .3, .3, MAT.BONE, .45);
    }

    // the mouth: a wedge opening straight into the front of it
    const mx = bx - rx * .05, my = by + ry * .05;
    const a = .14 + gape * .45, reach = rx * 1.25;
    const top = [mx + reach, my - Math.tan(a) * reach], bot = [mx + reach, my + Math.tan(a) * reach];
    Spr.poly([[mx, my], top, bot], MAT.MOUTH, (x) => .05 + (x - mx) / reach * .32);
    Spr.blob(mx + reach * .5, my + Math.tan(a) * reach * .25, reach * .2, Math.max(1, Math.tan(a) * reach * .22), MAT.GUM, { lit: .42 });
    Spr.stroke([[mx + 2, my - 1], top], Math.max(.8, H * .08), Math.max(1, H * .11), MAT.GUM, .6);
    Spr.stroke([[mx + 2, my + 1], bot], Math.max(.8, H * .08), Math.max(1, H * .11), MAT.GUM, .48);
    const tn = Math.max(4, Math.round(L * .05));
    const ang = Math.atan2(top[1] - my, top[0] - mx), ang2 = Math.atan2(bot[1] - my, bot[0] - mx);
    Spr.teeth(mx + reach * .2, my - Math.tan(a) * reach * .2, top[0] - 2, top[1] + 1, tn, Math.max(2, H * .3), -Math.sin(ang) * .3, Math.cos(ang), seed);
    Spr.teeth(mx + reach * .2, my + Math.tan(a) * reach * .2, bot[0] - 2, bot[1] - 1, tn, Math.max(2, H * .3), Math.sin(ang2) * .3, -Math.cos(ang2), seed + 5);

    // eyes set in rows along the head, like an audience
    const count = Math.max(1, S.eyes);
    for (let e = 0; e < count; e++) {
      const side = e % 2 ? 1 : -1, k = Math.floor(e / 2);
      const theta = side * (.95 + k * .36);
      const ex = bx + Math.cos(theta) * rx * .66, ey = by + Math.sin(theta) * ry * .68;
      Spr.eye(ex, ey, Math.max(1, H * (.09 - k * .01)), S.pal.eyeCss, { blink: S.blink, slit: def.id !== 'penance', lid: def.id === 'penance', glow: false });
    }
    if (def.glow) for (let k = 0; k < 6; k++) Spr.plot(bx - rx * .65 + k * rx * .16, by - ry * .5 + (k % 3) * 2, MAT.GLOW, .55 + Math.sin(t * 4 + k) * .3);
  },

  /* ---------------------------- leviathan ---------------------------- */
  leviathan(S, m) {
    const { L, H, t, thr, gape, seed } = S;
    const rage = !!(m && m.rage);
    const N = Math.max(16, Math.round(L / 5));
    const bodyEnd = .74;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, x = -L * .5 + u * L * bodyEnd;
      const amp = (2 + (1 - u) * H * .9) * thr * (1 - u * .7);
      const y = Math.sin((1 - u) * 3.6 - t * (rage ? 3.4 : 2.2)) * amp + Math.sin((1 - u) * 1.6 - t * 1.3) * amp * .35;
      const r = H * (u < .16 ? .1 + u * 3.3 : .64 - Math.abs(u - .6) * .22);
      pts.push({ x, y, r: Math.max(1.5, r) });
    }
    const P = f => pts[Math.max(0, Math.min(N, Math.round(f * N)))];
    const hd = pts[N], hx = hd.x + H * .45, hy = hd.y;

    // fins trailing off the flanks, in shadow
    for (let k = 0; k < 5; k++) {
      const p = P(.25 + k * .12), line = [];
      for (let s = 0; s <= 1.0001; s += .125) line.push([p.x - s * L * .16, p.y + p.r * .6 + s * H * .9 + Math.sin(s * 4 - t * 2 + k) * H * .22]);
      Spr.stroke(line, Math.max(.8, H * .06), .4, MAT.FIN, .18);
    }
    const tp = pts[0];
    Spr.poly([[tp.x + 4, tp.y], [tp.x - H * 1.3, tp.y - H * 1.1 + Math.sin(t * 2) * H * .3], [tp.x - H * .6, tp.y], [tp.x - H * 1.2, tp.y + H * .95 + Math.sin(t * 2 + 1) * H * .3]], MAT.FIN, .4);
    // the crest: long bone spines with skin webbed between
    for (let i = Math.round(N * .16); i < Math.round(N * .9); i++) {
      const p = pts[i], u = i / N;
      const sh = H * (.2 + Math.sin(u * Math.PI) * .5);
      for (let y = p.y - p.r - sh * .55; y <= p.y - p.r + 1; y++) Spr.plot(p.x, y, MAT.FIN, .34);
      if (i % 5 === 0) Spr.stroke([[p.x + 1, p.y - p.r + 1], [p.x - H * .2, p.y - p.r - sh]], Math.max(.7, H * .025), .3, MAT.BONE, .58);
    }

    // the body: overlapping scales, old scars, barnacles
    const sc = Math.max(5, Math.round(H * .13));
    Spr.tube(pts, MAT.BODY, {
      belly: MAT.BELLY, bellyFrom: .4,
      tex: (x, y) => {
        const col = Math.floor(x / sc), cx = x - col * sc, yy = y + (col & 1) * (sc >> 1);
        const cy = yy - Math.floor(yy / sc) * sc;
        const edge = cy + Math.abs(cx - sc / 2) * .7;
        return (edge > sc - 1.2 ? -.2 : 0) + (cy < 1 && cx > 1 && cx < sc - 1 ? .1 : 0) + (hash3(x >> 1, y >> 1, seed) > .965 ? .2 : 0);
      }
    });
    for (let k = 0; k < 9; k++) {
      const p = P(.15 + hash3(k, 9, seed) * .65);
      const cx = p.x + hash3(k, 10, seed) * 6 - 3, cy = p.y - p.r * (.2 + hash3(k, 11, seed) * .5);
      for (let b = 0; b < 3; b++) Spr.blob(cx + b * 2 - 2, cy + (b % 2), .9, .9, MAT.BONE, { lit: .6 });
    }
    if (rage) for (let i = 2; i < N * .9; i++) Spr.plot(pts[i].x, pts[i].y + Math.sin(i * .9 + t * 4) * pts[i].r * .35, MAT.GLOW, .8);
    // harpoons from everyone who tried, rope still hanging off them
    for (let k = 0; k < 4; k++) {
      const p = P(.3 + k * .13);
      const ex = p.x + 3 - k * 2, ey = p.y - p.r * .5;
      const sx = ex - H * (.4 + k * .06), sy = ey - H * (.7 + k * .06);
      Spr.stroke([[ex, ey], [sx, sy]], .9, .9, MAT.METAL, .62);
      Spr.poly([[sx - 2, sy - 1], [sx - 1, sy - 4], [sx + 2, sy]], MAT.METAL, .8);
      Spr.stroke([[sx, sy], [sx - 3, sy + H * .3], [sx - 1, sy + H * .6 + Math.sin(t * 2 + k) * 2]], .45, .45, MAT.WOOD, .5);
    }
    for (let e = 0; e < S.eyes; e++) {
      const p = P(.84 - e * .065);
      Spr.eye(p.x, p.y - p.r * .3, Math.max(1, H * .045), S.pal.eyeCss, { slit: true, blink: e === 2 ? S.blink : 1, glow: rage });
    }

    // the head: a long armoured skull, and an underjaw that drops open full of fangs
    const hp = (u, v) => [hx + u * H, hy + v * H];
    const open = .08 + gape * .5, jc = Math.cos(open), js = Math.sin(open);
    const hu = -.5, hv = .2;                                    // the hinge, under the eye
    const J = (u, v) => { const du = u - hu, dv = v - hv; return hp(hu + du * jc - dv * js, hv + du * js + dv * jc); };
    const skullLit = (x, y) => .6 - (y - hy) / H * .4 + (hash3(x >> 1, y >> 1, seed + 4) > .965 ? -.12 : 0) + (hash3(x, y, seed) > .975 ? .1 : 0);

    // horns sweeping back off the crown, the far one in shadow
    for (let k = 1; k >= 0; k--) {
      Spr.stroke([hp(-.7 - k * .25, -.5), hp(-1.15 - k * .2, -.82 + k * .1), hp(-1.7 - k * .15, -.9 + k * .12)], Math.max(1, H * .08), .5, MAT.BONE, .6 - k * .25);
    }
    // inside the mouth, and whatever is burning in there
    Spr.poly([hp(-.55, .12), hp(.7, .02), J(.7, .12), J(-.3, .22)], MAT.MOUTH, .12);
    if (rage && gape > .1) Spr.blob(hx - H * .05, hy + H * (.1 + gape * .12), H * .35, H * (.05 + gape * .12), MAT.GLOW, { lit: .8 });
    // the underjaw, fangs up
    Spr.poly([J(-.62, .12), J(.74, .08), J(.7, .24), J(.2, .42), J(-.45, .52)], MAT.SHELL, (x, y) => skullLit(x, y) - .12);
    const la = J(-.3, .16), lb = J(.66, .1), ln = J(-.3, .06);
    Spr.teeth(la[0], la[1], lb[0], lb[1], Math.max(5, Math.round(H * .09)), Math.max(2, H * .2), (ln[0] - la[0]) / (H * .1), (ln[1] - la[1]) / (H * .1), seed + 11);
    // the skull
    Spr.poly([hp(-1.35, -.45), hp(-.85, -.66), hp(-.3, -.56), hp(.2, -.34), hp(.72, -.1), hp(.76, .03), hp(.2, .06), hp(-.35, .12), hp(-.65, .38), hp(-1.1, .6), hp(-1.4, .2)], MAT.SHELL, skullLit);
    // plates, a gill cover, and a row of spines down the crown
    Spr.stroke([hp(-.2, -.5), hp(-.05, -.2), hp(.1, .04)], .5, .5, MAT.DARK, .2);
    Spr.stroke([hp(-.95, -.55), hp(-1.05, -.1), hp(-.9, .4)], Math.max(.6, H * .02), .5, MAT.DARK, .15);
    Spr.stroke([hp(-.2, .1), hp(.7, .01)], Math.max(.6, H * .02), .6, MAT.SHELL, .82);
    for (let k = 0; k < 5; k++) {
      const [sx, sy] = hp(-1.15 + k * .22, -.58 - (k === 2 ? .06 : 0) + k * .03 * (k > 2 ? 2 : 0));
      Spr.poly([[sx - H * .05, sy + 2], [sx - H * .16, sy - H * .15], [sx + H * .05, sy + 2]], MAT.BONE, .55);
    }
    // long upper fangs, two of them far too long
    const ua = hp(-.3, .1), ub = hp(.68, .03);
    Spr.teeth(ua[0], ua[1], ub[0], ub[1], Math.max(5, Math.round(H * .09)), Math.max(2, H * .18), .05, 1, seed + 5);
    for (const f of [-.05, .42]) { const [fx, fy] = hp(f, .07 - f * .07); Spr.stroke([[fx, fy], [fx + H * .03, fy + H * .38]], Math.max(1, H * .035), .3, MAT.TOOTH, .8); }
    // barbels off the chin
    for (let k = 0; k < 4; k++) {
      const [bx, by] = J(-.1 - k * .15, .45), line = [];
      for (let s = 0; s <= 1.0001; s += .125) line.push([bx - s * H * .9, by + s * H * (1 + k * .2) + Math.sin(s * 4 - t * 2.4 + k) * H * .18]);
      Spr.stroke(line, Math.max(.8, H * .04), .4, MAT.BODY, .35);
    }
    // a heavy brow over the one great eye
    const [ex, ey] = hp(-.5, -.26);
    Spr.eye(ex, ey, Math.max(2, H * .1), S.pal.eyeCss, { slit: true, blink: S.blink, glow: rage });
    Spr.poly([hp(-.85, -.48), hp(-.25, -.46), hp(-.12, -.34), hp(-.6, -.38)], MAT.SHELL, .8);
  },

  /* ------------------------------ mother ----------------------------- */
  mother(S, m) {
    const { L, H, t } = S;
    // a crown of long tentacles streaming back from behind her head
    for (let k = 0; k < 8; k++) {
      const side = k % 2 ? 1 : -1;
      const base = [L * (.2 - k * .015), side * H * (.15 + (k % 4) * .08)];
      const len = L * (.36 + (k % 3) * .06), line = [];
      for (let s = 0; s <= 1.0001; s += .1) {
        line.push([base[0] - s * len, base[1] + side * s * H * (.9 + k * .08) + Math.sin(s * 5 - t * 1.8 + k) * H * .28 * s]);
      }
      Spr.stroke(line, Math.max(1.2, H * .08), .5, MAT.FIN, k < 4 ? .2 : .4);
      for (let j = 2; j < line.length - 1; j += 2) Spr.plot(line[j][0], line[j][1] + side * H * .07, MAT.BONE, .5);
    }
    Plans.leviathan(S, m);
    if (m && m.rage) for (let e = 0; e < 6; e++) Spr.eye(-L * .25 + e * L * .07, H * .28, Math.max(1, H * .045), S.pal.eyeCss, { slit: true, glow: true });
  }
};

/* -------------------------------- drawing -------------------------------- */

const Beast = {
  // how much room a creature's pixels might need, around its middle
  bounds(def, L, H, tilt) {
    const plan = def.plan || 'eel';
    const wide = plan === 'bloom' || plan === 'ray' || plan === 'mother' ? 2.1 : 1.8;
    const tall = plan === 'ray' ? H * 6.4 : plan === 'crustacean' ? H * 5.6 : Math.max(H * 8.5, L * .8);
    // turning it shears its far ends up and down by up to half its width
    return [Math.ceil(L * wide) + 20, Math.ceil(tall + L * wide * Math.abs(tilt || 0)) + 20];
  },

  /* Creatures are animated the way sprites are: on whole steps, 20 a second,
     staggered so only a third of them change on any one frame. In between,
     each one's last pixels are put down again wherever it has swum to. A step
     only ends early for something you would notice at once: it turns round,
     is hit, flies into a rage, or bites or leans a good deal further. Every
     input is rounded, so the same pose always comes out the same. */
  STEPS: 20,
  cache: true,
  _held: new Map(),
  _calls: 0,

  draw(g, m, t) {
    const d = m.def;
    const L = Math.max(10, m.len / PIX), H = Math.max(2, L * (d.girth || .27));

    if (!m.noShadow) {
      g.save();
      resetTransform(g);
      g.fillStyle = 'rgba(0,0,0,.32)';
      const sw = snap(m.len * .36);
      for (let k = 0; k < 3; k++) g.fillRect(snap(m.x) - sw + k * 8, DECK_Y - 4 + k * 2, sw * 2 - k * 16, 2);
      g.restore();
    }

    const seed = (m.seed || 1) | 0, face = m.face < 0 ? -1 : 1, rage = !!m.rage;
    const beat = (seed % 3) / 3, step = Math.floor(t * this.STEPS + beat + 1e-6);
    const rot = Math.round(clamp(m.rot || 0, -.7, .7) * 100) / 100;
    const gape = Math.round(clamp(m.gape || 0, 0, 1.2) * 20) / 20;
    const thr = Math.round((m.thrashAmt === undefined ? 1 : m.thrashAmt) * 4) / 4;
    const flash = Math.round(clamp(m.flash || 0, 0, 1) * 4) / 4;

    let held = null;
    if (this.cache) {
      const who = d.id + '/' + seed + '/' + Math.round(L);
      held = this._held.get(who);
      if (!held) this._held.set(who, held = { step: NaN, baked: null, surface: null, last: 0 });
      held.last = ++this._calls;
      if (this._calls % 600 === 0) this._forget();
      if (held.step === step && held.face === face && held.rage === rage && held.flash === flash && held.thr === thr &&
          Math.abs(held.rot - rot) < .04 && Math.abs(held.gape - gape) < .1) {
        if (held.baked) Spr.blit(g, snap(m.x), snap(m.y), held.baked);
        return;
      }
      Object.assign(held, { step, face, rage, flash, thr, rot, gape });
    }

    const tq = (step - beat) / this.STEPS, tilt = Math.tan(rot);
    const [w, h] = this.bounds(d, L, H, tilt);
    Spr.begin(w, h);
    Spr.tilt = tilt;
    const S = {
      L, H, t: tq, seed, def: d, m, thr, gape,
      eyes: d.eyes === undefined ? 2 : d.eyes,
      blink: (Math.sin(tq * 1.7 + seed) > .93 || Math.sin(tq * .7 + seed * 2) > .97) ? .1 : 1,
      pal: beastPalette(d, rage)
    };
    (Plans[d.plan] || Plans.eel)(S, m);
    const baked = Spr.bake(face, S.pal, flash, held ? held.surface : undefined);
    if (held) { held.baked = baked; if (baked) held.surface = baked.S; }
    if (baked) Spr.blit(g, snap(m.x), snap(m.y), baked);
  },

  // how big a creature comes out, in game pixels [w, h], without drawing it anywhere
  measure(m) {
    const cache = this.cache, blit = Spr.blit;
    let size = [0, 0];
    this.cache = false;
    Spr.blit = (g, x, y, b) => { size = [b.cw * PIX, b.ch * PIX]; };
    try { this.draw(null, Object.assign({}, m, { x: 0, y: 0, noShadow: true }), 0); }
    finally { Spr.blit = blit; this.cache = cache; }
    return size;
  },

  // let go of creatures that haven't been drawn in a while
  _forget() {
    for (const [who, held] of this._held) if (this._calls - held.last > 600) this._held.delete(who);
  }
};

/* ------------------------------ everything else ------------------------------
   People, gear, relics and the boat are drawn with the same workbench. Each
   gets a palette of its own: a colour per material, shaded the same way. */

const SPRITE_BASE = {
  BODY: '#7a6a58', BELLY: '#c8b89a', FIN: '#5a4a3a', SHELL: '#8a7a68', MOUTH: '#60162a', GUM: '#b25062',
  TOOTH: '#eee6ce', BONE: '#ccc2a8', METAL: '#7c7068', WOOD: '#805c3a', DARK: '#281c30', EYE: '#ffd76a',
  GLOW: '#ffd76a', PUPIL: '#0a040e', WHITE: '#fffcee',
  C1: '#8a8a8a', C2: '#8a8a8a', C3: '#8a8a8a', C4: '#8a8a8a', C5: '#8a8a8a', C6: '#8a8a8a', C7: '#8a8a8a', C8: '#8a8a8a'
};
const _spritePalettes = new Map();
function spritePalette(key, spec) {
  let P = _spritePalettes.get(key);
  if (P) return P;
  const s = Object.assign({}, SPRITE_BASE, spec);
  P = [];
  for (const k in MAT) {
    if (k === 'EMPTY') continue;
    const col = hexRgb(s[k]);
    P[MAT[k]] = k === 'PUPIL' || k === 'WHITE' ? flat(col) : EMISSIVE[MAT[k]] ? lights(col) : tones(col);
  }
  P.outline = s.outline ? hexRgb(s.outline) : [22, 14, 28];
  P.eyeCss = s.EYE; P.glowCss = s.GLOW;
  _spritePalettes.set(key, P);
  return P;
}

/* A sprite that isn't a creature, drawn through the same cache: `who` names
   the thing on screen, `pose` is a string of everything that changes its
   pixels. Same pose, same pixels, put down again for free. */
const Sprite = {
  cache: true,
  _held: new Map(),
  _calls: 0,
  draw(g, who, pose, wx, wy, o) {
    const face = o.face < 0 ? -1 : 1, flash = o.flash || 0;
    let held = null;
    if (this.cache) {
      held = this._held.get(who);
      if (!held) this._held.set(who, held = { pose: null, baked: null, surface: null, last: 0 });
      held.last = ++this._calls;
      if (this._calls % 900 === 0) for (const [k, h] of this._held) if (this._calls - h.last > 900) this._held.delete(k);
      const key = pose + '|' + face + '|' + Math.round(flash * 4);
      if (held.pose === key) {
        if (held.baked) Spr.blit(g, snap(wx), snap(wy), held.baked);
        return;
      }
      held.pose = key;
    }
    Spr.begin(o.w, o.h);
    o.paint();
    const baked = Spr.bake(face, o.pal, flash, held ? held.surface : undefined);
    if (held) { held.baked = baked; if (baked) held.surface = baked.S; }
    if (baked) Spr.blit(g, snap(wx), snap(wy), baked);
  }
};

// every creature in the game is drawn through here
Art.monster = function (g, m, t) { Beast.draw(g, m, t); };
