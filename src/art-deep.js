'use strict';
/* ========================================================================
   art-deep.js — the second half of the sea: Nerys, the diving suit, and
   everything below the surface. Adds to the Art object from art.js.
   ======================================================================== */

Object.assign(Art, {

  /* Nerys, from Lanthorne. Poses:
       'stand'  on her feet
       'sit'    washed up on the deck
       'rise'   hanging off a line by her hair, arms up
       'swim'   stretched out, head leading
     Feet are at (x, y) except when swimming, when (x, y) is her middle. */
  girl(g, x, y, o) {
    o = o || {};
    const f = o.face === undefined ? 1 : o.face;
    const t = o.t || 0;
    const pose = o.pose || 'stand';
    const skin = '#b9d4cc', skinD = '#8fb1aa';
    const hair = '#17313d', hairL = '#2c5866';
    const tunic = '#35604a', tunicD = '#26473a', shell = '#e6dbbf';
    const swim = pose === 'swim', sit = pose === 'sit', rise = pose === 'rise';
    const kick = swim ? Math.round(Math.sin(t * 9) * 3) * PIX : 0;
    const drift = Math.round(Math.sin(t * 2.2) * 2);
    const low = sit ? 14 : 0;           // her body sits lower when she is down

    g.save();
    g.translate(snap(x), snap(y));
    if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
    if (o.scale) g.scale(o.scale, o.scale);
    if (!swim && !o.noShadow) {
      g.fillStyle = 'rgba(0,0,0,.26)';
      g.beginPath(); g.ellipse(0, 1, sit ? 24 : 16, 5, 0, 0, 6.2832); g.fill();
    }
    g.scale(f, 1);
    if (swim) g.rotate(Math.PI / 2 + (o.rot || 0));
    if (swim) g.translate(0, 30);
    else if (o.rot) { g.translate(0, -30); g.rotate(o.rot); g.translate(0, 30); }

    // the long hair behind her, streaming when she swims
    g.fillStyle = hair;
    g.fillRect(-12, -56 + low, 8, swim ? 44 + drift * 2 : 30 + drift);
    g.fillStyle = hairL;
    g.fillRect(-10, -50 + low, 2, swim ? 34 : 20);

    // back arm
    g.fillStyle = skinD;
    if (rise) g.fillRect(-9, -76, 5, 22);
    else if (sit) g.fillRect(-14, -30 + low, 5, 16);
    else g.fillRect(-9, -40 + low - (swim ? 6 : 0), 5, 16);

    // legs, with pale webbed feet
    if (sit) {
      g.fillStyle = skinD; g.fillRect(-2, -6, 22, 6);
      g.fillStyle = skin; g.fillRect(-4, -10, 24, 6);
      g.fillStyle = '#9fc9c2'; g.fillRect(20, -12, 4, 8); g.fillRect(18, -6, 4, 6);
    } else {
      g.fillStyle = skinD; g.fillRect(-6 + kick, -18, 6, 16);
      g.fillStyle = skin; g.fillRect(1 - kick, -18, 6, 16);
      g.fillStyle = '#9fc9c2';
      g.fillRect(-8 + kick, -2, 8, 2); g.fillRect(0 - kick, -2, 10, 2);
      if (swim) { g.fillRect(-8 + kick, 0, 6, 4); g.fillRect(0 - kick, 0, 6, 4); }
    }

    // tunic of woven kelp, a ragged hem and a belt of shells
    g.fillStyle = tunic;
    roundRect(g, -10, -44 + low, 20, 28, 3); g.fill();
    g.fillStyle = tunicD;
    g.fillRect(-10, -44 + low, 6, 28);
    g.fillRect(0, -40 + low, 2, 20);
    g.fillRect(-10, -18 + low, 4, 4); g.fillRect(-2, -18 + low, 4, 6); g.fillRect(6, -18 + low, 4, 4);
    g.fillStyle = shell;
    g.fillRect(-10, -28 + low, 20, 2);
    g.fillRect(2, -30 + low, 4, 4);

    // a glowing pendant, the only warm light she brings up with her
    stepGlow(g, 4, -36 + low, 12, 'rgb(150,240,255)', .55, { steps: 2 });
    g.fillStyle = '#c8f8ff';
    g.fillRect(2, -38 + low, 4, 4);

    // neck, with gills
    g.fillStyle = skinD;
    g.fillRect(-4, -46 + low, 8, 4);
    g.fillStyle = '#6c948e';
    g.fillRect(-4, -46 + low, 2, 2); g.fillRect(-4, -43 + low, 2, 1);

    // head
    g.fillStyle = skin;
    roundRect(g, -8, -60 + low, 16, 14, 3); g.fill();
    g.fillRect(8, -56 + low, 2, 4);                          // nose
    g.fillStyle = skinD; g.fillRect(4, -50 + low, 4, 2);     // mouth
    g.fillStyle = '#0e3a46'; g.fillRect(4, -56 + low, 2, 4); // eye
    g.fillStyle = '#9ff0ff'; g.fillRect(4, -56 + low, 2, 2);
    // a fin where an ear should be
    g.fillStyle = '#7fb3ad';
    g.beginPath(); g.moveTo(-1, -54 + low); g.lineTo(-7, -62 + low); g.lineTo(-4, -49 + low); g.closePath(); g.fill();
    // hair over the top and down the back of the head, a shell pinned in it
    g.fillStyle = hair;
    g.fillRect(-10, -62 + low, 18, 5);
    g.fillRect(-10, -58 + low, 6, 16);
    g.fillRect(4, -58 + low, 4, 2);
    g.fillStyle = hairL; g.fillRect(-4, -62 + low, 8, 2);
    g.fillStyle = shell; g.fillRect(-8, -60 + low, 4, 4);

    // front arm
    g.fillStyle = skin;
    if (rise) g.fillRect(4, -78, 5, 24);
    else if (sit) g.fillRect(6, -34 + low, 5, 14);
    else g.fillRect(6, -40 + low + (swim ? 4 : 0), 5, 16);

    g.restore();
  },

  /* ----------------------------- the diving suit ----------------------------- */

  // a round diving helmet with its window facing +x, centred on (cx, cy)
  helmet(g, cx, cy, r, suit) {
    const brass = suit ? suit.brass : '#a8844a';
    const dark = css(shade(hexRgb(brass), -.35));
    g.fillStyle = dark;
    g.beginPath(); g.arc(cx, cy, r + 2, 0, 6.2832); g.fill();
    g.fillStyle = brass;
    g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.fill();
    // collar and the valve on top
    g.fillStyle = dark;
    g.fillRect(cx - r, cy + r - 4, r * 2 - 2, 6);
    g.fillRect(cx - 4, cy - r - 4, 6, 4);
    // the window, with bars across it and a glint
    const wx = cx + r * .36;
    g.fillStyle = dark;
    g.beginPath(); g.arc(wx, cy, r * .62 + 2, 0, 6.2832); g.fill();
    g.fillStyle = '#16303c';
    g.beginPath(); g.arc(wx, cy, r * .62, 0, 6.2832); g.fill();
    g.fillStyle = dark;
    g.fillRect(wx - 1, cy - r * .62, 2, r * 1.24);
    g.fillStyle = 'rgba(190,240,255,.7)';
    g.fillRect(wx - r * .3, cy - r * .36, 4, 2);
    // shine on the dome
    g.fillStyle = 'rgba(255,255,255,.28)';
    g.fillRect(cx - r * .6, cy - r * .7, 6, 2);
  },

  // what the Old One leaves on the deck
  drops(g, x, y, t) {
    g.save();
    g.translate(snap(x), snap(y));
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.beginPath(); g.ellipse(0, 1, 62, 6, 0, 0, 6.2832); g.fill();
    // the suit, flat and empty, a sleeve flung out
    g.fillStyle = '#4a4f45';
    roundRect(g, -44, -10, 44, 10, 3); g.fill();
    g.fillRect(-58, -8, 16, 6);
    g.fillRect(-4, -6, 22, 5);
    g.fillStyle = '#34382f';
    g.fillRect(-44, -4, 44, 2);
    // the tank
    g.fillStyle = '#7d868c';
    roundRect(g, -36, -20, 26, 10, 4); g.fill();
    g.fillStyle = '#5a6268'; g.fillRect(-12, -18, 4, 6);
    // the helmet, tipped on its side
    this.helmet(g, 30, -12, 11, SUITS[0]);
    // the harpoon, still through the sleeve
    g.save();
    g.translate(-70, -5);
    g.rotate(-.05);
    this.diveWeapon(g, DIVE_WEAPONS[0], t, 0);
    g.restore();
    // dripping
    g.fillStyle = 'rgba(160,210,230,.6)';
    g.fillRect(-20 + ((t * 30) % 40), -1, 2, 2);
    g.restore();
  },

  /* Underwater weapons, drawn from the grip with the business end toward +x.
     `p` is how far through an attack the holder is (0 when idle). */
  diveWeapon(g, w, t, p) {
    if (!w) return;
    t = t || 0; p = p || 0;
    switch (w.kind) {

      case 'dharpoon': {
        const L = 66;
        g.fillStyle = w.grip; g.fillRect(-10, -2, L, 4);
        // the Margaret's colours, painted round the shaft
        g.fillStyle = '#e0aa3c'; g.fillRect(4, -3, 6, 6);
        g.fillStyle = '#b4494b'; g.fillRect(10, -3, 4, 6);
        g.fillStyle = w.metal;
        g.beginPath(); g.moveTo(L - 12, -5); g.lineTo(L + 8, 0); g.lineTo(L - 12, 5); g.closePath(); g.fill();
        g.beginPath();
        g.moveTo(L - 10, -4); g.lineTo(L - 20, -11); g.lineTo(L - 6, -2);
        g.moveTo(L - 10, 4); g.lineTo(L - 20, 11); g.lineTo(L - 6, 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(L - 10, -2, 12, 2);
        break;
      }

      case 'trident': {
        const L = 58;
        g.fillStyle = w.grip; g.fillRect(-10, -2, L, 4);
        g.fillStyle = w.metal;
        g.fillRect(L - 4, -14, 4, 28);
        for (const dy of [-12, 0, 12]) {
          g.fillRect(L - 2, dy - 2, 16, 4);
          g.beginPath(); g.moveTo(L + 14, dy - 4); g.lineTo(L + 22, dy); g.lineTo(L + 14, dy + 4); g.closePath(); g.fill();
        }
        g.fillStyle = w.accent;       // barnacles
        g.fillRect(L - 6, -10, 4, 4); g.fillRect(L + 4, 8, 4, 4); g.fillRect(20, -4, 4, 4);
        break;
      }

      case 'eel': {
        // a short handle, a rope, and a very angry eel on the end of it
        g.fillStyle = w.grip; g.fillRect(-6, -3, 12, 6);
        const pts = [];
        for (let i = 0; i <= 10; i++) {
          const f = i / 10;
          pts.push([8 + f * 64, Math.sin(f * 7 - t * 9) * (4 + f * 6) * (1 - p * .6)]);
        }
        g.strokeStyle = '#c9b27a'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(4, 0); g.lineTo(pts[2][0], pts[2][1]); g.stroke();
        g.strokeStyle = '#3f5a2e'; g.lineWidth = 7;
        g.beginPath();
        for (let i = 2; i < pts.length; i++) (i === 2 ? g.moveTo : g.lineTo).call(g, pts[i][0], pts[i][1]);
        g.stroke();
        g.strokeStyle = w.accent; g.lineWidth = 3;
        g.beginPath();
        for (let i = 3; i < pts.length; i++) (i === 3 ? g.moveTo : g.lineTo).call(g, pts[i][0], pts[i][1] - 2);
        g.stroke();
        const [hx, hy] = pts[pts.length - 1];
        g.fillStyle = '#3f5a2e'; g.fillRect(hx - 2, hy - 5, 12, 10);
        g.fillStyle = '#ffffff'; g.fillRect(hx + 4, hy - 3, 2, 2);
        // crackling while it is being used
        if (p > 0 || Math.sin(t * 13) > .92) {
          g.strokeStyle = w.metal; g.lineWidth = 3;
          g.beginPath();
          for (let k = 0; k < 3; k++) {
            const [ex, ey] = pts[4 + k * 2];
            g.moveTo(ex, ey); g.lineTo(ex + rand(-8, 8), ey - 10 - rand(0, 8)); g.lineTo(ex + rand(-8, 8), ey - 18);
          }
          g.stroke();
        }
        break;
      }

      case 'tusk': {
        // long, tapered, spiralled
        const L = 84;
        g.fillStyle = w.grip; g.fillRect(-8, -4, 16, 8);
        g.fillStyle = w.metal;
        g.beginPath(); g.moveTo(8, -6); g.lineTo(L, -1); g.lineTo(L + 4, 0); g.lineTo(L, 1); g.lineTo(8, 6); g.closePath(); g.fill();
        g.fillStyle = w.accent;
        for (let i = 0; i < 7; i++) {
          const x0 = 14 + i * 10, hw = 6 * (1 - (x0 - 8) / (L - 8));
          g.fillRect(x0, -hw, 3, hw * 2);
        }
        break;
      }

      case 'bell':
      default: {
        // a bronze bell swinging off a short iron handle
        const swing = p > 0 ? Math.sin(p * 30) * .5 : Math.sin(t * 2) * .08;
        g.fillStyle = w.grip; g.fillRect(-6, -3, 22, 6);
        g.save();
        g.translate(18, 0);
        g.rotate(swing);
        g.fillStyle = '#5a5f6b'; g.fillRect(-2, -2, 4, 8);
        g.fillStyle = w.metal;
        g.beginPath();
        g.moveTo(-8, 6); g.lineTo(8, 6); g.lineTo(14, 28); g.lineTo(-14, 28); g.closePath(); g.fill();
        g.beginPath(); g.arc(0, 8, 8, Math.PI, 0); g.fill();
        g.fillStyle = w.accent; g.fillRect(-14, 24, 28, 4);
        g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-10, 12, 4, 12);
        g.fillStyle = '#3a2f24'; g.fillRect(-3 + Math.round(swing * 12), 26, 6, 6);
        g.restore();
        break;
      }
    }
  },

  /* The boy in the suit, standing on the deck: for suiting up and jumping in.
     Same frame of reference as Art.boy: feet at (x, y). */
  diverStanding(g, x, y, o) {
    o = o || {};
    const f = o.face === undefined ? 1 : o.face;
    const suit = o.suit || SUITS[0];
    const t = o.t || 0;
    const walk = o.state === 'walk' ? Math.sin(t * 12) * 4 : 0;
    g.save();
    g.translate(snap(x), snap(y));
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath(); g.ellipse(0, 1, 18, 5, 0, 0, 6.2832); g.fill();
    g.scale(f, 1);
    if (o.rot) { g.translate(0, -30); g.rotate(o.rot); g.translate(0, 30); }
    const rubber = suit.rubber, rubberD = css(shade(hexRgb(rubber), -.3));
    // tank on the back
    g.fillStyle = '#7d868c'; roundRect(g, -18, -44, 10, 26, 4); g.fill();
    g.fillStyle = '#5a6268'; g.fillRect(-16, -48, 6, 4);
    // legs and fins
    g.fillStyle = rubberD; g.fillRect(-7 + walk * .6, -18, 7, 14);
    g.fillStyle = rubber; g.fillRect(1 - walk * .6, -18, 7, 14);
    g.fillStyle = '#2f5f6a';
    g.fillRect(-10 + walk * .6, -4, 16, 4); g.fillRect(-2 - walk * .6, -4, 18, 4);
    // body, with a brass belt
    g.fillStyle = rubber; roundRect(g, -10, -40, 20, 24, 3); g.fill();
    g.fillStyle = rubberD; g.fillRect(-10, -40, 6, 24);
    g.fillStyle = suit.brass; g.fillRect(-10, -24, 20, 3);
    // arms
    g.fillStyle = rubberD; g.fillRect(-8, -36, 6, 14);
    g.fillStyle = rubber; g.fillRect(6, -36, 6, 14);
    // helmet
    this.helmet(g, 0, -52, 12, suit);
    g.restore();
  },

  /* ------------------------------ below the boat ---------------------------- */

  // scenery that never moves, laid out once from a fixed seed (not
  // Math.random, so drawing never changes how the game itself plays out)
  _diveDecor() {
    if (this._decor) return this._decor;
    let s = 20260916;
    const r = (a, b) => { s = (s * 16807) % 2147483647; return a + (s / 2147483647) * (b - a); };
    const clear = (x, L, pad) => Math.abs(x - L.gapX) > L.gapW / 2 + pad;
    const kelp = [], sponges = [], pillars = [], towers = [];
    for (let x = 220; x < DIVE_W - 220; x += r(50, 120)) {
      if (clear(x, DIVE_LEDGES[0], 20)) kelp.push({ x, y: DIVE_LEDGES[0].y, h: r(140, 460), ph: r(0, 6.3), w: r(2, 4) > 3 ? 6 : 4 });
    }
    for (let x = 220; x < DIVE_W - 220; x += r(80, 190)) {
      if (clear(x, DIVE_LEDGES[1], 20)) sponges.push({ x, y: DIVE_LEDGES[1].y, h: r(40, 130), n: Math.floor(r(1, 4)), pink: r(0, 1) < .4 });
    }
    for (let x = 260; x < DIVE_W - 260; x += r(150, 290)) {
      if (clear(x, DIVE_LEDGES[2], 60)) pillars.push({ x, y: DIVE_LEDGES[2].y, h: r(140, 420), w: Math.round(r(17, 28)) * 2, broken: r(0, 1) < .55, glyph: r(0, 1) < .5 });
    }
    for (let x = CITY_X - 1800; x < CITY_X + 1800; x += r(80, 170)) {
      if (Math.abs(x - CITY_X) < 380) continue;             // the gate stands here
      const w = Math.round(r(30, 60)) * 2;
      const h = Math.max(100, r(180, 640) * (1 - Math.abs(x - CITY_X) / 2600));
      const lights = [];
      for (let k = 0; k < Math.floor(h / 36); k++) {
        if (r(0, 1) < .55) lights.push({ dx: Math.round(r(4, w / 2 - 6)) * 2, dy: Math.round(r(10, h / 2 - 10)) * 2, cyan: r(0, 1) < .3 });
      }
      towers.push({ x, w, h, dome: r(0, 1) < .45, spire: r(0, 1) < .3, lights });
    }
    return (this._decor = { kelp, sponges, pillars, towers });
  },

  diveScene(g, D, t) {
    const p = D.p;
    if (!p) return;
    const cx = snap(D.cam.x), cy = snap(D.cam.y);
    const x0 = cx - 80, x1 = cx + VIEW_W + 80, y0 = cy - 80, y1 = cy + VIEW_H + 80;
    const decor = this._diveDecor();
    const suit = D.suit();

    // the water, darkening with depth: one tall dithered ramp, sliced
    const TOP = -160, SPAN = DIVE_FLOOR + 260 - TOP, hpx = Math.round(SPAN / PIX);
    const at = y => (y - TOP) / SPAN;
    const strip = ditherStrip('dive-water|' + hpx, hpx, [
      [0, [16, 24, 56]], [at(-2), [30, 46, 88]], [at(0), [44, 102, 128]], [at(500), [20, 58, 84]],
      [at(1500), [9, 28, 46]], [at(3000), [4, 13, 26]], [1, [3, 8, 18]]
    ]);
    g.drawImage(strip, 0, (cy - TOP) / PIX, PW, PH, 0, 0, VIEW_W, VIEW_H);

    g.save();
    g.translate(Cam.shakeX - cx, Cam.shakeY - cy);

    // light coming down from the surface
    const shaft = clamp(1 - cy / 700, 0, 1);
    if (shaft > .01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = shaft * .1;
      g.fillStyle = 'rgb(190,226,244)';
      for (let k = Math.floor(x0 / 260) - 1; k <= Math.ceil(x1 / 260) + 1; k++) {
        const sx = k * 260 + Math.sin(t * .35 + k) * 30;
        g.beginPath(); g.moveTo(sx - 18, 0); g.lineTo(sx + 18, 0); g.lineTo(sx + 120, 720); g.lineTo(sx - 80, 720); g.closePath(); g.fill();
      }
      g.restore();
    }
    if (y0 < 60) this._surfaceFromBelow(g, x0, x1, t);

    this._diveCliffs(g, y0, y1);
    for (const R of DIVE_ROCKS) if (R.y1 > y0 && R.y0 < y1 && R.x1 > x0 && R.x0 < x1) this._diveRock(g, R, x0, x1);

    // kelp on the first shelf, swaying
    for (const k of decor.kelp) {
      if (k.x < x0 || k.x > x1 || k.y - k.h > y1 || k.y < y0) continue;
      const n = Math.ceil(k.h / 20);
      for (let i = 1; i <= n; i++) {
        const nx = snap(k.x + Math.sin(t * .8 + k.ph + i * .3) * i * 1.4);
        const ny = k.y - i * 20;
        g.fillStyle = '#1d4634';
        g.fillRect(nx - k.w / 2, ny, k.w, 22);
        if (i % 2 === 0) { g.fillStyle = '#2a5e44'; g.fillRect(i % 4 ? nx + k.w / 2 : nx - k.w / 2 - 10, ny + 6, 10, 4); }
      }
    }
    // sponges on the second
    for (const sp of decor.sponges) {
      if (sp.x < x0 - 40 || sp.x > x1 || sp.y - sp.h > y1 || sp.y < y0) continue;
      for (let j = 0; j < sp.n; j++) {
        const h = sp.h * (1 - j * .25);
        g.fillStyle = sp.pink ? '#4a2f44' : '#2f3a4a';
        g.fillRect(sp.x + j * 14, sp.y - h, 10, h);
        g.fillStyle = sp.pink ? '#6a4a62' : '#48586a';
        g.fillRect(sp.x + j * 14, sp.y - h, 10, 4);
      }
    }
    // the broken columns of the drowned halls
    for (const c of decor.pillars) {
      if (c.x + c.w < x0 || c.x - c.w > x1 || c.y - c.h > y1 || c.y < y0) continue;
      const left = c.x - c.w / 2;
      g.fillStyle = '#141b26';
      g.fillRect(left, c.y - c.h, c.w, c.h);
      g.fillStyle = '#1d2634';
      for (let fx = left + 6; fx < left + c.w - 4; fx += 10) g.fillRect(fx, c.y - c.h + 12, 2, c.h - 16);
      if (c.broken) {
        g.fillStyle = '#141b26';
        g.beginPath(); g.moveTo(left, c.y - c.h); g.lineTo(left + c.w * .4, c.y - c.h - 26); g.lineTo(left + c.w * .6, c.y - c.h - 8); g.lineTo(left + c.w, c.y - c.h - 18); g.lineTo(left + c.w, c.y - c.h); g.closePath(); g.fill();
      } else {
        g.fillRect(left - 8, c.y - c.h - 12, c.w + 16, 12);
      }
    }
    // Lanthorne, on the bottom
    if (y1 > DIVE_FLOOR - 700) this._city(g, decor, x0, x1);
    if (y1 > DIVE_FLOOR) {
      g.fillStyle = '#090d13';
      g.fillRect(x0, DIVE_FLOOR, x1 - x0, 400);
      g.fillStyle = 'rgba(90,130,150,.2)';
      for (let x = Math.floor(x0 / 16) * 16; x < x1; x += 16) g.fillRect(x, DIVE_FLOOR + Math.round(Math.sin(x * .05) * 2) * PIX, 16, 2);
    }

    // everything alive
    for (const m of D.mobs) {
      if (m.x < x0 - 400 || m.x > x1 + 400 || m.y < y0 - 300 || m.y > y1 + 300) continue;
      g.save();
      if (m.dead) g.globalAlpha = clamp(1 - m.t / 1.8, 0, 1);
      this.monster(g, { x: m.x, y: m.y, face: m.face, rot: m.rot, len: m.def.len, def: m.def, flash: m.flash, gape: m.gape, seed: m.seed, thrashAmt: m.thrash, noShadow: true }, t);
      g.restore();
      if (!m.dead && m.hp < m.maxHp) {
        const bw = 56, by = m.y - m.def.len * (m.def.girth || .27) - 26;
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(snap(m.x - bw / 2), snap(by), bw, 4);
        g.fillStyle = '#e2645c'; g.fillRect(snap(m.x - bw / 2), snap(by), snap(bw * m.hp / m.maxHp), 4);
      }
    }
    for (const b of D.globs) {
      g.fillStyle = 'rgba(40,20,60,.95)';
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, 6.2832); g.fill();
      g.fillStyle = 'rgba(160,110,200,.6)'; g.fillRect(snap(b.x - 4), snap(b.y - 4), 4, 4);
    }

    // the boy
    const a = p.atk;
    const aim = a ? Math.atan2(a.ay, a.ax) : p.aim;
    const prog = a ? clamp(a.t / a.dur, 0, 1) : 0;
    const blink = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
    this.diver(g, p.x, p.y, {
      face: p.face, suit, weapon: D.weapon(), t: p.animT, aim,
      kick: clamp(Math.hypot(p.vx, p.vy) / 240, 0, 1), tilt: clamp(p.vy / 520, -.5, .5),
      attackP: prog, thrust: a && a.style === 'thrust' ? Math.sin(prog * Math.PI) * 22 : 0,
      alpha: blink ? .45 : 1
    });
    g.restore();

    // marine snow, drifting past the glass
    g.save();
    g.fillStyle = '#cfe4f0';
    for (let i = 0; i < 120; i++) {
      const hx = ((i * 73.7) % 101) / 101, hy = ((i * 149.3) % 211) / 211;
      const W = VIEW_W + 80, H = VIEW_H + 80;
      const x = (((hx * W - cx * .15) % W) + W) % W - 40;
      const y = (((hy * H - cy * .15 - t * (6 + i % 7 * 3)) % H) + H) % H - 40;
      g.globalAlpha = .08 + (i % 5) * .03;
      g.fillRect(snap(x), snap(y), PIX, PIX);
    }
    g.restore();

    // the dark, with a pool of helmet-lamp light around him
    const depth = clamp((cy + VIEW_H / 2 - 150) / 2700, 0, 1);
    const dark = depth * .93;
    const lamp = 150 * suit.lamp * (Player.lantern ? 1.35 : 1);
    this._darkness(g, p.x - cx + Cam.shakeX, p.y - cy + Cam.shakeY, lamp, dark);

    // lights that the dark doesn't touch
    g.save();
    g.translate(Cam.shakeX - cx, Cam.shakeY - cy);
    if (y1 > DIVE_FLOOR - 700) this._cityLights(g, decor, x0, x1, t);
    for (const c of decor.pillars) {
      if (!c.glyph || c.x < x0 || c.x > x1 || c.y - c.h > y1 || c.y < y0) continue;
      g.globalAlpha = .35 + Math.sin(t * 1.3 + c.x) * .15;
      g.fillStyle = '#6fd8c8';
      g.fillRect(snap(c.x - 4), snap(c.y - c.h * .6), 8, 2); g.fillRect(snap(c.x - 2), snap(c.y - c.h * .6 + 6), 4, 6);
      g.globalAlpha = 1;
    }
    if (dark > .2) {
      g.globalAlpha = clamp((dark - .2) * 1.8, 0, 1);
      for (const m of D.mobs) {
        if (m.dead || m.x < x0 || m.x > x1 || m.y < y0 || m.y > y1) continue;
        const ex = m.x + m.face * m.def.len * .34, ey = m.y - m.def.len * (m.def.girth || .27) * .25;
        if (m.def.glow) stepGlow(g, ex, ey, 18, m.def.glow, .45, { steps: 2 });
        g.fillStyle = m.def.eye;
        g.fillRect(snap(ex - 4), snap(ey), 2, 2); g.fillRect(snap(ex + 2), snap(ey), 2, 2);
      }
      g.globalAlpha = 1;
    }
    for (const m of D.mobs) {
      if (m.state !== 'tele' || m.x < x0 || m.x > x1) continue;
      Text.draw(g, '!', m.x + m.face * m.def.len * .3, m.y - m.def.len * (m.def.girth || .27) - 10, {
        size: 40, align: 'center', color: '#ff5a5a', outline: 'rgba(0,0,0,.7)', alpha: .6 + Math.sin(t * 26) * .3
      });
    }
    for (const R of D.rings) {
      g.globalAlpha = clamp(1 - R.r / R.max, .2, 1);
      g.strokeStyle = R.from === 'player' ? '#f0cf8a' : '#c46bff';
      g.lineWidth = 4;
      g.beginPath(); g.arc(R.x, R.y, R.r, 0, 6.2832); g.stroke();
      g.globalAlpha = 1;
    }
    for (const z of D.zaps) {
      g.strokeStyle = z.t < .1 ? '#ffffff' : '#7fe0ff';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(z.x1, z.y1);
      for (let k = 1; k < 6; k++) {
        const f = k / 6;
        g.lineTo(lerp(z.x1, z.x2, f) + Math.sin(k * 12.9 + z.t * 90) * 12, lerp(z.y1, z.y2, f) + Math.cos(k * 7.3 + z.t * 80) * 12);
      }
      g.lineTo(z.x2, z.y2); g.stroke();
    }
    stepGlow(g, p.x + p.face * 26, p.y - 2, 10, 'rgb(255,236,190)', .6 * depth, { steps: 2 });
    Particles.draw(g, 0);
    Floaters.draw(g, 0);
    g.restore();
  },

  _darkness(g, sx, sy, r, a) {
    if (a < .02) return;
    g.save();
    g.fillStyle = 'rgb(1,3,8)';
    for (const [k, share] of [[1, .42], [1.45, .38], [2, .55]]) {
      g.globalAlpha = a * share;
      g.beginPath();
      g.rect(-10, -10, VIEW_W + 20, VIEW_H + 20);
      g.ellipse(snap(sx), snap(sy), r * k, r * k * .8, 0, 0, 6.2832);
      g.fill('evenodd');
    }
    g.restore();
  },

  _surfaceFromBelow(g, x0, x1, t) {
    // the underside of the waves
    g.fillStyle = 'rgba(170,215,235,.55)';
    for (let x = Math.floor(x0 / 8) * 8; x < x1; x += 8) g.fillRect(x, snap(Math.sin(x / 60 + t * 1.6) * 3), 8, PIX);
    // the Margaret's hull, and the ladder hanging off her bow
    const bx0 = DIVE_BOAT_X - 950, bx1 = DIVE_BOAT_X + 950;
    if (bx1 + 60 > x0 && bx0 - 60 < x1) {
      g.fillStyle = '#0b1016';
      g.beginPath();
      g.moveTo(bx0 - 20, -40);
      g.lineTo(bx1 + 60, -40);
      g.quadraticCurveTo(bx1 + 10, 30, bx1 - 140, 52);
      g.lineTo(bx0 + 160, 60);
      g.quadraticCurveTo(bx0 + 10, 50, bx0 - 20, -40);
      g.closePath(); g.fill();
      g.fillRect(bx0 + 220, 56, bx1 - bx0 - 460, 10);
      g.fillStyle = 'rgba(150,200,220,.22)';
      g.fillRect(bx0, 0, bx1 - bx0, 2);
      const lx = DIVE_LADDER_X, sway = Math.round(Math.sin(t * 1.2) * 2) * PIX;
      g.fillStyle = '#6b4a2a';
      g.fillRect(lx - 14, -40, 4, 150); g.fillRect(lx + 12 + sway, -40, 4, 150);
      for (let y = -28; y < 110; y += 16) g.fillRect(lx - 14, y, 30 + sway, 3);
      stepGlow(g, lx, -62, 40, 'rgb(255,200,120)', .5, { steps: 3 });
      g.fillStyle = '#ffd9a8'; g.fillRect(lx - 4, -68, 8, 10);
    }
  },

  _diveCliffs(g, y0, y1) {
    const step = 20;
    const ya = Math.floor(y0 / step) * step, yb = y1 + step;
    g.fillStyle = '#0c1219';
    g.beginPath();
    g.moveTo(-300, ya);
    for (let y = ya; y <= yb; y += step) g.lineTo(snap(diveWallL(y)), y);
    g.lineTo(-300, yb);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(DIVE_W + 300, ya);
    for (let y = ya; y <= yb; y += step) g.lineTo(snap(DIVE_W - diveWallR(y)), y);
    g.lineTo(DIVE_W + 300, yb);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(80,120,150,.25)';
    for (let y = ya; y <= yb; y += step) {
      g.fillRect(snap(diveWallL(y)) - 2, y, 2, step);
      g.fillRect(snap(DIVE_W - diveWallR(y)), y, 2, step);
    }
  },

  _diveRock(g, R, x0, x1) {
    const a = Math.max(R.x0, x0 - 20), b = Math.min(R.x1, x1 + 20);
    g.fillStyle = '#0e141c';
    g.fillRect(a, R.y0 + 4, b - a, R.y1 - R.y0 - 4);
    for (let x = Math.floor(a / 16) * 16; x < b; x += 16) {
      const bump = Math.round(Math.sin(x * .07) * 3 + Math.sin(x * .19) * 2) * PIX;
      g.fillStyle = '#0e141c';
      g.fillRect(x, R.y0 + bump, 16, 10);
      g.fillRect(x, R.y1 - 4, 16, 6 + Math.abs(bump));
      g.fillStyle = 'rgba(90,130,150,.3)';
      g.fillRect(x, R.y0 + bump, 16, 2);
    }
  },

  _city(g, decor, x0, x1) {
    const F = DIVE_FLOOR;
    for (const tw of decor.towers) {
      if (tw.x + tw.w < x0 || tw.x > x1) continue;
      g.fillStyle = '#101722';
      g.fillRect(tw.x, F - tw.h, tw.w, tw.h);
      g.fillStyle = '#18212e';
      g.fillRect(tw.x, F - tw.h, 4, tw.h);
      if (tw.dome) { g.fillStyle = '#101722'; g.beginPath(); g.arc(tw.x + tw.w / 2, F - tw.h, tw.w / 2, Math.PI, 0); g.fill(); }
      if (tw.spire) { g.fillStyle = '#101722'; g.beginPath(); g.moveTo(tw.x + 6, F - tw.h); g.lineTo(tw.x + tw.w / 2, F - tw.h - 70); g.lineTo(tw.x + tw.w - 6, F - tw.h); g.closePath(); g.fill(); }
    }
    // the great gate
    if (CITY_X + 400 > x0 && CITY_X - 400 < x1) {
      g.fillStyle = '#16202c';
      g.fillRect(CITY_X - 340, F - 560, 80, 560);
      g.fillRect(CITY_X + 260, F - 560, 80, 560);
      g.strokeStyle = '#16202c'; g.lineWidth = 60;
      g.beginPath(); g.arc(CITY_X, F - 560, 300, Math.PI, 0); g.stroke();
      g.fillStyle = '#1f2b3a';
      g.fillRect(CITY_X - 340, F - 560, 8, 560); g.fillRect(CITY_X + 260, F - 560, 8, 560);
    }
  },

  _cityLights(g, decor, x0, x1, t) {
    const F = DIVE_FLOOR;
    for (const tw of decor.towers) {
      if (tw.x + tw.w < x0 || tw.x > x1) continue;
      for (const L of tw.lights) {
        const x = tw.x + L.dx, y = F - tw.h + L.dy;
        const col = L.cyan ? '#9ff0ff' : '#ffd98a';
        g.globalAlpha = .75 + Math.sin(t * .7 + L.dx) * .2;
        g.fillStyle = col;
        g.fillRect(snap(x), snap(y), 4, 4);
      }
      g.globalAlpha = 1;
    }
    if (CITY_X + 400 > x0 && CITY_X - 400 < x1) {
      for (let i = -3; i <= 3; i++) {
        const ang = Math.PI * (.5 + i * .13);
        stepGlow(g, CITY_X - Math.cos(ang) * 300, F - 560 - Math.sin(ang) * 300, 16, 'rgb(160,240,255)', .5, { steps: 2 });
      }
    }
  },

  /* The boy swimming: stretched out, helmet leading, fins kicking.
     (x, y) is his middle. `aim` is the world angle the weapon points. */
  diver(g, x, y, o) {
    o = o || {};
    const f = o.face === undefined ? 1 : o.face;
    const suit = o.suit || SUITS[0];
    const t = o.t || 0;
    const kick = Math.sin(t * (6 + (o.kick || 0) * 8)) * (2 + (o.kick || 0) * 4);
    const rubber = suit.rubber, rubberD = css(shade(hexRgb(rubber), -.3));
    g.save();
    g.translate(snap(x), snap(y));
    if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
    g.scale(f, 1);
    g.rotate(o.tilt || 0);

    // fins and legs trailing behind
    g.fillStyle = rubberD; g.fillRect(-34, -4 + kick, 20, 6);
    g.fillStyle = rubber; g.fillRect(-34, 2 - kick, 20, 6);
    g.fillStyle = '#2f5f6a';
    g.beginPath(); g.moveTo(-34, -4 + kick); g.lineTo(-50, -10 + kick * 1.6); g.lineTo(-50, 2 + kick * 1.6); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-34, 2 - kick); g.lineTo(-50, -2 - kick * 1.6); g.lineTo(-50, 10 - kick * 1.6); g.closePath(); g.fill();
    // tank along his back
    g.fillStyle = '#7d868c'; roundRect(g, -20, -18, 26, 9, 4); g.fill();
    g.fillStyle = '#5a6268'; g.fillRect(4, -18, 4, 5);
    // body
    g.fillStyle = rubber; roundRect(g, -18, -10, 28, 16, 4); g.fill();
    g.fillStyle = rubberD; g.fillRect(-18, 2, 28, 4);
    g.fillStyle = suit.brass; g.fillRect(-6, -10, 3, 16);
    // back arm
    g.fillStyle = rubberD; g.fillRect(0, 4, 12, 5);
    // helmet
    this.helmet(g, 20, -2, 11, suit);
    // front arm and weapon, pointing wherever he aims
    const local = Math.atan2(Math.sin(o.aim || 0), Math.cos(o.aim || 0) * f);
    g.save();
    g.translate(6, 2);
    g.rotate(local - (o.tilt || 0));
    g.fillStyle = rubber; g.fillRect(0, -3, 14, 6);
    g.translate(14 + (o.thrust || 0), 0);
    this.diveWeapon(g, o.weapon, t, o.attackP || 0);
    g.restore();
    g.restore();
  }
});
