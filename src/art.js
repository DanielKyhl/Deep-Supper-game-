'use strict';
/* ========================================================================
   art.js — every pixel in this game is drawn by hand, at runtime
   ======================================================================== */

const SKY_KEYS = [
  { t: 0.00, top: [104, 176, 222], mid: [166, 212, 236], low: [255, 228, 184] },
  { t: 0.42, top: [ 96, 110, 172], mid: [214, 130, 130], low: [255, 166,  92] },
  { t: 0.70, top: [ 40,  46,  94], mid: [ 96,  66, 118], low: [190,  94,  88] },
  { t: 1.00, top: [  8,  12,  34], mid: [ 14,  26,  60], low: [ 26,  44,  86] }
];

const SEA_DAY  = { deep: [16, 62, 92],  mid: [30, 104, 140], top: [76, 158, 178], foam: [206, 238, 244] };
const SEA_NITE = { deep: [ 5, 10, 26],  mid: [ 9,  22,  48], top: [22,  44,  78], foam: [120, 158, 196] };

const WOOD = {
  deck: [128, 96, 62], deckAlt: [116, 86, 55], deckLine: [86, 62, 40],
  hull: [92, 66, 44], hullDark: [64, 44, 30], hullLite: [136, 102, 66],
  trim: [176, 138, 78], rope: [186, 162, 116]
};

function skyAt(n) {
  n = clamp(n, 0, 1);
  let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (n >= SKY_KEYS[i].t && n <= SKY_KEYS[i + 1].t) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
  }
  const k = (n - a.t) / Math.max(.0001, b.t - a.t);
  return { top: mix(a.top, b.top, k), mid: mix(a.mid, b.mid, k), low: mix(a.low, b.low, k) };
}

/* ---------------------- dithered vertical gradients ----------------------
   Smooth canvas gradients are the one thing that gives away downscaled
   vector art, so the big flat areas (sky, sea, the water column) are drawn
   as ordered-dithered ramps instead. Each ramp is rasterised once at buffer
   resolution into an offscreen strip and cached against a key, then blitted
   as a single image — so the per-pixel work happens only when the colours
   actually change (the sky only changes as `night` moves).               */

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
];
const DITHER_STEP = 18;          // colour quantisation, in 0-255 units
const _ditherCache = new Map();

// stops: [[pos, [r,g,b]], ...] with pos in 0..1 down the strip
function ditherStrip(key, hpx, stops) {
  const hit = _ditherCache.get(key);
  if (hit) return hit;

  const cv = document.createElement('canvas');
  cv.width = PW; cv.height = hpx;
  const cg = cv.getContext('2d');
  const img = cg.createImageData(PW, hpx);
  const d = img.data;

  for (let y = 0; y < hpx; y++) {
    const f = hpx > 1 ? y / (hpx - 1) : 0;
    // sample the ramp
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (f >= stops[i][0] && f <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
    }
    const k = (f - a[0]) / Math.max(.0001, b[0] - a[0]);
    const col = mix(a[1], b[1], clamp(k, 0, 1));
    for (let x = 0; x < PW; x++) {
      const th = (BAYER4[y & 3][x & 3] + .5) / 16;
      const i = (y * PW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = col[c];
        const lo = Math.floor(v / DITHER_STEP) * DITHER_STEP;
        const frac = (v - lo) / DITHER_STEP;
        d[i + c] = Math.min(255, lo + (frac > th ? DITHER_STEP : 0));
      }
      d[i + 3] = 255;
    }
  }
  cg.putImageData(img, 0, 0);

  if (_ditherCache.size > 40) _ditherCache.delete(_ditherCache.keys().next().value);
  _ditherCache.set(key, cv);
  return cv;
}

// blit a cached ramp across the full width, in 960-space coordinates
function ditherFill(g, key, y960, h960, stops) {
  const hpx = Math.max(1, Math.round(h960 / PIX));
  const strip = ditherStrip(key + '|' + hpx, hpx, stops);
  g.drawImage(strip, 0, 0, PW, hpx, 0, y960, VIEW_W, hpx * PIX);
}

// quantise `night` so the cache isn't rebuilt every single frame
function nightKey(n) { return Math.round(clamp(n, 0, 1) * 32); }

/* A halo as a few hard-edged rings instead of a smooth radial falloff. A
   smooth gradient is exactly the smear that makes pixel art look blurry;
   stepped light is how pixel art has always drawn it. Multiplies into
   whatever globalAlpha is already set, so fades still work.               */
function stepGlow(g, x, y, r, col, a, o) {
  o = o || {};
  const steps = o.steps || 3;
  const sq = o.squash || 1;
  g.save();
  if (o.op) g.globalCompositeOperation = o.op;
  g.globalAlpha = g.globalAlpha * clamp(a, 0, 1) / steps;
  g.fillStyle = col;
  for (let i = 0; i < steps; i++) {
    const k = 1 - i / steps;
    g.beginPath();
    g.ellipse(x, y, r * k, r * k * sq, 0, 0, 6.2832);
    g.fill();
  }
  g.restore();
}

/* Darken the frame in two hard bands. The ellipses are big enough that
   only the corners fall outside them, so no band edge cuts across the
   middle of the sky. `tight` pulls them in, for the hurt flash, which
   has to be seen.                                                         */
function stepVignette(g, col, a, tight) {
  const bands = tight ? [[400, 240], [500, 300]] : [[520, 320], [600, 370]];
  g.save();
  g.fillStyle = col;
  g.globalAlpha = g.globalAlpha * clamp(a, 0, 1) * .45;
  for (const [rx, ry] of bands) {
    g.beginPath();
    g.rect(-20, -20, VIEW_W + 40, VIEW_H + 40);
    g.ellipse(VIEW_W / 2, VIEW_H / 2, rx, ry, 0, 0, 6.2832);
    g.fill('evenodd');
  }
  g.restore();
}

