'use strict';
/* ========================================================================
   dive.js — the second half: over the side in the suit, and down.

   The sea below the Margaret is its own world, 4800 wide and 4000 deep,
   in four bands of water separated by rock shelves with gaps in them.
   You swim it freely, fight what lives in it, and climb back up the
   ladder at the bow to sell what you killed. Air runs out, and every suit
   has a depth past which it starts to buckle.
   ======================================================================== */

const DIVE_W = 4800;
const DIVE_FLOOR = 4000;             // the seabed, and Lanthorne on it
const DIVE_BOAT_X = 2400;            // the middle of the Margaret, seen from below
const DIVE_LADDER_X = DIVE_BOAT_X + 800;
const CITY_X = 2400;
const FATHOM = 50;                   // pixels of water to a fathom

const DIVE_ZONES = [
  { name: 'The Shelf', top: 0, bottom: 950 },
  { name: 'The Drop', top: 950, bottom: 1950 },
  { name: 'The Drowned Halls', top: 1950, bottom: 3050 },
  { name: 'Lanthorne', top: 3050, bottom: DIVE_FLOOR }
];

// the rock shelf under each band, and where the way through it is
const DIVE_LEDGES = [
  { y: 950, h: 70, gapX: 1500, gapW: 720 },
  { y: 1950, h: 80, gapX: 3300, gapW: 680 },
  { y: 3050, h: 90, gapX: 1600, gapW: 660 }
];

// solid rectangles, two per shelf
const DIVE_ROCKS = DIVE_LEDGES.flatMap(L => [
  { x0: 0, x1: L.gapX - L.gapW / 2, y0: L.y, y1: L.y + L.h },
  { x0: L.gapX + L.gapW / 2, x1: DIVE_W, y0: L.y, y1: L.y + L.h }
]);

// how far the cliff on each side reaches in, at a depth
function diveWallL(y) { return 110 + Math.sin(y * .006) * 50 + Math.sin(y * .023 + 1) * 22; }
function diveWallR(y) { return 110 + Math.sin(y * .005 + 2) * 50 + Math.sin(y * .019 + 4) * 22; }

function diveZoneAt(y) {
  for (let i = 0; i < DIVE_ZONES.length; i++) if (y < DIVE_ZONES[i].bottom) return i + 1;
  return DIVE_ZONES.length;
}

// keep a circle of radius r inside the water: cliffs, seabed and shelves
function diveCollide(o, r) {
  const wl = diveWallL(o.y) + r, wr = DIVE_W - diveWallR(o.y) - r;
  if (o.x < wl) { o.x = wl; if (o.vx < 0) o.vx = 0; }
  if (o.x > wr) { o.x = wr; if (o.vx > 0) o.vx = 0; }
  if (o.y > DIVE_FLOOR - r) { o.y = DIVE_FLOOR - r; if (o.vy > 0) o.vy = 0; }
  for (const R of DIVE_ROCKS) {
    const nx = clamp(o.x, R.x0, R.x1), ny = clamp(o.y, R.y0, R.y1);
    const dx = o.x - nx, dy = o.y - ny, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      o.x = nx + dx / d * r; o.y = ny + dy / d * r;
      const along = (o.vx * dx + o.vy * dy) / d;
      if (along < 0) { o.vx -= along * dx / d; o.vy -= along * dy / d; }
    } else {
      // the centre is inside the rock: out through the nearer face
      if (o.y - R.y0 < R.y1 - o.y) { o.y = R.y0 - r; if (o.vy > 0) o.vy = 0; }
      else { o.y = R.y1 + r; if (o.vy < 0) o.vy = 0; }
    }
  }
}

