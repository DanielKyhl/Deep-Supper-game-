'use strict';
/* ========================================================================
   battle.js — you versus the thing on the end of your line
   ======================================================================== */

const Battle = {
  def: null, m: null, phase: 'intro', t: 0,
  arenaL: 0, arenaR: 0,
  waves: [], globs: [],
  hitstop: 0, banner: null, reward: null,
  rage: false,

  start(def) {
    this.def = def;
    this.phase = 'intro';
    this.t = 0;
    this.waves.length = 0;
    this.globs.length = 0;
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
    Player.rollT = 0; Player.rollCd = 0;
    Player.invuln = 0; Player.knock = 0; Player.healT = 0;

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
        if (P.comboBuffer && P.combo < 2) { this._swing(P.combo + 1); }
        else { P.bState = 'idle'; P.combo = 0; P.comboBuffer = false; }
      }
    } else if (!frozen) {
      // free movement
      let mv = 0;
      if (Input.held('left')) mv -= 1;
      if (Input.held('right')) mv += 1;
      if (mv !== 0) { P.face = mv; P.bState = onGround ? 'walk' : 'jump'; }
      else P.bState = onGround ? 'idle' : 'jump';
      P.x += mv * 250 * dt;

      if (Input.tap('jump') && onGround) {
        P.vy = -640; Sfx.whoosh();
        Particles.burst(P.x, DECK_Y, 5, { color: 'rgba(220,230,244,.7)', vy: -40, g: 400, size: 3, life: .35 });
      }
      if (Input.tap('attack') && P.weapon >= 0) this._swing(0);
      if (Input.tap('roll') && onGround && P.rollCd <= 0) {
        P.rollT = .34; P.rollCd = .62; P.invuln = Math.max(P.invuln, .30);
        Sfx.whoosh();
      }
      if (Input.tap('use') && P.bandages > 0 && P.hp < P.maxHp && P.healT <= 0) {
        P.bandages--; P.hp = Math.min(P.maxHp, P.hp + 2); P.healT = .5;
        Sfx.heal();
        if (Prefs.damageNumbers) Floaters.add(P.x, DECK_Y - 70, '+2', { color: '#8ce0a4', size: 22 });
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

  _swing(step) {
    const P = Player;
    const w = WEAPONS[Math.max(0, P.weapon)];
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
    const w = WEAPONS[Math.max(0, P.weapon)];
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
    const sw = WEAPONS[Math.max(0, Player.weapon)];
    const crit = chance(.14);
    let dmg = Math.round(sw.dmg * rand(.88, 1.12) * (crit ? 1.75 : 1) * (Player.combo === 2 ? 1.35 : 1));
    if (m.state === 'recover') dmg = Math.round(dmg * 1.35);
    m.x += Player.face * 6 * (sw.knock || 1);
    m.hp -= dmg;
    m.flash = 1;
    m.hits++;
    this.hitstop = crit ? .085 : .05;
    Cam.kick(crit ? 6 : 3.2);
    Sfx.hit(); if (crit) Sfx.crit();

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
    else this._checkBossPhase();
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
    this.banner = { text: 'DEFEATED', t: 0, dur: 3, color: '#8ce0a4' };
  },

  _hurtPlayer(dmg, fromX) {
    const P = Player;
    if (P.invuln > 0 || this.phase !== 'fight') return;
    P.hp -= dmg;
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
    if (!d.boss) return d.atk;
    if (this.bossPhase >= 3) return ['lunge', 'slam', 'sweep', 'spew', 'lunge', 'sweep', 'slam', 'spew'];
    if (this.bossPhase === 2) return ['lunge', 'slam', 'spit', 'sweep', 'lunge', 'spew'];
    return ['lunge', 'slam', 'spit', 'lunge'];
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

  _updateMonster(dt) {
    const m = this.m, d = this.def;
    m.t += dt;
    m.flash = Math.max(0, m.flash - dt * 4);
    const rageMul = this.bossPhase >= 3 ? 1.7 : (this.rage ? 1.35 : 1);
    const restY = this.restY;

    // always face the player
    const wantFace = Player.x < m.x ? -1 : 1;

    switch (m.state) {

      case 'idle': {
        m.face = wantFace;
        m.rot = approach(m.rot, Math.sin(m.t * 1.6) * .05, dt * 2);
        m.y = approach(m.y, restY + Math.sin(m.t * 2.2) * 8, dt * 90);
        m.gape = approach(m.gape, .12 + Math.sin(m.t * 3) * .1, dt * 2);
        m.thrashAmt = 1;
        // drift toward the player
        const dx = Player.x - m.x;
        if (Math.abs(dx) > 190) m.x += sign(dx) * d.speed * .55 * rageMul * dt;
        else if (Math.abs(dx) < 120) m.x -= sign(dx) * d.speed * .4 * dt;
        m.cool -= dt * rageMul;
        if (m.cool <= 0) {
          m.atk = choice(this._atkPool());
          m.state = 'tele'; m.t = 0;
          m.target = Player.x;
        }
        break;
      }

      case 'tele': {
        m.face = wantFace;
        const dur = (m.atk === 'roar' ? 1.1 : (m.atk === 'slam' ? .68 :
                    (m.atk === 'sweep' ? .78 : .62))) / rageMul;
        const p = clamp(m.t / dur, 0, 1);
        m.thrashAmt = 1 + p * 2.2;
        m.gape = (m.atk === 'spit' || m.atk === 'spew') ? p * .95 : p * .5;
        if (m.atk === 'lunge') { m.x -= m.face * 70 * dt; m.rot = -m.face * p * .12; }
        if (m.atk === 'slam') { m.y = approach(m.y, restY - 140, dt * 320); m.rot = -m.face * p * .3; }
        if (m.atk === 'sweep') { m.y = approach(m.y, restY - 90, dt * 260); m.rot = approach(m.rot, -m.face * .4, dt * 3); }
        if (m.atk === 'roar') { m.y = approach(m.y, restY - 70, dt * 200); m.gape = .9; }
        if (chance(dt * 24)) {
          Particles.burst(m.x + rand(-this.len / 3, this.len / 3), m.y + rand(-20, 26), 1,
            { color: 'rgba(255,120,120,.7)', vy: -60, g: -30, size: rand(2, 5), life: .5 });
        }
        if (p >= 1) {
          m.t = 0;
          m.target = Player.x;
          if (m.atk === 'lunge') { m.state = 'lunge'; m.vx = m.face * (520 + d.speed * 1.9) * rageMul; Sfx.roar(); }
          else if (m.atk === 'slam') { m.state = 'slam'; Sfx.whoosh(); }
          else if (m.atk === 'spit') { m.state = 'spit'; m.shots = 0; }
          else if (m.atk === 'spew') { m.state = 'spew'; m.shots = 0; Sfx.roar(); }
          else if (m.atk === 'sweep') {
            m.state = 'sweep';
            m.sweepDir = (m.x > (this.arenaL + this.arenaR) / 2) ? -1 : 1;
            m.face = m.sweepDir;
            Sfx.roar(); Cam.kick(6);
          } else { m.state = 'recover'; m.recDur = .5; Sfx.roar(); Cam.kick(10); }
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
        const pb = { x: Player.x - 13, y: Player.y - 52, w: 26, h: 52 };
        if (overlaps(hb, pb)) this._hurtPlayer(d.dmg, m.x);
        if (chance(dt * 30)) {
          Particles.burst(hx, DECK_Y - 6, 1, { color: 'rgba(190,220,236,.6)', vx: -m.face * 160, vy: -60, g: 500, size: rand(2, 5), life: .4 });
        }
        if (m.t > .52 || m.x < this.arenaL - 40 || m.x > this.arenaR + 40) {
          m.state = 'recover'; m.t = 0; m.recDur = .85 / rageMul;
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
          const pb = { x: Player.x - 13, y: Player.y - 52, w: 26, h: 52 };
          if (overlaps(hb, pb)) this._hurtPlayer(d.dmg + 1, m.x);
          m.state = 'recover'; m.t = 0; m.recDur = 1.0 / rageMul;
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
          const dx = (Player.x + rand(-70, 70)) - hx;
          this.globs.push({
            x: hx, y: hy,
            vx: dx * 1.05, vy: -290 - Math.abs(dx) * .12,
            r: 12, t: 0
          });
          Sfx.noise({ f: 900, f2: 200, dur: .16, vol: .16 });
          Particles.burst(hx, hy, 6, { color: '#9fd4e4', vx: m.face * rand(60, 200), vy: rand(-90, 20), g: 500, size: 3, life: .4 });
        }
        if (m.t > .62) { m.state = 'recover'; m.t = 0; m.recDur = .78 / rageMul; }
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
        const pb = { x: Player.x - 13, y: Player.y - 46, w: 26, h: 46 };
        if (overlaps(hb, pb)) this._hurtPlayer(d.dmg, m.x);
        if (chance(dt * 40)) {
          Particles.burst(m.x + rand(-this.len / 2, this.len / 2), DECK_Y - 4, 1,
            { color: 'rgba(200,224,240,.6)', vx: -dir * 200, vy: -70, g: 500, size: rand(2, 5), life: .45 });
        }
        if ((dir > 0 && m.x > this.arenaR + 20) || (dir < 0 && m.x < this.arenaL - 20) || m.t > 1.5) {
          m.state = 'recover'; m.t = 0; m.recDur = .9 / rageMul;
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
          const dx = (Player.x - hx) + spread * 300;
          this.globs.push({
            x: hx, y: hy, vx: dx * 1.0,
            vy: -330 - Math.abs(dx) * .1, r: 13, t: 0
          });
          Sfx.noise({ f: 800, f2: 180, dur: .14, vol: .12 });
        }
        if (m.t > 1.2) { m.state = 'recover'; m.t = 0; m.recDur = .8 / rageMul; }
        break;
      }

      case 'recover': {
        m.face = wantFace;
        m.thrashAmt = approach(m.thrashAmt, .5, dt * 3);
        m.gape = approach(m.gape, .1, dt * 2);
        m.rot = approach(m.rot, 0, dt * 2.4);
        m.y = approach(m.y, restY, dt * 150);
        if (m.t > m.recDur) {
          m.state = 'idle'; m.t = 0;
          m.cool = (rand(.75, 1.45) + (4 - d.depth) * .16) / rageMul;
        }
        break;
      }
    }

    m.x = clamp(m.x, this.arenaL - 30, this.arenaR + 30);

    // dripping
    if (chance(dt * 10)) {
      Particles.burst(m.x + rand(-this.len / 2, this.len / 2), m.y + this.len * .15, 1,
        { color: 'rgba(160,210,230,.7)', vx: 0, vy: 10, g: 600, size: 2.5, life: .6 });
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
      if (w.t > 1.7 || w.x < this.arenaL - 60 || w.x > this.arenaR + 60) this.waves.splice(i, 1);
    }
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

    // the player
    this.drawPlayer(g);
  },

  drawPlayer(g) {
    const P = Player;
    const sx = P.x - Cam.x;
    const blink = P.invuln > 0 && Math.floor(P.invuln * 22) % 2 === 0;
    g.save();
    if (blink) g.globalAlpha = .4;

    const w = WEAPONS[Math.max(0, P.weapon)];
    const o = {
      face: P.face, t: P.animT, state: P.bState === 'attack' ? 'idle' : P.bState, squash: bodySquash(P),
      air: -P.air, rollT: P.rollT > 0 ? (.34 - P.rollT) : 0,
      hold: P.weapon >= 0 ? 'weapon' : null, weapon: w
    };

    if (P.bState === 'attack') {
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
          g.lineWidth = (chop ? 10 : 7) * a + 2;
          g.beginPath(); g.arc(0, 16, R, mid - wide, mid + wide); g.stroke();
          g.globalAlpha = a * .32;
          g.lineWidth = (chop ? 22 : 16) * a;
          g.beginPath(); g.arc(0, 16, R * .82, mid - wide * .8, mid + wide * .8); g.stroke();
        }
        g.lineCap = 'butt';
        g.restore();
      }
    }
    g.restore();
  },

  drawUI(g) {
    const m = this.m;

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
      Text.draw(g, '[J] swing   [K] roll   [SPACE] jump   [Q] bandage', VIEW_W / 2, VIEW_H - 92, {
        size: 14, align: 'center', color: 'rgba(210,220,244,' + a + ')', font: 'Verdana, sans-serif'
      });
    }
  }
};
