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
    const grad = g.createLinearGradient(0, 0, 0, HORIZON_Y + 20);
    grad.addColorStop(0, css(s.top));
    grad.addColorStop(0.55, css(s.mid));
    grad.addColorStop(1, css(s.low));
    g.fillStyle = grad;
    g.fillRect(0, 0, VIEW_W, HORIZON_Y + 22);

    // stars
    const sa = clamp((night - 0.5) * 2.6, 0, 1);
    if (sa > 0.01) {
      for (const st of this.stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * st.sp + st.ph);
        g.globalAlpha = sa * tw * .95;
        g.fillStyle = st.c;
        g.fillRect(st.x, st.y, st.s, st.s);
        if (st.s > 1.5) {
          g.globalAlpha = sa * tw * .3;
          g.fillRect(st.x - 1.5, st.y + st.s / 2 - .5, st.s + 3, 1);
          g.fillRect(st.x + st.s / 2 - .5, st.y - 1.5, 1, st.s + 3);
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
      const rg = g.createRadialGradient(742, sunY, 4, 742, sunY, 84);
      rg.addColorStop(0, css(sunC, .95));
      rg.addColorStop(.35, css(sunC, .3));
      rg.addColorStop(1, css(sunC, 0));
      g.fillStyle = rg; g.beginPath(); g.arc(742, sunY, 84, 0, 6.2832); g.fill();
      g.fillStyle = css(sunC);
      g.beginPath(); g.arc(742, sunY, 26, 0, 6.2832); g.fill();
      g.globalAlpha = 1;
    }
    if (night > 0.45) {
      const a = clamp((night - 0.45) / 0.3, 0, 1);
      const moonY = lerp(HORIZON_Y - 20, 86, clamp((night - .45) / .5, 0, 1));
      this.moonX = 196; this.moonY = moonY; this.moonA = a;
      g.globalAlpha = a;
      const rg = g.createRadialGradient(196, moonY, 6, 196, moonY, 96);
      rg.addColorStop(0, 'rgba(226,238,255,.42)');
      rg.addColorStop(.4, 'rgba(196,214,255,.12)');
      rg.addColorStop(1, 'rgba(196,214,255,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(196, moonY, 96, 0, 6.2832); g.fill();
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
      g.strokeStyle = '#3a4358'; g.lineWidth = 1.6;
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
      g.strokeStyle = foam; g.lineWidth = 1.6; g.stroke();
    }
  },

  sea(g, camX, t, night) {
    const c = this._seaCols(night);
    const grad = g.createLinearGradient(0, HORIZON_Y - 6, 0, VIEW_H);
    grad.addColorStop(0, css(c.top));
    grad.addColorStop(.35, css(c.mid));
    grad.addColorStop(1, css(c.deep));
    g.fillStyle = grad;
    g.fillRect(0, HORIZON_Y - 6, VIEW_W, VIEW_H - HORIZON_Y + 6);

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
    const ang = Math.sin(t * 0.62) * 0.0105 + Math.sin(t * 0.29) * 0.005;
    const bob = Math.sin(t * 0.9) * 3.4 + Math.sin(t * 1.7) * 1.1;
    g.save();
    g.translate(VIEW_W / 2, DECK_Y + 80);
    g.rotate(ang);
    g.translate(-VIEW_W / 2, -(DECK_Y + 80));
    g.translate(0, bob);
    return { ang, bob };
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
    g.strokeStyle = css(WOOD.rope, .8); g.lineWidth = 2.2;
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

    /* --- crates & barrels --- */
    this._crate(g, X(392), DECK_Y, 46, st && st.crateOpen);
    this._crate(g, X(452), DECK_Y, 34, false);
    this._barrel(g, X(960), DECK_Y, 1);
    this._barrel(g, X(1002), DECK_Y, .82);
    this._crate(g, X(1240), DECK_Y, 40, false);
    this._netPile(g, X(1310), DECK_Y);
    this._barrel(g, X(1640), DECK_Y, .9);

    /* --- bow fishing station --- */
    this._fishingPost(g, X(1744), DECK_Y, t, night);

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
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 1;
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
      g.strokeStyle = css(WOOD.trim, .7); g.lineWidth = 2;
      g.beginPath(); g.arc(sx, DECK_Y + 48, 9, 0, 6.2832); g.stroke();
      if (night > .4) {
        g.fillStyle = 'rgba(255,196,110,' + (0.25 * night) + ')';
        g.beginPath(); g.arc(sx, DECK_Y + 48, 7, 0, 6.2832); g.fill();
      }
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
      const rg = g.createRadialGradient(x + 51, y - h + 39, 2, x + 51, y - h + 39, 90);
      rg.addColorStop(0, 'rgba(255,190,110,.30)'); rg.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = rg; g.fillRect(x - 40, y - h - 40, 260, 220); g.restore();
    }
    // door
    g.fillStyle = css(shade(WOOD.hull, -.18));
    g.fillRect(x + 104, y - 72, 44, 72);
    g.fillStyle = css(WOOD.trim);
    g.beginPath(); g.arc(x + 112, y - 36, 3, 0, 6.2832); g.fill();
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
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 1.5;
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
    g.strokeStyle = css(WOOD.rope, .55); g.lineWidth = 1.6;
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
    g.strokeStyle = css(WOOD.rope, .8); g.lineWidth = 1.6;
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
    g.strokeStyle = css(WOOD.hullDark); g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y - 12 * s); g.lineTo(x, y - 2 * s); g.stroke();
    g.fillStyle = '#5a5f6b';
    g.fillRect(x - 9 * s, y, 18 * s, 4 * s);
    g.fillRect(x - 9 * s, y + 22 * s, 18 * s, 4 * s);
    g.fillStyle = night > .25 ? 'rgba(255,206,120,' + (.85 * flick) + ')' : 'rgba(210,220,230,.5)';
    g.fillRect(x - 7 * s, y + 3 * s, 14 * s, 19 * s);
    g.strokeStyle = '#3f434d'; g.lineWidth = 1.6;
    g.strokeRect(x - 7 * s, y + 3 * s, 14 * s, 19 * s);
    g.beginPath(); g.moveTo(x, y + 3 * s); g.lineTo(x, y + 22 * s); g.stroke();
    if (night > .2) {
      g.globalCompositeOperation = 'lighter';
      const R = 150 * s * flick;
      const rg = g.createRadialGradient(x, y + 12 * s, 4, x, y + 12 * s, R);
      rg.addColorStop(0, 'rgba(255,190,104,' + (.32 * night) + ')');
      rg.addColorStop(.45, 'rgba(255,170,90,' + (.10 * night) + ')');
      rg.addColorStop(1, 'rgba(255,160,80,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(x, y + 12 * s, R, 0, 6.2832); g.fill();
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

  _netPile(g, x, y) {
    g.save();
    g.strokeStyle = 'rgba(196,178,130,.75)'; g.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.ellipse(x + rand(-2, 2), y - 6 - i * 2.2, 34 - i * 2.4, 9 - i * .6, 0, 0, 6.2832);
      g.stroke();
    }
    g.fillStyle = 'rgba(120,104,70,.35)';
    g.beginPath(); g.ellipse(x, y - 8, 34, 12, 0, 0, 6.2832); g.fill();
    // floats
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#c96a4a' : '#d8c48a';
      g.beginPath(); g.arc(x - 24 + i * 16, y - 22 - (i % 2) * 6, 4.5, 0, 6.2832); g.fill();
    }
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
    g.strokeStyle = '#8794a0'; g.lineWidth = 2;
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

    if (st === 'walk') {
      const p = Math.sin(t * 12);
      legA = p * 5; legB = -p * 5; armA = -p * 4; armB = p * 4;
      bob = Math.abs(Math.sin(t * 12)) * 2;
    } else if (st === 'jump') {
      legA = 4; legB = -3; armA = -6; armB = -4;
    } else if (st === 'roll') {
      // handled below
    } else if (st === 'hurt') {
      armA = -7; armB = -7; legA = 3;
    } else {
      bob = Math.sin(t * 2.4) * 1.3;
      armA = Math.sin(t * 2.4) * 1.2;
    }

    g.save();
    g.translate(x, y - bob);

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

    // torso / coat
    g.fillStyle = coat;
    roundRect(g, -10, -35, 20, 20, 3); g.fill();
    g.fillStyle = coatD;
    g.fillRect(-10, -21, 20, 5);
    g.fillRect(4, -35, 6, 20);
    g.fillStyle = '#6b4a2a';
    g.fillRect(-10, -25, 20, 3);
    g.fillStyle = '#c9a44c';
    g.fillRect(-1, -25, 3, 3);

    // scarf
    g.fillStyle = '#b4494b';
    g.fillRect(-9, -39, 18, 5);
    g.fillStyle = '#8f3739';
    g.fillRect(2, -39, 5, 9 + Math.sin(t * 5) * 2);

    // head
    g.fillStyle = skin;
    roundRect(g, -8, -52, 16, 14, 3); g.fill();
    g.fillStyle = skinD;
    g.fillRect(-8, -42, 16, 2);
    // ear
    g.fillStyle = skinD; g.fillRect(-9, -47, 2, 4);
    // hair
    g.fillStyle = '#6b4326';
    g.fillRect(-8, -53, 16, 5);
    g.fillRect(-9, -50, 3, 5);
    // eye + brow
    g.fillStyle = '#2a2028';
    g.fillRect(2, -47, 3, 4);
    g.fillRect(1, -49, 5, 1.5);
    // mouth
    g.fillStyle = skinD; g.fillRect(3, -41, 4, 1.5);
    // sou'wester hat
    g.fillStyle = '#e0aa3c';
    g.fillRect(-13, -54, 26, 4);
    roundRect(g, -9, -62, 18, 9, 3); g.fill();
    g.fillStyle = '#c8963a';
    g.fillRect(-13, -51, 26, 2);
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.fillRect(-8, -61, 14, 2);

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
      g.strokeStyle = '#c9b27a'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(rodL * .3, -2); g.stroke();
      g.fillStyle = '#9aa6b4';
      g.beginPath(); g.arc(9, 4, 4.5, 0, 6.2832); g.fill();
      g.restore();
    } else if (o.hold === 'sword') {
      g.save();
      g.translate(0, 16);
      g.rotate(o.swordAngle === undefined ? -0.5 : o.swordAngle);
      this.sword(g, o.sword || SWORDS[0]);
      g.restore();
    }
    g.restore();

    g.restore();
  },

  sword(g, s) {
    // drawn from the grip, blade pointing +x
    g.fillStyle = s.hilt;
    g.fillRect(-4, -3, 12, 6);
    g.fillStyle = '#c9a44c';
    g.fillRect(7, -8, 4, 16);
    const bl = 40 * (s.reach || 1);
    g.beginPath();
    g.moveTo(11, -4.5);
    g.lineTo(11 + bl - 9, -4.5);
    g.lineTo(11 + bl, 0);
    g.lineTo(11 + bl - 9, 4.5);
    g.lineTo(11, 4.5);
    g.closePath();
    g.fillStyle = s.blade; g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fillRect(12, -3, bl - 11, 1.6);
    g.fillStyle = 'rgba(0,0,0,.2)';
    g.fillRect(12, 2, bl - 11, 1.4);
  },

  dad(g, x, y, o) {
    o = o || {};
    const f = o.face === undefined ? 1 : o.face;
    const t = o.t || 0;
    const walking = o.state === 'walk';
    const p = walking ? Math.sin(t * 9) : 0;
    const bob = walking ? Math.abs(Math.sin(t * 9)) * 2 : Math.sin(t * 1.8) * 1.2;

    g.save();
    g.translate(x, y - bob);
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
    g.translate(x, y - bob);
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

  /* ------------------------------ monsters ----------------------------- */

  monsterPath(g, m, len, h) {
    const L = len / 2;
    g.beginPath();
    g.moveTo(L, 0);                                   // snout
    g.bezierCurveTo(L * .6, -h * 1.05, L * .1, -h * 1.15, -L * .35, -h * .72);
    g.bezierCurveTo(-L * .62, -h * .5, -L * .82, -h * .3, -L, -h * .16);  // tail root
    g.lineTo(-L, h * .16);
    g.bezierCurveTo(-L * .82, h * .32, -L * .62, h * .55, -L * .35, h * .8);
    g.bezierCurveTo(L * .1, h * 1.18, L * .6, h * .95, L, 0);
    g.closePath();
  },

  monster(g, m, t) {
    const len = m.len, h = len * 0.27;
    const d = m.def;
    g.save();
    g.translate(m.x, m.y);
    g.scale(m.face, 1);
    g.rotate(m.rot || 0);

    const thrash = Math.sin(t * (m.thrashSpeed || 5)) * (m.thrashAmt || 1);

    // shadow on the deck
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.beginPath(); g.ellipse(m.x, DECK_Y + 2, len * .38, 10, 0, 0, 6.2832); g.fill();
    g.restore();

    const body = d.body, belly = d.belly, finC = d.fin;

    // tail fin
    g.save();
    g.translate(-len / 2, 0);
    g.rotate(thrash * .22);
    g.fillStyle = css(finC);
    g.beginPath();
    g.moveTo(4, 0);
    g.lineTo(-len * .30, -h * 1.25);
    g.lineTo(-len * .18, -h * .18);
    g.lineTo(-len * .30, h * 1.15);
    g.closePath(); g.fill();
    g.fillStyle = css(shade(finC, -.25));
    g.beginPath();
    g.moveTo(2, 0); g.lineTo(-len * .26, -h * .95); g.lineTo(-len * .16, -h * .1); g.closePath(); g.fill();
    g.restore();

    // dorsal fin — base buried in the back, swept backwards
    g.fillStyle = css(shade(finC, .08));
    g.beginPath();
    g.moveTo(len * .20, -h * .70);
    g.quadraticCurveTo(len * .01, -h * 1.72 - thrash * 3, -len * .15, -h * 1.14);
    g.lineTo(-len * .30, -h * .50);
    g.closePath(); g.fill();
    g.fillStyle = css(shade(finC, -.22));
    g.beginPath();
    g.moveTo(len * .06, -h * .70);
    g.quadraticCurveTo(-len * .02, -h * 1.30 - thrash * 2, -len * .13, -h * 1.02);
    g.lineTo(-len * .20, -h * .50);
    g.closePath(); g.fill();

    // body
    this.monsterPath(g, d, len, h);
    const bg = g.createLinearGradient(0, -h, 0, h);
    bg.addColorStop(0, css(shade(body, .16)));
    bg.addColorStop(.45, css(body));
    bg.addColorStop(.78, css(mix(body, belly, .55)));
    bg.addColorStop(1, css(belly));
    g.fillStyle = bg; g.fill();
    g.strokeStyle = css(shade(body, -.35)); g.lineWidth = 2.5; g.stroke();

    // scale speckle
    g.save();
    this.monsterPath(g, d, len, h); g.clip();
    g.fillStyle = 'rgba(0,0,0,.10)';
    for (let i = 0; i < 44; i++) {
      const a = (i * 97.3) % 1, b = (i * 57.7) % 1;
      g.beginPath();
      g.arc(-len / 2 + a * len, -h + b * h * 2, 2.2 + (i % 3), 0, 6.2832);
      g.fill();
    }
    // lateral line
    g.strokeStyle = css(shade(body, -.3), .6); g.lineWidth = 2;
    g.beginPath();
    g.moveTo(len * .42, -h * .06);
    g.quadraticCurveTo(0, h * .14, -len * .48, 0);
    g.stroke();
    g.restore();

    // pectoral fin
    g.save();
    g.translate(len * .16, h * .42);
    g.rotate(.5 + thrash * .16);
    g.fillStyle = css(shade(finC, -.05));
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(-h * .28, h * .95); g.lineTo(h * .55, h * .5);
    g.closePath(); g.fill();
    g.restore();

    // gills
    g.strokeStyle = css(shade(body, -.4), .75); g.lineWidth = 2.4;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(len * .22 - i * 9, -h * .52);
      g.quadraticCurveTo(len * .19 - i * 9, 0, len * .22 - i * 9, h * .42);
      g.stroke();
    }

    // jaw
    const gape = m.gape || 0;
    g.save();
    g.translate(len * .30, h * .1);
    // lower jaw swings open
    g.save();
    g.rotate(gape * .55);
    g.fillStyle = css(shade(body, -.22));
    g.beginPath();
    g.moveTo(-6, -4);
    g.quadraticCurveTo(len * .12, h * .12, len * .21, h * .04);
    g.lineTo(len * .2, h * .22);
    g.quadraticCurveTo(len * .06, h * .3, -6, h * .16);
    g.closePath(); g.fill();
    // lower teeth
    g.fillStyle = '#f6f2e2';
    for (let i = 0; i < 6; i++) {
      const tx = len * .03 + i * (len * .031);
      g.beginPath();
      g.moveTo(tx, 0); g.lineTo(tx + 5, 0); g.lineTo(tx + 2.5, -9 - (i % 2) * 4);
      g.closePath(); g.fill();
    }
    g.restore();
    // mouth interior
    if (gape > .05) {
      g.fillStyle = 'rgba(28,8,16,.9)';
      g.beginPath();
      g.moveTo(-6, -4);
      g.quadraticCurveTo(len * .1, -2, len * .2, 0);
      g.lineTo(len * .2, gape * h * .7);
      g.quadraticCurveTo(len * .06, gape * h * .8, -6, gape * h * .3);
      g.closePath(); g.fill();
    }
    // upper teeth
    g.fillStyle = '#f6f2e2';
    for (let i = 0; i < 7; i++) {
      const tx = len * .01 + i * (len * .029);
      g.beginPath();
      g.moveTo(tx, -2); g.lineTo(tx + 5, -2); g.lineTo(tx + 2.5, 8 + (i % 2) * 5);
      g.closePath(); g.fill();
    }
    g.restore();

    // eye
    const ex = len * .33, ey = -h * .42;
    g.fillStyle = '#0c0a12';
    g.beginPath(); g.arc(ex, ey, h * .19, 0, 6.2832); g.fill();
    g.fillStyle = d.eye;
    g.beginPath(); g.arc(ex, ey, h * .14, 0, 6.2832); g.fill();
    g.fillStyle = '#0a0810';
    g.beginPath(); g.ellipse(ex + h * .02, ey, h * .05, h * .11, 0, 0, 6.2832); g.fill();
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.beginPath(); g.arc(ex - h * .05, ey - h * .05, h * .035, 0, 6.2832); g.fill();
    // eye glow
    g.save();
    g.globalCompositeOperation = 'lighter';
    const eg = g.createRadialGradient(ex, ey, 1, ex, ey, h * .55);
    eg.addColorStop(0, 'rgba(255,255,255,.20)');
    eg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = eg;
    g.beginPath(); g.arc(ex, ey, h * .55, 0, 6.2832); g.fill();
    g.restore();

    // hit flash
    if (m.flash > 0) {
      g.globalAlpha = Math.min(1, m.flash);
      this.monsterPath(g, d, len, h);
      g.fillStyle = '#fff'; g.fill();
      g.globalAlpha = 1;
    }

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
    g.lineWidth = 1.6; g.strokeStyle = fill ? '#7a1f26' : 'rgba(180,140,140,.5)';
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
    const rg = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 200, VIEW_W / 2, VIEW_H / 2, 640);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(2,4,12,' + (0.35 + night * 0.3) + ')');
    g.fillStyle = rg;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
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
    g.strokeStyle = 'rgba(180,206,236,.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 90 * amount; i++) {
      const sx = ((i * 137.5 + t * 620) % (VIEW_W + 200)) - 100;
      const sy = ((i * 83.3 + t * 980) % (VIEW_H + 100)) - 50;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx - 5, sy + 16); g.stroke();
    }
    g.restore();
  }
};
