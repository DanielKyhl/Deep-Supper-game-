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
