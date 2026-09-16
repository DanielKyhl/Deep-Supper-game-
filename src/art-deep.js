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
  }
});