const Dive = {
  phase: 'off',        // gear | leap | swim | climb | blackout | off
  t: 0,
  underwater: false,
  suited: false,       // on deck: has he got the suit on yet
  deck: { x: 0, y: DECK_Y, rot: 0, visible: true },
  p: null,             // the swimmer
  mobs: [], globs: [], rings: [], zaps: [], respawns: [],
  cam: { x: 0, y: 0 },
  haulStart: 0,
  hitstop: 0,
  deepest: 0,
  firstDive: true,
  _fading: false,

  reset() {
    this.phase = 'off';
    this.underwater = false;
    this.suited = false;
    this.p = null;
    this.mobs.length = 0; this.globs.length = 0; this.rings.length = 0;
    this.zaps.length = 0; this.respawns.length = 0;
    this._fading = false;
  },

  suit() { return SUITS[Math.max(0, Player.suit)]; },
  weapon() { return DIVE_WEAPONS[Math.max(0, Player.diveWeapon)]; },

  /* -------------------------------- on deck ------------------------------- */

  // E at the bow, once there is a suit to dive in
  start() {
    this.reset();
    this.phase = 'gear';
    this.t = 0;
    Player.x = FISH_X; Player.face = 1; Player.state = 'idle';
    Object.assign(this.deck, { x: FISH_X, y: DECK_Y, rot: 0, visible: true });
    Cam.snap(FISH_X);           // the whole run-up and leap stays in frame
    Cam.locked = true;
    this.haulStart = Player.catches.length;
    Sfx.select();
  },

  update(dt) {
    this.t += dt;
    switch (this.phase) {
      case 'gear': this._gear(dt); break;
      case 'leap': this._leap(dt); break;
      case 'swim': this._swim(dt); break;
      // climb and blackout are waiting on the fade to black
    }
  },

  // on with the suit: a scuffle, a puff of dust, a helmet
  _gear(dt) {
    if (!this.suited && this.t > .6) {
      this.suited = true;
      Sfx.whoosh(); Sfx.thud();
      Particles.burst(FISH_X, DECK_Y - 30, 22, { color: '#d8cdb4', vx: rand(-120, 120), vy: rand(-160, -30), g: 200, size: rand(2, 5), life: .7 });
    }
    if (this.t > 1.5) { this.phase = 'leap'; this.t = 0; }
  },

  // a run at the rail and over it
  _leap(dt) {
    const D = this.deck, run = .45, fly = .6;
    if (this.t < run) {
      D.x = lerp(FISH_X, 1800, this.t / run);
      D.state = 'walk';
    } else if (this.t < run + fly) {
      const p = (this.t - run) / fly;
      D.x = lerp(1800, 1885, p);
      D.y = lerp(DECK_Y, WATER_Y + 24, p) - Math.sin(p * Math.PI) * 80;
      D.rot = p * 1.6;
      D.state = 'idle';
      if (!this._launched) { this._launched = true; Sfx.whoosh(); }
    } else if (D.visible) {
      D.visible = false;
      Sfx.splash(); Cam.kick(4);
      Particles.burst(1885, WATER_Y, 30, { color: '#cfeaf4', vx: rand(-170, 170), vy: rand(-420, -120), g: 900, size: rand(2, 6), life: rand(.5, 1) });
    }
    if (this.t > run + fly + .5 && !this._fading) {
      this._fading = true;
      Game.fadeOut(() => this.enterWater());
    }
  },

  /* ------------------------------ in the water ----------------------------- */

  enterWater() {
    this._fading = false;
    this._launched = false;
    this.underwater = true;
    this.phase = 'swim';
    this.t = 0;
    Particles.clear(); Floaters.clear();
    const suit = this.suit();
    this.p = {
      x: DIVE_LADDER_X - 40, y: 70, vx: 0, vy: 40, face: 1, aim: 0,
      atk: null, cd: 0, dashT: 0, dashCd: 0, invuln: 1, healT: 0,
      air: suit.air, pressureT: 0, drownT: 0, bubbleT: 0, animT: 0
    };
    this.deepest = 0;
    this.spawnAll();
    this.cam.x = clamp(this.p.x - VIEW_W / 2, 0, DIVE_W - VIEW_W);
    this.cam.y = -120;
  },

  // a fresh sea every dive
  spawnAll() {
    this.mobs.length = 0;
    for (let zone = 1; zone <= DIVE_ZONES.length; zone++) {
      for (let i = 0; i < 7; i++) this.spawn(zone, null);
    }
  },

  // somewhere open in a zone, away from the ladder and (if given) from a point
  spawn(zone, awayFrom) {
    const Z = DIVE_ZONES[zone - 1];
    const pool = DIVE_MONSTERS.filter(m => m.zone === zone);
    if (!pool.length) return null;
    for (let tries = 0; tries < 30; tries++) {
      const x = rand(360, DIVE_W - 360), y = rand(Z.top + 140, Z.bottom - 160);
      if (zone === 1 && Math.abs(x - DIVE_LADDER_X) < 700 && y < 600) continue;
      if (DIVE_ROCKS.some(R => x > R.x0 - 80 && x < R.x1 + 80 && y > R.y0 - 80 && y < R.y1 + 80)) continue;
      if (awayFrom && Math.hypot(x - awayFrom.x, y - awayFrom.y) < 900) continue;
      const def = choice(pool);
      const m = {
        def, x, y, vx: 0, vy: 0, face: chance(.5) ? 1 : -1, rot: 0,
        hp: def.hp, maxHp: def.hp, state: 'drift', t: rand(0, 3), cool: 1,
        homeX: x, homeY: y, wx: x, wy: y, wanderT: 0,
        flash: 0, gape: .1, seed: (def.id.charCodeAt(0) * 7 + def.id.length * 13) % 97 + 1 + (tries % 5),
        atk: null, dirX: 1, dirY: 0, shots: 0, stun: 0, dead: false, zone, thrash: 1
      };
      this.mobs.push(m);
      return m;
    }
    return null;
  },

  _swim(dt) {
    // checked before the hit-pause, so a press at the ladder is never swallowed
    if (this.atLadder() && Input.tap('interact')) { this.climb(); return; }
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    const p = this.p;
    p.animT += dt;
    this._player(dt);
    if (this.phase !== 'swim') return;
    for (const m of this.mobs) {
      if (m.dead || Math.abs(m.x - p.x) < 1700 && Math.abs(m.y - p.y) < 1300) this._mob(m, dt);
    }
    for (let i = this.mobs.length - 1; i >= 0; i--) if (this.mobs[i].gone) this.mobs.splice(i, 1);
    this._projectiles(dt);
    this._respawn(dt);
    this._camera(dt);
    for (let i = this.zaps.length - 1; i >= 0; i--) { this.zaps[i].t += dt; if (this.zaps[i].t > .22) this.zaps.splice(i, 1); }
  },

  atLadder() {
    return !!this.p && Math.abs(this.p.x - DIVE_LADDER_X) < 90 && this.p.y < 80;
  },

  _camera(dt, snapTo) {
    const p = this.p;
    const tx = clamp(p.x - VIEW_W / 2, 0, DIVE_W - VIEW_W);
    const ty = clamp(p.y - VIEW_H / 2 + 20, -150, DIVE_FLOOR + 80 - VIEW_H);
    const k = snapTo ? 1 : Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  },

  /* --------------------------------- the boy ------------------------------- */

  _player(dt) {
    const P = Player, p = this.p, suit = this.suit(), w = this.weapon();
    p.invuln = Math.max(0, p.invuln - dt);
    p.cd = Math.max(0, p.cd - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.dashT = Math.max(0, p.dashT - dt);
    p.healT = Math.max(0, p.healT - dt);

    let ix = (Input.held('right') ? 1 : 0) - (Input.held('left') ? 1 : 0);
    let iy = (Input.held('down') ? 1 : 0) - (Input.held('up') || Input.held('jump') ? 1 : 0);
    const n = Math.hypot(ix, iy);
    if (n) { ix /= n; iy /= n; }
    if (ix) p.face = ix < 0 ? -1 : 1;
    if (!p.atk) p.aim = n ? Math.atan2(iy, ix) : (p.face > 0 ? 0 : Math.PI);

    const acc = 1000 * suit.speed, top = 240 * suit.speed;
    p.vx += ix * acc * dt;
    p.vy += iy * acc * dt;
    // past the suit's depth the water pushes back on the way down
    if (p.y > suit.depth && p.vy > 40) p.vy = 40;
    const drag = Math.min(1, dt * 2.8);
    p.vx -= p.vx * drag; p.vy -= p.vy * drag;
    p.vy += 10 * dt;                           // a diver sinks, slowly
    const sp = Math.hypot(p.vx, p.vy);
    if (p.dashT <= 0 && !(p.atk && p.atk.style === 'lance') && sp > top) { p.vx *= top / sp; p.vy *= top / sp; }

    // dash
    if (Input.tap('roll') && p.dashCd <= 0) {
      const dx = n ? ix : p.face, dy = n ? iy : 0;
      p.vx += dx * 520; p.vy += dy * 520;
      p.dashT = .22; p.dashCd = .75; p.invuln = Math.max(p.invuln, .3);
      Sfx.whoosh();
      for (let i = 0; i < 6; i++) this.bubble(p.x - dx * 20, p.y - dy * 20);
    }

    // attack
    if (Input.tap('attack') && !p.atk && p.cd <= 0) this.attack();
    if (p.atk) this._attack(dt, w);

    // bandage
    if (Input.tap('use') && P.bandages > 0 && P.hp < P.maxHp && p.healT <= 0) {
      P.bandages--; P.hp = Math.min(P.maxHp, P.hp + 2); p.healT = .5;
      Sfx.heal();
      if (Prefs.damageNumbers) Floaters.add(p.x, p.y - 40, '+2', { color: '#8ce0a4', size: 22 });
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y < 8) { p.y = 8; if (p.vy < 0) p.vy = 0; }
    diveCollide(p, 20);
    this.deepest = Math.max(this.deepest, p.y);

    // air: refills at the surface, runs out everywhere else
    if (p.y < 40) {
      p.air = Math.min(suit.air, p.air + dt * 40);
      p.drownT = 0;
    } else {
      p.air = Math.max(0, p.air - dt);
      if (p.air <= 0) {
        p.drownT += dt;
        if (p.drownT > 1.2) { p.drownT = 0; this.hurtPlayer(1, p.x, p.y + 1, true); }
      }
    }
    // pressure
    if (p.y > suit.depth) {
      p.pressureT += dt;
      if (p.pressureT > 1.5) { p.pressureT = 0; this.hurtPlayer(1, p.x, p.y + 1, true); Cam.kick(3); }
    } else p.pressureT = 0;

    // bubbles from the helmet
    p.bubbleT -= dt;
    if (p.bubbleT <= 0 && p.y > 30) {
      p.bubbleT = rand(.4, .9);
      this.bubble(p.x + p.face * 18, p.y - 10);
    }
  },

  bubble(x, y) {
    Particles.add(x, y, { vx: rand(-10, 10), vy: rand(-70, -40), g: -40, drag: 1, size: rand(2, 4), life: rand(.8, 1.6), color: 'rgba(200,236,250,.7)' });
  },

  /* -------------------------------- attacking ------------------------------ */

  attack() {
    const p = this.p, w = this.weapon();
    const dur = { thrust: .3, zap: .4, lance: .38, ring: .5 }[w.style] || .3;
    p.atk = { style: w.style, t: 0, dur, ax: Math.cos(p.aim), ay: Math.sin(p.aim), hit: new Set(), fired: false };
    if (w.style === 'thrust') { p.vx += p.atk.ax * 160; p.vy += p.atk.ay * 160; Sfx.swing(); }
    if (w.style === 'lance') { Sfx.whoosh(); p.invuln = Math.max(p.invuln, .34); }
    if (w.style === 'zap') Sfx.tone({ f: 1400, f2: 300, dur: .2, type: 'sawtooth', vol: .12 });
    if (w.style === 'ring') Sfx.tone({ f: 220, f2: 180, dur: 1.2, type: 'triangle', vol: .3 });
  },

  _attack(dt, w) {
    const p = this.p, a = p.atk;
    a.t += dt;
    if (a.style === 'thrust' && a.t >= .06 && a.t <= .2) {
      // along the spear, from the hand to the tip
      for (const m of this.mobs) {
        if (m.dead || a.hit.has(m)) continue;
        for (let k = 0; k <= 6; k++) {
          const f = k / 6, x = p.x + a.ax * (18 + f * w.reach), y = p.y + a.ay * (18 + f * w.reach);
          if (this._inMob(m, x, y, w.width / 2)) { a.hit.add(m); this.hitMob(m, w, a.ax, a.ay); break; }
        }
      }
    }
    if (a.style === 'zap' && !a.fired && a.t >= .1) {
      a.fired = true;
      const near = this.mobs.filter(m => !m.dead && Math.hypot(m.x - p.x, m.y - p.y) < w.reach + m.def.len * .35)
        .sort((m1, m2) => Math.hypot(m1.x - p.x, m1.y - p.y) - Math.hypot(m2.x - p.x, m2.y - p.y))
        .slice(0, w.chain);
      let fromX = p.x + a.ax * 60, fromY = p.y + a.ay * 60;
      for (const m of near) {
        this.zaps.push({ x1: fromX, y1: fromY, x2: m.x, y2: m.y, t: 0 });
        fromX = m.x; fromY = m.y;
        const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy) || 1;
        this.hitMob(m, w, dx / d, dy / d);
        if (!m.dead) { m.state = 'stun'; m.t = 0; m.stun = .6; }
      }
      if (!near.length) this.zaps.push({ x1: p.x, y1: p.y, x2: p.x + a.ax * w.reach * .6, y2: p.y + a.ay * w.reach * .6, t: 0 });
    }
    if (a.style === 'lance' && a.t < .26) {
      p.vx = a.ax * w.dash; p.vy = a.ay * w.dash;
      const tipX = p.x + a.ax * (24 + w.reach), tipY = p.y + a.ay * (24 + w.reach);
      for (const m of this.mobs) {
        if (m.dead || a.hit.has(m)) continue;
        if (this._inMob(m, tipX, tipY, 18) || this._inMob(m, p.x, p.y, 22)) { a.hit.add(m); this.hitMob(m, w, a.ax, a.ay); }
      }
      if (chance(dt * 30)) this.bubble(p.x - a.ax * 30, p.y - a.ay * 30);
    }
    if (a.style === 'ring' && !a.fired && a.t >= .08) {
      a.fired = true;
      this.rings.push({ x: p.x, y: p.y, r: 24, max: w.reach, speed: w.reach / .4, width: 30, from: 'player', hit: new Set(), t: 0 });
      Cam.kick(4);
    }
    if (a.t >= a.dur) { p.atk = null; p.cd = w.cd; }
  },

  // is a circle at (x, y) of radius r touching this creature's body?
  _inMob(m, x, y, r) {
    const rx = m.def.len * .42 + r, ry = Math.max(14, m.def.len * (m.def.girth || .27) * 1.05) + r;
    const dx = (x - m.x) / rx, dy = (y - m.y) / ry;
    return dx * dx + dy * dy <= 1;
  },

  hitMob(m, w, kx, ky) {
    const crit = chance(.12);
    const dmg = Math.round(w.dmg * rand(.9, 1.1) * (crit ? 1.7 : 1));
    m.hp -= dmg;
    m.flash = 1;
    m.vx += kx * w.knock; m.vy += ky * w.knock;
    this.hitstop = crit ? .07 : .04;
    Cam.kick(crit ? 5 : 2.5);
    Sfx.hit(); if (crit) Sfx.crit();
    if (Prefs.damageNumbers) {
      Floaters.add(m.x, m.y - 30, String(dmg), { color: crit ? '#ffd257' : '#fff', size: crit ? 30 : 22, life: .8 });
    }
    Particles.burst(m.x - kx * m.def.len * .2, m.y - ky * 10, crit ? 14 : 8, {
      color: chance(.5) ? '#c4e6f2' : '#8e2c3a', vx: rand(-160, 160), vy: rand(-160, 160), g: 0, drag: 3, size: rand(2, 5), life: rand(.3, .7)
    });
    if (m.hp <= 0) this.killMob(m);
    else if (m.state === 'drift') { m.state = 'hunt'; m.t = 0; m.cool = rand(.4, .9); }
  },

  killMob(m) {
    m.dead = true; m.state = 'dead'; m.t = 0; m.flash = 1;
    const trophy = makeTrophy(m.def);
    if (Player.luck) trophy.value = Math.round(trophy.value * 1.25);
    Player.catches.push(trophy);
    Player.kills[m.def.id] = (Player.kills[m.def.id] || 0) + 1;
    Player.totalKills++;
    Sfx.roar(); Cam.kick(7);
    Floaters.add(m.x, m.y - 60, m.def.name, { color: '#9ff0ff', size: 20, life: 1.6, vy: -30 });
    Particles.burst(m.x, m.y, 40, { color: chance(.5) ? '#ffe9a8' : '#c4e6f2', vx: rand(-260, 260), vy: rand(-260, 260), g: 0, drag: 2.5, size: rand(2, 7), life: rand(.6, 1.2) });
    if (!m.def.spawnOnly) this.respawns.push({ zone: m.zone, t: 45 });
  },

  _respawn(dt) {
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      r.t -= dt;
      if (r.t <= 0 && this.spawn(r.zone, this.p)) this.respawns.splice(i, 1);
    }
  },

  /* -------------------------------- getting hurt ---------------------------- */

  hurtPlayer(dmg, fromX, fromY, unblockable) {
    const P = Player, p = this.p;
    if (this.phase !== 'swim' || !p) return;
    if (p.invuln > 0 && !unblockable) return;
    P.hp -= dmg;
    if (!unblockable) {
      const dx = p.x - fromX, dy = p.y - fromY, d = Math.hypot(dx, dy) || 1;
      p.vx += dx / d * 340; p.vy += dy / d * 340;
      p.invuln = 1.0;
    }
    Sfx.hurt(); Cam.kick(6);
    Game.hurtFlash = 1;
    if (Prefs.damageNumbers) Floaters.add(p.x, p.y - 40, '-' + dmg, { color: '#ff7a7a', size: 24 });
    Particles.burst(p.x, p.y, 10, { color: '#e2464c', vx: rand(-140, 140), vy: rand(-140, 140), g: 0, drag: 3, size: rand(2, 4), life: .5 });
    if (P.hp <= 0) { P.hp = 0; this.blackout(); }
  },

  /* ------------------------------ the creatures ----------------------------- */

  _mob(m, dt) {
    const def = m.def, p = this.p;
    m.t += dt;
    m.flash = Math.max(0, m.flash - dt * 4);
    const dx = p.x - m.x, dy = p.y - m.y, dist = Math.hypot(dx, dy) || 1;
    const spd = def.speed;
    const toward = (s, k) => { m.vx += dx / dist * s * dt * k; m.vy += dy / dist * s * dt * k; };

    switch (m.state) {
      case 'drift': {
        m.wanderT -= dt;
        if (m.wanderT <= 0) { m.wanderT = rand(2, 4); m.wx = m.homeX + rand(-240, 240); m.wy = m.homeY + rand(-120, 120); }
        const wx = m.wx - m.x, wy = m.wy - m.y, wd = Math.hypot(wx, wy) || 1;
        if (wd > 20) { m.vx += wx / wd * spd * .9 * dt; m.vy += wy / wd * spd * .9 * dt; }
        m.gape = approach(m.gape, .1, dt);
        if (dist < def.aggro) { m.state = 'hunt'; m.t = 0; m.cool = rand(.5, 1.1); }
        break;
      }
      case 'hunt': {
        const keep = def.len * .45 + 70;
        if (dist > keep) toward(spd, 2.4); else toward(-spd, 1.2);
        m.cool -= dt;
        if (m.cool <= 0 && dist < def.aggro * 1.2) {
          m.atk = choice(def.atk); m.state = 'tele'; m.t = 0;
        }
        if (dist > def.aggro * 2.4) { m.state = 'drift'; m.t = 0; m.wanderT = 0; }
        break;
      }
      case 'tele': {
        const dur = { bite: .45, charge: .6, ink: .5, pulse: .7 }[m.atk] || .5;
        m.vx *= 1 - Math.min(1, dt * 5); m.vy *= 1 - Math.min(1, dt * 5);
        m.thrash = 1 + m.t / dur * 2;
        m.gape = m.t / dur * (m.atk === 'ink' ? .95 : .6);
        if (m.t >= dur) {
          m.dirX = dx / dist; m.dirY = dy / dist;
          m.state = m.atk; m.t = 0; m.shots = 0;
          if (m.atk === 'charge' || m.atk === 'bite') Sfx.roar();
          if (m.atk === 'pulse') {
            this.rings.push({ x: m.x, y: m.y, r: def.len * .3, max: 210 + def.len * .35, speed: 380, width: 22, from: 'mob', dmg: def.dmg, hit: new Set(), t: 0 });
            Sfx.tone({ f: 120, f2: 60, dur: .5, type: 'sine', vol: .25 });
          }
        }
        break;
      }
      case 'bite': {
        const s = spd * 3.2;
        m.vx = m.dirX * s; m.vy = m.dirY * s;
        m.gape = .9;
        const hx = m.x + m.dirX * def.len * .4, hy = m.y + m.dirY * def.len * .4;
        if (Math.hypot(p.x - hx, p.y - hy) < Math.max(22, def.len * .12) + 16) this.hurtPlayer(def.dmg, m.x, m.y);
        if (m.t > .4) this._recover(m, .7);
        break;
      }
      case 'charge': {
        const s = spd * 4;
        m.vx = m.dirX * s; m.vy = m.dirY * s;
        m.thrash = 3;
        if (this._inMob(m, p.x, p.y, 14)) this.hurtPlayer(def.dmg, m.x, m.y);
        if (m.t > .9) this._recover(m, .9);
        break;
      }
      case 'ink': {
        const want = Math.min(3, Math.floor(m.t / .14) + 1);
        while (m.shots < want) {
          m.shots++;
          const hx = m.x + (dx / dist) * def.len * .38, hy = m.y + (dy / dist) * def.len * .2;
          const ang = Math.atan2(dy, dx) + (m.shots - 2) * .22;
          this.globs.push({ x: hx, y: hy, vx: Math.cos(ang) * 320, vy: Math.sin(ang) * 320, r: 11, t: 0, dmg: 1 });
          Sfx.noise({ f: 700, f2: 200, dur: .16, vol: .12 });
        }
        if (m.t > .5) this._recover(m, .8);
        break;
      }
      case 'pulse':
        if (m.t > .4) this._recover(m, .8);
        break;
      case 'recover':
        m.thrash = approach(m.thrash, 1, dt * 3);
        m.gape = approach(m.gape, .1, dt * 2);
        if (m.t > m.recDur) { m.state = 'hunt'; m.t = 0; m.cool = rand(1.1, 2.1) - m.zone * .12; }
        break;
      case 'stun':
        m.vx *= 1 - Math.min(1, dt * 4); m.vy *= 1 - Math.min(1, dt * 4);
        if (m.t > m.stun) { m.state = 'hunt'; m.t = 0; m.cool = rand(.6, 1.2); }
        break;
      case 'dead':
        m.vx *= 1 - Math.min(1, dt * 2); m.vy = approach(m.vy, 40, dt * 80);
        m.rot = approach(m.rot, .9 * m.face, dt * .6);
        if (m.t > 1.8) m.gone = true;
        break;
    }

    // swim
    const drag = m.state === 'bite' || m.state === 'charge' ? 0 : Math.min(1, dt * 2.2);
    m.vx -= m.vx * drag; m.vy -= m.vy * drag;
    m.x += m.vx * dt; m.y += m.vy * dt;
    // creatures keep to their own band of water
    const Z = DIVE_ZONES[m.zone - 1];
    m.y = clamp(m.y, Math.max(40, Z.top + 30), Z.bottom - 30);
    diveCollide(m, Math.max(16, def.len * (def.girth || .27) * .8));

    // face and lean the way it is going
    if (m.state === 'hunt' || m.state === 'tele' || m.state === 'ink' || m.state === 'stun') m.face = dx < 0 ? -1 : 1;
    else if (!m.dead && Math.abs(m.vx) > 12) m.face = m.vx < 0 ? -1 : 1;
    if (!m.dead) m.rot = clamp(Math.atan2(m.vy, Math.abs(m.vx) + 30) * .7, -.6, .6);
  },

  _recover(m, dur) { m.state = 'recover'; m.t = 0; m.recDur = dur; },

  _projectiles(dt) {
    const p = this.p;
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const b = this.globs[i];
      b.t += dt;
      b.vx *= 1 - Math.min(1, dt * .6); b.vy *= 1 - Math.min(1, dt * .6);
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (chance(dt * 20)) Particles.add(b.x, b.y, { vx: 0, vy: 0, g: 0, size: 3, life: .5, color: 'rgba(40,20,60,.8)' });
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 16) { this.hurtPlayer(b.dmg, b.x, b.y); this.globs.splice(i, 1); continue; }
      if (b.t > 2.4) this.globs.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const R = this.rings[i];
      R.t += dt;
      const prev = R.r;
      R.r += R.speed * dt;
      if (R.from === 'player') {
        for (const m of this.mobs) {
          if (m.dead || R.hit.has(m)) continue;
          const d = Math.hypot(m.x - R.x, m.y - R.y) - Math.min(m.def.len * .3, 90);
          if (d <= R.r + R.width / 2 && d >= prev - R.width) {
            R.hit.add(m);
            const dd = Math.hypot(m.x - R.x, m.y - R.y) || 1;
            this.hitMob(m, this.weapon(), (m.x - R.x) / dd, (m.y - R.y) / dd);
          }
        }
      } else if (!R.hit.has('player')) {
        const d = Math.hypot(p.x - R.x, p.y - R.y);
        if (Math.abs(d - R.r) < R.width / 2 + 14) { R.hit.add('player'); this.hurtPlayer(R.dmg, R.x, R.y); }
      }
      if (R.r >= R.max) this.rings.splice(i, 1);
    }
  },

  /* ------------------------------- leaving ------------------------------- */

  climb() {
    if (this.phase !== 'swim') return;
    this.phase = 'climb';
    Sfx.splash();
    const n = Player.catches.length - this.haulStart;
    Game.fadeOut(() => this.backOnDeck(n ? 'Back aboard with ' + n + ' in the net.' : 'Back aboard. Dry, nearly.'));
  },

  blackout() {
    if (this.phase !== 'swim') return;
    this.phase = 'blackout';
    Sfx.roar();
    Game.fadeOut(() => {
      const lost = Player.catches.length - this.haulStart;
      Player.catches.length = this.haulStart;
      Player.hp = Player.maxHp;
      this.backOnDeck(lost ? 'You wake on the deck, coughing. The sea kept what you caught.' : 'You wake on the deck, coughing.');
    });
  },

  backOnDeck(message) {
    this.reset();
    this.firstDive = false;
    Particles.clear(); Floaters.clear();
    Game.state = 'play';
    Player.x = FISH_X; Player.face = -1; Player.state = 'idle'; Player.y = DECK_Y; Player.vy = 0;
    Cam.locked = false;
    Cam.snap(Player.x);
    Game.toast(message);
    Game.autosave();
  },

  /* -------------------------------- drawing ------------------------------- */

  // on deck, the boy before (and just after) the suit goes on
  drawDeckPlayer(g) {
    const D = this.deck;
    if (!D.visible) return;
    if (!this.suited) {
      Art.boy(g, D.x - Cam.x, D.y, { face: 1, t: Game.t, state: 'idle', frontArm: Math.sin(this.t * 20) * .6, backArm: -Math.sin(this.t * 20) * .6 });
      return;
    }
    Art.diverStanding(g, D.x - Cam.x, D.y, { face: 1, suit: this.suit(), t: this.t, state: D.state, rot: D.rot });
  },

  draw(g) {
    Art.diveScene(g, this, Game.t);
  },

  drawUI(g) {
    if (!this.underwater) return;
    this.drawHUD(g);
    const p = this.p, suit = this.suit();
    if (this.phase !== 'swim') return;
    let tip = null, col = '#dfe4f0';
    if (p.y > suit.depth) { tip = 'TOO DEEP: the suit is buckling'; col = '#ff8a8a'; }
    else if (p.air <= 0) { tip = 'OUT OF AIR: get to the surface'; col = '#ff8a8a'; }
    else if (p.air < suit.air * .25) { tip = 'Low on air'; col = Math.sin(Game.t * 8) > 0 ? '#ffb070' : '#ff8a8a'; }
    else if (this.atLadder()) tip = '[' + keyLabel(ACTIONS.interact[0]) + '] Climb aboard';
    else if (this.firstDive && this.t < 9) {
      tip = keyLabel(ACTIONS.jump[1] || ACTIONS.up[0]) + keyLabel(ACTIONS.left[0]) + keyLabel(ACTIONS.down[0]) + keyLabel(ACTIONS.right[0]) +
        ' swim   [' + keyLabel(ACTIONS.attack[0]) + '] attack   [' + keyLabel(ACTIONS.roll[0]) + '] dash   ladder at the bow';
    }
    if (tip) Fishing._tip(g, tip, col);
  },

  drawHUD(g) {
    const P = Player, p = this.p, suit = this.suit();
    if (!p) return;
    Game.drawHearts(g, 34, 34);

    // air, as a row of pips
    const frac = p.air / suit.air;
    Text.draw(g, 'AIR', 22, 66, { size: 14, color: frac < .25 ? '#ff9a7a' : '#9fd4e4', outline: 'rgba(0,0,0,.7)' });
    for (let i = 0; i < 10; i++) {
      const on = (i + .5) / 10 <= frac;
      g.fillStyle = on ? (frac < .25 ? '#ff8a6a' : '#8fd8ee') : 'rgba(120,140,170,.3)';
      g.fillRect(60 + i * 14, 56, 10, 10);
    }
    if (P.catches.length) {
      Art.fishIcon(g, 40, 92, .9, P.catches[P.catches.length - 1].body, P.catches[P.catches.length - 1].belly);
      Text.draw(g, '×' + P.catches.length, 60, 98, { size: 16, color: '#cfd8ea', outline: 'rgba(0,0,0,.6)' });
    }
    if (P.bandages) Text.draw(g, '❤ ×' + P.bandages + '  [' + keyLabel(ACTIONS.use[0]) + ']', 34, 122, { size: 13, color: '#9fd8b0', outline: 'rgba(0,0,0,.6)' });

    // depth readout, top right
    const fm = Math.max(0, Math.round(p.y / FATHOM));
    const limit = Math.round(suit.depth / FATHOM);
    Text.draw(g, fm + ' fm', VIEW_W - 52, 40, { size: 30, align: 'right', color: p.y > suit.depth ? '#ff8a8a' : '#e8f4ff', outline: 'rgba(0,0,0,.7)' });
    Text.draw(g, DIVE_ZONES[diveZoneAt(p.y) - 1].name, VIEW_W - 52, 62, { size: 14, align: 'right', color: '#9fb8d8', outline: 'rgba(0,0,0,.7)' });
    Text.draw(g, 'suit holds to ' + limit + ' fm', VIEW_W - 52, 80, { size: 13, align: 'right', color: '#8d97b4', outline: 'rgba(0,0,0,.7)' });
    Text.draw(g, this.weapon().name, VIEW_W - 52, 98, { size: 13, align: 'right', color: '#d8cdb4', outline: 'rgba(0,0,0,.7)' });

    // the depth gauge down the right edge
    const gx = VIEW_W - 22, gy0 = 30, gy1 = 470, span = gy1 - gy0;
    g.fillStyle = 'rgba(8,12,24,.6)'; g.fillRect(gx - 4, gy0, 8, span);
    for (const Z of DIVE_ZONES) { g.fillStyle = 'rgba(160,190,220,.5)'; g.fillRect(gx - 6, snap(gy0 + Z.bottom / DIVE_FLOOR * span), 12, 2); }
    g.fillStyle = '#ff6a6a'; g.fillRect(gx - 8, snap(gy0 + Math.min(1, suit.depth / DIVE_FLOOR) * span), 16, 2);
    g.fillStyle = '#c9a44c'; g.fillRect(gx - 6, gy0 - 4, 12, 4);
    g.fillStyle = '#e8f4ff'; g.fillRect(gx - 6, snap(gy0 + clamp(p.y / DIVE_FLOOR, 0, 1) * span) - 2, 12, 4);

    // an arrow back to the ladder when it is off screen
    const lx = DIVE_LADDER_X - this.cam.x, ly = 0 - this.cam.y;
    if (lx < 0 || lx > VIEW_W || ly < 0 || ly > VIEW_H) {
      const ang = Math.atan2(ly - VIEW_H / 2, lx - VIEW_W / 2);
      const ex = clamp(VIEW_W / 2 + Math.cos(ang) * 400, 60, VIEW_W - 90);
      const ey = clamp(VIEW_H / 2 + Math.sin(ang) * 230, 140, VIEW_H - 60);
      g.save();
      g.translate(snap(ex), snap(ey)); g.rotate(ang);
      g.fillStyle = 'rgba(232,199,106,.85)';
      g.beginPath(); g.moveTo(14, 0); g.lineTo(-6, -9); g.lineTo(-6, 9); g.closePath(); g.fill();
      g.restore();
      Text.draw(g, 'BOAT', ex, ey + 24, { size: 12, align: 'center', color: 'rgba(232,199,106,.85)', outline: 'rgba(0,0,0,.7)' });
    }
  }
};
