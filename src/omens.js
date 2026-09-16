'use strict';
/* ========================================================================
   omens.js — the sea at night, being quietly wrong.

   Every so often, on deck in the dark, something small happens that nobody
   explains: a lantern gutters out and comes back, the bell rings once by
   itself, wet footprints come aboard behind him, something knocks under the
   hull, two pale eyes open on the black water and close again. Nothing
   jumps out, nothing is loud, and nothing ever says what it was. It can be
   turned off under Options, Gameplay.
   ======================================================================== */

const OMEN = {
  first: 50,             // seconds on deck at night before the first
  gap: [60, 140],        // seconds between them after that
  chance: .6,            // the chance, when one is due, that it happens at all
  night: .7              // how dark it has to be
};

const OMENS = {
  // the lantern nearest him gutters out, and after a while it comes back
  lantern: {
    dur: 3.2,
    start(o) {
      const lights = [812, 1452, 1766];
      o.x = lights.reduce((a, b) => Math.abs(b - Player.x) < Math.abs(a - Player.x) ? b : a);
      Sfx.tone({ f: 180, f2: 60, dur: .5, type: 'sine', vol: .05 });
    },
    // how far out it is at a moment: quick to go, slow and flickering to come back
    dim(o) {
      const p = o.t / this.dur;
      if (p < .12) return p / .12;
      if (p < .7) return 1;
      return clamp(1 - (p - .7) / .3, 0, 1) * (Math.sin(o.t * 40) > 0 ? 1 : .6);
    }
  },
  // the ship's bell rings once, softly, with nobody near it
  bell: {
    dur: 2.4,
    start() { Sfx.bellToll(); }
  },
  // wet footprints come up over the rail behind him, and dry away
  footprints: {
    dur: 9,
    start(o) {
      const side = Player.face > 0 ? -1 : 1;
      o.steps = [];
      const x0 = clamp(Player.x + side * 260, WALK_L + 40, WALK_R - 40);
      for (let i = 0; i < 6; i++) o.steps.push({ x: x0 - side * i * 34, y: DECK_Y - 6 + (i % 2) * 5, at: i * .35 });
    }
  },
  // three knocks under the hull, slow
  knock: {
    dur: 2.2,
    start(o) { o.knocks = 0; },
    update(o) {
      const want = Math.min(3, Math.floor(o.t / .55) + 1);
      while (o.knocks < want) { o.knocks++; Sfx.knock(); Cam.kick(1); }
    }
  },
  // out past the rail, two pale eyes open on the water, look, and close
  eyes: {
    dur: 3.6,
    start(o) { o.x = 140 + SeaDice.next() * (VIEW_W - 280); }
  },
  // a long shadow slides under the boat
  shadow: {
    dur: 8,
    start(o) { o.dir = SeaDice.next() < .5 ? -1 : 1; Sfx.tone({ f: 42, f2: 30, dur: 3, type: 'sine', vol: .12 }); }
  },
  // singing, very faint, from nowhere in particular
  singing: {
    dur: 4.5,
    start() { Sfx.choir(); }
  },
  // his breath fogs, as if it got very cold all at once
  breath: {
    dur: 5,
    start() {}
  },
  // Dorran stops, and looks at the water
  dorran: {
    dur: 1,
    can() { return !Game.bark.text && Math.abs(STALL_X - Player.x) < 520; },
    start() { Game.dorranShouts(dorranPick(DORRAN.deck.omen)); }
  }
};

