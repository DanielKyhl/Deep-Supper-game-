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
