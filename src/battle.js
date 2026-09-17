'use strict';
/* ========================================================================
   battle.js — you versus the thing on the end of your line
   ======================================================================== */

const Battle = {
  def: null, m: null, phase: 'intro', t: 0,
  arenaL: 0, arenaR: 0,
  waves: [], globs: [], spikes: [], curtains: [], shards: [],
  glare: 0, lastSkill: -99, parried: 0,
  hitstop: 0, banner: null, reward: null,
  rage: false,

  start(def) {
    this.def = def;
    if (def.id === 'leviathan') Player.chum = false;     // the chum brought it; it's spent
    this.phase = 'intro';
    this.t = 0;
    this.waves.length = 0;
    this.globs.length = 0;
    this.spikes.length = 0; this.curtains.length = 0; this.shards.length = 0;
    this.glare = 0; this.lastSkill = -99; this.parried = 0;
    this.hurtTaken = 0;
    Skill.active = null;
    this.hitstop = 0;
    this.banner = null;
    this.reward = null;
    this.rage = false;
    this.bossPhase = 1;

    Cam.locked = true;
    this.arenaL = Cam.x + 80;
    this.arenaR = Cam.x + VIEW_W - 80;

    Player.x = clamp(Player.x - 260, this.arenaL + 40, this.arenaR - 200);
    Player.y = DECK_Y; Player.vy = 0; Player.air = 0;
    Player.face = 1;
    Player.bState = 'idle';
    Player.attackT = 0; Player.combo = 0; Player.attackDone = false;
    Player.chargeT = 0; Player.heavy = false;
    Player.rollT = 0; Player.rollCd = 0;
    Player.invuln = 0; Player.knock = 0; Player.healT = 0;
    Status.clear(Player);

    this.m = {
      def, x: Cam.x + VIEW_W + 180, y: DECK_Y - 250,
      vx: 0, vy: 0, face: -1, rot: -0.5,
      hp: def.hp, maxHp: def.hp,
      state: 'enter', t: 0, flash: 0, gape: 0,
      cool: 1.0, target: 0, hits: 0,
      thrashSpeed: 5, thrashAmt: 1,
      shots: 0,
      // a stable per-fight seed so its lumps and wobbles stay its own
      seed: (def.id.charCodeAt(0) * 7 + def.id.length * 13 + def.len) % 97 + 1,
      rage: false
    };
    Sfx.roar();
    Cam.kick(8);
  },

  get len() { return this.def.len; },
  get girth() { return this.def.girth === undefined ? .27 : this.def.girth; },
  get restY() { return DECK_Y - this.len * this.girth - 16; },

  /* ------------------------------- update ------------------------------ */

  update(dt) {
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    this.t += dt;
    const m = this.m;

    if (this.phase === 'intro') {
      m.t += dt;
      const p = clamp(m.t / 1.5, 0, 1);
      m.x = lerp(Cam.x + VIEW_W + 180, Cam.x + VIEW_W - 300, ease(p));
      m.y = lerp(DECK_Y - 320, this.restY, ease(p));
      m.rot = lerp(-0.6, 0, ease(p));
      m.gape = Math.sin(p * Math.PI) * .8;
      if (p >= 1 && m.t > 2.2) {
        this.phase = 'fight';
        m.state = 'idle'; m.t = 0; m.cool = 1.25;
        Cam.kick(6); Sfx.thud();
        Particles.burst(m.x, DECK_Y, 30, { color: '#9fd4e4', vy: rand(-300, -80), g: 700, size: rand(3, 7), life: .8 });
      }
      if (p >= 1 && m.t < 2.2) {
        // roar on landing
        if (!m._landed) {
          m._landed = true;
          Sfx.thud(); Cam.kick(10);
          Particles.burst(m.x, DECK_Y, 40, { color: '#b7d8e6', vy: rand(-360, -120), g: 800, size: rand(3, 8), life: .9 });
        }
        m.gape = .55 + Math.sin(m.t * 12) * .25;
      }
      this._updatePlayer(dt, true);
      return;
    }

    if (this.phase === 'win' || this.phase === 'lose') {
      m.t += dt;
      if (this.phase === 'win') {
        m.rot += dt * .55;
        m.y += dt * 26;
        m.flash = Math.max(0, m.flash - dt * 2);
        if (chance(dt * 14)) {
          Particles.burst(m.x + rand(-this.len / 2, this.len / 2), m.y + rand(-30, 30), 2,
            { color: chance(.5) ? '#ffe9a8' : '#9fd4e4', vy: rand(-120, -30), g: 220, size: rand(2, 5), life: 1 });
        }
      }
      this._updatePlayer(dt, true);
      this._updateProjectiles(dt, false);
      if (m.t > 2.9) {
        if (this.phase === 'win') Game.endBattle(true, this.reward);
        else Game.endBattle(false);
      }
      return;
    }

    /* ------------------------------ fighting --------------------------- */
    // something you have to answer: everything else waits for it
    if (Skill.active) {
      Skill.update(dt);
      this._skillPose(dt);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
      return;
    }
    this.glare = Math.max(0, this.glare - dt * 2.2);
    this.parried = Math.max(0, this.parried - dt);
    this._updatePlayer(dt, false);
    this._updateMonster(dt);
    this._updateProjectiles(dt, true);

    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
  },

  /* ------------------------------- player ------------------------------ */

  _updatePlayer(dt, frozen) {
    const P = Player;
    if (!frozen) Status.tickPlayer(P, dt, dmg => this._poisonHit(dmg));
    P.invuln = Math.max(0, P.invuln - dt);
    P.rollCd = Math.max(0, P.rollCd - dt);
    P.healT = Math.max(0, P.healT - dt);
    P.animT = (P.animT || 0) + dt;

    const onGround = P.y >= DECK_Y - 0.01;

    // knockback slide
    if (P.knock !== 0) {
      P.x += P.knock * dt;
      P.knock = approach(P.knock, 0, 900 * dt);
    }

    if (!frozen && P.rollT > 0) {
      P.rollT -= dt;
      P.x += P.face * 470 * dt;
      P.bState = 'roll';
      if (P.rollT <= 0) { P.bState = 'idle'; }
    } else if (!frozen && P.attackT > 0) {
      P.attackT -= dt;
      const total = P.attackDur;
      const elapsed = total - P.attackT;
      // small forward step on the swing
      if (elapsed > .06 && elapsed < .2) P.x += P.face * 120 * dt;
      // active frames
      if (!P.attackDone && elapsed > total * .28 && elapsed < total * .62) {
        this._tryHit();
      }
      // buffer a follow-up
      if (Input.tap('attack') && elapsed > total * .45) P.comboBuffer = true;
      if (P.attackT <= 0) {
        const wasHeavy = P.heavy;
        P.heavy = false;
        if (P.comboBuffer && P.combo < 2 && !wasHeavy) { this._swing(P.combo + 1); }
        else { P.bState = 'idle'; P.combo = 0; P.comboBuffer = false; }
      }
    } else if (!frozen) {
      // free movement
      let mv = 0;
      if (Input.held('left')) mv -= 1;
      if (Input.held('right')) mv += 1;
      if (mv !== 0) { P.face = mv; P.bState = onGround ? 'walk' : 'jump'; }
      else P.bState = onGround ? 'idle' : 'jump';

      // still holding the attack key once a swing is over: winding up a heavy blow
      const w = deckWeapon();
      if (P.weapon >= 0 && Input.held('attack') && !Input.tap('attack')) {
        const need = chargeTime(w);
        P.chargeT += dt;
        P.bState = 'charge';
        if (P.chargeT >= need && !P.chargeReady) {
          P.chargeReady = true;
          Sfx.tone({ f: 660, f2: 990, dur: .16, type: 'triangle', vol: .12 });
          Particles.burst(P.x + P.face * 20, P.y - 70, 10, { color: '#ffe9a8', vx: rand(-120, 120), vy: rand(-140, 40), g: 200, size: rand(2, 4), life: .45 });
        } else if (!P.chargeReady && chance(dt * 30)) {
          const a = rand(0, 6.28);
          Particles.burst(P.x + P.face * 16 + Math.cos(a) * 46, P.y - 60 + Math.sin(a) * 40, 1, { color: 'rgba(255,233,168,.8)', vx: -Math.cos(a) * 90, vy: -Math.sin(a) * 90, g: 0, size: 2, life: .45 });
        }
      } else if (P.chargeT > 0) {
        const full = P.chargeT >= chargeTime(w);
        P.chargeT = 0; P.chargeReady = false;
        if (full) this._heavy();
      }
      P.x += mv * 250 * dt * (P.chargeT > 0 ? .35 : 1);

      if (Input.tap('jump') && onGround) {
        P.vy = -640; Sfx.whoosh();
        Particles.burst(P.x, DECK_Y, 5, { color: 'rgba(220,230,244,.7)', vy: -40, g: 400, size: 3, life: .35 });
      }
      if (Input.tap('attack') && P.weapon >= 0 && P.bState !== 'attack') this._swing(0);
      if (Input.tap('roll') && onGround && P.rollCd <= 0) {
        P.chargeT = 0; P.chargeReady = false;
        P.rollT = .34; P.rollCd = .62; P.invuln = Math.max(P.invuln, .30);
        Sfx.whoosh();
      }
      if (Input.tap('use') && P.bandages > 0 && P.hp < P.maxHp && P.healT <= 0) {
        P.bandages--; P.hp = Math.min(P.maxHp, P.hp + 2); P.healT = .5;
        Sfx.heal();
        if (Prefs.damageNumbers) Floaters.add(P.x, DECK_Y - 70, '+2', { color: '#8ce0a4', size: 22 });
        if (Status.cure(P)) Floaters.add(P.x, DECK_Y - 96, 'the sting is out', { color: '#b8f0a8', size: 16, life: 1 });
        Particles.burst(P.x, DECK_Y - 40, 12, { color: '#a8f0c0', vy: -90, g: 120, size: 3, life: .8 });
      }
    }

    // gravity
    P.vy += 1750 * dt;
    P.y += P.vy * dt;
    if (P.y >= DECK_Y) {
      if (P.vy > 260) {
        P.landT = .2;
        Particles.burst(P.x, DECK_Y, 6, { color: 'rgba(210,220,236,.6)', vx: rand(-90, 90), vy: -50, g: 400, size: 2.5, life: .34 });
      }
      P.y = DECK_Y; P.vy = 0;
    }
    P.landT = Math.max(0, (P.landT || 0) - dt);
    P.air = P.y - DECK_Y;
    P.x = clamp(P.x, this.arenaL, this.arenaR);

    // walk dust
    if (P.bState === 'walk' && chance(dt * 8)) {
      Particles.burst(P.x - P.face * 10, DECK_Y, 1, { color: 'rgba(190,170,140,.45)', vy: -22, g: 120, size: 2, life: .4 });
    }
  },

  // let go at full charge: the weapon's heavy blow
  _heavy() {
    const P = Player, w = deckWeapon(), hv = w.heavy || {};
    P.combo = 0;
    P.heavy = true;
    P.attackDur = .5 / (w.speed || 1);
    P.attackT = P.attackDur;
    P.attackDone = false;
    P.comboBuffer = false;
    P.bState = 'attack';
    // the lunge carries him forward on the same slide knockback uses
    if (hv.dash) P.knock = P.face * Math.sqrt(2 * 900 * hv.dash);
    Sfx.swing();
    Sfx.tone({ f: 110, f2: 55, dur: .34, type: 'sawtooth', vol: .15 });
    Cam.kick(4);
  },

  _swing(step) {
    const P = Player;
    const w = deckWeapon();
    P.heavy = false;
    P.combo = step;
    const base = w.style === 'chop' ? .44 : (w.style === 'thrust' ? .26 : .32);
    P.attackDur = (step === 2 ? base * 1.4 : base) / (w.speed || 1);
    P.attackT = P.attackDur;
    P.attackDone = false;
    P.comboBuffer = false;
    P.bState = 'attack';
    Sfx.swing();
    if (w.style === 'chop') Sfx.tone({ f: 150, f2: 90, dur: .18, type: 'triangle', vol: .12 });
  },

  _playerHitbox() {
    const P = Player;
    const w = deckWeapon();
    if (P.heavy) {
      const hv = w.heavy || {}, reach = 64 * w.reach * (hv.reach || 1.25);
      if (hv.both) return { x: P.x - reach, y: P.y - 110, w: reach * 2, h: 110 };
      return { x: P.face > 0 ? P.x + 6 : P.x - 6 - reach, y: P.y - 110, w: reach, h: 110 };
    }
    const reach = 64 * w.reach;
    let y, h;
    if (w.style === 'thrust') { y = P.y - 54; h = 34; }             // narrow, level
    else if (w.style === 'chop') { y = P.y - 96; h = 96; }           // tall, overhead
    else { y = P.y - 62 + (P.combo === 1 ? -10 : 0); h = P.combo === 2 ? 74 : 58; }
    return { x: P.face > 0 ? P.x + 6 : P.x - 6 - reach, y, w: reach, h };
  },

  _monsterHurtbox() {
    const m = this.m, L = this.len, gh = L * this.girth;
    return { x: m.x - L * .42, y: m.y - gh * 1.05, w: L * .84, h: gh * 2.1 };
  },

  _tryHit() {
    const m = this.m;
    if (m.state === 'dead') return;
    const hb = this._playerHitbox();
    if (!overlaps(hb, this._monsterHurtbox())) return;

    Player.attackDone = true;
    const sw = deckWeapon();
    const heavy = Player.heavy, hv = (heavy && sw.heavy) || null;
    const crit = (hv && hv.crit) || chance(.14);
    let dmg = Math.round(sw.dmg * rand(.88, 1.12) * (crit ? 1.75 : 1) * (Player.combo === 2 && !heavy ? 1.35 : 1) * (hv ? hv.mult : 1) * Bestiary.edge(this.def));
    if (m.state === 'recover') dmg = Math.round(dmg * (this.parried > 0 ? 1.8 : 1.35));
    const windingUp = m.state === 'tele' && m.atk !== 'roar';
    this.lastBlowHeavy = heavy;
    // one blow, whatever it is
    if (Player.excalibur) dmg = Math.max(dmg, m.hp);
    m.x += Player.face * 6 * (sw.knock || 1);
    m.hp -= dmg;
    m.flash = 1;
    m.hits++;
    this.hitstop = heavy ? .12 : crit ? .085 : .05;
    Cam.kick(heavy ? 10 : crit ? 6 : 3.2);
    Sfx.hit(); if (crit) Sfx.crit();
    if (hv && hv.pull) m.x -= Player.face * hv.pull;

    const hx = Player.x + Player.face * 60, hy = Player.y - 54;
    if (Prefs.damageNumbers) Floaters.add(hx, hy - 14, String(dmg), {
      color: crit ? '#ffd257' : '#fff', size: crit ? 30 : 22, life: .8
    });
    if (crit && Prefs.damageNumbers) Floaters.add(hx, hy - 40, 'CRIT', { color: '#ffb347', size: 16, life: .7 });

    Particles.burst(hx, hy, crit ? 16 : 10, {
      color: chance(.5) ? '#ffffff' : '#c4e6f2',
      vx: rand(-180, 180) + Player.face * 90, vy: rand(-200, 40), g: 760,
      size: rand(2, 6), life: rand(.3, .6), shape: 'streak'
    });
    Particles.burst(hx, hy, 6, {
      color: '#8e2c3a', vx: rand(-140, 140), vy: rand(-160, -20), g: 800, size: rand(3, 6), life: .7
    });

    // stagger
    m.x += Player.face * 10;

    if (m.hp <= 0) this._die();
    else {
      if (hv) {
        this._afflict({ dmg: sw.dmg, bleed: hv.bleed ? 1 : 0, stun: hv.stun ? 1 : 0, stunDur: hv.stun }, true);
        // caught mid wind-up, it loses the attack
        if (windingUp && !this._answering() && !Status.stunned(m)) {
          this._recover(.6);
          if (Prefs.damageNumbers) Floaters.add(m.x, m.y - this.len * this.girth - 50, 'INTERRUPTED', { color: '#f0cf6a', size: 16, life: .9 });
        }
        Particles.burst(hx, hy, 18, { color: sw.accent || '#ffe9a8', vx: rand(-260, 260), vy: rand(-260, 60), g: 600, size: rand(3, 7), life: rand(.4, .8) });
      } else this._afflict(sw, false);
      this._checkBossPhase();
    }
  },

  // bleeding and stunning, and saying so
  _afflict(w, heavy) {
    const m = this.m;
    if (this._answering()) return [];
    const got = Status.inflict(m, w, heavy);
    const x = m.x, y = m.y - this.len * this.girth - 24;
    if (got.includes('bleed') && Prefs.damageNumbers) Floaters.add(x - 30, y, 'BLEEDING', { color: '#ff6a6a', size: 15, life: .8 });
    if (got.includes('stun')) {
      if (Prefs.damageNumbers) Floaters.add(x + 30, y, 'STUNNED', { color: '#ffd257', size: 15, life: .8 });
      Sfx.tone({ f: 1300, f2: 900, dur: .22, type: 'triangle', vol: .09 });
    }
    return got;
  },

  // the Old One mid-skill-check is never knocked out of it
  _answering() { const s = this.m.state; return s === 'jaw' || s === 'breach' || s === 'drag'; },

  // a bleed tick: small, red, and it can finish a thing off
  _bleed(dmg) {
    const m = this.m;
    if (m.state === 'dead' || this.phase !== 'fight') return;
    m.hp -= dmg;
    m.flash = Math.max(m.flash, .45);
    if (Prefs.damageNumbers) Floaters.add(m.x + rand(-30, 30), m.y - 20, String(dmg), { color: '#ff7a7a', size: 16, life: .6 });
    Particles.burst(m.x + rand(-this.len * .3, this.len * .3), m.y + 10, 4, { color: '#8e2c3a', vx: rand(-40, 40), vy: rand(-40, 20), g: 800, size: rand(2, 4), life: .6 });
    if (m.hp <= 0) {
      if (typeof Achievements !== 'undefined') Achievements.event('bleedKill');
      this._die();
    } else this._checkBossPhase();
  },

  // poison running its course: one heart, no knockback
  _poisonHit(dmg) {
    const P = Player;
    if (this.phase !== 'fight') return;
    P.hp -= dmg;
    this.hurtTaken += dmg;
    Sfx.hurt();
    Game.hurtFlash = .6;
    if (Prefs.damageNumbers) Floaters.add(P.x, P.y - 70, '-' + dmg, { color: '#8ee07a', size: 22 });
    if (P.hp <= 0) {
      P.hp = 0;
      this.phase = 'lose';
      this.m.t = 0;
      this.banner = { text: 'YOU ARE DOWN', t: 0, dur: 3, color: '#ff6a6a' };
    }
  },

  _die() {
    const m = this.m;
    m.state = 'dead';
    m.flash = 1;
    this.phase = 'win';
    m.t = 0;
    Sfx.roar();
    Cam.kick(14);
    Particles.burst(m.x, m.y, 60, {
      color: chance(.5) ? '#ffe9a8' : '#ffffff',
      vx: rand(-320, 320), vy: rand(-420, -60), g: 640, size: rand(3, 9), life: rand(.7, 1.4)
    });
    const trophy = makeTrophy(this.def);
    this.reward = trophy;
    Player.catches.push(trophy);
    Player.kills[this.def.id] = (Player.kills[this.def.id] || 0) + 1;
    Player.totalKills++;
    Bestiary.landed(trophy);
    Bestiary.settle();
    if (Weather.raging()) Achievements.event('stormCatch');
    if (this.def.boss && this.hurtTaken === 0) Achievements.event('flawless');
    if (this.lastBlowHeavy && Player.attackDone && Player.heavy && typeof Achievements !== 'undefined') Achievements.event('heavyKill');
    this.banner = { text: 'DEFEATED', t: 0, dur: 3, color: '#8ce0a4' };
  },

  _hurtPlayer(dmg, fromX, force, o) {
    const P = Player;
    if ((P.invuln > 0 && !force) || this.phase !== 'fight') return;
    P.hp -= dmg;
    this.hurtTaken += dmg;
    if (o && o.poison && P.hp > 0 && Status.poison(P) && Prefs.damageNumbers) Floaters.add(P.x, P.y - 96, 'POISONED', { color: '#8ee07a', size: 18, life: 1 });
    P.invuln = 1.05;
    P.knock = (P.x < fromX ? -1 : 1) * 340;
    P.vy = -230;
    P.attackT = 0; P.rollT = 0;
    P.bState = 'hurt';
    Sfx.hurt();
    Cam.kick(7);
    this.hitstop = .07;
    Game.hurtFlash = 1;
    if (Prefs.damageNumbers) Floaters.add(P.x, P.y - 70, '-' + dmg, { color: '#ff7a7a', size: 24 });
    Particles.burst(P.x, P.y - 40, 12, { color: '#e2464c', vx: rand(-160, 160), vy: rand(-220, -40), g: 700, size: rand(2, 5), life: .6 });
    if (P.hp <= 0) {
      P.hp = 0;
      this.phase = 'lose';
      this.m.t = 0;
      this.banner = { text: 'YOU ARE DOWN', t: 0, dur: 3, color: '#ff6a6a' };
    }
  },

  /* ------------------------------- monster ----------------------------- */

  // which attacks are on the table right now
  _atkPool() {
    const d = this.def;
    if (!d.boss) return attacksOf(d);
    if (this.bossPhase >= 3) return ['lunge', 'sweep', 'spew', 'jaw', 'breach', 'drag'];
    if (this.bossPhase === 2) return ['lunge', 'slam', 'sweep', 'spew', 'jaw', 'breach'];
    return ['lunge', 'slam', 'spit', 'jaw'];
  },

  // what comes next: a boss never asks you to answer two things back to back
  _chooseAttack() {
    const pool = this._atkPool();
    if (!this.def.boss) return pickAttack(pool);
    const fresh = this.t - this.lastSkill > 6;
    const options = pool.filter(a => fresh || OLD_ONE_SKILLS.indexOf(a) < 0);
    return choice(options);
  },

  // the boss gets worse in two clear steps
  _checkBossPhase() {
    if (!this.def.boss) return;
    const f = this.m.hp / this.m.maxHp;
    const want = f < .32 ? 3 : (f < .66 ? 2 : 1);
    if (want <= this.bossPhase) return;
    this.bossPhase = want;
    this.rage = want >= 2;
    this.m.state = 'tele'; this.m.t = 0; this.m.atk = 'roar';
    Sfx.roar(); Cam.kick(14);
    this.banner = want === 2
      ? { text: 'IT STOPS PLAYING', t: 0, dur: 2.4, color: '#ff8a5a' }
      : { text: 'IT REMEMBERS YOUR FATHER', t: 0, dur: 2.8, color: '#ff4d4d' };
    Particles.burst(this.m.x, this.m.y, 60, {
      color: want === 3 ? '#ff4d4d' : '#ff9a5a',
      vx: rand(-400, 400), vy: rand(-360, 120), g: 320, size: rand(3, 9), life: rand(.8, 1.6)
    });
  },

  _recover(dur) { const m = this.m; m.state = 'recover'; m.t = 0; m.recDur = dur; },

  // where its mouth is, on the deck side
  _mouthX() { return this.m.x + this.m.face * this.len * .38; },

  _updateMonster(dt) {
    const m = this.m, d = this.def;
    m.t += dt;
    m.flash = Math.max(0, m.flash - dt * 4);
    Status.tick(m, dt, dmg => this._bleed(dmg));
    if (this.phase !== 'fight') return;
    if (Status.stunned(m) && !this._answering()) {
      // whatever it was about to do, it isn't now; it reels until the stars clear
      if (m.state !== 'recover') { m.state = 'recover'; m.recDur = .35; m.lure = 0; this.glare = 0; }
      m.t = 0;
      m.thrashAmt = .4; m.gape = .35;
      m.rot = Math.sin(this.t * 7) * .12;
      m.y = approach(m.y, this.restY + 10, dt * 150);
      return;
    }
    const rageMul = this.bossPhase >= 3 ? 1.7 : (this.rage ? 1.35 : 1);
    const restY = this.restY;
    const P = Player;
    const pb = { x: P.x - 13, y: P.y - 52, w: 26, h: 52 };

    // always face the player
    const wantFace = P.x < m.x ? -1 : 1;

    switch (m.state) {

      case 'idle': {
        m.face = wantFace;
        m.rot = approach(m.rot, Math.sin(m.t * 1.6) * .05, dt * 2);
        m.y = approach(m.y, restY + Math.sin(m.t * 2.2) * 8, dt * 90);
        m.gape = approach(m.gape, .12 + Math.sin(m.t * 3) * .1, dt * 2);
        m.thrashAmt = 1;
        // drift toward the player
        const dx = P.x - m.x;
        if (Math.abs(dx) > 190) m.x += sign(dx) * d.speed * .55 * rageMul * dt;
        else if (Math.abs(dx) < 120) m.x -= sign(dx) * d.speed * .4 * dt;
        m.cool -= dt * rageMul;
        if (m.cool <= 0) {
          m.atk = this._chooseAttack();
          m.state = 'tele'; m.t = 0;
          m.target = P.x;
        }
        break;
      }

      case 'tele': {
        m.face = wantFace;
        const base = { roar: 1.1, slam: .68, sweep: .78, coil: .62, lure: .95, grasp: .5, shell: .6, sting: .7, swoop: .5, gulp: .55, shards: .55, jaw: 1.0, breach: .9, drag: .8 }[m.atk] || .62;
        const dur = base / rageMul;
        const p = clamp(m.t / dur, 0, 1);
        m.thrashAmt = 1 + p * 2.2;
        m.gape = (m.atk === 'spit' || m.atk === 'spew' || m.atk === 'gulp' || m.atk === 'jaw') ? p * .95 : p * .5;
        if (m.atk === 'lunge') { m.x -= m.face * 70 * dt; m.rot = -m.face * p * .12; }
        if (m.atk === 'slam') { m.y = approach(m.y, restY - 140, dt * 320); m.rot = -m.face * p * .3; }
        if (m.atk === 'sweep') { m.y = approach(m.y, restY - 90, dt * 260); m.rot = approach(m.rot, -m.face * .4, dt * 3); }
        if (m.atk === 'roar') { m.y = approach(m.y, restY - 70, dt * 200); m.gape = .9; }
        if (m.atk === 'coil') { m.y = approach(m.y, restY + 24, dt * 160); m.thrashAmt = 3.2; }
        if (m.atk === 'sting' || m.atk === 'swoop') m.y = approach(m.y, restY - 110, dt * 260);
        if (m.atk === 'jaw') { m.y = approach(m.y, restY - 130, dt * 260); m.rot = -m.face * p * .35; }
        if (m.atk === 'breach') m.y = approach(m.y, DECK_Y + 260, dt * 520);
        if (m.atk === 'shards') m.rot = -m.face * p * .3;
        m.lure = m.atk === 'lure' ? p : 0;
        if (chance(dt * 24)) {
          Particles.burst(m.x + rand(-this.len / 3, this.len / 3), m.y + rand(-20, 26), 1,
            { color: 'rgba(255,120,120,.7)', vy: -60, g: -30, size: rand(2, 5), life: .5 });
        }
        if (p >= 1) {
          m.t = 0; m.shots = 0;
          m.target = P.x;
          m.state = m.atk;
          switch (m.atk) {
            case 'lunge': m.vx = m.face * (520 + d.speed * 1.9) * rageMul; Sfx.roar(); break;
            case 'slam': Sfx.whoosh(); break;
            case 'spew': Sfx.roar(); break;
            case 'sweep':
              m.sweepDir = (m.x > (this.arenaL + this.arenaR) / 2) ? -1 : 1;
              m.face = m.sweepDir;
              Sfx.roar(); Cam.kick(6);
              break;
            case 'coil':
              m.fromX = m.x;
              m.toX = clamp(P.x + m.face * 170, this.arenaL + 40, this.arenaR - 40);
              Sfx.whoosh();
              break;
            case 'lure': this.glare = 1; m.lureX = P.x; Sfx.tone({ f: 1400, f2: 2400, dur: .3, type: 'sine', vol: .14 }); break;
            case 'shell': m.vx = m.face * (560 + d.speed * 2) * rageMul; m.bounces = 0; Sfx.whoosh(); break;
            case 'sting': this._curtains(); break;
            case 'swoop': m.shadowX = P.x; Sfx.whoosh(); break;
            case 'gulp': Sfx.roar(); break;
            case 'jaw': this._skillJaw(); break;
            case 'breach': this._skillBreach(); break;
            case 'drag': this._skillDrag(); break;
            case 'roar': this._recover(.5); Sfx.roar(); Cam.kick(10); break;
          }
        }
        break;
      }

      case 'lunge': {
        m.x += m.vx * dt;
        m.rot = approach(m.rot, m.face * .06, dt * 3);
        m.gape = .85;
        m.thrashAmt = 3;
        m.y = approach(m.y, restY + 14, dt * 200);
        // the head is the danger, and it is low
        const hx = m.x + m.face * this.len * .34;
        const hb = { x: hx - 50, y: DECK_Y - 78, w: 100, h: 78 };
        if (overlaps(hb, pb)) this._hurtPlayer(d.dmg, m.x);
        if (chance(dt * 30)) {
          Particles.burst(hx, DECK_Y - 6, 1, { color: 'rgba(190,220,236,.6)', vx: -m.face * 160, vy: -60, g: 500, size: rand(2, 5), life: .4 });
        }
        if (m.t > .52 || m.x < this.arenaL - 40 || m.x > this.arenaR + 40) {
          this._recover(.85 / rageMul);
          m.x = clamp(m.x, this.arenaL - 20, this.arenaR + 20);
          Cam.kick(4);
        }
        break;
      }

      case 'slam': {
        m.x = approach(m.x, m.target, 620 * dt);
        m.y += 1500 * dt;
        m.rot = approach(m.rot, .18 * m.face, dt * 4);
        m.gape = .5;
        if (m.y >= restY + 30) {
          m.y = restY + 30;
          Sfx.thud(); Cam.kick(12);
          this.waves.push({ x: m.x, dir: -1, t: 0 });
          this.waves.push({ x: m.x, dir: 1, t: 0 });
          Particles.burst(m.x, DECK_Y, 34, {
            color: chance(.5) ? '#c8b48c' : '#9fd4e4',
            vx: rand(-380, 380), vy: rand(-420, -60), g: 900, size: rand(3, 7), life: rand(.4, .9)
          });
          const hb = { x: m.x - 110, y: DECK_Y - 90, w: 220, h: 90 };
          if (overlaps(hb, pb)) this._hurtPlayer(d.dmg + 1, m.x);
          this._recover(1.0 / rageMul);
        }
        break;
      }

      case 'spit': {
        m.gape = .95;
        m.face = wantFace;
        const every = .17;
        const want = Math.min(3, Math.floor(m.t / every) + 1);
        while (m.shots < want) {
          m.shots++;
          const hx = m.x + m.face * this.len * .36;
          const hy = m.y + 6;
          const dx = (P.x + rand(-70, 70)) - hx;
          this.globs.push({ x: hx, y: hy, vx: dx * 1.05, vy: -290 - Math.abs(dx) * .12, r: 12, t: 0 });
          Sfx.noise({ f: 900, f2: 200, dur: .16, vol: .16 });
          Particles.burst(hx, hy, 6, { color: '#9fd4e4', vx: m.face * rand(60, 200), vy: rand(-90, 20), g: 500, size: 3, life: .4 });
        }
        if (m.t > .62) this._recover(.78 / rageMul);
        break;
      }

      // it rears up and scythes the whole deck. jump it.
      case 'sweep': {
        const dir = m.sweepDir;
        m.x += dir * (620 + d.speed * 2.4) * rageMul * dt;
        m.y = approach(m.y, restY + 26, dt * 420);
        m.rot = approach(m.rot, dir * .1, dt * 4);
        m.gape = .6;
        m.thrashAmt = 3.4;
        const hb = { x: m.x - this.len * .5, y: DECK_Y - 52, w: this.len, h: 52 };
        if (overlaps(hb, { x: P.x - 13, y: P.y - 46, w: 26, h: 46 })) this._hurtPlayer(d.dmg, m.x);
        if (chance(dt * 40)) {
          Particles.burst(m.x + rand(-this.len / 2, this.len / 2), DECK_Y - 4, 1,
            { color: 'rgba(200,224,240,.6)', vx: -dir * 200, vy: -70, g: 500, size: rand(2, 5), life: .45 });
        }
        if ((dir > 0 && m.x > this.arenaR + 20) || (dir < 0 && m.x < this.arenaL - 20) || m.t > 1.5) {
          this._recover(.9 / rageMul);
          Cam.kick(6);
        }
        break;
      }

      // a wide barrage, aimed everywhere at once
      case 'spew': {
        m.gape = 1;
        m.face = wantFace;
        const every = .13;
        const want = Math.min(8, Math.floor(m.t / every) + 1);
        while (m.shots < want) {
          const k = m.shots++;
          const hx = m.x + m.face * this.len * .36;
          const hy = m.y + 6;
          const spread = (k / 7 - .5) * 2;
          const dx = (P.x - hx) + spread * 300;
          this.globs.push({ x: hx, y: hy, vx: dx * 1.0, vy: -330 - Math.abs(dx) * .1, r: 13, t: 0 });
          Sfx.noise({ f: 800, f2: 180, dur: .14, vol: .12 });
        }
        if (m.t > 1.2) this._recover(.8 / rageMul);
        break;
      }

      /* ----------------------- each body's own attack ----------------------- */

      // springs in a high arc over the boy and lashes down behind him
      case 'coil': {
        const dur = .85 / Math.sqrt(rageMul);
        const p = clamp(m.t / dur, 0, 1);
        m.x = lerp(m.fromX, m.toX, p);
        m.y = restY - Math.sin(p * Math.PI) * 230;
        m.rot = m.face * (p - .5) * 1.1;
        m.thrashAmt = 2.6; m.gape = .7;
        if (p > .55) {
          const hb = { x: m.x - this.len * .32, y: m.y - 30, w: this.len * .64, h: 60 };
          if (overlaps(hb, pb)) this._hurtPlayer(d.dmg, m.x);
        }
        if (p >= 1) {
          this.waves.push({ x: m.x, dir: -1, t: 0, life: .75 });
          this.waves.push({ x: m.x, dir: 1, t: 0, life: .75 });
          Sfx.thud(); Cam.kick(8);
          m.face = wantFace;
          this._recover(.8 / rageMul);
        }
        break;
      }

      // the lure flares in your eyes, and it lunges for where you stood
      case 'lure': {
        m.lure = Math.max(0, 1 - m.t * 3);
        const goal = m.lureX - m.face * this.len * .34;
        if (m.t > .12 && m.t < .42) {
          m.x = approach(m.x, goal, 2600 * dt);
          m.gape = .95; m.thrashAmt = 3;
          const hx = this._mouthX();
          if (overlaps({ x: hx - 55, y: DECK_Y - 90, w: 110, h: 90 }, pb)) this._hurtPlayer(d.dmg, m.x);
        }
        if (m.t > .65) this._recover(.9 / rageMul);
        break;
      }

      // arms burst up through the deck where you are standing, one after another
      case 'grasp': {
        const every = .55 / rageMul;
        const want = Math.min(3, Math.floor(m.t / every) + 1);
        while (m.shots < want) {
          m.shots++;
          this.spikes.push({ x: P.x, t: 0, warn: .45 / rageMul, up: .35 });
          Sfx.noise({ f: 300, f2: 80, dur: .2, vol: .12 });
        }
        m.gape = .4; m.thrashAmt = 2.4;
        if (m.t > every * 3 + .5) this._recover(.8 / rageMul);
        break;
      }

      // tucks into its shell and bowls across the deck: jump it
      case 'shell': {
        m.x += m.vx * dt;
        m.y = approach(m.y, DECK_Y - this.len * this.girth * .7, dt * 400);
        m.rot = Math.sin(m.t * 18) * .25;
        m.thrashAmt = 0; m.gape = 0;
        const hb = { x: m.x - this.len * .34, y: DECK_Y - 60, w: this.len * .68, h: 60 };
        if (overlaps(hb, pb)) this._hurtPlayer(d.dmg, m.x);
        if (chance(dt * 30)) Particles.burst(m.x - sign(m.vx) * this.len * .3, DECK_Y - 4, 1, { color: 'rgba(200,180,140,.6)', vx: -m.vx * .2, vy: -60, g: 500, size: rand(2, 4), life: .4 });
        if ((m.x < this.arenaL && m.vx < 0) || (m.x > this.arenaR && m.vx > 0)) {
          m.vx = -m.vx; m.bounces++; Cam.kick(6); Sfx.thud();
        }
        if (m.bounces >= 2 || m.t > 2.6) { m.face = wantFace; this._recover(1.0 / rageMul); }
        break;
      }

      // hangs overhead and lets down curtains of stingers: stand in the gap
      case 'sting': {
        m.y = approach(m.y, restY - 130, dt * 200);
        m.gape = .3; m.thrashAmt = 2;
        if (m.t > 1.7) this._recover(.8 / rageMul);
        break;
      }

      // up out of sight; its shadow finds you, stops, and then it comes down
      case 'swoop': {
        const rise = .5, track = 1.5 / Math.sqrt(rageMul), lock = track + .35, fall = lock + .28;
        if (m.t < rise) { m.y -= 1100 * dt; }
        else if (m.t < track) { m.y = -260; m.shadowX = approach(m.shadowX, P.x, 620 * dt); m.x = m.shadowX; }
        else if (m.t < lock) { m.y = -260; m.x = m.shadowX; }
        else if (m.t < fall) {
          m.y = lerp(-260, restY + 30, (m.t - lock) / (fall - lock));
          m.x = m.shadowX;
          const hb = { x: m.x - this.len * .36, y: DECK_Y - 100, w: this.len * .72, h: 100 };
          if (m.y > DECK_Y - 200 && overlaps(hb, pb)) this._hurtPlayer(d.dmg + 1, m.x);
        } else {
          m.y = restY + 30;
          Sfx.thud(); Cam.kick(12);
          this.waves.push({ x: m.x, dir: -1, t: 0, life: .6 });
          this.waves.push({ x: m.x, dir: 1, t: 0, life: .6 });
          this._recover(1.1 / rageMul);
        }
        m.rot = m.t > lock ? m.face * .4 : 0;
        m.thrashAmt = 2;
        break;
      }

      // breathes in the whole deck; walk against it or get swallowed
      case 'gulp': {
        const mx = this._mouthX();
        m.gape = 1; m.thrashAmt = 1.6;
        if (m.t < 1.4) {
          if (P.rollT <= 0) P.x += sign(mx - P.x) * 200 * rageMul * dt;
          if (chance(dt * 40)) Particles.burst(P.x + rand(-160, 160), DECK_Y - rand(10, 90), 1, { color: 'rgba(210,230,240,.6)', vx: sign(mx - P.x) * 420, vy: 0, g: 0, size: 2, life: .4 });
          if (Math.abs(P.x - mx) < 50) { this._hurtPlayer(d.dmg + 1, m.x); this._recover(.9 / rageMul); }
        } else if (m.t < 1.6) {
          if (overlaps({ x: mx - 50, y: DECK_Y - 100, w: 100, h: 100 }, pb)) this._hurtPlayer(d.dmg, m.x);
        } else this._recover(.9 / rageMul);
        break;
      }

      // flings splinters of bone that stick in the boards
      case 'shards': {
        const want = Math.min(5, Math.floor(m.t / .08) + 1);
        while (m.shots < want) {
          const k = m.shots++;
          const hx = this._mouthX(), hy = m.y - 10;
          const dx = (P.x - hx) + (k - 2) * 90;
          this.shards.push({ x: hx, y: hy, vx: dx * 1.1, vy: -360 - k * 20, t: 0, stuck: false });
          Sfx.noise({ f: 1400, f2: 500, dur: .08, vol: .1 });
        }
        m.gape = .8;
        if (m.t > .55) this._recover(.8 / rageMul);
        break;
      }

      /* ------------------- the Old One: things to answer ------------------- */

      case 'jaw': case 'breach': case 'drag':
        // held by the skill check; see _skillPose
        break;

      case 'recover': {
        m.face = wantFace;
        m.thrashAmt = approach(m.thrashAmt, .5, dt * 3);
        m.gape = approach(m.gape, .1, dt * 2);
        m.rot = approach(m.rot, 0, dt * 2.4);
        m.y = approach(m.y, restY, dt * 150);
        if (m.t > m.recDur) {
          m.state = 'idle'; m.t = 0;
          m.cool = (rand(.75, 1.45) + (4 - (d.depth || 4)) * .16) / rageMul;
        }
        break;
      }
    }

    if (m.state !== 'swoop') m.x = clamp(m.x, this.arenaL - 30, this.arenaR + 30);

    // dripping
    if (chance(dt * 10) && m.y > 0) {
      Particles.burst(m.x + rand(-this.len / 2, this.len / 2), m.y + this.len * .15, 1,
        { color: 'rgba(160,210,230,.7)', vx: 0, vy: 10, g: 600, size: 2.5, life: .6 });
    }
  },

  // four curtains of stingers across the deck, and one gap
  _curtains() {
    const n = 5, w = (this.arenaR - this.arenaL) / n;
    const safe = Math.floor(Math.random() * n);
    for (let i = 0; i < n; i++) {
      if (i === safe) continue;
      this.curtains.push({ x: this.arenaL + w * (i + .5), w: w * .86, t: 0, warn: .8, on: .55 });
    }
    Sfx.noise({ f: 2000, f2: 900, dur: .3, vol: .08 });
  },

  _updateHazards(dt, live) {
    const P = Player;
    const pb = { x: P.x - 13, y: P.y - 50, w: 26, h: 50 };
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const s = this.spikes[i];
      s.t += dt;
      if (live && s.t > s.warn && s.t < s.warn + s.up && overlaps({ x: s.x - 26, y: DECK_Y - 112, w: 52, h: 112 }, pb)) this._hurtPlayer(1, s.x);
      if (s.t > s.warn && s.t - dt <= s.warn) { Cam.kick(5); Sfx.thud(); Particles.burst(s.x, DECK_Y, 12, { color: '#b89a70', vx: rand(-200, 200), vy: rand(-300, -80), g: 800, size: rand(2, 5), life: .5 }); }
      if (s.t > s.warn + s.up + .25) this.spikes.splice(i, 1);
    }
    for (let i = this.curtains.length - 1; i >= 0; i--) {
      const c = this.curtains[i];
      c.t += dt;
      if (live && c.t > c.warn && c.t < c.warn + c.on && overlaps({ x: c.x - c.w / 2, y: 0, w: c.w, h: DECK_Y }, pb)) this._hurtPlayer(1, c.x, false, { poison: true });
      if (c.t > c.warn + c.on + .2) this.curtains.splice(i, 1);
    }
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.t += dt;
      if (!s.stuck) {
        s.vy += 900 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        if (live && overlaps({ x: s.x - 6, y: s.y - 6, w: 12, h: 12 }, pb)) { this._hurtPlayer(1, s.x); this.shards.splice(i, 1); continue; }
        if (s.y >= DECK_Y - 2) { s.y = DECK_Y - 2; s.stuck = true; s.t = 0; Sfx.noise({ f: 500, f2: 200, dur: .06, vol: .08 }); }
      } else {
        // stuck in the boards: don't stand on them
        if (live && P.y >= DECK_Y - 4 && Math.abs(P.x - s.x) < 12) this._hurtPlayer(1, s.x);
        if (s.t > 2.8) this.shards.splice(i, 1);
      }
    }
  },

  /* --------------------- the Old One's skill checks --------------------- */

  // its jaws come down on you: press as the ring closes, and you parry them
  _skillJaw() {
    const m = this.m;
    this.lastSkill = this.t;
    Skill.start({
      kind: 'ring', label: 'PARRY THE JAW', action: 'attack',
      count: this.bossPhase >= 3 ? 2 : 1, shrink: .95 / (this.rage ? 1.12 : 1), window: .12,
      at: () => ({ x: Player.x - Cam.x, y: Player.y - 64 })
    }, ok => {
      if (ok) {
        this.parried = 2.4;
        Achievements.event('parry');
        m.flash = 1; Cam.kick(12); Sfx.crit();
        if (Prefs.damageNumbers) Floaters.add(Player.x, Player.y - 90, 'PARRIED', { color: '#f0cf6a', size: 26, life: 1 });
        m.x -= m.face * 60;
        this._recover(2.4);
      } else {
        Cam.kick(14); Sfx.thud();
        this._hurtPlayer(this.def.dmg - 1, m.x, true);
        this._recover(.9);
      }
    });
  },

  // it goes under the boat and comes up through it: keep your feet
  _skillBreach() {
    const m = this.m;
    this.lastSkill = this.t;
    const keys = ['left', 'right', 'jump'];
    const seq = [];
    for (let i = 0; i < (this.bossPhase >= 3 ? 5 : 4); i++) {
      let k;
      do { k = choice(keys); } while (k === seq[seq.length - 1]);
      seq.push(k);
    }
    Skill.start({ kind: 'keys', label: 'KEEP YOUR FEET', seq, per: this.bossPhase >= 3 ? .72 : .85 }, ok => {
      m.y = this.restY + 40;
      m.x = clamp(Player.x + (Player.x < (this.arenaL + this.arenaR) / 2 ? 240 : -240), this.arenaL, this.arenaR);
      Particles.burst(m.x, DECK_Y, 50, { color: '#b7d8e6', vx: rand(-400, 400), vy: rand(-520, -120), g: 900, size: rand(3, 8), life: 1 });
      Cam.kick(16); Sfx.roar();
      if (ok) { m.flash = 1; this._recover(1.6); }
      else { this._hurtPlayer(this.def.dmg - 1, m.x, true); this._recover(.8); }
    });
  },

  // a barbel round your ankle, dragging you in: hold against it
  _skillDrag() {
    const m = this.m;
    this.lastSkill = this.t;
    const pull = m.x > Player.x ? 1 : -1;
    this.dragFrom = Player.x;
    Skill.start({
      kind: 'hold', label: 'PULL FREE', dur: this.bossPhase >= 3 ? 3.4 : 3,
      pull, strength: this.bossPhase >= 3 ? 2.7 : 2.3, keys: pull > 0 ? ['left', 'right'] : ['right', 'left']
    }, ok => {
      Player.x = this.dragFrom;
      if (ok) { m.flash = 1; Sfx.thud(); this.parried = 1.6; this._recover(1.8); }
      else { Player.x = this._mouthX() - m.face * 30; this._hurtPlayer(this.def.dmg - 1, m.x, true); this._recover(.9); }
    });
  },

  // what the boss looks like while you answer it
  _skillPose(dt) {
    const m = this.m, A = Skill.active;
    m.t += dt;
    m.flash = Math.max(0, m.flash - dt * 4);
    m.face = Player.x < m.x ? -1 : 1;
    if (m.state === 'jaw') { m.gape = .7 + Math.sin(m.t * 9) * .25; m.y = approach(m.y, this.restY - 110, dt * 120); m.thrashAmt = 2.4; }
    if (m.state === 'breach') { if (A && A.kind === 'keys' && chance(dt * 6)) Cam.kick(5); }
    if (m.state === 'drag') {
      m.gape = 1; m.thrashAmt = 2.8;
      if (A && A.kind === 'hold') Player.x = this.dragFrom + A.pos * A.pull * 70;
    }
    Player.bState = 'idle';
  },

  _drawHazards(g) {
    const camX = Cam.x, m = this.m;
    // arms about to come up through the boards
    for (const s of this.spikes) {
      const sx = snap(s.x - camX);
      if (s.t < s.warn) {
        g.fillStyle = 'rgba(40,20,20,' + (.4 + (s.t / s.warn) * .5) + ')';
        for (let k = -2; k <= 2; k++) g.fillRect(sx + k * 8 - 2, DECK_Y - 4 - Math.abs(k) * 2, 4, 6 + (2 - Math.abs(k)) * 2);
      } else {
        const p = clamp((s.t - s.warn) / .12, 0, 1) * clamp((s.warn + s.up + .25 - s.t) / .2, 0, 1);
        const h = snap(112 * p);
        const col = css(this.def.body);
        g.fillStyle = col; g.fillRect(sx - 12, DECK_Y - h, 24, h);
        g.fillStyle = css(shade(this.def.body, .25)); g.fillRect(sx - 12, DECK_Y - h, 6, h);
        g.fillStyle = css(this.def.belly || shade(this.def.body, .3));
        for (let y = DECK_Y - h + 10; y < DECK_Y - 6; y += 16) g.fillRect(sx + 6, y, 6, 6);
        g.fillStyle = col; g.fillRect(sx - 6, DECK_Y - h - 12, 12, 12);
      }
    }
    // curtains of stingers: first the drip, then the fall
    for (const c of this.curtains) {
      const x0 = snap(c.x - c.w / 2 - camX), w = snap(c.w);
      if (c.t < c.warn) {
        g.fillStyle = 'rgba(255,90,90,' + (.12 + Math.sin(c.t * 30) * .06) + ')';
        g.fillRect(x0, DECK_Y - 8, w, 8);
        g.fillStyle = css(this.def.glow ? hexRgb(this.def.glow) : [200, 220, 255], .7);
        for (let k = 0; k < 4; k++) g.fillRect(x0 + ((k * 37 + Math.floor(c.t * 60)) % w), snap((m.y + 40 + ((c.t * 300 + k * 50) % 200))), 2, 6);
      } else if (c.t < c.warn + c.on) {
        const col = this.def.glow ? hexRgb(this.def.glow) : [190, 200, 255];
        g.fillStyle = css(col, .28); g.fillRect(x0, 0, w, DECK_Y);
        g.fillStyle = css(col, .8);
        for (let x = x0 + 4; x < x0 + w; x += 10) g.fillRect(x, 0, 2, DECK_Y);
      }
    }
    // the ray's shadow, looking for you
    if (m.state === 'swoop' && m.t > .5) {
      const locked = m.t > 1.5;
      const r = this.len * .36;
      g.fillStyle = locked && Math.floor(this.t * 16) % 2 ? 'rgba(160,20,30,.55)' : 'rgba(0,0,0,.45)';
      g.fillRect(snap(m.shadowX - camX - r), DECK_Y - 6, snap(r * 2), 6);
      g.fillRect(snap(m.shadowX - camX - r * .7), DECK_Y - 10, snap(r * 1.4), 4);
    }
    // bone in the boards
    for (const s of this.shards) {
      const sx = snap(s.x - camX), sy = snap(s.y);
      g.fillStyle = '#e8dcc0';
      if (s.stuck) { g.fillRect(sx - 2, sy - 16, 4, 16); g.fillStyle = '#9a8a6a'; g.fillRect(sx, sy - 16, 2, 16); }
      else { g.fillRect(sx - 6, sy - 2, 12, 4); }
    }
    // the angler's lure, swelling before it goes off
    if (m.lure > 0 && this.def.plan === 'angler') {
      g.save();
      g.globalCompositeOperation = 'lighter';
      stepGlow(g, this._mouthX() - camX + m.face * 30, m.y - this.len * this.girth * 1.4, 20 + m.lure * 90, 'rgb(255,240,180)', .25 + m.lure * .45, { steps: 3 });
      g.restore();
    }
  },

  _updateProjectiles(dt, live) {
    // shockwaves
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt;
      w.x += w.dir * 430 * dt;
      if (live) {
        const hb = { x: w.x - 20, y: DECK_Y - 40, w: 40, h: 40 };
        const pb = { x: Player.x - 13, y: Player.y - 46, w: 26, h: 46 };
        if (overlaps(hb, pb)) this._hurtPlayer(1, w.x);
      }
      if (chance(dt * 40)) {
        Particles.burst(w.x, DECK_Y - 4, 1, { color: 'rgba(200,224,240,.7)', vy: -80, g: 500, size: 3, life: .35 });
      }
      if (w.t > (w.life || 1.7) || w.x < this.arenaL - 60 || w.x > this.arenaR + 60) this.waves.splice(i, 1);
    }
    this._updateHazards(dt, live);
    // globs
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const b = this.globs[i];
      b.t += dt;
      b.vy += 780 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (live) {
        const pb = { x: Player.x - 13, y: Player.y - 48, w: 26, h: 48 };
        if (overlaps({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }, pb)) {
          this._hurtPlayer(1, b.x);
          this.globs.splice(i, 1);
          continue;
        }
      }
      if (b.y > DECK_Y - 4) {
        Particles.burst(b.x, DECK_Y - 4, 10, {
          color: '#9fd4e4', vx: rand(-160, 160), vy: rand(-220, -40), g: 800, size: rand(2, 5), life: .5
        });
        Sfx.noise({ f: 600, f2: 140, dur: .18, vol: .12 });
        this.globs.splice(i, 1);
      }
    }
  },

  /* ------------------------------- drawing ----------------------------- */

  drawActors(g) {
    const m = this.m;
    const camX = Cam.x;

    // monster (world -> screen)
    g.save();
    const drawM = {
      x: m.x - camX, y: m.y, face: m.face, rot: m.rot, len: this.len,
      def: this.def, flash: m.flash, gape: m.gape, seed: m.seed, rage: this.rage,
      thrashSpeed: 5 + (this.rage ? 3 : 0), thrashAmt: m.thrashAmt
    };
    if (this.rage && this.phase === 'fight') {
      g.save();
      g.globalCompositeOperation = 'lighter';
      stepGlow(g, drawM.x, m.y, this.len * .7, 'rgb(255,60,60)', .18, { steps: 3 });
      g.restore();
    }
    Art.monster(g, drawM, this.t);
    g.restore();
    if (this.phase === 'fight') Status.drawIcons(g, m.x - camX, m.y - this.len * this.girth - 40, m.fx, this.t);

    // telegraph marker
    if (m.state === 'tele' && this.phase === 'fight') {
      const a = .35 + Math.sin(this.t * 26) * .25;
      g.save();
      g.globalAlpha = a;
      Text.draw(g, '!', m.x - camX + m.face * this.len * .3, m.y - this.len * .34, {
        size: 44, align: 'center', color: '#ff5a5a', weight: 'bold',
        outline: 'rgba(0,0,0,.7)', outlineW: 5
      });
      g.restore();
      if (m.atk === 'slam') {
        g.save();
        g.globalAlpha = .25 + Math.sin(this.t * 20) * .12;
        g.fillStyle = '#ff5a5a';
        g.fillRect(m.target - camX - 110, DECK_Y - 6, 220, 6);
        g.restore();
      }
    }

    // shockwaves
    for (const w of this.waves) {
      const sx = w.x - camX;
      g.save();
      g.globalAlpha = clamp(1 - w.t / 1.7, 0, 1);
      g.strokeStyle = '#bfe0f0'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(sx - w.dir * 26, DECK_Y);
      g.quadraticCurveTo(sx, DECK_Y - 40 - Math.sin(w.t * 20) * 5, sx + w.dir * 20, DECK_Y - 2);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(sx - w.dir * 16, DECK_Y);
      g.quadraticCurveTo(sx + w.dir * 4, DECK_Y - 26, sx + w.dir * 16, DECK_Y - 2);
      g.stroke();
      g.restore();
    }

    // globs
    for (const b of this.globs) {
      const sx = b.x - camX;
      g.save();
      g.fillStyle = 'rgba(120,200,224,.9)';
      g.beginPath();
      g.ellipse(sx, b.y, b.r * 1.12, b.r * .88, Math.atan2(b.vy, b.vx), 0, 6.2832);
      g.fill();
      g.fillStyle = 'rgba(230,248,255,.6)';
      g.beginPath(); g.arc(sx - 3, b.y - 3, b.r * .32, 0, 6.2832); g.fill();
      g.strokeStyle = 'rgba(60,130,160,.8)'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(sx, b.y, b.r * 1.12, b.r * .88, Math.atan2(b.vy, b.vx), 0, 6.2832); g.stroke();
      g.restore();
    }

    this._drawHazards(g);

    // the player
    this.drawPlayer(g);
  },

  drawPlayer(g) {
    const P = Player;
    const sx = P.x - Cam.x;
    const blink = P.invuln > 0 && Math.floor(P.invuln * 22) % 2 === 0;
    g.save();
    if (blink) g.globalAlpha = .4;

    const w = deckWeapon();
    const o = {
      face: P.face, t: P.animT, state: P.bState === 'attack' ? 'idle' : P.bState, squash: bodySquash(P),
      air: -P.air, rollT: P.rollT > 0 ? (.34 - P.rollT) : 0,
      hold: P.weapon >= 0 ? 'weapon' : null, weapon: w
    };

    if (P.bState === 'charge') {
      const k = clamp(P.chargeT / chargeTime(w), 0, 1), shake = k >= 1 ? Math.sin(P.animT * 60) * .05 : 0;
      o.state = 'idle';
      o.weaponAngle = lerp(-1.15, w.style === 'thrust' ? -.6 : -2.6, easeOut(k)) + shake;
      o.frontArm = lerp(.35, w.style === 'thrust' ? -.9 : -1.9, easeOut(k));
      o.lunge = w.style === 'thrust' ? -6 * k : 0;
    } else if (P.bState === 'attack' && P.heavy) {
      const total = P.attackDur, e = (total - P.attackT) / total;
      o.swingP = e;
      const hv = w.heavy || {};
      if (w.style === 'thrust') {
        o.weaponAngle = -.1; o.frontArm = .05;
        o.lunge = ease(clamp(e / .3, 0, 1)) * 20;
      } else if (hv.both) {
        o.weaponAngle = -2.4 + ease(clamp(e / .8, 0, 1)) * 6.8;
        o.frontArm = -1.4 + ease(clamp(e / .8, 0, 1)) * 2.4;
      } else {
        const k = ease(clamp(e / .55, 0, 1));
        o.weaponAngle = lerp(-2.9, 1.5, k);
        o.frontArm = lerp(-2.1, 1.1, k);
      }
    } else if (P.bState === 'attack') {
      const total = P.attackDur, e = (total - P.attackT) / total;
      o.swingP = e;
      if (w.style === 'thrust') {
        // wind back, then drive it straight forward
        const k = e < .3 ? -.5 * (1 - e / .3) : 0;
        o.weaponAngle = -.15 + k;
        o.frontArm = -.05 + k * 1.4;
        o.lunge = e > .3 ? ease(clamp((e - .3) / .25, 0, 1)) * 14 : 0;
      } else if (w.style === 'chop') {
        const k = easeOut(clamp(e / .62, 0, 1));
        o.weaponAngle = lerp(-2.7, 1.35, k);
        o.frontArm = lerp(-1.9, 1.0, k);
      } else if (P.combo === 1) {
        o.weaponAngle = lerp(1.2, -1.9, easeOut(e));
        o.frontArm = lerp(.7, -1.2, easeOut(e));
      } else if (P.combo === 2) {
        o.weaponAngle = lerp(-2.2, 3.4, ease(e));
        o.frontArm = lerp(-.9, 1.4, ease(e));
      } else {
        o.weaponAngle = lerp(-2.3, 1.0, easeOut(e));
        o.frontArm = lerp(-1.3, .8, easeOut(e));
      }
    } else if (P.bState === 'hurt') {
      o.frontArm = -1.4; o.weaponAngle = -1.9;
    }

    Art.boy(g, sx, P.y, o);
    if (Status.poisoned(P)) Status.drawPoison(g, sx, P.y, P.animT);

    // the trail the weapon leaves
    if (P.bState === 'attack' && P.weapon >= 0) {
      const total = P.attackDur, e = (total - P.attackT) / total;
      if (e > .14 && e < .76) {
        const a = clamp(1 - (e - .14) / .6, 0, 1);
        const R = 64 * w.reach;
        g.save();
        g.translate(sx + P.face * 8, P.y - 34);
        g.scale(P.face, 1);
        g.strokeStyle = w.metal;
        g.lineCap = 'round';

        if (w.style === 'thrust') {
          // a spear of motion blur rather than an arc
          g.globalAlpha = a * .55;
          g.lineWidth = 5 * a + 1;
          g.beginPath();
          g.moveTo(10, 12); g.lineTo(R * 1.15, 10);
          g.stroke();
          g.globalAlpha = a * .22;
          g.lineWidth = 14 * a;
          g.beginPath();
          g.moveTo(16, 12); g.lineTo(R * 1.02, 10);
          g.stroke();
        } else {
          const chop = w.style === 'chop';
          const base = chop ? -2.5 : (P.combo === 1 ? 1.1 : -2.2);
          const span = chop ? 3.7 : (P.combo === 1 ? -2.8 : 3.1);
          const mid = base + span * ease(clamp((e - .14) / .44, 0, 1));
          const wide = chop ? .55 : .75;
          g.globalAlpha = a * .8;
          if (P.heavy) g.strokeStyle = w.accent || w.metal;
          g.lineWidth = (chop || P.heavy ? 12 : 7) * a + 2;
          g.beginPath(); g.arc(0, 16, R, mid - wide, mid + wide); g.stroke();
          g.globalAlpha = a * .32;
          g.lineWidth = (chop ? 22 : 16) * a;
          g.beginPath(); g.arc(0, 16, R * .82, mid - wide * .8, mid + wide * .8); g.stroke();
        }
        g.lineCap = 'butt';
        g.restore();
      }
    }
    // how charged the heavy blow is: a row of pips over his head
    if (P.bState === 'charge') {
      const k = clamp(P.chargeT / chargeTime(w), 0, 1), full = k >= 1;
      const pips = 6, bx = snap(sx - pips * 5), by = snap(P.y - 118);
      for (let i = 0; i < pips; i++) {
        g.fillStyle = (i + 1) / pips <= k + .001 ? (full && Math.sin(P.animT * 30) > 0 ? '#fff6d0' : '#f0cf6a') : 'rgba(20,16,12,.6)';
        g.fillRect(bx + i * 10, by, 8, 6);
      }
      if (full) Text.draw(g, (w.heavy ? w.heavy.name : 'Heavy').toUpperCase(), sx, by - 8, { size: 12, align: 'center', color: '#f0cf6a', outline: 'rgba(0,0,0,.7)', outlineW: 3 });
    }
    g.restore();
  },

  drawUI(g) {
    const m = this.m;

    // the angler's lure going off in your eyes
    if (this.glare > 0) {
      g.fillStyle = 'rgba(255,250,228,' + (this.glare * .85).toFixed(3) + ')';
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    Skill.draw(g);

    /* monster health */
    if (this.phase !== 'lose') {
      const bw = 520, bx = VIEW_W / 2 - bw / 2, by = 74;
      panel(g, bx - 12, by - 30, bw + 24, 52, { alpha: .82 });
      Text.draw(g, this.def.name.toUpperCase(), VIEW_W / 2, by - 10, {
        size: 16, align: 'center', color: this.rage ? '#ff8a8a' : '#f0cf8a',
        weight: 'bold', font: 'Verdana, sans-serif'
      });
      g.fillStyle = 'rgba(0,0,0,.55)';
      roundRect(g, bx, by, bw, 12, 5); g.fill();
      const p = clamp(m.hp / m.maxHp, 0, 1);
      const hg = g.createLinearGradient(bx, 0, bx + bw, 0);
      if (this.rage) { hg.addColorStop(0, '#ff5a5a'); hg.addColorStop(1, '#a02020'); }
      else { hg.addColorStop(0, '#e2645c'); hg.addColorStop(1, '#8e2c3a'); }
      g.fillStyle = hg;
      roundRect(g, bx, by, bw * p, 12, 5); g.fill();
      // the two places where it gets worse
      if (this.def.boss) {
        g.fillStyle = 'rgba(12,10,18,.85)';
        for (const f of [.32, .66]) g.fillRect(bx + bw * f - 1.5, by, 3, 12);
      }
      g.strokeStyle = '#c8a45c'; g.lineWidth = 3;
      roundRect(g, bx, by, bw, 12, 5); g.stroke();
      if (this.def.boss && this.bossPhase > 1) {
        Text.draw(g, 'PHASE ' + this.bossPhase, VIEW_W / 2 + bw / 2 + 4, by + 11, {
          size: 11, align: 'left', color: this.bossPhase >= 3 ? '#ff5a5a' : '#ff9a6a',
          weight: 'bold', font: 'Verdana, sans-serif'
        });
      }
    }

    /* banner */
    if (this.banner) {
      const b = this.banner;
      const p = b.t / b.dur;
      const a = clamp(Math.min(p * 6, (1 - p) * 4), 0, 1);
      g.save(); g.globalAlpha = a;
      Text.draw(g, b.text, VIEW_W / 2, 210, {
        size: 52, align: 'center', color: b.color, weight: 'bold',
        font: 'Georgia, serif', outline: 'rgba(0,0,0,.8)', outlineW: 7
      });
      g.restore();
    }

    /* intro name card */
    if (this.phase === 'intro') {
      const a = clamp(Math.min(this.t * 2, (2.6 - this.t) * 2), 0, 1);
      g.save(); g.globalAlpha = a;
      Text.draw(g, this.def.name, VIEW_W / 2, 190, {
        size: 46, align: 'center', color: '#f2e2bd', weight: 'bold',
        font: 'Georgia, serif', outline: 'rgba(0,0,0,.85)', outlineW: 6
      });
      Text.draw(g, this.def.flavour, VIEW_W / 2, 222, {
        size: 19, align: 'center', color: '#b9c4dd', italic: true,
        font: 'Georgia, serif', outline: 'rgba(0,0,0,.7)', outlineW: 4
      });
      g.restore();
    }

    /* reward card */
    if (this.phase === 'win' && this.reward && this.m.t > .8) {
      const a = clamp((this.m.t - .8) * 2, 0, 1);
      const w = 420, x = VIEW_W / 2 - w / 2, y = 250;
      g.save(); g.globalAlpha = a;
      panel(g, x, y, w, 96, { alpha: .95 });
      Art.fishIcon(g, x + 54, y + 48, 2.0, this.reward.body, this.reward.belly);
      Text.draw(g, this.reward.name, x + 104, y + 36, { size: 21, color: '#f2e2bd', weight: 'bold' });
      Text.draw(g, this.reward.weight + ' lb — worth about ', x + 104, y + 62, { size: 15, color: '#a8b4cf', font: 'Verdana, sans-serif' });
      const ww = Text.width(g, this.reward.weight + ' lb — worth about ', { size: 15, font: 'Verdana, sans-serif' });
      Text.draw(g, this.reward.value + '§', x + 104 + ww, y + 62, { size: 15, color: '#f0cf8a', weight: 'bold', font: 'Verdana, sans-serif' });
      Text.draw(g, 'Sell it to Dorran at the stall.', x + 104, y + 82, { size: 13, color: '#8d97b4', italic: true });
      g.restore();
    }

    /* lose card */
    if (this.phase === 'lose' && this.m.t > .9) {
      const a = clamp((this.m.t - .9) * 2, 0, 1);
      g.save(); g.globalAlpha = a;
      Text.draw(g, 'It slips back over the rail.', VIEW_W / 2, 280, {
        size: 22, align: 'center', color: '#b9c4dd', italic: true,
        outline: 'rgba(0,0,0,.7)', outlineW: 4
      });
      g.restore();
    }

    /* controls reminder */
    if (this.phase === 'fight' && this.t < 7) {
      const a = clamp(Math.min(this.t, 7 - this.t), 0, 1) * .8;
      Text.draw(g, '[J] swing, hold for a heavy blow   [K] roll   [SPACE] jump   [Q] bandage', VIEW_W / 2, VIEW_H - 92, {
        size: 14, align: 'center', color: 'rgba(210,220,244,' + a + ')', font: 'Verdana, sans-serif'
      });
    }
  }
};
