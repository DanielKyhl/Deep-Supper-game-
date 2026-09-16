'use strict';
/* ========================================================================
   status.js — what lingers after a hit.

   Creatures can bleed, from the cleaver, the barbed harpoons, the tooth
   and the tusk, or be stunned, by the chain, the bell and heavy blows.
   The boy can be poisoned by anything that stings, or blinded and slowed
   by ink. Each is a small timer kept on whatever carries it (`fx`); one
   set of rules ticks them all, and the drawing reads them straight off.
   ======================================================================== */

const STATUS = {
  bleed:  { dur: 3.0, every: .5, share: .18 },   // each tick hurts for share x the weapon's damage
  stun:   { deck: .9, boss: .3 },                // a boss shrugs off most of a stun
  poison: { dur: 3.2, dmg: 1 },                  // one heart when it runs its course; a bandage cures it
  ink:    { dur: 2.2, slow: .45 }                // under half speed, and half blind
};

const Status = {
  // its own dice, so a bleed or a stun never shifts the game's other rolls
  s: (Date.now() >>> 0) || 7,
  roll() { this.s = (Math.imul(this.s ^ (this.s >>> 15), 2246822519) + 3266489917) >>> 0; return this.s / 4294967296; },

  fx(t) { return t.fx || (t.fx = {}); },
  clear(t) { if (t) t.fx = {}; },

  /* ------------------------------ creatures ------------------------------ */

  // bleeding for a while; a fresh cut keeps the worse of the two wounds
  bleed(m, weaponDmg) {
    const fx = this.fx(m), dmg = Math.max(1, Math.round(weaponDmg * STATUS.bleed.share));
    if (fx.bleed) { fx.bleed.t = 0; fx.bleed.dmg = Math.max(fx.bleed.dmg, dmg); return fx.bleed; }
    return (fx.bleed = { t: 0, tick: 0, dur: STATUS.bleed.dur, dmg });
  },
  bleeding(m) { return !!(m.fx && m.fx.bleed); },

  // unable to act for a moment; returns how long it really lasts
  stun(m, dur) {
    const fx = this.fx(m);
    const d = m.def && m.def.boss ? dur * STATUS.stun.boss : dur;
    fx.stun = Math.max(fx.stun || 0, d);
    return d;
  },
  stunned(m) { return !!(m.fx && m.fx.stun > 0); },

  // does a weapon leave anything behind on this hit? (`heavy` blows always do)
  inflict(m, w, heavy) {
    const got = [];
    if (!w || m.dead || m.hp <= 0) return got;
    if (w.bleed && (heavy || this.roll() < w.bleed)) { this.bleed(m, w.dmg); got.push('bleed'); }
    if (w.stun && (heavy || this.roll() < w.stun)) { this.stun(m, w.stunDur || STATUS.stun.deck); got.push('stun'); }
    return got;
  },

  // advance a creature's statuses; `hurt(dmg)` is called for every bleed tick
  tick(m, dt, hurt) {
    const fx = m.fx;
    if (!fx) return;
    if (fx.stun > 0) fx.stun = Math.max(0, fx.stun - dt);
    const b = fx.bleed;
    if (b) {
      b.t += dt; b.tick += dt;
      while (b.tick >= STATUS.bleed.every && fx.bleed === b) {
        b.tick -= STATUS.bleed.every;
        hurt(b.dmg);
      }
      if (b.t >= b.dur && fx.bleed === b) fx.bleed = null;
    }
  },

  /* ------------------------------- the boy -------------------------------- */

  poison(P) {
    const fx = this.fx(P), fresh = !fx.poison;
    fx.poison = { t: 0, dur: STATUS.poison.dur };
    if (fresh && typeof Achievements !== 'undefined') Achievements.event('poisoned');
    return fresh;
  },
  poisoned(P) { return !!(P.fx && P.fx.poison); },
  // a bandage binds the wound and draws out the sting
  cure(P) {
    if (!this.poisoned(P)) return false;
    P.fx.poison = null;
    return true;
  },

  ink(P) { this.fx(P).ink = { t: 0, dur: STATUS.ink.dur }; },
  inked(P) { return !!(P.fx && P.fx.ink); },
  // how fast he can move right now, as a fraction of normal
  speed(P) { return this.inked(P) ? STATUS.ink.slow : 1; },

  // `hurt(dmg)` when the poison runs its course
  tickPlayer(P, dt, hurt) {
    const fx = P.fx;
    if (!fx) return;
    if (fx.poison) {
      fx.poison.t += dt;
      if (fx.poison.t >= fx.poison.dur) { fx.poison = null; hurt(STATUS.poison.dmg); }
    }
    if (fx.ink) {
      fx.ink.t += dt;
      if (fx.ink.t >= fx.ink.dur) fx.ink = null;
    }
  },

  /* ------------------------------- drawing -------------------------------- */

  // little pixel signs over whatever carries them: a drop of blood, stars going round
  drawIcons(g, x, y, fx, t) {
    if (!fx) return;
    const u = PIX * 2;              // each pixel of a sign is two of the game's pixels
    if (fx.bleed) {
      // a drop of blood, outlined, bobbing beside it
      const bx = snap(x - (fx.stun > 0 ? 34 : 6)), by = snap(y + Math.sin(t * 5) * 3);
      g.fillStyle = '#1a0608';
      g.fillRect(bx - u, by, u * 5, u * 4); g.fillRect(bx, by + u * 4, u * 3, u);
      g.fillRect(bx + u, by - u * 2, u, u * 2); g.fillRect(bx, by - u, u * 3, u);
      g.fillStyle = '#d23a44';
      g.fillRect(bx, by, u * 3, u * 4); g.fillRect(bx + u, by - u, u, u);
      g.fillStyle = '#ff9a9a'; g.fillRect(bx, by + u, u, u);
    }
    if (fx.stun > 0) {
      // stars going round its head
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + i * 2.094;
        const sx = snap(x + 10 + Math.cos(a) * 26), sy = snap(y + Math.sin(a) * 8);
        g.fillStyle = '#3a2a08';
        g.fillRect(sx - u, sy - PIX, u * 3, u + PIX * 2); g.fillRect(sx - PIX, sy - u, u + PIX * 2, u * 3);
        g.fillStyle = i % 2 ? '#fff2a8' : '#ffd257';
        g.fillRect(sx - u, sy, u * 3, u); g.fillRect(sx, sy - u, u, u * 3);
      }
    }
  },

  // ink on the glass of the helmet: black blots creeping in from the edges
  drawInk(g, fx) {
    if (!fx || !fx.ink) return;
    const f = fx.ink, a = clamp(Math.min(f.t * 6, (f.dur - f.t) * 1.5), 0, 1);
    stepVignette(g, 'rgb(12,6,24)', .7 * a, true);
    const blots = [[40, 60, 90], [150, 20, 60], [880, 80, 100], [930, 300, 80], [60, 420, 110], [300, 520, 70], [700, 510, 90], [520, 10, 50]];
    for (const [bx, by, r] of blots) {
      const rr = r * (.6 + .4 * a);
      g.fillStyle = 'rgba(16,6,30,' + (.94 * a).toFixed(3) + ')';
      for (let k = 0; k < 4; k++) {
        const w = snap(rr * (1 - k * .22) * 2), h = snap(rr * (.7 + k * .1) * 2);
        g.fillRect(snap(bx - w / 2 + k * 6), snap(by - h / 2 - k * 4), w, h);
      }
      // it runs down the glass
      for (let k = 0; k < 3; k++) {
        const dx = snap(bx + (k - 1) * rr * .5), len = snap(rr * (.5 + ((bx + k * 37) % 7) / 10) * f.t / f.dur * 2);
        g.fillRect(dx, snap(by + rr * .6), PIX * 2, len);
        g.fillRect(dx - PIX, snap(by + rr * .6) + len, PIX * 4, PIX * 3);
      }
      // a wet highlight on each blot
      g.fillStyle = 'rgba(120,90,170,' + (.35 * a).toFixed(3) + ')';
      g.fillRect(snap(bx - rr * .4), snap(by - rr * .45), PIX * 3, PIX);
    }
  },

  // the boy, poisoned: green bubbles rising off him. (x, y) are his feet, in draw space
  drawPoison(g, x, y, t) {
    for (let i = 0; i < 4; i++) {
      const p = (t * .9 + i * .25) % 1;
      const bx = snap(x + Math.sin(t * 3 + i * 1.7) * 10), by = snap(y - 20 - p * 60);
      g.globalAlpha = (1 - p) * .9;
      g.fillStyle = '#7fe07a';
      g.fillRect(bx, by, PIX * 2, PIX * 2);
      g.fillStyle = '#d8ffc8';
      g.fillRect(bx, by, PIX, PIX);
    }
    g.globalAlpha = 1;
  }
};
