'use strict';
/* ========================================================================
   weather.js — storms at sea.

   Now and then a storm rolls in over the Margaret: rain, a heavier swell,
   and lightning. The moment a bolt lights the sky and the water, whatever
   is swimming close under the surface out there shows as a shape, for as
   long as the flash lasts. Fish bite faster in a storm, and bigger things
   come up. The flash itself can be softened or turned off in Graphics.
   ======================================================================== */

const WEATHER = {
  every: 45,             // seconds between chances of a storm, at sea
  chance: .22,           // the chance at each of those
  rise: 16,              // seconds to build
  hold: [70, 150],       // seconds at its worst
  fall: 20,              // seconds to blow over
  bolts: [5, 13],        // seconds between strikes at full strength
  reveal: .4,            // chance a strike shows something under the water
  flashes: { full: 1, soft: .4, off: 0 }
};

// the shapes lightning can show: long things, bigger than the boat
const STORM_SHAPES = [
  { len: 900, girth: .07, fins: 3, tail: 1.2 },     // like the Old One
  { len: 700, girth: .12, fins: 2, tail: .8 },      // something broad
  { len: 1200, girth: .05, fins: 5, tail: 1.6 }     // something that just keeps going
];

const Weather = {
  storm: 0, phase: 'calm', t: 0, next: WEATHER.every, hold: 0,
  flash: 0, bolt: null, boltT: 0, thunder: [], reveal: null, rainT: 0,

  reset() {
    Object.assign(this, { storm: 0, phase: 'calm', t: 0, next: WEATHER.every, hold: 0, flash: 0, bolt: null, boltT: 0, reveal: null, rainT: 0 });
    this.thunder.length = 0;
  },

  // where there can be weather: on deck, fishing, or fighting, out at sea
  outside() {
    const s = Game.state;
    return (s === 'play' || s === 'fish' || s === 'battle' || s === 'shop') && CUT.harbourX < -600;
  },
  raging() { return this.storm > .5; },

  begin() {
    if (this.phase !== 'calm') return false;
    this.phase = 'rising'; this.t = 0;
    this.hold = lerp(WEATHER.hold[0], WEATHER.hold[1], SeaDice.next());
    this.boltT = 3;
    return true;
  },
  end() { if (this.phase === 'rising' || this.phase === 'raging') { this.phase = 'falling'; this.t = 0; } },

  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.bolt) { this.bolt.t += dt; if (this.bolt.t > .22) this.bolt = null; }
    if (this.reveal) { this.reveal.t += dt; if (this.reveal.t > .9) this.reveal = null; }
    // thunder follows the flash, further off the longer it takes
    for (let i = this.thunder.length - 1; i >= 0; i--) {
      this.thunder[i].t -= dt;
      if (this.thunder[i].t <= 0) { Sfx.thunder(this.thunder[i].near); this.thunder.splice(i, 1); }
    }
    if (!this.outside()) return;

    this.t += dt;
    switch (this.phase) {
      case 'calm':
        this.storm = Math.max(0, this.storm - dt / WEATHER.fall);
        this.next -= dt;
        if (this.next <= 0) {
          this.next = WEATHER.every;
          if (SeaDice.chance(WEATHER.chance)) this.begin();
        }
        break;
      case 'rising':
        this.storm = Math.min(1, this.t / WEATHER.rise);
        if (this.storm >= 1) { this.phase = 'raging'; this.t = 0; }
        break;
      case 'raging':
        this.storm = 1;
        if (this.t >= this.hold) { this.phase = 'falling'; this.t = 0; }
        break;
      case 'falling':
        this.storm = Math.max(0, 1 - this.t / WEATHER.fall);
        if (this.storm <= 0) { this.phase = 'calm'; this.t = 0; this.next = WEATHER.every; }
        break;
    }

    // lightning, more often the worse it gets
    if (this.storm > .35) {
      this.boltT -= dt * this.storm;
      if (this.boltT <= 0) {
        this.boltT = lerp(WEATHER.bolts[0], WEATHER.bolts[1], SeaDice.next());
        this.strike();
      }
      this.rainT -= dt;
      if (this.rainT <= 0) { this.rainT = .42; Sfx.rain(this.storm); }
    }
  },

  // a bolt of lightning: the flash, the thunder after, and maybe a shape in the water
  strike(showShape) {
    const x = 80 + SeaDice.next() * (VIEW_W - 160);
    const pts = [[x, -10]];
    let px = x;
    for (let y = 30; y < HORIZON_Y; y += 22 + SeaDice.next() * 18) { px += (SeaDice.next() - .5) * 60; pts.push([px, y]); }
    this.bolt = { pts, t: 0 };
    this.flash = 1;
    const near = SeaDice.next();
    this.thunder.push({ t: .35 + (1 - near) * 1.6, near });
    if (showShape || SeaDice.chance(WEATHER.reveal)) {
      const shape = STORM_SHAPES[Math.floor(SeaDice.next() * STORM_SHAPES.length) % STORM_SHAPES.length];
      this.reveal = { shape, x: 120 + SeaDice.next() * (VIEW_W - 240), face: SeaDice.next() < .5 ? -1 : 1, t: 0 };
      if (typeof Achievements !== 'undefined') Achievements.event('silhouette');
    }
    return this.bolt;
  },

  /* ----------------------------- what it does ---------------------------- */

  // how long a bite takes, as a fraction of a calm night's
  biteWait() { return 1 - .35 * this.storm; },
  // a storm brings bigger things up, like the Drowned Charm does
  luckyWater() { return this.raging(); },
  // how much bigger the swell is
  swell() { return 1 + this.storm * .8; },

  /* -------------------------------- drawing ------------------------------- */

  flashLevel() {
    const k = WEATHER.flashes[Settings.data.flashes];
    return this.flash * (k === undefined ? 1 : k);
  },

  // low cloud rolling over the sky
  drawSky(g, t) {
    if (this.storm <= .01) return;
    g.save();
    g.fillStyle = 'rgba(8,10,20,' + (.55 * this.storm).toFixed(3) + ')';
    g.fillRect(0, 0, VIEW_W, HORIZON_Y + 30);
    g.fillStyle = 'rgba(40,44,60,' + (.5 * this.storm).toFixed(3) + ')';
    for (let i = 0; i < 9; i++) {
      const cx = snap(((i * 211 + t * (24 + i * 5)) % (VIEW_W + 400)) - 200), cy = snap(30 + (i % 4) * 34);
      g.fillRect(cx - 120, cy, 240, 18);
      g.fillRect(cx - 80, cy - 10, 160, 12);
      g.fillRect(cx - 150, cy + 14, 180, 12);
    }
    g.restore();
  },

  // the flash on the sky and the far water, and the shape it catches under the surface
  drawFar(g, t) {
    const f = this.flashLevel();
    if (this.bolt && f > 0) {
      g.save();
      g.fillStyle = 'rgba(210,226,255,' + (.55 * f).toFixed(3) + ')';
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.restore();
    }
    if (this.bolt) {
      g.save();
      g.fillStyle = '#f4f8ff';
      const P = this.bolt.pts;
      for (let i = 1; i < P.length; i++) {
        const [x0, y0] = P[i - 1], [x1, y1] = P[i], n = Math.ceil(Math.abs(y1 - y0) / PIX);
        for (let k = 0; k <= n; k++) g.fillRect(snap(lerp(x0, x1, k / n)), snap(lerp(y0, y1, k / n)), PIX * 2, PIX);
      }
      g.restore();
    }
    const R = this.reveal;
    if (R) {
      // it shows while the flash does, and fades as the dark comes back
      const a = clamp(1 - R.t / .9, 0, 1) * (f > 0 ? 1 : .35);
      // a long body just under the surface, column by column: a blunt head, a
      // slow swell through the middle, a long taper to the tail, and fins breaking the water
      const S = R.shape, y0 = HORIZON_Y + 26, len = S.len, h = Math.max(8, len * S.girth);
      const col = 'rgba(2,3,8,' + (.92 * a).toFixed(3) + ')';
      g.save();
      g.fillStyle = col;
      const step = PIX * 2, n = Math.ceil(len / step);
      let finAt = 0;
      for (let i = 0; i <= n; i++) {
        const u = i / n;                                   // 0 at the head, 1 at the tail
        const body = u < .12 ? Math.sqrt(u / .12) : Math.pow(1 - (u - .12) / .88, .7);
        const thick = Math.max(PIX, h * body);
        const cx = R.x + (.5 - u) * len * R.face;
        const cy = y0 + Math.sin(u * 5 - t * 1.5) * 5 * u;
        g.fillRect(snap(cx), snap(cy - thick / 2), step, snap(thick));
        // fins, as ridges breaking the surface
        if (S.fins && u > .18 && u < .75 && u >= finAt) {
          finAt = u + .55 / S.fins;
          for (let k = 0; k < 7; k++) g.fillRect(snap(cx - R.face * k * PIX), snap(cy - thick / 2 - (7 - k) * PIX * 1.4), step, snap((7 - k) * PIX * 1.4));
        }
      }
      // the fluke of the tail, lifting
      const tx = R.x - .5 * len * R.face, ty = y0 + Math.sin(5 - t * 1.5) * 5;
      for (let k = 0; k < 10; k++) {
        const w = snap((10 - k) * PIX * 1.6 * S.tail);
        g.fillRect(snap(tx - R.face * k * PIX) - w / 2, snap(ty - k * PIX * 1.6), w, PIX * 2);
      }
      g.restore();
    }
  },

  drawRain(g, t) {
    if (this.storm <= .01) return;
    Art.rain(g, t, this.storm * 1.6);
  },

  // a last, fainter flash over everything, the boat included
  drawNear(g) {
    const f = this.flashLevel();
    if (f <= 0) return;
    g.fillStyle = 'rgba(210,226,255,' + (.18 * f).toFixed(3) + ')';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
  }
};
