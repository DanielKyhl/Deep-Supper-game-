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

// where the Mother is fought: the open water in front of Lanthorne's gate
const MOTHER_ARENA = { w: 1520, top: 3150 };

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
  mobs: [], globs: [], rings: [], zaps: [], respawns: [], shots: [],
  mouseT: -99, mouseAim: false,
  cam: { x: 0, y: 0 },
  haulStart: 0,
  hitstop: 0,
  deepest: 0,
  firstDive: true,
  _fading: false,
  boss: null,          // the Mother, while she is here
  girl: { x: 0, y: 0, face: 1, rot: 0, visible: false },
  camFocus: null,
  banner: null,
  sawMotherIntro: false,

  reset() {
    this.phase = 'off';
    this.underwater = false;
    this.suited = false;
    this.p = null;
    this.mobs.length = 0; this.globs.length = 0; this.rings.length = 0;
    this.zaps.length = 0; this.respawns.length = 0; this.shots.length = 0;
    this._fading = false;
    this.boss = null;
    this.camFocus = null;
    this.banner = null;
    this.girl.visible = false;
    Status.clear(Player);
    Sfx.setUnderwater(false);
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
      case 'scene': this._scene(dt); break;
      // climb and blackout are waiting on the fade to black
    }
  },

  // on with the suit: a scuffle, a puff of dust, a helmet
  _gear(dt) {
    if (!this.suited && this.t > .6) {
      this.suited = true;
      Sfx.suitUp();
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
      cd: 0, fireT: 0, harpoonOut: false, dashT: 0, dashCd: 0, invuln: 1, healT: 0,
      air: suit.air, pressureT: 0, drownT: 0, bubbleT: 0, animT: 0
    };
    this.deepest = 0;
    this.amb = { breath: 1.5, beep: 0, creak: .3, sonar: rand(6, 14), moan: rand(18, 30) };
    Sfx.setUnderwater(true);
    Sfx.plunge();
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
    const pool = DIVE_MONSTERS.filter(m => m.zone === zone && !m.boss && !m.spawnOnly);
    if (!pool.length) return null;
    for (let tries = 0; tries < 30; tries++) {
      const x = rand(360, DIVE_W - 360), y = rand(Z.top + 140, Z.bottom - 160);
      if (zone === 1 && Math.abs(x - DIVE_LADDER_X) < 700 && y < 600) continue;
      if (DIVE_ROCKS.some(R => x > R.x0 - 80 && x < R.x1 + 80 && y > R.y0 - 80 && y < R.y1 + 80)) continue;
      if (awayFrom && Math.hypot(x - awayFrom.x, y - awayFrom.y) < 900) continue;
      // the Mother's arena starts empty
      if (zone === 4 && !Player.beatMother && Math.abs(x - CITY_X) < MOTHER_ARENA.w / 2 + 200) continue;
      return this.makeMob(choice(pool), x, y, zone);
    }
    return null;
  },

  makeMob(def, x, y, zone) {
    const m = {
      def, x, y, vx: 0, vy: 0, face: chance(.5) ? 1 : -1, rot: 0,
      hp: def.hp, maxHp: def.hp, state: 'drift', t: rand(0, 3), cool: 1,
      homeX: x, homeY: y, wx: x, wy: y, wanderT: 0,
      flash: 0, gape: .1, seed: (def.id.charCodeAt(0) * 7 + def.id.length * 13) % 97 + 1 + Math.floor(rand(0, 5)),
      atk: null, dirX: 1, dirY: 0, shots: 0, stun: 0, dead: false, zone, thrash: 1
    };
    this.mobs.push(m);
    return m;
  },

  // everything a weapon can hit: the creatures, and her while she lives
  targets() {
    return this.boss && !this.boss.dead ? this.mobs.concat([this.boss]) : this.mobs;
  },

  _swim(dt) {
    // checked before the hit-pause, so a press at the ladder is never swallowed
    if (this.atLadder() && Input.tap('interact')) { this.climb(); return; }
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    const p = this.p;
    p.animT += dt;
    if (Skill.active) {
      Skill.update(dt);
      this._skillPose(dt);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
      this._camera(dt);
      return;
    }
    this._player(dt);
    if (this.phase !== 'swim') return;
    for (const m of this.mobs) {
      if (m.dead || Math.abs(m.x - p.x) < 1700 && Math.abs(m.y - p.y) < 1300) this._mob(m, dt);
    }
    for (let i = this.mobs.length - 1; i >= 0; i--) if (this.mobs[i].gone) this.mobs.splice(i, 1);
    if (this.boss) this._boss(dt);
    else this._checkMother();
    this._shots(dt);
    this._projectiles(dt);
    this._respawn(dt);
    Lore.pickups(this);
    this._ambience(dt);
    this._camera(dt);
    for (let i = this.zaps.length - 1; i >= 0; i--) { this.zaps[i].t += dt; if (this.zaps[i].t > .22) this.zaps.splice(i, 1); }
  },

  atLadder() {
    return !!this.p && Math.abs(this.p.x - DIVE_LADDER_X) < 90 && this.p.y < 80;
  },

  _camera(dt, snapTo) {
    const f = this.camFocus || this.p;
    const tx = clamp(f.x - VIEW_W / 2, 0, DIVE_W - VIEW_W);
    const ty = clamp(f.y - VIEW_H / 2 + 20, -150, DIVE_FLOOR + 80 - VIEW_H);
    const k = snapTo ? 1 : Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  },

  /* --------------------------------- the boy ------------------------------- */

  _player(dt) {
    const P = Player, p = this.p, suit = this.suit();
    p.invuln = Math.max(0, p.invuln - dt);
    p.cd = Math.max(0, p.cd - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.dashT = Math.max(0, p.dashT - dt);
    p.healT = Math.max(0, p.healT - dt);
    p.fireT = Math.max(0, p.fireT - dt);

    let ix = (Input.held('right') ? 1 : 0) - (Input.held('left') ? 1 : 0);
    let iy = (Input.held('down') ? 1 : 0) - (Input.held('up') || Input.held('jump') ? 1 : 0);
    const n = Math.hypot(ix, iy);
    if (n) { ix /= n; iy /= n; }
    if (ix) p.face = ix < 0 ? -1 : 1;

    // aim at the mouse while it is in use; otherwise the way he swims, or faces
    const mouse = Input.mouse();
    if (mouse.moved || mouse.down) this.mouseT = Game.t;
    this.mouseAim = mouse.inside && Game.t - this.mouseT < 4;
    if (this.mouseAim) {
      p.aim = Math.atan2(mouse.y + this.cam.y - p.y, mouse.x + this.cam.x - p.x);
      p.face = Math.cos(p.aim) < 0 ? -1 : 1;
    } else {
      p.aim = n ? Math.atan2(iy, ix) : (p.face > 0 ? 0 : Math.PI);
    }

    Status.tickPlayer(P, dt, dmg => this.hurtPlayer(dmg, p.x, p.y + 1, true));
    const acc = 1000 * suit.speed * Status.speed(P), top = 240 * suit.speed * Status.speed(P);
    p.vx += ix * acc * dt;
    p.vy += iy * acc * dt;
    // past the suit's depth the water pushes back on the way down
    if (p.y > suit.depth && p.vy > 40) p.vy = 40;
    const drag = Math.min(1, dt * 2.8);
    p.vx -= p.vx * drag; p.vy -= p.vy * drag;
    p.vy += 10 * dt;                           // a diver sinks, slowly
    const sp = Math.hypot(p.vx, p.vy);
    if (p.dashT <= 0 && sp > top) { p.vx *= top / sp; p.vy *= top / sp; }

    // dash
    if (Input.tap('roll') && p.dashCd <= 0) {
      const dx = n ? ix : p.face, dy = n ? iy : 0;
      p.vx += dx * 520; p.vy += dy * 520;
      p.dashT = .22; p.dashCd = .75; p.invuln = Math.max(p.invuln, .3);
      Sfx.dashUnder();
      for (let i = 0; i < 6; i++) this.bubble(p.x - dx * 20, p.y - dy * 20);
    }

    // fire: hold the attack key or the mouse button and it keeps firing, forever
    if ((Input.tap('attack') || Input.held('attack') || mouse.down) && p.cd <= 0 && !p.harpoonOut) this.fire();

    // bandage
    if (Input.tap('use') && P.bandages > 0 && P.hp < P.maxHp && p.healT <= 0) {
      P.bandages--; P.hp = Math.min(P.maxHp, P.hp + 2); p.healT = .5;
      Sfx.heal();
      if (Prefs.damageNumbers) Floaters.add(p.x, p.y - 40, '+2', { color: '#8ce0a4', size: 22 });
      if (Status.cure(P)) Floaters.add(p.x, p.y - 66, 'the sting is out', { color: '#b8f0a8', size: 16, life: 1 });
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y < 8) { p.y = 8; if (p.vy < 0) p.vy = 0; }
    diveCollide(p, 20);
    if (this.boss && !this.boss.dead) this._arenaClamp(p, 24);
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
      if (p.pressureT > 1.5) { p.pressureT = 0; Sfx.creak(true); this.hurtPlayer(1, p.x, p.y + 1, true); Cam.kick(3); }
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

  /* --------------------------------- firing -------------------------------- */

  // where shots leave the launcher
  muzzle() {
    const p = this.p;
    return { x: p.x + Math.cos(p.aim) * 44, y: p.y + 2 + Math.sin(p.aim) * 44 };
  },

  fire() {
    const p = this.p, w = this.weapon();
    const mz = this.muzzle();
    const shot = (ang, extra) => this.shots.push(Object.assign({
      w, style: w.style, x: mz.x, y: mz.y, vx: Math.cos(ang) * w.speed, vy: Math.sin(ang) * w.speed,
      dist: 0, r: w.size, hit: new Set(), t: 0, back: false
    }, extra));

    if (w.style === 'spread') {
      for (let i = 0; i < w.count; i++) shot(p.aim + (i - (w.count - 1) / 2) * w.spread);
    } else shot(p.aim);
    if (w.style === 'harpoon') p.harpoonOut = true;
    Sfx.fireUnder(w.style);

    p.cd = w.cd;
    p.fireT = .18;
    p.vx -= Math.cos(p.aim) * 60; p.vy -= Math.sin(p.aim) * 60;     // recoil
    for (let i = 0; i < 3; i++) this.bubble(mz.x, mz.y);
  },

  // rock, cliff, seabed or open air: things a shot cannot go through
  _solid(x, y) {
    if (y < 0 || y > DIVE_FLOOR) return true;
    if (x < diveWallL(y) || x > DIVE_W - diveWallR(y)) return true;
    return DIVE_ROCKS.some(R => x > R.x0 && x < R.x1 && y > R.y0 && y < R.y1);
  },

  _shots(dt) {
    const p = this.p;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt;

      // a harpoon on its way back up the line
      if (s.back) {
        const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1, step = 1400 * dt;
        if (d <= step + 24) {
          this.shots.splice(i, 1);
          p.harpoonOut = false;
          p.cd = s.w.cd;
          Sfx.reelIn();
          continue;
        }
        s.x += dx / d * step; s.y += dy / d * step;
        continue;
      }

      const sp = Math.hypot(s.vx, s.vy);
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.dist += sp * dt;
      if (s.style === 'wave') s.r = s.w.size + s.dist / s.w.range * s.w.grow;
      if (chance(dt * 25) && s.style !== 'wave') this.bubble(s.x, s.y);

      let done = this._solid(s.x, s.y);
      if (done) Particles.burst(s.x, s.y, 6, { color: 'rgba(200,220,230,.7)', vx: rand(-80, 80), vy: rand(-80, 80), g: 0, drag: 3, size: 2, life: .4 });

      for (const m of this.targets()) {
        if (done) break;
        if (m.dead || s.hit.has(m) || !this._inMob(m, s.x, s.y, s.r)) continue;
        s.hit.add(m);
        this.hitMob(m, s.w, s.vx / sp, s.vy / sp);
        if (s.style === 'harpoon' || s.style === 'spread') done = true;
        if (s.style === 'chain') { this._chain(m, s.w); done = true; }
      }

      if (!done && s.dist >= s.w.range) done = true;
      if (!done) continue;
      if (s.style === 'harpoon') { s.back = true; Sfx.reelOut(); }
      else this.shots.splice(i, 1);
    }
  },

  // lightning jumping on from what was hit to the nearest few around it
  _chain(first, w) {
    this.zaps.push({ x1: first.x - 30, y1: first.y - 20, x2: first.x, y2: first.y, t: 0 });
    if (!first.dead && !first.def.boss) { first.state = 'stun'; first.t = 0; first.stun = .5; Status.stun(first, .5); }
    const near = this.targets()
      .filter(m => m !== first && !m.dead && Math.hypot(m.x - first.x, m.y - first.y) < w.jump + Math.min(m.def.len * .3, 120))
      .sort((a, b) => Math.hypot(a.x - first.x, a.y - first.y) - Math.hypot(b.x - first.x, b.y - first.y))
      .slice(0, w.chain);
    let from = first;
    for (const m of near) {
      this.zaps.push({ x1: from.x, y1: from.y, x2: m.x, y2: m.y, t: 0 });
      const dx = m.x - from.x, dy = m.y - from.y, d = Math.hypot(dx, dy) || 1;
      this.hitMob(m, w, dx / d, dy / d);
      if (!m.dead && !m.def.boss) { m.state = 'stun'; m.t = 0; m.stun = .5; Status.stun(m, .5); }
      from = m;
    }
    Sfx.zapUnder();
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
    const heft = m.def.boss ? .08 : 1;
    m.vx += kx * w.knock * heft; m.vy += ky * w.knock * heft;
    this.hitstop = crit ? .07 : .04;
    Cam.kick(crit ? 5 : 2.5);
    Sfx.hitWet(crit);
    if (Prefs.damageNumbers) {
      Floaters.add(m.x, m.y - 30, String(dmg), { color: crit ? '#ffd257' : '#fff', size: crit ? 30 : 22, life: .8 });
    }
    Particles.burst(m.x - kx * m.def.len * .2, m.y - ky * 10, crit ? 14 : 8, {
      color: chance(.5) ? '#c4e6f2' : '#8e2c3a', vx: rand(-160, 160), vy: rand(-160, 160), g: 0, drag: 3, size: rand(2, 5), life: rand(.3, .7)
    });
    if (m.def.boss) {
      if (m.hp <= 0) this.killBoss();
      else { if (w.bleed) Status.inflict(m, { dmg: w.dmg, bleed: w.bleed }); this._bossPhase(); }
      return;
    }
    if (m.hp <= 0) { this.killMob(m); return; }
    const got = Status.inflict(m, w);
    if (got.includes('stun')) { m.state = 'stun'; m.t = 0; m.stun = Math.max(m.stun || 0, Status.fx(m).stun); }
    else if (m.state === 'drift') { m.state = 'hunt'; m.t = 0; m.cool = rand(.4, .9); }
  },

  // a bleed tick on something down here
  _bleedMob(m, dmg) {
    if (m.dead) return;
    m.hp -= dmg;
    m.flash = Math.max(m.flash, .45);
    if (Prefs.damageNumbers) Floaters.add(m.x + rand(-20, 20), m.y - 20, String(dmg), { color: '#ff7a7a', size: 16, life: .6 });
    Particles.burst(m.x, m.y, 3, { color: '#8e2c3a', vx: rand(-40, 40), vy: rand(-40, 40), g: 0, drag: 2, size: rand(2, 4), life: .7 });
    if (m.hp > 0) return;
    if (typeof Achievements !== 'undefined') Achievements.event('bleedKill');
    if (m.def.boss) this.killBoss(); else this.killMob(m);
  },

  killMob(m) {
    m.dead = true; m.state = 'dead'; m.t = 0; m.flash = 1;
    const trophy = makeTrophy(m.def);
    if (Player.luck) trophy.value = Math.round(trophy.value * 1.25);
    Player.catches.push(trophy);
    Player.kills[m.def.id] = (Player.kills[m.def.id] || 0) + 1;
    Player.totalKills++;
    Sfx.creatureDie(m.def.len); Cam.kick(7);
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
    Sfx.hurtUnder(); Cam.kick(6);
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
    if (!m.dead) { Status.tick(m, dt, dmg => this._bleedMob(m, dmg)); if (m.dead) return; }
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
          m.atk = pickAttack(attacksOf(def)); m.state = 'tele'; m.t = 0;
          const lv = this._near(m);
          if (lv > .05) Sfx.growl(def.len, lv);
        }
        if (dist > def.aggro * 2.4) { m.state = 'drift'; m.t = 0; m.wanderT = 0; }
        break;
      }
      case 'tele': {
        const dur = { bite: .45, charge: .6, ink: .5, pulse: .7, lash: .45, lure: .6, snap: .55, glide: .5, gulp: .55, volley: .5 }[m.atk] || .5;
        m.vx *= 1 - Math.min(1, dt * 5); m.vy *= 1 - Math.min(1, dt * 5);
        m.thrash = 1 + m.t / dur * 2;
        m.gape = m.t / dur * (m.atk === 'ink' ? .95 : .6);
        if (m.t >= dur) {
          m.dirX = dx / dist; m.dirY = dy / dist;
          m.state = m.atk; m.t = 0; m.shots = 0;
          const lv = this._near(m);
          if (lv > .05 && m.atk === 'bite') Sfx.chomp(lv);
          if (lv > .05 && m.atk === 'charge') Sfx.rush(lv);
          if (m.atk === 'pulse') {
            this.rings.push({ x: m.x, y: m.y, r: def.len * .3, max: 210 + def.len * .35, speed: 380, width: 22, from: 'mob', dmg: def.dmg, hit: new Set(), t: 0, poison: def.plan === 'bloom' });
            if (lv > .05) Sfx.pulseBoom(lv);
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
          this.globs.push({ x: hx, y: hy, vx: Math.cos(ang) * 320, vy: Math.sin(ang) * 320, r: 11, t: 0, dmg: 1, kind: 'ink' });
          const lv = this._near(m);
          if (lv > .05) Sfx.inkSquirt(lv);
        }
        if (m.t > .5) this._recover(m, .8);
        break;
      }
      case 'pulse':
        if (m.t > .4) this._recover(m, .8);
        break;

      /* ------------------------ each body's own attack ------------------------ */

      // three quick darts, each from a fresh angle
      case 'lash': {
        const every = .24;
        const k = Math.floor(m.t / every);
        if (k !== m.shots && k < 3) {
          m.shots = k;
          const a = Math.atan2(dy, dx) + (k === 1 ? .55 : -.55);
          m.dirX = Math.cos(a); m.dirY = Math.sin(a);
          const lv = this._near(m);
          if (lv > .05) Sfx.rush(lv * .6);
        }
        const s = spd * 4.4;
        m.vx = m.dirX * s; m.vy = m.dirY * s;
        m.gape = .9; m.thrash = 3;
        const hx = m.x + m.dirX * def.len * .4, hy = m.y + m.dirY * def.len * .4;
        if (Math.hypot(p.x - hx, p.y - hy) < Math.max(22, def.len * .12) + 16) this.hurtPlayer(def.dmg, m.x, m.y);
        if (m.t > every * 3) this._recover(m, .8);
        break;
      }
      // the lure draws you in toward the teeth
      case 'lure': {
        const mx = m.x + m.face * def.len * .4, my = m.y;
        const ax = mx - p.x, ay = my - p.y, ad = Math.hypot(ax, ay) || 1;
        m.gape = Math.min(1, .5 + m.t * .4); m.thrash = 1.5;
        if (m.t < 1.3) {
          if (p.dashT <= 0) { p.vx += ax / ad * 520 * dt; p.vy += ay / ad * 520 * dt; }
          if (chance(dt * 30)) Particles.add(p.x + rand(-100, 100), p.y + rand(-80, 80), { vx: ax / ad * 240, vy: ay / ad * 240, g: 0, drag: 0, size: 2, life: .5, color: 'rgba(255,240,180,.55)' });
          if (ad < def.len * .2 + 34) { m.gape = 1; this.hurtPlayer(def.dmg, mx, my); this._recover(m, .9); }
        } else this._recover(m, .9);
        break;
      }
      // a claw snaps shut and fires a shock of bubbles
      case 'snap': {
        if (m.shots === 0) {
          m.shots = 1;
          const a = Math.atan2(dy, dx);
          this.globs.push({ x: m.x + Math.cos(a) * def.len * .4, y: m.y + Math.sin(a) * def.len * .2, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, r: 13, t: 0, dmg: def.dmg, kind: 'bubble' });
          const lv = this._near(m);
          if (lv > .05) Sfx.pulseBoom(lv * .5);
        }
        if (m.t > .4) this._recover(m, .7);
        break;
      }
      // a wide curve out, round, and back through you
      case 'glide': {
        const side = m.seed % 2 ? 1 : -1;
        const a = Math.atan2(m.dirY, m.dirX) + (1 - clamp(m.t / 1.1, 0, 1)) * 1.3 * side;
        const s = spd * 3.6;
        m.vx = Math.cos(a) * s; m.vy = Math.sin(a) * s;
        m.thrash = 2;
        if (this._inMob(m, p.x, p.y, 12)) this.hurtPlayer(def.dmg, m.x, m.y);
        if (m.t > 1.2) this._recover(m, .9);
        break;
      }
      // suction, then a bite
      case 'gulp': {
        const mx = m.x + m.face * def.len * .42, my = m.y;
        const ax = mx - p.x, ay = my - p.y, ad = Math.hypot(ax, ay) || 1;
        m.gape = 1; m.thrash = 1.4;
        if (m.t < 1.2) {
          if (p.dashT <= 0) { p.vx += ax / ad * 460 * dt; p.vy += ay / ad * 460 * dt; }
          if (chance(dt * 40)) Particles.add(p.x + rand(-120, 120), p.y + rand(-90, 90), { vx: ax / ad * 260, vy: ay / ad * 260, g: 0, drag: 0, size: 2, life: .5, color: 'rgba(200,220,230,.5)' });
          if (ad < def.len * .22 + 30) { this.hurtPlayer(def.dmg + 1, mx, my); this._recover(m, 1); }
        } else this._recover(m, .9);
        break;
      }
      // a fan of bone shards
      case 'volley': {
        if (m.shots === 0) {
          m.shots = 1;
          const a0 = Math.atan2(dy, dx);
          for (let k = -2; k <= 2; k++) {
            const a = a0 + k * .22;
            this.globs.push({ x: m.x + Math.cos(a0) * def.len * .3, y: m.y, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, r: 8, t: 0, dmg: 1, kind: 'bone' });
          }
          const lv = this._near(m);
          if (lv > .05) Sfx.inkSquirt(lv);
        }
        if (m.t > .45) this._recover(m, .8);
        break;
      }
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
    const drag = m.state === 'bite' || m.state === 'charge' || m.state === 'lash' || m.state === 'glide' ? 0 : Math.min(1, dt * 2.2);
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
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 16) {
        const landed = p.invuln <= 0;
        this.hurtPlayer(b.dmg, b.x, b.y);
        if (landed && b.kind === 'ink' && Player.hp > 0) Status.ink(Player);
        this.globs.splice(i, 1);
        continue;
      }
      if (b.t > 2.4) this.globs.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const R = this.rings[i];
      R.t += dt;
      R.r += R.speed * dt;
      // rings only ever come from the creatures; his weapons all fire shots
      if (!R.hit.has('player')) {
        const d = Math.hypot(p.x - R.x, p.y - R.y);
        if (Math.abs(d - R.r) < R.width / 2 + 14) {
          R.hit.add('player');
          const landed = p.invuln <= 0;
          this.hurtPlayer(R.dmg, R.x, R.y);
          if (landed && R.poison && Player.hp > 0 && Status.poison(Player) && Prefs.damageNumbers) Floaters.add(p.x, p.y - 66, 'POISONED', { color: '#8ee07a', size: 18, life: 1 });
        }
      }
      if (R.r >= R.max) this.rings.splice(i, 1);
    }
  },

  /* ------------------------------ the Mother ------------------------------
     At the bottom, in front of Lanthorne's gate, Nerys is being hunted by
     the thing the Old One came from. Getting close starts it; once it has
     started, the current holds you in until one of you is done.          */

  _checkMother() {
    const p = this.p;
    if (Player.beatMother || p.y < MOTHER_ARENA.top + 100 || Math.abs(p.x - CITY_X) > MOTHER_ARENA.w / 2 + 340) return;
    this.startMother();
  },

  startMother() {
    const def = monsterDef('mother');
    const p = this.p;
    this.boss = {
      def, x: CITY_X + 900, y: 3600, vx: 0, vy: 0, face: -1, rot: 0,
      hp: def.hp, maxHp: def.hp, state: 'scene', t: 0, cool: 1.6, phase: 1,
      flash: 0, gape: .2, thrash: 1, seed: 41, dead: false, atk: null,
      sweepY: 0, sweepX: 0, sweepDir: 1, dirX: -1, dirY: 0, pulses: 0
    };
    // the player comes in from wherever he was, into the arena
    this._arenaClamp(p, 24);
    p.vx = 0; p.vy = 0;
    this.shots.length = 0; p.harpoonOut = false;
    Object.assign(this.girl, { visible: true, x: CITY_X + 320, y: 3620, face: -1, rot: 0 });
    // the whole conversation only once a session; after a blackout, straight to it
    const steps = this.sawMotherIntro ? motherReturnSteps(this) : motherIntroSteps(this);
    this.sawMotherIntro = true;
    this.phase = 'scene';
    CUT.play(steps.steps, { finalize: steps.finalize, onEnd: () => { this.phase = 'swim'; } });
  },

  _arenaClamp(o, r) {
    const A = MOTHER_ARENA;
    const x0 = CITY_X - A.w / 2 + r, x1 = CITY_X + A.w / 2 - r;
    if (o.x < x0) { o.x = x0; if (o.vx < 0) o.vx = 0; }
    if (o.x > x1) { o.x = x1; if (o.vx > 0) o.vx = 0; }
    if (o.y < A.top + r) { o.y = A.top + r; if (o.vy < 0) o.vy = 0; }
  },

  // attacks she can reach for, by phase
  motherPool() {
    const B = this.boss;
    if (B.phase >= 3) return ['maw', 'sweep', 'pulse', 'brood', 'stare', 'whirlpool', 'coil'];
    if (B.phase === 2) return ['maw', 'sweep', 'brood', 'pulse', 'stare', 'whirlpool'];
    return ['maw', 'pulse', 'sweep', 'stare'];
  },

  // she never asks you to answer two things back to back
  _motherPick() {
    const B = this.boss;
    const fresh = this.t - (B.lastSkill === undefined ? -99 : B.lastSkill) > 6;
    return choice(this.motherPool().filter(a => fresh || MOTHER_SKILLS.indexOf(a) < 0));
  },

  // her great eye, on screen
  _eyeScreen() {
    const B = this.boss, len = B.def.len, girth = B.def.girth || .2;
    return { x: B.x + B.face * len * .23 - this.cam.x, y: B.y - len * girth * .26 - this.cam.y };
  },

  // the eye opens and something gathers in it: shoot it as the ring closes
  _skillStare() {
    const B = this.boss;
    B.lastSkill = this.t;
    Skill.start({
      kind: 'ring', label: 'SHOOT THE EYE', action: 'attack', count: B.phase >= 3 ? 2 : 1, shrink: .9, window: .12,
      at: () => this._eyeScreen()
    }, ok => {
      if (ok) {
        B.flash = 1; Cam.kick(10); Sfx.hitWet(true);
        B.hp = Math.max(1, B.hp - Math.round(B.maxHp * .05));
        if (Prefs.damageNumbers) Floaters.add(this.p.x, this.p.y - 60, 'RIGHT IN THE EYE', { color: '#f0cf6a', size: 22, life: 1.2 });
        this._bossRest(2.0);
        this._bossPhase();
      } else {
        this.hurtPlayer(2, B.x, B.y, true);
        this._bossRest(.9);
      }
    });
  },

  // the whole sea turns toward her mouth: swim against it
  _skillWhirl() {
    const B = this.boss, p = this.p;
    B.lastSkill = this.t;
    const pull = B.x > p.x ? 1 : -1;
    this.whirlFrom = { x: p.x, y: p.y };
    Sfx.inhale();
    Skill.start({
      kind: 'hold', label: 'SWIM AGAINST IT', dur: B.phase >= 3 ? 3.6 : 3.1, pull,
      strength: B.phase >= 3 ? 2.7 : 2.3, keys: pull > 0 ? ['left', 'right'] : ['right', 'left']
    }, ok => {
      p.x = this.whirlFrom.x; p.y = this.whirlFrom.y; p.vx = 0; p.vy = 0;
      if (ok) { B.flash = 1; this._bossRest(1.8); }
      else { const m = this._mouth(); this.hurtPlayer(2, m.x, m.y, true); p.vx = -pull * 700; this._bossRest(1.0); }
    });
  },

  // her arms close in from every side: slip out between them
  _skillCoil() {
    const B = this.boss;
    B.lastSkill = this.t;
    const dirs = ['up', 'down', 'left', 'right'], seq = [];
    for (let i = 0; i < (B.phase >= 3 ? 5 : 4); i++) {
      let k;
      do { k = choice(dirs); } while (k === seq[seq.length - 1]);
      seq.push(k);
    }
    Skill.start({ kind: 'keys', label: 'SLIP THE COILS', seq, per: B.phase >= 3 ? .7 : .82, alias: { jump: 'up' } }, ok => {
      if (ok) { B.flash = 1; this._bossRest(1.5); }
      else { this.hurtPlayer(2, this.p.x + 1, this.p.y, true); this._bossRest(.9); }
    });
  },

  // how she moves while you answer her
  _skillPose(dt) {
    const B = this.boss, A = Skill.active, p = this.p;
    if (!B) return;
    B.t += dt;
    B.flash = Math.max(0, B.flash - dt * 3);
    B.face = p.x < B.x ? -1 : 1;
    if (B.state === 'stare') { B.gape = .25; B.thrash = 1.2; }
    if (B.state === 'whirlpool') {
      B.gape = 1; B.thrash = 2.4;
      if (A && A.kind === 'hold') p.x = this.whirlFrom.x + A.pos * A.pull * 90;
      if (chance(dt * 50)) Particles.add(p.x + rand(-260, 260), p.y + rand(-160, 160), { vx: (B.x - p.x) > 0 ? 380 : -380, vy: rand(-60, 60), g: 0, drag: 0, size: 2, life: .5, color: 'rgba(200,170,230,.55)' });
    }
    if (B.state === 'coil') { B.thrash = 3; if (chance(dt * 5)) Cam.kick(3); }
  },

  _bossPhase() {
    const B = this.boss;
    const f = B.hp / B.maxHp;
    const want = f < .33 ? 3 : (f < .66 ? 2 : 1);
    if (want <= B.phase) return;
    B.phase = want;
    B.state = 'tele'; B.t = 0; B.atk = 'roar';
    Sfx.motherRoar(); Cam.kick(14);
    this.banner = want === 2
      ? { text: 'SHE IS NOT PLAYING', t: 0, dur: 2.6, color: '#ff8a5a' }
      : { text: 'LANTHORNE GOES DARK', t: 0, dur: 3, color: '#c46bff' };
  },

  _mouth() {
    const B = this.boss;
    return { x: B.x + B.face * B.def.len * .44, y: B.y };
  },

  _boss(dt) {
    const B = this.boss, p = this.p, def = B.def;
    B.t += dt;
    if (!B.dead) { Status.tick(B, dt, dmg => this._bleedMob(B, dmg)); if (B.dead || this.boss !== B) return; }
    B.flash = Math.max(0, B.flash - dt * 3);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
    const rage = B.phase >= 3 ? 1.45 : (B.phase === 2 ? 1.2 : 1);
    const dx = p.x - B.x, dy = p.y - B.y, dist = Math.hypot(dx, dy) || 1;
    const hard = B.phase >= 3 ? 1 : 0;

    switch (B.state) {
      case 'scene':
        B.thrash = 1.4; B.gape = .3 + Math.sin(B.t * 2) * .2;
        break;

      case 'idle': {
        // hang off to one side of him, a mouth's length away
        const side = p.x < CITY_X ? 1 : -1;
        const tx = clamp(p.x + side * 640, CITY_X - 520, CITY_X + 520), ty = clamp(p.y - 30, MOTHER_ARENA.top + 180, DIVE_FLOOR - 200);
        B.vx += (tx - B.x) * 1.6 * dt; B.vy += (ty - B.y) * 1.6 * dt;
        B.face = dx < 0 ? -1 : 1;
        B.gape = approach(B.gape, .15, dt); B.thrash = approach(B.thrash, 1, dt);
        B.cool -= dt * rage;
        if (B.cool <= 0) { B.atk = this._motherPick(); B.state = 'tele'; B.t = 0; }
        break;
      }

      case 'tele': {
        const dur = ({ maw: .95, pulse: .8, sweep: 1.1, brood: .7, stare: 1.0, whirlpool: .6, coil: .8, roar: 1.3 }[B.atk] || .8) / rage;
        B.vx *= 1 - Math.min(1, dt * 4); B.vy *= 1 - Math.min(1, dt * 4);
        B.face = dx < 0 ? -1 : 1;
        B.thrash = 1 + B.t / dur * 2.4;
        B.gape = B.atk === 'roar' ? .95 : B.t / dur * .8;
        if (B.atk === 'sweep' && B.t < .05) { B.sweepY = p.y; B.sweepDir = p.x < CITY_X ? 1 : -1; }
        if (B.t >= dur) {
          B.t = 0;
          B.dirX = dx / dist; B.dirY = dy / dist;
          if (B.atk === 'roar') { B.state = 'idle'; B.cool = .6; break; }
          B.state = B.atk;
          if (B.atk === 'maw') { Sfx.growl(B.def.len, 1); Sfx.chomp(1); }
          if (B.atk === 'sweep') { B.sweepX = CITY_X - B.sweepDir * (MOTHER_ARENA.w / 2 + 120); Sfx.rush(1); }
          if (B.atk === 'pulse') { B.pulses = 0; }
          if (B.atk === 'brood') this._brood();
          if (B.atk === 'stare') this._skillStare();
          if (B.atk === 'whirlpool') this._skillWhirl();
          if (B.atk === 'coil') this._skillCoil();
        }
        break;
      }

      case 'maw': {
        const s = 880 * rage;
        B.vx = B.dirX * s; B.vy = B.dirY * s * .7;
        B.gape = 1; B.thrash = 3;
        const m = this._mouth();
        if (Math.hypot(p.x - m.x, p.y - m.y) < 110) this.hurtPlayer(def.dmg + hard, m.x, m.y);
        if (B.t > .55) this._bossRest(1.0);
        break;
      }

      case 'sweep': {
        // a tentacle scything the whole width of the arena at one depth
        B.sweepX += B.sweepDir * 1500 * rage * dt;
        if (Math.abs(p.y - B.sweepY) < 46 && Math.abs(p.x - B.sweepX) < 70) this.hurtPlayer(def.dmg, B.sweepX, B.sweepY);
        if (Math.abs(B.sweepX - CITY_X) > MOTHER_ARENA.w / 2 + 140 && B.t > .2) this._bossRest(.9);
        break;
      }

      case 'pulse': {
        const want = hard ? 2 : 1;
        if (B.pulses < want && B.t > B.pulses * .5) {
          B.pulses++;
          this.rings.push({ x: B.x, y: B.y, r: 160, max: 1100, speed: 440, width: 34, from: 'mob', dmg: 1, hit: new Set(), t: 0 });
          Sfx.pulseBoom(1); Cam.kick(6);
        }
        if (B.t > .5 * want + .2) this._bossRest(.9);
        break;
      }

      case 'brood':
        if (B.t > .6) this._bossRest(.8);
        break;

      // held while you answer her: see _skillPose
      case 'stare': case 'whirlpool': case 'coil':
        break;

      case 'rest':
        B.gape = approach(B.gape, .15, dt * 2); B.thrash = approach(B.thrash, 1, dt * 2);
        if (B.t > B.restDur / rage) { B.state = 'idle'; B.t = 0; B.cool = rand(.6, 1.2); }
        break;

      case 'dying':
        B.vx *= 1 - Math.min(1, dt * 2);
        B.vy = approach(B.vy, 70, dt * 40);
        B.rot = approach(B.rot, .5 * B.face, dt * .3);
        B.gape = .6 + Math.sin(B.t * 6) * .3;
        B.flash = Math.sin(B.t * 18) > .6 ? .8 : 0;
        if (chance(dt * 16)) Particles.burst(B.x + rand(-400, 400), B.y + rand(-120, 120), 3, { color: chance(.5) ? '#c46bff' : '#ffe9a8', vx: rand(-120, 120), vy: rand(-160, 40), g: 0, drag: 2, size: rand(2, 6), life: 1 });
        break;
    }

    if (B.state !== 'maw') { B.vx *= 1 - Math.min(1, dt * 2); B.vy *= 1 - Math.min(1, dt * 2); }
    B.x += B.vx * dt; B.y += B.vy * dt;
    if (B.state !== 'dying') {
      B.x = clamp(B.x, CITY_X - MOTHER_ARENA.w / 2 - 200, CITY_X + MOTHER_ARENA.w / 2 + 200);
      B.y = clamp(B.y, MOTHER_ARENA.top + 120, DIVE_FLOOR - 140);
      B.rot = clamp(B.vy / 1400, -.25, .25);
    }
  },

  // the helmet's own soundscape: breathing, the gauge, the suit, and far-off things
  _ambience(dt) {
    const p = this.p, suit = this.suit(), A = this.amb;
    if (!A) return;
    A.breath -= dt;
    if (A.breath <= 0 && p.air > 0) { A.breath = rand(3.4, 4.2); Sfx.breathe(); }
    if (p.air < suit.air * .25) {
      A.beep -= dt;
      if (A.beep <= 0) { A.beep = p.air <= 0 ? .6 : 1.3; Sfx.lowAir(p.air <= 0); }
    } else A.beep = 0;
    if (p.y > suit.depth) {
      A.creak -= dt;
      if (A.creak <= 0) { A.creak = rand(.9, 1.4); Sfx.creak(false); }
    } else A.creak = .3;
    if (p.y > 900) { A.sonar -= dt; if (A.sonar <= 0) { A.sonar = rand(14, 26); Sfx.sonar(); } }
    if (p.y > 1400) { A.moan -= dt; if (A.moan <= 0) { A.moan = rand(22, 45); Sfx.moan(); } }
    if (chance(dt * .6)) Sfx.bubbleBlip(.5);
  },

  // how loud a creature is from where he is: full up close, nothing past ~1000px
  _near(m) {
    return clamp(1.2 - Math.hypot(m.x - this.p.x, m.y - this.p.y) / 850, 0, 1);
  },

  _bossRest(dur) { const B = this.boss; B.state = 'rest'; B.t = 0; B.restDur = dur; },

  // three of her young, out of her mouth
  _brood() {
    const alive = this.mobs.filter(m => m.def.spawnOnly && !m.dead).length;
    const def = monsterDef('broodling');
    const m = this._mouth();
    for (let i = 0; i < Math.min(3, 6 - alive); i++) {
      const b = this.makeMob(def, m.x + rand(-60, 60), m.y + rand(-60, 60), 4);
      b.state = 'hunt'; b.cool = rand(.8, 1.6);
      b.vx = this.boss.face * rand(200, 400); b.vy = rand(-200, 200);
    }
    Sfx.broodSqueal();
  },

  killBoss() {
    const B = this.boss;
    B.dead = true; B.hp = 0; B.state = 'dying'; B.t = 0;
    const trophy = makeTrophy(B.def);
    Player.catches.push(trophy);
    Player.kills.mother = (Player.kills.mother || 0) + 1;
    Player.totalKills++;
    // her young go with her
    for (const m of this.mobs) if (m.def.spawnOnly && !m.dead) { m.dead = true; m.state = 'dead'; m.t = 0; }
    this.rings.length = 0; this.globs.length = 0;
    this.banner = null;
    Sfx.motherRoar(); Sfx.creatureDie(B.def.len); Cam.kick(18);
    this.phase = 'scene';
    const s = motherEndSteps(this);
    CUT.play(s.steps, { finalize: s.finalize, onEnd: () => { this.phase = 'swim'; } });
  },

  _scene(dt) {
    CUT.update(dt);
    if (this.boss) this._boss(dt);
    const p = this.p;
    p.animT += dt;
    p.vx *= 1 - Math.min(1, dt * 3); p.vy *= 1 - Math.min(1, dt * 3);
    p.x += p.vx * dt; p.y += p.vy * dt;
    diveCollide(p, 20);
    for (const m of this.mobs) if (m.dead) this._mob(m, dt);
    for (let i = this.mobs.length - 1; i >= 0; i--) if (this.mobs[i].gone) this.mobs.splice(i, 1);
    this._camera(dt);
    if (!CUT.running && this.phase === 'scene') this.phase = 'swim';
  },

  /* ------------------------------- leaving ------------------------------- */

  climb() {
    if (this.phase !== 'swim') return;
    this.phase = 'climb';
    Sfx.climbOut();
    const n = Player.catches.length - this.haulStart;
    Game.fadeOut(() => this.backOnDeck(n ? 'Back aboard with ' + n + ' in the net.' : 'Back aboard. Dry, nearly.', DORRAN.deck.aboard));
  },

  blackout() {
    if (this.phase !== 'swim') return;
    this.phase = 'blackout';
    Sfx.blackout();
    Game.fadeOut(() => {
      const lost = Player.catches.length - this.haulStart;
      Player.catches.length = this.haulStart;
      Player.hp = Player.maxHp;
      const fee = salvageFee();
      const cost = fee > 0 ? ' Salvage fee: ' + fee + '§' : '';
      this.backOnDeck((lost ? 'You wake on the deck. The sea kept your catch.' : 'You wake on the deck, coughing.') + cost, DORRAN.deck.woke);
    });
  },

  backOnDeck(message, dorran) {
    this.reset();
    this.firstDive = false;
    Particles.clear(); Floaters.clear();
    Game.state = 'play';
    Player.x = FISH_X; Player.face = -1; Player.state = 'idle'; Player.y = DECK_Y; Player.vy = 0;
    Cam.locked = false;
    Cam.snap(Player.x);
    Game.toast(message);
    // the last boss is beaten: time to go home, said once, then left to the objective
    if (FINALE.ready() && !Player.sawEnding && !Game.toldHomeward) {
      Game.toldHomeward = true;
      Game.narrate('homeward');
    } else if (dorran) Game.dorranShouts(dorranPick(dorran));
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
    // ink across the glass of his helmet
    Status.drawInk(g, Player.fx);
    this.drawHUD(g);
    this._drawBoss(g);
    if (this.phase === 'scene') { CUT.drawOverlay(g); return; }
    Skill.draw(g);
    const p = this.p, suit = this.suit();
    if (this.phase !== 'swim') return;
    let tip = null, col = '#dfe4f0';
    if (p.y > suit.depth) { tip = 'TOO DEEP: the suit is buckling'; col = '#ff8a8a'; }
    else if (p.air <= 0) { tip = 'OUT OF AIR: get to the surface'; col = '#ff8a8a'; }
    else if (p.air < suit.air * .25) { tip = 'Low on air'; col = Math.sin(Game.t * 8) > 0 ? '#ffb070' : '#ff8a8a'; }
    else if (this.atLadder()) tip = '[' + keyLabel(ACTIONS.interact[0]) + '] Climb aboard';
    else if (this.firstDive && this.t < 9 && !this.boss) {
      tip = keyLabel(ACTIONS.jump[1] || ACTIONS.up[0]) + keyLabel(ACTIONS.left[0]) + keyLabel(ACTIONS.down[0]) + keyLabel(ACTIONS.right[0]) +
        ' swim   [' + keyLabel(ACTIONS.attack[0]) + '] or click: fire   [' + keyLabel(ACTIONS.roll[0]) + '] dash';
    }
    if (tip) Fishing._tip(g, tip, col);

    // a pixel crosshair where the mouse is aiming
    if (this.mouseAim) {
      const m = Input.mouse(), x = snap(m.x), y = snap(m.y);
      const ready = p.cd <= 0 && !p.harpoonOut;
      g.fillStyle = 'rgba(0,0,0,.6)';
      g.fillRect(x - 10, y - 1, 6, 4); g.fillRect(x + 6, y - 1, 6, 4); g.fillRect(x - 1, y - 10, 4, 6); g.fillRect(x - 1, y + 6, 4, 6);
      g.fillStyle = ready ? '#f0cf8a' : '#8d97b4';
      g.fillRect(x - 10, y, 6, 2); g.fillRect(x + 6, y, 6, 2); g.fillRect(x, y - 10, 2, 6); g.fillRect(x, y + 6, 2, 6);
    }
  },

  // her health across the top, with the two places she gets worse, and her banners
  _drawBoss(g) {
    const B = this.boss;
    if (B && !B.dead && B.state !== 'scene') {
      const bw = 520, bx = VIEW_W / 2 - bw / 2, by = 64;
      panel(g, bx - 12, by - 30, bw + 24, 52, { alpha: .85 });
      Text.draw(g, B.def.name.toUpperCase(), VIEW_W / 2, by - 10, { size: 16, align: 'center', color: B.phase >= 2 ? '#ff8ab0' : '#d9b8ff' });
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(bx, by, bw, 12);
      g.fillStyle = B.phase >= 3 ? '#c83a6a' : '#8e4ac0';
      g.fillRect(bx, by, snap(bw * clamp(B.hp / B.maxHp, 0, 1)), 12);
      g.fillStyle = 'rgba(12,10,18,.85)';
      for (const f of [.33, .66]) g.fillRect(snap(bx + bw * f), by, 2, 12);
      if (B.phase > 1) Text.draw(g, 'PHASE ' + B.phase, bx + bw + 16, by + 11, { size: 11, color: '#ff8ab0' });
    }
    const b = this.banner;
    if (b) {
      const k = b.t / b.dur;
      Text.draw(g, b.text, VIEW_W / 2, 210, {
        size: 52, align: 'center', color: b.color, outline: 'rgba(0,0,0,.8)',
        alpha: clamp(Math.min(k * 6, (1 - k) * 4), 0, 1)
      });
    }
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
    if (!this.boss && (lx < 0 || lx > VIEW_W || ly < 0 || ly > VIEW_H)) {
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