const Omens = {
  next: OMEN.first, active: null, recent: [],

  reset() { this.next = OMEN.first; this.active = null; this.recent.length = 0; },

  // quiet nights only: on deck, dark, nothing being said, no storm
  quiet() {
    return Game.state === 'play' && Game.night >= OMEN.night && !Dialogue.active && !Weather.raging() &&
      Settings.data.unease !== false && CUT.harbourX < -600;
  },

  update(dt) {
    const o = this.active;
    if (o) {
      o.t += dt;
      const def = OMENS[o.id];
      if (def.update) def.update(o, dt);
      if (o.t >= def.dur) this.active = null;
      return;
    }
    if (!this.quiet()) return;
    this.next -= dt;
    if (this.next > 0) return;
    this.next = lerp(OMEN.gap[0], OMEN.gap[1], SeaDice.next());
    if (SeaDice.chance(OMEN.chance)) this.begin();
  },

  // something happens: one that hasn't lately, and that can right now
  begin(id) {
    const ids = Object.keys(OMENS).filter(k => (id ? k === id : this.recent.indexOf(k) < 0) && (!OMENS[k].can || OMENS[k].can()));
    if (!ids.length) return null;
    const pick = ids[Math.floor(SeaDice.next() * ids.length) % ids.length];
    const o = { id: pick, t: 0 };
    this.active = o;
    OMENS[pick].start(o);
    this.recent.push(pick);
    if (this.recent.length > 4) this.recent.shift();
    Player.omens = (Player.omens || 0) + 1;
    if (typeof Achievements !== 'undefined') Achievements.event('omen');
    return o;
  },

  // how guttered-out a lantern at world x is right now, 0 to 1
  dim(x) {
    const o = this.active;
    return o && o.id === 'lantern' && o.x === x ? OMENS.lantern.dim(o) : 0;
  },
  // extra swing on the bell
  bellSwing() {
    const o = this.active;
    return o && o.id === 'bell' ? Math.sin(o.t * 5) * .35 * (1 - o.t / OMENS.bell.dur) : 0;
  },

  /* -------------------------------- drawing ------------------------------- */

  // on the far water, behind the boat
  drawSea(g, t) {
    const o = this.active;
    if (!o || o.id !== 'eyes') return;
    const p = o.t / OMENS.eyes.dur;
    const open = p < .15 ? p / .15 : p > .8 ? (1 - p) / .2 : (Math.sin(o.t * 2.3) > .97 ? .2 : 1);
    const y = snap(HORIZON_Y + 22), h = Math.max(0, Math.round(open * 2)) * PIX;
    if (!h) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    stepGlow(g, o.x, y, 16, 'rgb(200,230,210)', .12 * open, { steps: 2 });
    g.restore();
    g.fillStyle = '#d8f0e0';
    g.fillRect(snap(o.x - 14), y - h / 2, PIX * 3, h);
    g.fillRect(snap(o.x + 10), y - h / 2, PIX * 3, h);
  },

  // on the deck: footprints, and the lantern glass going dark
  drawDeck(g, camX) {
    const o = this.active;
    if (!o) return;
    if (o.id === 'footprints') {
      // wet prints on the deck boards: a dark print with the lantern light caught in it
      for (const s of o.steps) {
        if (o.t < s.at) continue;
        const a = clamp(1 - (o.t - 5) / 4, 0, 1);
        if (a <= 0) continue;
        g.globalAlpha = a;
        const x = snap(s.x - camX), y = DECK_Y - 4 - (s.y > DECK_Y - 4 ? 0 : PIX);
        g.fillStyle = 'rgba(16,26,34,.8)';
        g.fillRect(x, y, PIX * 5, PIX * 2);
        g.fillStyle = 'rgba(170,200,220,.55)';
        g.fillRect(x + PIX, y, PIX * 2, PIX);
      }
      g.globalAlpha = 1;
    }
    if (o.id === 'lantern') {
      const d = OMENS.lantern.dim(o), lamp = { 812: DECK_Y - 122, 1452: DECK_Y - 128, 1766: DECK_Y - 118 }[o.x];
      g.fillStyle = 'rgba(12,10,8,' + (.85 * d).toFixed(3) + ')';
      g.fillRect(snap(o.x - camX - 7), lamp + 4, 14, 18);
    }
  },

  // in front of everything on deck: the shadow under the hull, his breath in the cold
  drawFront(g, camX, t) {
    const o = this.active;
    if (!o) return;
    if (o.id === 'shadow') {
      const p = o.t / OMENS.shadow.dur;
      const x = o.dir > 0 ? lerp(-700, VIEW_W + 700, p) : lerp(VIEW_W + 700, -700, p);
      const a = Math.sin(p * Math.PI) * .45;
      g.fillStyle = 'rgba(2,4,10,' + a.toFixed(3) + ')';
      for (let i = 0; i < 12; i++) {
        const u = i / 11, w = 110, thick = 18 * Math.sin(Math.min(1, u * 1.3) * Math.PI) + 4;
        g.fillRect(snap(x + (u - .5) * 1100 * o.dir - w / 2), snap(512 - thick / 2), w, snap(thick));
      }
    }
    if (o.id === 'breath') {
      const sx = Player.x - camX + Player.face * 14, sy = Player.y - 62;
      for (let i = 0; i < 3; i++) {
        const k = ((o.t * .8 + i / 3) % 1);
        g.fillStyle = 'rgba(220,232,244,' + ((1 - k) * .5 * Math.min(1, o.t)).toFixed(3) + ')';
        const s = snap(4 + k * 10);
        g.fillRect(snap(sx + Player.face * k * 30 - s / 2), snap(sy - k * 16 - s / 2), s, s);
      }
    }
  }
};