const Art = {
  stars: [], clouds: [], gulls: [],

  init() {
    for (let i = 0; i < 130; i++) {
      this.stars.push({
        x: rand(0, VIEW_W), y: rand(0, HORIZON_Y - 12),
        s: rand(.6, 2.0), ph: rand(0, 6.28), sp: rand(.6, 2.4),
        c: chance(.12) ? '#bcd4ff' : (chance(.1) ? '#ffe3c2' : '#ffffff')
      });
    }
    for (let i = 0; i < 16; i++) {
      this.clouds.push({
        x: rand(-200, 2400), y: rand(24, 190), s: rand(.55, 1.5),
        sp: rand(3, 9), a: rand(.2, .55)
      });
    }
    for (let i = 0; i < 5; i++) this.gulls.push({ x: rand(0, VIEW_W), y: rand(70, 170), sp: rand(14, 26), ph: rand(0, 6.3) });
  },

  /* ------------------------------- sky -------------------------------- */

  sky(g, night, t) {
    const s = skyAt(night);
    // the sky is a dithered ramp, cached per night step
    ditherFill(g, 'sky' + nightKey(night), 0, HORIZON_Y + 24,
      [[0, s.top], [.55, s.mid], [1, s.low]]);

    // stars
    const sa = clamp((night - 0.5) * 2.6, 0, 1);
    if (sa > 0.01) {
      for (const st of this.stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * st.sp + st.ph);
        g.globalAlpha = sa * tw * .95;
        g.fillStyle = st.c;
        // one pixel each, on the grid; the bright ones get a small cross
        const sx = snap(st.x), sy = snap(st.y);
        g.fillRect(sx, sy, PIX, PIX);
        if (st.s > 1.5) {
          g.globalAlpha = sa * tw * .45;
          g.fillRect(sx - PIX, sy, PIX * 3, PIX);
          g.fillRect(sx, sy - PIX, PIX, PIX * 3);
        }
      }
      g.globalAlpha = 1;
    }

    // sun / moon
    const sunY = lerp(120, HORIZON_Y + 40, clamp(night / 0.72, 0, 1));
    if (night < 0.85) {
      const a = clamp(1 - (night - 0.55) / 0.3, 0, 1);
      g.globalAlpha = a;
      const sunC = mix([255, 244, 190], [255, 128, 72], clamp(night / .72, 0, 1));
      stepGlow(g, 742, sunY, 84, css(sunC), .55, { steps: 3 });
      g.fillStyle = css(sunC);
      g.beginPath(); g.arc(742, sunY, 26, 0, 6.2832); g.fill();
      g.globalAlpha = 1;
    }
    if (night > 0.45) {
      const a = clamp((night - 0.45) / 0.3, 0, 1);
      const moonY = lerp(HORIZON_Y - 20, 86, clamp((night - .45) / .5, 0, 1));
      this.moonX = 196; this.moonY = moonY; this.moonA = a;
      g.globalAlpha = a;
      stepGlow(g, 196, moonY, 96, 'rgb(206,222,255)', .3, { steps: 3 });
      g.fillStyle = '#eef3ff';
      g.beginPath(); g.arc(196, moonY, 22, 0, 6.2832); g.fill();
      g.fillStyle = 'rgba(178,192,222,.5)';
      g.beginPath(); g.arc(190, moonY - 6, 5, 0, 6.28); g.fill();
      g.beginPath(); g.arc(203, moonY + 5, 3.4, 0, 6.28); g.fill();
      g.beginPath(); g.arc(196, moonY + 12, 2.4, 0, 6.28); g.fill();
      g.globalAlpha = 1;
    } else { this.moonA = 0; }

    // clouds
    for (const c of this.clouds) {
      c.x -= c.sp * (1 / 60);
      if (c.x < -320) c.x = VIEW_W + rand(120, 900);
      const tint = mix([255, 250, 240], [40, 52, 86], night);
      g.globalAlpha = c.a * lerp(1, .55, night);
      g.fillStyle = css(tint);
      this._cloud(g, c.x, c.y, c.s);
      g.globalAlpha = 1;
    }

    // gulls (day only)
    if (night < 0.55) {
      g.globalAlpha = clamp(1 - night / .55, 0, 1) * .7;
      g.strokeStyle = '#3a4358'; g.lineWidth = 3;
      for (const b of this.gulls) {
        b.x -= b.sp * (1 / 60);
        if (b.x < -30) { b.x = VIEW_W + rand(20, 400); b.y = rand(60, 180); }
        const f = Math.sin(t * 6 + b.ph) * 4;
        g.beginPath();
        g.moveTo(b.x - 7, b.y + f); g.quadraticCurveTo(b.x - 3, b.y - 2 + f, b.x, b.y + f);
        g.quadraticCurveTo(b.x + 3, b.y - 2 + f, b.x + 7, b.y + f);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  },

  _cloud(g, x, y, s) {
    g.beginPath();
    g.ellipse(x, y, 66 * s, 17 * s, 0, 0, 6.2832);
    g.ellipse(x - 34 * s, y + 5 * s, 34 * s, 12 * s, 0, 0, 6.2832);
    g.ellipse(x + 30 * s, y + 4 * s, 40 * s, 13 * s, 0, 0, 6.2832);
    g.ellipse(x + 6 * s, y - 11 * s, 32 * s, 15 * s, 0, 0, 6.2832);
    g.fill();
  },

  /* ------------------------------- sea -------------------------------- */

  _seaCols(night) {
    return {
      deep: mix(SEA_DAY.deep, SEA_NITE.deep, night),
      mid:  mix(SEA_DAY.mid,  SEA_NITE.mid,  night),
      top:  mix(SEA_DAY.top,  SEA_NITE.top,  night),
      foam: mix(SEA_DAY.foam, SEA_NITE.foam, night)
    };
  },

  _band(g, camX, t, y0, amp, wl, sp, par, col, foam) {
    g.beginPath();
    g.moveTo(-12, VIEW_H + 4);
    for (let x = -12; x <= VIEW_W + 12; x += 7) {
      const wx = x + camX * par;
      const y = y0
        + Math.sin(wx / wl + t * sp) * amp
        + Math.sin(wx / (wl * 0.41) - t * sp * 1.6) * amp * 0.4;
      g.lineTo(x, y);
    }
    g.lineTo(VIEW_W + 12, VIEW_H + 4);
    g.closePath();
    g.fillStyle = col;
    g.fill();
    if (foam) {
      g.beginPath();
      for (let x = -12; x <= VIEW_W + 12; x += 7) {
        const wx = x + camX * par;
        const y = y0
          + Math.sin(wx / wl + t * sp) * amp
          + Math.sin(wx / (wl * 0.41) - t * sp * 1.6) * amp * 0.4;
        if (x === -12) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = foam; g.lineWidth = 3; g.stroke();
    }
  },

  sea(g, camX, t, night) {
    const c = this._seaCols(night);
    ditherFill(g, 'sea' + nightKey(night), HORIZON_Y - 6, VIEW_H - HORIZON_Y + 6,
      [[0, c.top], [.35, c.mid], [1, c.deep]]);

    // horizon haze
    g.fillStyle = css(mix(skyAt(night).low, c.top, .5), .5);
    g.fillRect(0, HORIZON_Y - 4, VIEW_W, 5);

    // moon path on the water
    if (this.moonA > 0.02) {
      g.save();
      g.globalAlpha = this.moonA * .5;
      for (let i = 0; i < 22; i++) {
        const p = i / 22;
        const yy = HORIZON_Y + 4 + p * p * 220;
        const w = 8 + p * 90 + Math.sin(t * 2 + i) * 10;
        g.fillStyle = 'rgba(206,224,255,' + (0.5 - p * 0.42) + ')';
        g.fillRect(196 - w / 2 + Math.sin(t * 1.4 + i * .8) * 12, yy, w, 2 + p * 2);
      }
      g.restore();
    }

    this._band(g, camX, t, HORIZON_Y + 12, 3, 130, .7, .012, css(shade(c.mid, .10)), css(c.foam, .12));
    this._band(g, camX, t, HORIZON_Y + 34, 5, 180, .9, .03,  css(shade(c.mid, .02)), css(c.foam, .10));
    this._band(g, camX, t, HORIZON_Y + 66, 8, 240, 1.1, .06, css(shade(c.mid, -.10)), css(c.foam, .12));
  },

  /* The water column you drop a line into. Drawn in water-space (the caller
     has already translated by -viewY), so depth is absolute: 500 is the
     surface and it only gets worse from there.                            */
  underwater(g, o) {
    const top = WATER_TOP;
    const t = o.t, viewY = o.viewY;
    const vis0 = viewY - 40, vis1 = viewY + VIEW_H + 40;

    // the column: a dithered ramp for the first 1100px, then flat black-blue
    const deepest = [5, 17, 28];
    ditherFill(g, 'deep' + nightKey(o.night), top, 1104, [
      [0, mix([26, 82, 104], [10, 30, 50], o.night)],
      [.16, mix([16, 56, 78], [7, 22, 40], o.night)],
      [.45, [10, 29, 44]],
      [.78, [7, 21, 35]],
      [1, deepest]
    ]);
    g.fillStyle = css(deepest);
    g.fillRect(-60, top + 1104, VIEW_W + 120, 4100);

    // shafts of lantern light, only near the surface
    const shaft = clamp(1 - viewY / 420, 0, 1);
    if (shaft > .01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = shaft * .16;
      for (let i = 0; i < 5; i++) {
        const sx = 180 + i * 170 + Math.sin(t * .4 + i) * 26;
        g.fillStyle = 'rgba(190,226,244,1)';
        g.beginPath();
        g.moveTo(sx - 16, top);
        g.lineTo(sx + 16, top);
        g.lineTo(sx + 78 + i * 6, top + 440);
        g.lineTo(sx - 62 - i * 5, top + 440);
        g.closePath(); g.fill();
      }
      g.restore();
    }

    // thermoclines — the water changes its mind at certain depths
    g.save();
    for (let i = 1; i < 9; i++) {
      const y = top + i * 340;
      if (y < vis0 - 60 || y > vis1 + 60) continue;
      g.globalAlpha = .12;
      g.fillStyle = i % 2 ? '#0b2436' : '#071823';
      g.beginPath();
      g.moveTo(-60, y);
      for (let x = -60; x <= VIEW_W + 60; x += 40) {
        g.lineTo(x, y + Math.sin(x / 150 + t * .5 + i) * 9);
      }
      g.lineTo(VIEW_W + 60, y + 120);
      g.lineTo(-60, y + 120);
      g.closePath(); g.fill();
    }
    g.restore();

    // marine snow, rising past you as you descend
    g.save();
    for (let i = 0; i < 190; i++) {
      const hx = ((i * 73.7) % 101) / 101;
      const hy = ((i * 149.3) % 211) / 211;
      const sp = 6 + (i % 7) * 3;
      let y = top + hy * 4600 - (t * sp) % 4600;
      if (y < top) y += 4600;
      if (y < vis0 || y > vis1) continue;
      const x = hx * (VIEW_W + 80) - 40 + Math.sin(t * .6 + i) * 7;
      const s = .8 + (i % 4) * .5;
      g.globalAlpha = .10 + (i % 5) * .04;
      g.fillStyle = '#cfe4f0';
      const sz = s > 1.6 ? PIX * 2 : PIX;
      g.fillRect(snap(x), snap(y), sz, sz);
    }
    g.restore();

    // depth markings down the side, so you know how bad it is getting
    g.save();
    for (let i = 1; i <= 26; i++) {
      const y = top + i * 200;
      if (y < vis0 || y > vis1) continue;
      if (y - viewY < 70) continue;   // keep clear of the gear readout
      g.fillStyle = 'rgba(170,210,232,.55)';
      g.fillRect(VIEW_W - 132, y, 18, 3);
      Text.draw(g, (i * 4) + ' fm', VIEW_W - 18, y + 8, {
        size: 12, color: 'rgba(178,214,236,.8)', align: 'right'
      });
    }
    g.restore();

    // things that are not your business, passing at depth
    for (const s of (o.shapes || [])) {
      const y = top + s.depth;
      if (y < vis0 - 200 || y > vis1 + 200) continue;
      g.save();
      g.translate(s.x, y);
      g.scale(s.dir, 1);
      // darker than the water, with a cold rim so it reads against the black
      g.globalAlpha = s.a + .25;
      g.fillStyle = '#020a14';
      const wob = Math.sin(t * 1.4 + s.ph) * .12;
      g.beginPath();
      g.ellipse(0, 0, s.r, s.r * .26, wob, 0, 6.2832);
      g.fill();
      g.beginPath();
      g.moveTo(-s.r, 0); g.lineTo(-s.r * 1.5, -s.r * .34); g.lineTo(-s.r * 1.45, s.r * .3);
      g.closePath(); g.fill();
      g.globalAlpha = (s.a + .2) * .8;
      g.strokeStyle = 'rgba(150,196,224,.45)'; g.lineWidth = 3;
      g.beginPath();
      g.ellipse(0, 0, s.r, s.r * .26, wob, -2.5, -.5);
      g.stroke();
      // one small cold eye
      g.globalAlpha = 1;
      this._glowBlob(g, s.r * .62, -s.r * .06, 20, 'rgba(150,220,236,.8)', .30 + s.a);
      g.fillStyle = 'rgba(190,236,250,.8)';
      g.beginPath(); g.arc(s.r * .62, -s.r * .06, 1.7, 0, 6.2832); g.fill();
      g.restore();
    }

    // and the one that is
    if (o.watcher && o.watcher.a > .01) {
      const w = o.watcher;
      const y = top + w.depth;
      g.save();
      g.globalAlpha = w.a;
      // a suggestion of mass around the eyes
      g.fillStyle = 'rgba(2,4,10,.85)';
      g.beginPath();
      g.ellipse(w.x, y, 420, 120, Math.sin(t * .3) * .04, 0, 6.2832);
      g.fill();
      const blink = Math.sin(t * .8 + 1) > .965 ? .08 : 1;
      for (let i = 0; i < 3; i++) {
        const ex = w.x - 90 + i * 92, ey = y - 20 + (i === 1 ? -14 : 0);
        const r = (i === 1 ? 16 : 13) * blink;
        stepGlow(g, ex, ey, 62, 'rgb(220,30,30)', .5, { steps: 3, op: 'lighter' });
        g.fillStyle = '#ff3a3a';
        g.beginPath(); g.ellipse(ex, ey, r * .8, r, 0, 0, 6.2832); g.fill();
        g.fillStyle = '#2a0004';
        g.beginPath(); g.ellipse(ex, ey, r * .22, r * .9, 0, 0, 6.2832); g.fill();
      }
      g.restore();
    }
  },

  // drawn in front of the hull so the boat sits *in* the water
  seaFront(g, camX, t, night) {
    const c = this._seaCols(night);
    this._band(g, camX, t, 458, 11, 260, 1.25, .10, css(shade(c.deep, .12)), css(c.foam, .18));
    this._band(g, camX, t, 492, 15, 210, 1.6, .16, css(shade(c.deep, .02)), css(c.foam, .22));
    this._band(g, camX, t, 524, 13, 170, 2.0, .24, css(shade(c.deep, -.25)), null);
  },

  // shadowy shapes gliding under the surface
  shadows(g, t, camX, n) {
    g.save();
    for (let i = 0; i < n; i++) {
      const ph = i * 2.7;
      const x = ((t * (18 + i * 7) + i * 430) % (VIEW_W + 500)) - 250;
      const y = 372 + Math.sin(t * .6 + ph) * 16 + i * 22;
      g.globalAlpha = .16 + Math.sin(t * .9 + ph) * .05;
      g.fillStyle = '#020610';
      g.beginPath();
      g.ellipse(x, y, 58 + i * 12, 9 + i * 2, Math.sin(t * .5 + ph) * .1, 0, 6.2832);
      g.fill();
      g.beginPath();
      g.moveTo(x - 58 - i * 12, y);
      g.lineTo(x - 84 - i * 14, y - 10);
      g.lineTo(x - 84 - i * 14, y + 10);
      g.fill();
    }
    g.restore();
  },

  /* ------------------------------ harbour ------------------------------ */

  harbour(g, ox, night, t) {
    if (ox < -900 || ox > VIEW_W + 500) return;
    g.save();
    const silh = mix([46, 58, 74], [10, 14, 30], night);
    const lit = night > .35;

    // headland
    g.fillStyle = css(silh);
    g.beginPath();
    g.moveTo(ox - 400, HORIZON_Y + 6);
    g.lineTo(ox - 340, HORIZON_Y - 26);
    g.lineTo(ox - 240, HORIZON_Y - 40);
    g.lineTo(ox - 120, HORIZON_Y - 30);
    g.lineTo(ox + 60, HORIZON_Y - 44);
    g.lineTo(ox + 210, HORIZON_Y - 22);
    g.lineTo(ox + 330, HORIZON_Y - 34);
    g.lineTo(ox + 420, HORIZON_Y + 6);
    g.closePath(); g.fill();

    // village
    const houses = [[-300, 16, 22], [-262, 22, 30], [-216, 14, 18], [-170, 20, 26],
                    [-120, 16, 20], [-70, 24, 34], [-20, 15, 19], [30, 20, 25],
                    [88, 17, 22], [140, 22, 29], [196, 15, 18], [250, 19, 24]];
    for (const h of houses) {
      const hx = ox + h[0], hw = h[1], hh = h[2];
      const by = HORIZON_Y - 12;
      g.fillStyle = css(shade(silh, .06));
      g.fillRect(hx, by - hh, hw, hh);
      g.beginPath();
      g.moveTo(hx - 3, by - hh); g.lineTo(hx + hw / 2, by - hh - 9); g.lineTo(hx + hw + 3, by - hh); g.closePath();
      g.fill();
      if (lit && (h[0] % 3 === 0 || h[0] % 7 === 0)) {
        g.fillStyle = 'rgba(255,206,120,' + (0.55 + Math.sin(t * 2 + hx) * .12) + ')';
        g.fillRect(hx + hw / 2 - 2, by - hh + 7, 4, 5);
      }
    }

    // lighthouse
    const lx = ox + 330;
    g.fillStyle = css(shade(silh, .12));
    g.beginPath();
    g.moveTo(lx - 9, HORIZON_Y - 26); g.lineTo(lx - 6, HORIZON_Y - 86);
    g.lineTo(lx + 6, HORIZON_Y - 86); g.lineTo(lx + 9, HORIZON_Y - 26); g.closePath(); g.fill();
    g.fillStyle = lit ? '#ffd98a' : '#d8d2c0';
    g.fillRect(lx - 7, HORIZON_Y - 95, 14, 10);
    if (lit) {
      const beam = (t * .8) % 6.2832;
      g.save();
      g.globalAlpha = .16 + .12 * Math.abs(Math.cos(beam));
      g.fillStyle = '#ffe6a8';
      g.translate(lx, HORIZON_Y - 90);
      g.rotate(Math.sin(beam) * .5);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-260, -40); g.lineTo(-260, 40); g.closePath(); g.fill();
      g.restore();
    }

    // dock
    g.fillStyle = css(shade(silh, -.15));
    g.fillRect(ox - 120, HORIZON_Y + 4, 300, 8);
    for (let i = 0; i < 8; i++) g.fillRect(ox - 110 + i * 38, HORIZON_Y + 10, 6, 22);
    g.restore();
  },

  /* -------------------------------- boat ------------------------------- */

  beginBoat(g, t) {
    // the boat bobs in whole pixels and no longer rolls: rotating a 1900px
    // hull re-steps every edge on it each frame, which reads as shimmer
    const bob = snap(Math.sin(t * 0.9) * 3.4 + Math.sin(t * 1.7) * 1.1);
    g.save();
    g.translate(0, bob);
    return { ang: 0, bob };
  },
  endBoat(g) { g.restore(); },

  // everything BEHIND the crew
  boatBack(g, camX, t, night, st) {
    const X = x => x - camX;
    g.save();

    /* --- far bulwark: the wall the crew stands against --- */
    const BW = 42;
    const bwg = g.createLinearGradient(0, DECK_Y - BW, 0, DECK_Y);
    bwg.addColorStop(0, css(shade(WOOD.hull, -.10)));
    bwg.addColorStop(1, css(shade(WOOD.hull, -.34)));
    g.fillStyle = bwg;
    g.fillRect(X(16), DECK_Y - BW, BOAT_R - 32, BW);
    // plank seams
    g.fillStyle = 'rgba(0,0,0,.22)';
    for (let x = 16; x < BOAT_R; x += 46) {
      const sx = X(x);
      if (sx < -10 || sx > VIEW_W + 10) continue;
      g.fillRect(sx, DECK_Y - BW, 1.6, BW);
    }
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.fillRect(X(16), DECK_Y - BW + 17, BOAT_R - 32, 1.6);
    // cap rail
    g.fillStyle = css(shade(WOOD.trim, -.18));
    g.fillRect(X(14), DECK_Y - BW - 5, BOAT_R - 28, 6);
    g.fillStyle = css(WOOD.trim, .55);
    g.fillRect(X(14), DECK_Y - BW - 5, BOAT_R - 28, 2);
    // deck boards showing at the foot of the wall
    g.fillStyle = css(shade(WOOD.deck, -.18));
    g.fillRect(X(14), DECK_Y - 5, BOAT_R - 28, 5);

    /* --- stanchions + rope above the bulwark --- */
    g.fillStyle = css(WOOD.hullDark);
    for (let x = 60; x < BOAT_R - 40; x += 108) {
      const sx = X(x);
      if (sx < -30 || sx > VIEW_W + 30) continue;
      g.fillRect(sx, DECK_Y - BW - 26, 6, 26);
      g.fillStyle = css(shade(WOOD.hullDark, .14));
      g.fillRect(sx, DECK_Y - BW - 26, 6, 3);
      g.fillStyle = css(WOOD.hullDark);
    }
    g.strokeStyle = css(WOOD.rope, .8); g.lineWidth = 3;
    g.beginPath();
    for (let x = 40; x < BOAT_R; x += 18) {
      const sx = X(x);
      const seg = ((x - 60) % 108) / 108;
      const y = DECK_Y - BW - 22 + Math.sin(seg * Math.PI) * 4 + Math.sin((x + t * 16) / 70) * .8;
      if (x === 40) g.moveTo(sx, y); else g.lineTo(sx, y);
    }
    g.stroke();

    /* --- stern cabin --- */
    this._cabin(g, X(150), DECK_Y, night, t);

    /* --- mast + sail --- */
    this._mast(g, X(1050), t, night);

    /* --- Dorran's stall --- */
    this._stall(g, X(742), night, t);

    /* --- everything a working boat accumulates --- */
    this._bell(g, X(64), DECK_Y, t);
    this._lifeRing(g, X(336), DECK_Y - 78);
    this._crate(g, X(392), DECK_Y, 46, st && st.crateOpen);
    this._crate(g, X(452), DECK_Y, 34, false);
    this._pots(g, X(520), DECK_Y, 2);
    this._bucket(g, X(580), DECK_Y);
    this._mop(g, X(606), DECK_Y, t);
    this._dryingLine(g, X(624), X(714), DECK_Y - 96, t, night);
    this._drum(g, X(884), DECK_Y);
    this._barrel(g, X(960), DECK_Y, 1);
    this._barrel(g, X(1002), DECK_Y, .82);
    this._tarpCrate(g, X(1140), DECK_Y, t);
    this._crate(g, X(1240), DECK_Y, 40, false);
    this._pots(g, X(1392), DECK_Y, 1);
    this._chair(g, X(1452), DECK_Y);
    this._lantern(g, X(1452), DECK_Y - 128, night, t, .8);
    this._buoys(g, X(1560), DECK_Y - 46, t);
    this._barrel(g, X(1640), DECK_Y, .9);

    /* --- bow fishing station --- */
    this._fishingPost(g, X(1744), DECK_Y, t, night);

    /* --- strings of lights, because it is a long way home --- */
    this._lightString(g, X(230), X(1046), DECK_Y - 150, 46, t, night, 9);
    this._lightString(g, X(1054), X(1800), DECK_Y - 146, 40, t, night, 8);

    /* --- warm pools where the light lands on the deck --- */
    if (night > .25) {
      for (const lx of [156, 812, 1452, 1766]) {
        this._deckGlow(g, X(lx), night);
      }
    }

    g.restore();
  },

  /* ---------------------------- deck props ---------------------------- */

  _deckGlow(g, x, night) {
    if (x < -200 || x > VIEW_W + 200) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    stepGlow(g, x, DECK_Y - 4, 110, 'rgb(255,180,100)', .12 * night, { steps: 2, squash: 36 / 110 });
    g.restore();
  },

  // a catenary of little bulbs
  _lightString(g, x1, x2, y, sag, t, night, n) {
    if (x2 < -120 || x1 > VIEW_W + 120) return;
    g.save();
    const cy = y + sag;
    g.strokeStyle = 'rgba(40,34,28,.85)'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x1, y);
    g.quadraticCurveTo((x1 + x2) / 2, cy + Math.sin(t * .8) * 3, x2, y);
    g.stroke();
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      // point on the quadratic
      const mx = (x1 + x2) / 2, my = cy + Math.sin(t * .8) * 3;
      const bx = (1 - f) * (1 - f) * x1 + 2 * (1 - f) * f * mx + f * f * x2;
      const by = (1 - f) * (1 - f) * y + 2 * (1 - f) * f * my + f * f * y;
      if (bx < -30 || bx > VIEW_W + 30) continue;
      const flick = .75 + Math.sin(t * 3 + i * 1.7) * .12 + Math.sin(t * 9 + i) * .07;
      const col = ['#ffd27a', '#ff9c6a', '#ffe9a8', '#8fd6ff'][i % 4];
      g.strokeStyle = 'rgba(40,34,28,.8)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by + 6); g.stroke();
      if (night > .2) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        stepGlow(g, bx, by + 10, 13, col, .38 * night * flick, { steps: 2 });
        g.restore();
      }
      g.fillStyle = night > .2 ? col : '#e8e2d0';
      g.beginPath(); g.ellipse(bx, by + 10, 3.4, 4.6, 0, 0, 6.2832); g.fill();
    }
    g.restore();
  },

  _bell(g, x, y, t) {
    g.save();
    g.fillStyle = css(WOOD.hullDark);
    g.fillRect(x - 4, y - 96, 8, 96);
    g.fillStyle = css(WOOD.trim);
    g.fillRect(x - 16, y - 100, 32, 6);
    const sw = Math.sin(t * 1.2) * .06;
    g.save();
    g.translate(x, y - 94); g.rotate(sw);
    g.fillStyle = '#c9a44c';
    g.beginPath();
    g.moveTo(-11, 22); g.quadraticCurveTo(-9, 2, 0, 0);
    g.quadraticCurveTo(9, 2, 11, 22); g.closePath(); g.fill();
    g.fillStyle = '#8a6a25';
    g.fillRect(-12, 21, 24, 4);
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.beginPath(); g.moveTo(-7, 20); g.quadraticCurveTo(-6, 5, -1, 3); g.lineTo(-3, 20); g.closePath(); g.fill();
    g.fillStyle = '#6b5a2a';
    g.fillRect(-1.5, 24, 3, 7);
    g.restore();
    g.restore();
  },

  _lifeRing(g, x, y) {
    g.save();
    g.lineWidth = 9;
    g.strokeStyle = '#e8e2d0';
    g.beginPath(); g.arc(x, y, 17, 0, 6.2832); g.stroke();
    g.strokeStyle = '#c4483f';
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.arc(x, y, 17, i * 1.5708 + .3, i * 1.5708 + 1.25); g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, 22, 0, 6.2832); g.stroke();
    g.beginPath(); g.arc(x, y, 12.5, 0, 6.2832); g.stroke();
    g.strokeStyle = css(WOOD.rope, .8); g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x, y - 34); g.stroke();
    g.restore();
  },

  _pots(g, x, y, n) {
    g.save();
    for (let k = 0; k < n; k++) {
      const yy = y - k * 30, w = 40 - k * 4;
      g.fillStyle = css(shade(WOOD.hull, -.2));
      g.beginPath();
      g.moveTo(x - w, yy); g.lineTo(x - w + 4, yy - 26);
      g.lineTo(x + w - 4, yy - 26); g.lineTo(x + w, yy);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(214,204,170,.55)'; g.lineWidth = 3;
      for (let i = 1; i < 5; i++) {
        g.beginPath(); g.moveTo(x - w + i * (w / 2.5), yy); g.lineTo(x - w + 4 + i * (w / 2.6), yy - 26); g.stroke();
      }
      for (let i = 1; i < 3; i++) {
        g.beginPath(); g.moveTo(x - w + 2, yy - i * 9); g.lineTo(x + w - 2, yy - i * 9); g.stroke();
      }
      g.fillStyle = css(WOOD.hullDark);
      g.fillRect(x - w, yy - 3, w * 2, 4);
    }
    g.restore();
  },

  _bucket(g, x, y) {
    g.save();
    g.fillStyle = '#6b7a84';
    g.beginPath();
    g.moveTo(x - 12, y); g.lineTo(x - 15, y - 24); g.lineTo(x + 15, y - 24); g.lineTo(x + 12, y);
    g.closePath(); g.fill();
    g.fillStyle = '#8a99a4';
    g.beginPath(); g.ellipse(x, y - 24, 15, 4, 0, 0, 6.2832); g.fill();
    g.fillStyle = '#3f4a52';
    g.beginPath(); g.ellipse(x, y - 24, 11, 2.6, 0, 0, 6.2832); g.fill();
    g.strokeStyle = '#57646d'; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y - 25, 15, Math.PI, 0); g.stroke();
    g.restore();
  },

  _mop(g, x, y, t) {
    g.save();
    g.translate(x, y);
    g.rotate(-.28 + Math.sin(t * .7) * .01);
    g.fillStyle = css(shade(WOOD.hull, .1));
    g.fillRect(-2.5, -86, 5, 86);
    g.fillStyle = '#cfc7ac';
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.moveTo(-2 + (i - 3) * 2, -86);
      g.lineTo(-7 + i * 2.4, -66 - (i % 2) * 5);
      g.lineTo(-3 + i * 2.4, -66);
      g.closePath(); g.fill();
    }
    g.restore();
  },

  _dryingLine(g, x1, x2, y, t, night) {
    if (x2 < -80 || x1 > VIEW_W + 80) return;
    g.save();
    g.strokeStyle = css(WOOD.rope, .8); g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x1, y);
    g.quadraticCurveTo((x1 + x2) / 2, y + 16, x2, y);
    g.stroke();
    const n = 5;
    for (let i = 0; i < n; i++) {
      const f = (i + .5) / n;
      const mx = (x1 + x2) / 2, my = y + 16;
      const bx = (1 - f) * (1 - f) * x1 + 2 * (1 - f) * f * mx + f * f * x2;
      const by = (1 - f) * (1 - f) * y + 2 * (1 - f) * f * my + f * f * y;
      g.save();
      g.translate(bx, by + 4);
      g.rotate(Math.sin(t * 1.4 + i) * .08);
      g.fillStyle = css(mix([166, 158, 130], [96, 102, 118], night));
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(7, 10, 0, 26);
      g.quadraticCurveTo(-7, 10, 0, 0);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath(); g.moveTo(0, 26); g.lineTo(-5, 32); g.lineTo(5, 32); g.closePath(); g.fill();
      g.restore();
    }
    g.restore();
  },

  _drum(g, x, y) {
    g.save();
    const w = 34, h = 52;
    g.fillStyle = '#5a6a5f';
    g.fillRect(x - w / 2, y - h, w, h);
    g.fillStyle = '#6d8072';
    g.fillRect(x - w / 2, y - h, 7, h);
    g.fillStyle = '#42504a';
    g.fillRect(x - w / 2, y - h + 10, w, 4);
    g.fillRect(x - w / 2, y - 16, w, 4);
    g.fillStyle = '#8a6a3c';
    g.beginPath(); g.ellipse(x + 6, y - 30, 5, 8, .3, 0, 6.2832); g.fill();
    g.fillStyle = '#7d8f80';
    g.beginPath(); g.ellipse(x, y - h, w / 2, 5, 0, 0, 6.2832); g.fill();
    g.restore();
  },

  _tarpCrate(g, x, y, t) {
    g.save();
    this._crate(g, x, y, 52, false);
    g.fillStyle = '#4d5a52';
    g.beginPath();
    g.moveTo(x - 42, y - 6);
    g.quadraticCurveTo(x - 34, y - 66 + Math.sin(t) * 1.5, x + 2, y - 62);
    g.quadraticCurveTo(x + 40, y - 58, x + 44, y - 4);
    g.quadraticCurveTo(x, y - 14, x - 42, y - 6);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.08)';
    g.beginPath();
    g.moveTo(x - 42, y - 6);
    g.quadraticCurveTo(x - 34, y - 66, x + 2, y - 62);
    g.lineTo(x - 6, y - 20);
    g.closePath(); g.fill();
    g.strokeStyle = css(WOOD.rope, .7); g.lineWidth = 3;
    g.beginPath(); g.moveTo(x - 44, y - 26); g.quadraticCurveTo(x, y - 34, x + 46, y - 24); g.stroke();
    g.restore();
  },

  _chair(g, x, y) {
    g.save();
    g.fillStyle = css(shade(WOOD.hull, -.1));
    g.fillRect(x - 18, y - 26, 36, 5);
    g.fillRect(x - 16, y - 21, 5, 21);
    g.fillRect(x + 11, y - 21, 5, 21);
    g.fillRect(x + 11, y - 56, 5, 32);
    g.fillStyle = css(shade(WOOD.hull, .06));
    g.fillRect(x - 4, y - 52, 22, 5);
    g.fillRect(x - 4, y - 42, 22, 5);
    // a coat over the back
    g.fillStyle = '#4a5a6b';
    g.beginPath();
    g.moveTo(x + 2, y - 54);
    g.quadraticCurveTo(x + 26, y - 46, x + 20, y - 16);
    g.quadraticCurveTo(x + 8, y - 20, x + 2, y - 54);
    g.closePath(); g.fill();
    g.restore();
  },

  _buoys(g, x, y, t) {
    g.save();
    for (let i = 0; i < 3; i++) {
      const bx = x + i * 26, sw = Math.sin(t * .9 + i) * .08;
      g.save();
      g.translate(bx, y); g.rotate(sw);
      g.strokeStyle = css(WOOD.rope, .8); g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, -10); g.lineTo(0, 2); g.stroke();
      const col = ['#c4483f', '#d8c48a', '#4a7a8c'][i];
      g.fillStyle = col;
      g.beginPath(); g.ellipse(0, 16, 10, 15, 0, 0, 6.2832); g.fill();
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillRect(-10, 12, 20, 4);
      g.fillStyle = 'rgba(0,0,0,.2)';
      g.beginPath(); g.ellipse(4, 20, 4, 7, 0, 0, 6.2832); g.fill();
      g.restore();
    }
    g.restore();
  },

  // everything IN FRONT of the crew (hull, near gunwale, water line)
  boatFront(g, camX, t, night) {
    const X = x => x - camX;
    g.save();

    // near gunwale cap
    g.fillStyle = css(WOOD.trim);
    g.fillRect(X(10), DECK_Y, BOAT_R - 20, 7);
    g.fillStyle = css(shade(WOOD.trim, -.3));
    g.fillRect(X(10), DECK_Y + 7, BOAT_R - 20, 3);

    // hull body
    g.beginPath();
    g.moveTo(X(14), DECK_Y + 6);
    g.lineTo(X(BOAT_R - 14), DECK_Y + 6);
    g.quadraticCurveTo(X(BOAT_R + 40), DECK_Y + 46, X(BOAT_R - 110), DECK_Y + 88);
    g.lineTo(X(150), DECK_Y + 92);
    g.quadraticCurveTo(X(-26), DECK_Y + 56, X(14), DECK_Y + 6);
    g.closePath();
    const hg = g.createLinearGradient(0, DECK_Y, 0, DECK_Y + 92);
    hg.addColorStop(0, css(WOOD.hullLite));
    hg.addColorStop(.35, css(WOOD.hull));
    hg.addColorStop(1, css(WOOD.hullDark));
    g.fillStyle = hg; g.fill();

    // planking
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 3;
    for (let y = DECK_Y + 16; y < DECK_Y + 92; y += 11) {
      g.beginPath(); g.moveTo(X(0), y); g.lineTo(X(BOAT_R), y + 3); g.stroke();
    }
    // gold strake
    g.fillStyle = css(WOOD.trim, .9);
    g.fillRect(X(20), DECK_Y + 24, BOAT_R - 40, 5);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.fillRect(X(20), DECK_Y + 29, BOAT_R - 40, 2);
    // name board
    Text.draw(g, 'MARGARET', X(300), DECK_Y + 56, {
      size: 20, color: 'rgba(238,214,158,.72)', font: 'Georgia, serif',
      weight: 'bold', align: 'center', italic: true
    });
    // portholes
    for (let x = 560; x < 1700; x += 180) {
      const sx = X(x);
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.beginPath(); g.arc(sx, DECK_Y + 48, 9, 0, 6.2832); g.fill();
      g.strokeStyle = css(WOOD.trim, .7); g.lineWidth = 3;
      g.beginPath(); g.arc(sx, DECK_Y + 48, 9, 0, 6.2832); g.stroke();
      if (night > .4) {
        g.fillStyle = 'rgba(255,196,110,' + (0.25 * night) + ')';
        g.beginPath(); g.arc(sx, DECK_Y + 48, 7, 0, 6.2832); g.fill();
      }
    }
    g.restore();

    // anchor stowed at the bow
    const ax = X(1842);
    if (ax > -80 && ax < VIEW_W + 80) {
      g.save();
      g.strokeStyle = css(WOOD.rope, .8); g.lineWidth = 3;
      g.beginPath(); g.moveTo(ax, DECK_Y + 4); g.lineTo(ax, DECK_Y + 24); g.stroke();
      g.strokeStyle = '#6e7680'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(ax, DECK_Y + 22); g.lineTo(ax, DECK_Y + 62); g.stroke();
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(ax - 14, DECK_Y + 30); g.lineTo(ax + 14, DECK_Y + 30); g.stroke();
      g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(ax - 17, DECK_Y + 48);
      g.quadraticCurveTo(ax, DECK_Y + 74, ax + 17, DECK_Y + 48);
      g.stroke();
      g.lineCap = 'butt';
      g.fillStyle = '#6e7680';
      g.beginPath(); g.moveTo(ax - 22, DECK_Y + 42); g.lineTo(ax - 12, DECK_Y + 52); g.lineTo(ax - 19, DECK_Y + 54); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(ax + 22, DECK_Y + 42); g.lineTo(ax + 12, DECK_Y + 52); g.lineTo(ax + 19, DECK_Y + 54); g.closePath(); g.fill();
      g.restore();
    }

    // rust streaks weeping from the fastenings
    g.save();
    g.globalAlpha = .3;
    for (let x = 120; x < BOAT_R - 100; x += 137) {
      const sx = X(x);
      if (sx < -20 || sx > VIEW_W + 20) continue;
      const grd = g.createLinearGradient(0, DECK_Y + 10, 0, DECK_Y + 58);
      grd.addColorStop(0, 'rgba(150,90,50,.8)');
      grd.addColorStop(1, 'rgba(150,90,50,0)');
      g.fillStyle = grd;
      g.fillRect(sx, DECK_Y + 10, 4, 48);
    }
    g.restore();

    // rope fenders
    for (const fx of [220, 620, 1120, 1560]) {
      const sx = X(fx);
      g.strokeStyle = css(WOOD.rope, .8); g.lineWidth = 3;
      g.beginPath(); g.moveTo(sx, DECK_Y + 8); g.lineTo(sx, DECK_Y + 22); g.stroke();
      g.fillStyle = css(shade(WOOD.rope, -.18));
      g.beginPath(); g.ellipse(sx, DECK_Y + 30, 9, 10, 0, 0, 6.2832); g.fill();
      g.fillStyle = 'rgba(0,0,0,.2)';
      g.beginPath(); g.ellipse(sx, DECK_Y + 30, 5, 6, 0, 0, 6.2832); g.fill();
    }

    g.restore();
  },

  _cabin(g, x, y, night, t) {
    g.save();
    const w = 172, h = 104;
    g.fillStyle = css(shade(WOOD.hull, .06));
    g.fillRect(x, y - h, w, h);
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let i = 0; i < 7; i++) g.fillRect(x, y - h + i * 15, w, 1.5);
    // roof
    g.fillStyle = css(WOOD.hullDark);
    g.fillRect(x - 10, y - h - 12, w + 20, 13);
    g.fillStyle = css(WOOD.trim);
    g.fillRect(x - 10, y - h - 14, w + 20, 3);
    // window
    g.fillStyle = night > .4 ? '#ffcd7a' : '#8fb9c9';
    g.fillRect(x + 28, y - h + 22, 46, 34);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(x + 50, y - h + 22, 3, 34);
    g.fillRect(x + 28, y - h + 38, 46, 3);
    g.strokeStyle = css(WOOD.trim); g.lineWidth = 3;
    g.strokeRect(x + 28, y - h + 22, 46, 34);
    if (night > .4) {
      g.save(); g.globalCompositeOperation = 'lighter';
      stepGlow(g, x + 51, y - h + 39, 64, 'rgb(255,190,110)', .22, { steps: 2 });
      g.restore();
    }
    // the wheel, just visible through the glass
    g.save();
    g.beginPath(); g.rect(x + 28, y - h + 22, 46, 34); g.clip();
    g.strokeStyle = 'rgba(60,42,26,.75)'; g.lineWidth = 3;
    g.beginPath(); g.arc(x + 48, y - h + 48, 15, 0, 6.2832); g.stroke();
    g.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + t * .05;
      g.beginPath();
      g.moveTo(x + 48, y - h + 48);
      g.lineTo(x + 48 + Math.cos(a) * 19, y - h + 48 + Math.sin(a) * 19);
      g.stroke();
    }
    g.restore();

    // door, with a hook and an oilskin on it
    g.fillStyle = css(shade(WOOD.hull, -.18));
    g.fillRect(x + 104, y - 72, 44, 72);
    g.fillStyle = 'rgba(0,0,0,.2)';
    g.fillRect(x + 104, y - 72, 44, 3);
    g.fillStyle = css(WOOD.trim);
    g.beginPath(); g.arc(x + 112, y - 36, 3, 0, 6.2832); g.fill();
    g.fillStyle = '#e0aa3c';
    g.beginPath();
    g.moveTo(x + 132, y - 66);
    g.quadraticCurveTo(x + 146, y - 56, x + 142, y - 26);
    g.quadraticCurveTo(x + 130, y - 30, x + 132, y - 66);
    g.closePath(); g.fill();

    // a chalkboard nobody has updated
    g.fillStyle = '#2a2f33';
    g.fillRect(x + 12, y - 46, 40, 28);
    g.strokeStyle = css(WOOD.trim); g.lineWidth = 3;
    g.strokeRect(x + 12, y - 46, 40, 28);
    g.strokeStyle = 'rgba(226,226,214,.5)'; g.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(x + 17, y - 40 + i * 8);
      g.lineTo(x + 17 + [22, 30, 14][i], y - 40 + i * 8);
      g.stroke();
    }
    // chimney with smoke
    g.fillStyle = css(WOOD.hullDark);
    g.fillRect(x + 132, y - h - 34, 16, 22);
    g.globalAlpha = .18;
    g.fillStyle = '#cfd6e2';
    for (let i = 0; i < 5; i++) {
      const p = (t * .35 + i * .2) % 1;
      g.beginPath();
      g.arc(x + 140 + Math.sin(t * .8 + i) * 16 * p, y - h - 40 - p * 78, 5 + p * 14, 0, 6.2832);
      g.fill();
    }
    g.restore();
  },

  _mast(g, x, t, night) {
    g.save();
    const topY = -40;
    // sail (billowing)
    const bill = Math.sin(t * .7) * 10;
    g.beginPath();
    g.moveTo(x + 6, 70);
    g.quadraticCurveTo(x + 150 + bill, 150, x + 128 + bill * .5, 300);
    g.lineTo(x + 6, 300);
    g.closePath();
    const sg = g.createLinearGradient(x, 70, x + 150, 300);
    sg.addColorStop(0, css(mix([236, 226, 200], [58, 64, 96], night)));
    sg.addColorStop(1, css(mix([196, 182, 152], [34, 38, 62], night)));
    g.fillStyle = sg; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 3;
    for (let i = 1; i < 5; i++) {
      g.beginPath();
      g.moveTo(x + 6, 70 + i * 46);
      g.quadraticCurveTo(x + 90 + bill, 120 + i * 42, x + 128 + bill * .5 - i * 4, 300);
      g.stroke();
    }
    // mast pole
    g.fillStyle = css(WOOD.hull);
    g.fillRect(x - 7, topY, 14, DECK_Y - topY);
    g.fillStyle = css(shade(WOOD.hull, .16));
    g.fillRect(x - 7, topY, 4, DECK_Y - topY);
    // yard
    g.fillStyle = css(WOOD.hullDark);
    g.fillRect(x - 60, 66, 200, 7);
    // rigging
    g.strokeStyle = css(WOOD.rope, .55); g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, 74); g.lineTo(x - 210, DECK_Y - 36); g.stroke();
    g.beginPath(); g.moveTo(x, 74); g.lineTo(x + 240, DECK_Y - 36); g.stroke();
    g.beginPath(); g.moveTo(x, 120); g.lineTo(x - 150, DECK_Y - 36); g.stroke();
    // flag
    g.fillStyle = '#b4494b';
    g.beginPath();
    g.moveTo(x + 2, topY + 4);
    g.lineTo(x + 46 + Math.sin(t * 3) * 7, topY + 12 + Math.sin(t * 3.4) * 4);
    g.lineTo(x + 2, topY + 24);
    g.closePath(); g.fill();
    g.restore();
  },

  _stall(g, x, night, t) {
    g.save();
    const y = DECK_Y;
    // back poles
    g.fillStyle = css(WOOD.hullDark);
    g.fillRect(x - 62, y - 132, 8, 132);
    g.fillRect(x + 66, y - 132, 8, 132);
    // awning
    g.beginPath();
    g.moveTo(x - 82, y - 132);
    g.lineTo(x + 92, y - 132);
    g.lineTo(x + 82, y - 108);
    g.lineTo(x - 72, y - 108);
    g.closePath();
    g.fillStyle = '#7a3f47'; g.fill();
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? '#8d4a52' : '#5e3038';
      g.fillRect(x - 82 + i * 29, y - 132, 15, 26);
    }
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.fillRect(x - 82, y - 110, 176, 4);
    // hanging goods
    g.strokeStyle = css(WOOD.rope, .8); g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const hx = x - 52 + i * 34, len = 16 + (i % 3) * 8;
      g.beginPath(); g.moveTo(hx, y - 106); g.lineTo(hx, y - 106 + len); g.stroke();
      g.fillStyle = ['#8fa7b5', '#b0704a', '#6f8f6a', '#a58fb5'][i];
      g.beginPath(); g.ellipse(hx, y - 106 + len + 6, 6, 8, .2, 0, 6.2832); g.fill();
    }
    // the man himself, standing behind his counter
    Art.dorran(g, x + 8, y - 16, { t });

    // counter
    g.fillStyle = css(WOOD.hull);
    g.fillRect(x - 74, y - 46, 156, 46);
    g.fillStyle = css(WOOD.trim);
    g.fillRect(x - 78, y - 52, 164, 8);
    g.fillStyle = 'rgba(0,0,0,.2)';
    for (let i = 1; i < 5; i++) g.fillRect(x - 74 + i * 31, y - 46, 2, 46);
    // scale + coin pile on the counter
    g.fillStyle = '#c9b27a';
    g.fillRect(x + 34, y - 76, 3, 24);
    g.fillRect(x + 20, y - 76, 31, 3);
    g.beginPath(); g.arc(x + 22, y - 68, 7, 0, Math.PI); g.fill();
    g.beginPath(); g.arc(x + 49, y - 70, 7, 0, Math.PI); g.fill();
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? '#e8c76a' : '#c9a44c';
      g.beginPath(); g.ellipse(x - 46 + (i % 3) * 9, y - 54 - Math.floor(i / 3) * 4, 6, 2.6, 0, 0, 6.2832); g.fill();
    }
    // lantern on the post
    this._lantern(g, x + 70, y - 122, night, t, 1);
    g.restore();
  },

  _lantern(g, x, y, night, t, s) {
    g.save();
    const flick = 0.82 + Math.sin(t * 11) * .06 + Math.sin(t * 5.3) * .09;
    g.strokeStyle = css(WOOD.hullDark); g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, y - 12 * s); g.lineTo(x, y - 2 * s); g.stroke();
    g.fillStyle = '#5a5f6b';
    g.fillRect(x - 9 * s, y, 18 * s, 4 * s);
    g.fillRect(x - 9 * s, y + 22 * s, 18 * s, 4 * s);
    g.fillStyle = night > .25 ? 'rgba(255,206,120,' + (.85 * flick) + ')' : 'rgba(210,220,230,.5)';
    g.fillRect(x - 7 * s, y + 3 * s, 14 * s, 19 * s);
    g.strokeStyle = '#3f434d'; g.lineWidth = 3;
    g.strokeRect(x - 7 * s, y + 3 * s, 14 * s, 19 * s);
    g.beginPath(); g.moveTo(x, y + 3 * s); g.lineTo(x, y + 22 * s); g.stroke();
    if (night > .2) {
      g.globalCompositeOperation = 'lighter';
      // flicker the brightness, not the radius, or the rings crawl
      stepGlow(g, x, y + 12 * s, 84 * s, 'rgb(255,180,100)', .26 * night * flick, { steps: 3 });
    }
    g.restore();
  },

  _crate(g, x, y, s, open) {
    g.save();
    const w = s * 1.25, h = s;
    g.fillStyle = css(WOOD.hull);
    g.fillRect(x - w / 2, y - h, w, h);
    g.strokeStyle = css(shade(WOOD.hull, -.28)); g.lineWidth = 3;
    g.strokeRect(x - w / 2 + 1.5, y - h + 1.5, w - 3, h - 3);
    g.beginPath();
    g.moveTo(x - w / 2, y - h); g.lineTo(x + w / 2, y);
    g.moveTo(x + w / 2, y - h); g.lineTo(x - w / 2, y);
    g.stroke();
    g.fillStyle = css(WOOD.trim, .7);
    g.fillRect(x - w / 2, y - h - 4, w, 5);
    if (open) {
      g.save();
      g.translate(x - w / 2, y - h - 2); g.rotate(-.5);
      g.fillStyle = css(WOOD.trim, .85); g.fillRect(0, -5, w, 5);
      g.restore();
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(x - w / 2 + 4, y - h + 2, w - 8, 9);
    }
    g.restore();
  },

  _barrel(g, x, y, s) {
    g.save();
    const w = 40 * s, h = 54 * s;
    const grad = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    grad.addColorStop(0, css(shade(WOOD.hull, -.25)));
    grad.addColorStop(.4, css(shade(WOOD.hull, .10)));
    grad.addColorStop(1, css(shade(WOOD.hull, -.32)));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - w / 2, y);
    g.quadraticCurveTo(x - w / 2 - 5, y - h / 2, x - w / 2, y - h);
    g.lineTo(x + w / 2, y - h);
    g.quadraticCurveTo(x + w / 2 + 5, y - h / 2, x + w / 2, y);
    g.closePath(); g.fill();
    g.fillStyle = '#5f6068';
    g.fillRect(x - w / 2 - 3, y - h + 5 * s, w + 6, 4 * s);
    g.fillRect(x - w / 2 - 5, y - h * .55, w + 10, 4 * s);
    g.fillRect(x - w / 2 - 3, y - 10 * s, w + 6, 4 * s);
    g.fillStyle = css(shade(WOOD.hull, .22));
    g.beginPath(); g.ellipse(x, y - h, w / 2, 5 * s, 0, 0, 6.2832); g.fill();
    g.restore();
  },

  _fishingPost(g, x, y, t, night) {
    g.save();
    // rail gap with a rod holder
    g.fillStyle = css(WOOD.hullDark);
    g.fillRect(x - 4, y - 54, 9, 54);
    g.fillRect(x + 54, y - 54, 9, 54);
    g.fillStyle = css(WOOD.trim);
    g.fillRect(x - 10, y - 58, 82, 6);
    // bait bucket
    g.fillStyle = '#5d6b74';
    g.beginPath();
    g.moveTo(x + 78, y); g.lineTo(x + 84, y - 30); g.lineTo(x + 110, y - 30); g.lineTo(x + 116, y);
    g.closePath(); g.fill();
    g.strokeStyle = '#8794a0'; g.lineWidth = 3;
    g.beginPath(); g.arc(x + 97, y - 30, 13, Math.PI, 0); g.stroke();
    g.fillStyle = '#3c4750';
    g.beginPath(); g.ellipse(x + 97, y - 30, 16, 4, 0, 0, 6.2832); g.fill();
    // lantern on a hook
    this._lantern(g, x + 22, y - 118, night, t, .9);
    g.restore();
  },

  /* ------------------------------ people ------------------------------- */

  boy(g, x, y, o) {
    o = o || {};
    const f = o.face === undefined ? 1 : o.face;
    const t = o.t || 0;
    const st = o.state || 'idle';
    let legA = 0, legB = 0, armA = 0, armB = 0, bob = 0, crouch = 0;

    let lean = 0, headT = 0;
    if (st === 'walk') {
      const p = Math.sin(t * 12);
      legA = p * 5; legB = -p * 5; armA = -p * 4; armB = p * 4;
      bob = Math.abs(Math.sin(t * 12)) * 2;
      lean = .07;
      headT = Math.sin(t * 12 + 1) * .04;
    } else if (st === 'jump') {
      legA = 4; legB = -3; armA = -6; armB = -4;
      lean = .05;
    } else if (st === 'roll') {
      // handled below
    } else if (st === 'hurt') {
      armA = -7; armB = -7; legA = 3;
      lean = -.22;
    } else {
      bob = Math.sin(t * 2.4) * 1.3;
      armA = Math.sin(t * 2.4) * 1.2;
      headT = Math.sin(t * 1.9) * .02;
    }

    const sq = o.squash === undefined ? 1 : o.squash;

    g.save();
    g.translate(snap(x + (o.lunge || 0) * f), snap(y - bob));

    // shadow
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath(); g.ellipse(0, 1 + (o.air || 0), 18, 5, 0, 0, 6.2832); g.fill();

    g.scale(f, 1);

    if (st === 'roll') {
      g.translate(0, -24);
      g.rotate((o.rollT || 0) * 6.9 * 1);
      g.fillStyle = '#f0bd4a';
      roundRect(g, -17, -17, 34, 34, 12); g.fill();
      g.fillStyle = '#3b5a80';
      roundRect(g, -13, -2, 26, 16, 8); g.fill();
      g.fillStyle = '#2a2a33';
      g.fillRect(-14, 6, 10, 8); g.fillRect(6, 4, 10, 8);
      g.restore();
      return;
    }

    const skin = '#f1c493', skinD = '#d2a074';
    const coat = '#f0bd4a', coatD = '#c8963a';
    const pants = '#3b5a80', pantsD = '#2c4462';

    // squash on landing, stretch in the air, and a slight lean into motion
    if (sq !== 1 || lean !== 0) {
      g.scale(1 / sq, sq);
      g.rotate(lean);
    }

    // back arm
    g.save();
    g.translate(-8, -32 + crouch);
    g.rotate((o.backArm !== undefined ? o.backArm : armB * .08));
    g.fillStyle = coatD; g.fillRect(-3, 0, 6, 14);
    g.fillStyle = skinD; g.fillRect(-3, 13, 6, 5);
    g.restore();

    // back leg
    g.fillStyle = pantsD;
    g.fillRect(-8 + legB * .6, -17, 8, 14);
    g.fillStyle = '#23242c';
    g.fillRect(-10 + legB * .6, -4, 12, 5);

    // front leg
    g.fillStyle = pants;
    g.fillRect(1 + legA * .6, -17, 8, 14);
    g.fillStyle = '#2a2a33';
    g.fillRect(0 + legA * .6, -4, 13, 5);

    // torso / coat — shaded on the back, buttons on the front
    g.fillStyle = coat;
    roundRect(g, -10, -36, 20, 22, 3); g.fill();
    g.fillStyle = coatD;
    g.fillRect(-10, -22, 20, 6);
    g.fillRect(-10, -36, 6, 22);
    g.fillStyle = '#6b4a2a';
    g.fillRect(-10, -26, 20, 2);
    g.fillStyle = '#c9a44c';
    g.fillRect(4, -34, 2, 2);
    g.fillRect(4, -30, 2, 2);

    // scarf, with its loose end trailing behind and streaming when he runs
    g.fillStyle = '#b4494b';
    g.fillRect(-10, -40, 20, 6);
    g.fillStyle = '#8f3739';
    if (st === 'walk' || st === 'jump') {
      g.fillRect(-16, -38 + Math.round(Math.sin(t * 9)), 8, 4);
      g.fillRect(-20, -36 + Math.round(Math.sin(t * 9 + 1)), 4, 4);
    } else {
      g.fillRect(-10, -36, 4, 8 + (Math.sin(t * 5) > 0 ? 2 : 0));
    }

    // head — rides on its own little tilt so the walk has some bounce
    g.save();
    g.translate(0, -38); g.rotate(headT); g.translate(0, 38);
    g.fillStyle = skin;
    roundRect(g, -8, -52, 16, 14, 3); g.fill();
    // nose, one pixel proud of the face: the single strongest facing cue
    g.fillRect(8, -48, 2, 4);
    g.fillStyle = skinD;
    g.fillRect(-8, -40, 16, 2);
    // hair covers the whole back half of the head, down to the nape
    g.fillStyle = '#6b4326';
    g.fillRect(-8, -52, 16, 4);
    g.fillRect(-8, -48, 8, 8);
    // ear, just in front of the hair
    g.fillStyle = skinD; g.fillRect(0, -46, 2, 4);
    // eye towards the front, with a lighter pixel so it reads as an eye
    g.fillStyle = '#2a2028';
    g.fillRect(4, -48, 2, 4);
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fillRect(4, -48, 2, 2);
    // cheek and mouth
    g.fillStyle = 'rgba(214,112,92,.45)'; g.fillRect(2, -44, 2, 2);
    g.fillStyle = skinD; g.fillRect(4, -42, 4, 2);
    // sou'wester: the brim runs long down the back of the neck
    g.fillStyle = '#e0aa3c';
    g.fillRect(-14, -54, 26, 4);
    g.fillRect(-14, -50, 6, 6);
    roundRect(g, -8, -62, 16, 9, 3); g.fill();
    g.fillStyle = '#c8963a';
    g.fillRect(-14, -50, 26, 2);
    g.fillRect(-14, -46, 6, 2);
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.fillRect(-6, -60, 12, 2);
    g.restore();   // end head tilt

    // front arm (+ held item)
    g.save();
    g.translate(8, -32);
    const fa = (o.frontArm !== undefined ? o.frontArm : armA * .08);
    g.rotate(fa);
    g.fillStyle = coat; g.fillRect(-3, 0, 6, 14);
    g.fillStyle = skin; g.fillRect(-3, 13, 6, 5);
    if (o.hold === 'rod') {
      g.save();
      g.translate(0, 16);
      g.rotate(o.rodAngle === undefined ? -0.9 : o.rodAngle);
      const rodL = 74;
      g.strokeStyle = '#6b4a2a'; g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(rodL * .5, -4, rodL, -10 + (o.rodBend || 0)); g.stroke();
      g.strokeStyle = '#c9b27a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(rodL * .3, -2); g.stroke();
      g.fillStyle = '#9aa6b4';
      g.beginPath(); g.arc(9, 4, 4.5, 0, 6.2832); g.fill();
      g.restore();
    } else if (o.hold === 'weapon') {
      g.save();
      g.translate(0, 16);
      g.rotate(o.weaponAngle === undefined ? -0.5 : o.weaponAngle);
      // heavy things are carried in both hands
      const w = o.weapon || WEAPONS[0];
      this.weapon(g, w, o.t, o.swingP);
      g.restore();
    }
    g.restore();

    g.restore();
  },

  // every weapon is drawn from the grip with the business end pointing +x
  weapon(g, w, t, swingP) {
    if (!w) return;
    const L = 46 * (w.reach || 1);
    switch (w.kind) {

      case 'net': {
        g.fillStyle = w.grip;
        g.fillRect(-6, -2.6, L * .62, 5.2);
        g.fillStyle = 'rgba(0,0,0,.22)';
        g.fillRect(-6, .8, L * .62, 1.6);
        const hx = L * .62, R = 15;
        // the netting bag, dragged behind the hoop by the swing
        const drag = (swingP || 0) * 8;
        g.strokeStyle = 'rgba(228,222,198,.75)'; g.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
          g.beginPath();
          g.moveTo(hx + Math.cos(i / 4 * Math.PI - Math.PI / 2) * R,
                   Math.sin(i / 4 * Math.PI - Math.PI / 2) * R);
          g.quadraticCurveTo(hx + 12 - drag, i * 2 - 4, hx + 22 - drag, -1 + i);
          g.stroke();
        }
        for (let i = 1; i < 4; i++) {
          g.beginPath();
          g.ellipse(hx + i * 6 - drag * (i / 4), 0, 2 + i, R - i * 3.4, 0, -1.4, 1.4);
          g.stroke();
        }
        // hoop
        g.strokeStyle = w.metal; g.lineWidth = 3.4;
        g.beginPath(); g.ellipse(hx, 0, 6, R, 0, 0, 6.2832); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 3;
        g.beginPath(); g.ellipse(hx, 0, 6, R, 0, -2.6, -.4); g.stroke();
        break;
      }

      case 'gaff': {
        g.fillStyle = w.grip;
        g.fillRect(-6, -2.8, L * .78, 5.6);
        g.fillStyle = 'rgba(255,255,255,.14)';
        g.fillRect(-6, -2.8, L * .78, 1.6);
        // whipping at the throat
        g.fillStyle = w.accent;
        for (let i = 0; i < 3; i++) g.fillRect(L * .5 + i * 5, -3.4, 2.6, 6.8);
        g.strokeStyle = w.metal; g.lineWidth = 5; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(L * .76, 0);
        g.quadraticCurveTo(L * 1.02, -2, L * .98, 15);
        g.quadraticCurveTo(L * .94, 25, L * .78, 21);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3;
        g.beginPath();
        g.moveTo(L * .76, -2);
        g.quadraticCurveTo(L * 1.0, -3, L * .96, 13);
        g.stroke();
        g.lineCap = 'butt';
        break;
      }

      case 'cleaver': {
        g.fillStyle = w.grip;
        roundRect(g, -8, -4, 18, 8, 3); g.fill();
        g.fillStyle = w.accent;
        g.fillRect(9, -6, 4, 12);
        const bw = L * .78, bh = 24;
        g.beginPath();
        g.moveTo(13, -7);
        g.lineTo(13 + bw * .82, -bh * .62);
        g.quadraticCurveTo(13 + bw, -bh * .3, 13 + bw, bh * .2);
        g.lineTo(13 + bw * .5, bh * .5);
        g.lineTo(13, 7);
        g.closePath();
        g.fillStyle = w.metal; g.fill();
        g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 3; g.stroke();
        // rust and a chipped edge
        g.fillStyle = 'rgba(150,90,60,.35)';
        g.beginPath(); g.ellipse(13 + bw * .45, -2, bw * .2, 6, .3, 0, 6.2832); g.fill();
        g.fillStyle = 'rgba(255,255,255,.5)';
        g.beginPath();
        g.moveTo(15, 6); g.lineTo(13 + bw * .5, bh * .46); g.lineTo(13 + bw * .5, bh * .3);
        g.lineTo(15, 3); g.closePath(); g.fill();
        break;
      }

      case 'harpoon': {
        g.fillStyle = w.grip;
        g.fillRect(-14, -2.4, L * .86, 4.8);
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.fillRect(-14, -2.4, L * .86, 1.4);
        // lanyard trailing from the butt
        g.strokeStyle = 'rgba(200,178,122,.7)'; g.lineWidth = 3;
        g.beginPath();
        g.moveTo(-14, 0);
        g.quadraticCurveTo(-26, 8 + Math.sin((t || 0) * 6) * 3, -34, 4);
        g.stroke();
        g.fillStyle = w.accent;
        g.fillRect(L * .66, -3.6, 5, 7.2);
        // head
        const hx2 = L * .84;
        g.beginPath();
        g.moveTo(hx2, -4.4);
        g.lineTo(L * 1.12, 0);
        g.lineTo(hx2, 4.4);
        g.closePath();
        g.fillStyle = w.metal; g.fill();
        // barbs
        g.beginPath();
        g.moveTo(hx2 + 2, -3.6); g.lineTo(hx2 - 9, -12); g.lineTo(hx2 + 5, -2);
        g.moveTo(hx2 + 2, 3.6); g.lineTo(hx2 - 9, 12); g.lineTo(hx2 + 5, 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,.45)';
        g.beginPath();
        g.moveTo(hx2, -3); g.lineTo(L * 1.08, 0); g.lineTo(hx2, -1); g.closePath(); g.fill();
        break;
      }

      case 'chain': {
        // links follow a lazy curve that straightens as the swing peaks
        const p = swingP === undefined ? .4 : swingP;
        const n = 11;
        g.strokeStyle = w.metal; g.lineWidth = 4;
        for (let i = 0; i < n; i++) {
          const f = i / (n - 1);
          const x = f * L * 1.05;
          const y = Math.sin(f * 2.6 + (t || 0) * 3) * (1 - p) * 14 + f * p * 4;
          g.save();
          g.translate(x, y);
          g.rotate(f * .4 * (1 - p));
          g.strokeStyle = i % 2 ? w.metal : w.accent;
          g.lineWidth = 3.2;
          g.beginPath(); g.ellipse(0, 0, 4.4, 3, 0, 0, 6.2832); g.stroke();
          g.restore();
        }
        // the hook on the end, riding the last link
        const ex = L * 1.05;
        const ey = Math.sin(2.6 + (t || 0) * 3) * (1 - p) * 14 + p * 4;
        g.save();
        g.translate(ex, ey);
        g.strokeStyle = w.metal; g.lineWidth = 5; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(14, 2, 12, 14);
        g.quadraticCurveTo(10, 22, 0, 18);
        g.stroke();
        g.lineCap = 'butt';
        g.restore();
        g.fillStyle = w.grip;
        g.fillRect(-7, -4, 10, 8);
        break;
      }

      case 'tooth':
      default: {
        // a curved ivory blade, still rooted in a lump of jaw
        g.fillStyle = w.grip;
        roundRect(g, -7, -4.5, 17, 9, 3); g.fill();
        g.fillStyle = w.accent;
        g.fillRect(9, -8, 5, 16);
        g.beginPath(); g.arc(11.5, -8, 2.6, 0, 6.2832); g.fill();
        g.beginPath(); g.arc(11.5, 8, 2.6, 0, 6.2832); g.fill();
        const bl = L * 1.06;
        g.beginPath();
        g.moveTo(13, -5.5);
        g.quadraticCurveTo(13 + bl * .55, -13, 13 + bl, -3);
        g.quadraticCurveTo(13 + bl * .6, 2, 13, 5.5);
        g.closePath();
        const tg = g.createLinearGradient(13, -10, 13 + bl, 6);
        tg.addColorStop(0, w.metal);
        tg.addColorStop(.7, '#e6dcc4');
        tg.addColorStop(1, '#b9a88e');
        g.fillStyle = tg; g.fill();
        g.strokeStyle = 'rgba(90,70,60,.45)'; g.lineWidth = 3; g.stroke();
        // serrations along the inner edge
        g.fillStyle = 'rgba(255,255,255,.6)';
        for (let i = 0; i < 7; i++) {
          const f = .15 + i * .11;
          g.beginPath();
          g.arc(13 + bl * f, lerp(-6, -2, f) - 1, 1.8, 0, 6.2832);
          g.fill();
        }
        break;
      }
    }
  },

  dad(g, x, y, o) {
    o = o || {};
    const f = o.face === undefined ? 1 : o.face;
    const t = o.t || 0;
    const walking = o.state === 'walk';
    const p = walking ? Math.sin(t * 9) : 0;
    const bob = walking ? Math.abs(Math.sin(t * 9)) * 2 : Math.sin(t * 1.8) * 1.2;

    g.save();
    g.translate(snap(x), snap(y - bob));
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath(); g.ellipse(0, 1, 22, 6, 0, 0, 6.2832); g.fill();
    g.scale(f, 1);

    const coat = '#40536b', coatD = '#2f3e52', skin = '#e0b083', skinD = '#c09068';

    // back arm
    g.fillStyle = coatD; g.fillRect(-13 + p * 4, -50, 8, 20);
    // legs
    g.fillStyle = '#3a3f4d';
    g.fillRect(-11 - p * 6, -26, 10, 22);
    g.fillRect(2 + p * 6, -26, 10, 22);
    g.fillStyle = '#23242c';
    g.fillRect(-14 - p * 6, -6, 15, 7);
    g.fillRect(1 + p * 6, -6, 15, 7);
    // coat
    g.fillStyle = coat;
    roundRect(g, -15, -56, 30, 34, 4); g.fill();
    g.fillStyle = coatD;
    g.fillRect(-15, -30, 30, 8);
    g.fillRect(6, -56, 9, 34);
    g.fillStyle = '#2a2a33'; g.fillRect(-15, -34, 30, 4);
    g.fillStyle = '#c9a44c'; g.fillRect(-2, -34, 4, 4);
    // collar
    g.fillStyle = '#5a6d86'; g.fillRect(-14, -60, 28, 6);
    // head
    g.fillStyle = skin;
    roundRect(g, -11, -78, 22, 20, 4); g.fill();
    // beard
    g.fillStyle = '#8d8f9b';
    g.fillRect(-11, -66, 22, 9);
    g.fillRect(-6, -60, 16, 6);
    g.fillStyle = '#9fa2ad'; g.fillRect(-2, -68, 12, 3);
    // eye + brow
    g.fillStyle = '#2a2028'; g.fillRect(3, -72, 3, 3);
    g.fillStyle = '#8d8f9b'; g.fillRect(1, -75, 8, 2);
    // nose
    g.fillStyle = skinD; g.fillRect(8, -71, 4, 4);
    // cap
    g.fillStyle = '#26303f';
    roundRect(g, -13, -88, 26, 11, 3); g.fill();
    g.fillRect(2, -79, 17, 4);
    g.fillStyle = '#38455a'; g.fillRect(-12, -87, 24, 3);
    // pipe + smoke
    if (o.pipe !== false) {
      g.fillStyle = '#5a3f28';
      g.fillRect(10, -66, 10, 2.5);
      g.fillRect(18, -71, 4, 6);
      g.globalAlpha = .3; g.fillStyle = '#d6dae2';
      for (let i = 0; i < 3; i++) {
        const q = (t * .5 + i * .33) % 1;
        g.beginPath(); g.arc(21 + Math.sin(t + i) * 6 * q, -74 - q * 34, 2.5 + q * 7, 0, 6.2832); g.fill();
      }
      g.globalAlpha = 1;
    }
    // front arm
    g.fillStyle = coat; g.fillRect(9 - p * 4, -50, 9, 21);
    g.fillStyle = skin; g.fillRect(9 - p * 4, -30, 9, 6);

    g.restore();
  },

  dorran(g, x, y, o) {
    o = o || {};
    const t = o.t || 0;
    const bob = Math.sin(t * 1.5) * 1.4;
    g.save();
    g.translate(snap(x), snap(y - bob));
    g.scale(-1, 1); // faces left, toward the deck
    const coat = '#3e5a4a', coatD = '#2d4437', skin = '#dcae86';

    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath(); g.ellipse(0, 1, 20, 5, 0, 0, 6.2832); g.fill();

    // legs (mostly hidden behind counter)
    g.fillStyle = '#2f3a35';
    g.fillRect(-10, -24, 9, 24); g.fillRect(2, -24, 9, 24);
    // long coat
    g.fillStyle = coat;
    roundRect(g, -14, -56, 28, 40, 4); g.fill();
    g.fillStyle = coatD;
    g.fillRect(5, -56, 9, 40);
    g.fillRect(-14, -30, 28, 5);
    // scarf
    g.fillStyle = '#7d4a3a'; g.fillRect(-13, -60, 26, 6);
    // head
    g.fillStyle = skin;
    roundRect(g, -10, -76, 20, 19, 4); g.fill();
    // big nose
    g.fillStyle = '#c8946c'; g.fillRect(8, -68, 7, 5);
    // eye
    g.fillStyle = '#2a2028'; g.fillRect(2, -70, 3, 3);
    // stubble
    g.fillStyle = 'rgba(60,60,70,.35)'; g.fillRect(-6, -62, 16, 5);
    // wide hat
    g.fillStyle = '#2f3a35';
    g.beginPath(); g.ellipse(0, -78, 25, 6, 0, 0, 6.2832); g.fill();
    roundRect(g, -10, -90, 20, 13, 4); g.fill();
    g.fillStyle = '#7d4a3a';
    g.fillRect(-10, -80, 20, 3);
    // arm resting on counter
    g.fillStyle = coat;
    g.save(); g.translate(-11, -48); g.rotate(.9 + Math.sin(t * 1.1) * .05);
    g.fillRect(-4, 0, 8, 20);
    g.fillStyle = skin; g.fillRect(-4, 19, 8, 6);
    g.restore();
    g.restore();
  },

  // a soft additive glow; creatures themselves are drawn in beasts.js
  _glowBlob(g, x, y, r, col, a) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    stepGlow(g, x, y, r * .65, col, a === undefined ? .5 : a, { steps: 3 });
    g.restore();
  },

  // little silhouette for the trophy list
  fishIcon(g, x, y, s, body, belly) {
    g.save();
    g.translate(x, y); g.scale(s, s);
    g.beginPath();
    g.moveTo(14, 0);
    g.bezierCurveTo(8, -9, -4, -10, -10, -3);
    g.lineTo(-10, 3);
    g.bezierCurveTo(-4, 10, 8, 9, 14, 0);
    g.closePath();
    const grad = g.createLinearGradient(0, -9, 0, 9);
    grad.addColorStop(0, css(body || [90, 120, 140]));
    grad.addColorStop(1, css(belly || [190, 210, 200]));
    g.fillStyle = grad; g.fill();
    g.fillStyle = css(shade(body || [90, 120, 140], -.3));
    g.beginPath();
    g.moveTo(-10, 0); g.lineTo(-18, -7); g.lineTo(-16, 0); g.lineTo(-18, 7);
    g.closePath(); g.fill();
    g.fillStyle = '#14121c';
    g.beginPath(); g.arc(8, -2, 1.7, 0, 6.2832); g.fill();
    g.restore();
  },

  /* -------------------------------- HUD -------------------------------- */

  heart(g, x, y, fill) {
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.moveTo(0, 4);
    g.bezierCurveTo(-9, -4, -6, -11, 0, -6);
    g.bezierCurveTo(6, -11, 9, -4, 0, 4);
    g.closePath();
    if (fill) {
      g.fillStyle = '#e2464c'; g.fill();
      g.fillStyle = 'rgba(255,255,255,.45)';
      g.beginPath(); g.ellipse(-3, -5, 2, 1.4, -.5, 0, 6.2832); g.fill();
    } else {
      g.fillStyle = 'rgba(20,16,26,.55)'; g.fill();
    }
    g.lineWidth = 3; g.strokeStyle = fill ? '#7a1f26' : 'rgba(180,140,140,.5)';
    g.beginPath();
    g.moveTo(0, 4);
    g.bezierCurveTo(-9, -4, -6, -11, 0, -6);
    g.bezierCurveTo(6, -11, 9, -4, 0, 4);
    g.closePath(); g.stroke();
    g.restore();
  },

  coin(g, x, y, s) {
    s = s || 1;
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = '#c9a44c';
    g.beginPath(); g.ellipse(0, 0, 8, 8, 0, 0, 6.2832); g.fill();
    g.fillStyle = '#e8c76a';
    g.beginPath(); g.ellipse(-1, -1, 6, 6, 0, 0, 6.2832); g.fill();
    g.fillStyle = '#a8842f';
    Text.draw(g, '§', 0, 5, { size: 13, align: 'center', color: '#8a6a25', weight: 'bold', font: 'Georgia, serif' });
    g.restore();
  },

  /* ------------------------------- effects ----------------------------- */

  vignette(g, night) {
    // only at night: hard band edges over a bright daytime sky read as a lens fault
    stepVignette(g, 'rgb(2,4,12)', night * .5);
  },

  nightTint(g, night) {
    if (night < .05) return;
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = css(mix([255, 255, 255], [96, 118, 178], night * .55));
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.restore();
  },

  rain(g, t, amount) {
    if (amount <= 0) return;
    g.save();
    g.strokeStyle = 'rgba(180,206,236,.35)'; g.lineWidth = 3;
    for (let i = 0; i < 90 * amount; i++) {
      const sx = ((i * 137.5 + t * 620) % (VIEW_W + 200)) - 100;
      const sy = ((i * 83.3 + t * 980) % (VIEW_H + 100)) - 50;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx - 5, sy + 16); g.stroke();
    }
    g.restore();
  }
};
