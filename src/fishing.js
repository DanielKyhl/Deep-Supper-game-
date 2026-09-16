'use strict';
/* ========================================================================
   fishing.js — cast, sink, wait in the dark, hook, and haul
   ======================================================================== */

const FISH_X = 1700;   // where the boy stands to fish (world x)

// how far each rod can put a hook down, in pixels of water
const ROD_DEPTH = [280, 520, 820, 1220];

const Fishing = {
  phase: 'cast',   // cast | sink | deep | bite | reel | ambush | pull | junk | fail
  t: 0,
  hook: { x: 0, depth: 0, vy: 0, tug: 0 },
  targetDepth: 280,
  waitFor: 2,
  target: null,
  msg: '',
  intro: false,          // this cast is the scripted first catch
  eaten: false, warned: false, ambushFrom: -1, yankFrom: 0,
  shapes: [], watcher: { x: 480, depth: 0, a: 0, want: 0 },
  // reel minigame
  fy: .5, fvy: 0, fTarget: .5, fTimer: 0, fSpeed: .3,
  by: .7, bvy: 0, barFrac: .3,
  prog: .32, tension: 0, shake: 0,

  start() {
    const rod = RODS[Player.rod];
    this.phase = 'cast';
    this.t = 0;
    this.msg = '';
    this.target = null;
    this.intro = (Player.totalKills === 0 && !Player.introDone);
    this.eaten = false;
    this.warned = false;
    // once in a long while the sea hands something up instead: a sword, or a bottle
    this.special = null;
    if (!this.intro) {
      if (!Player.excalibur && SeaDice.chance(EXCALIBUR_CHANCE)) this.special = 'excalibur';
      else if (Lore.nextBottle() && SeaDice.chance(BOTTLE_CHANCE)) this.special = 'bottle';
    }
    Player.state = 'idle';
    Player.face = 1;
    Player.x = FISH_X;
    Cam.locked = true;
    this.hook.x = (FISH_X - Cam.x) + 74;
    this.hook.depth = -80;
    this.hook.vy = 0;
    this.hook.tug = 0;
    // the first cast goes a little deeper, so the ambush has room to happen in the dark
    this.targetDepth = this.intro ? 300 : ROD_DEPTH[Player.rod] * rand(.86, 1);
    Game.viewY = 0;

    // silhouettes drifting at depth, more of them the deeper you can reach
    this.shapes.length = 0;
    for (let i = 0; i < 5 + rod.depth * 2; i++) {
      this.shapes.push({
        x: rand(-100, VIEW_W + 100), depth: rand(120, this.targetDepth + 400),
        r: rand(22, 70), dir: chance(.5) ? 1 : -1, ph: rand(0, 6.3),
        a: rand(.10, .3), sp: rand(8, 30)
      });
    }
    // the thing that is always down there, once your line goes deep enough
    this.watcher.a = 0;
    this.watcher.want = 0;
    this.watcher.depth = this.targetDepth + rand(420, 700);
    this.watcher.x = rand(200, VIEW_W - 200);
    Sfx.cast();
  },

  quit() {
    Cam.locked = false;
    Game.viewY = 0;
    Game.state = 'play';
    Player.state = 'idle';
  },

  _anchor() {
    const px = Player.x - Cam.x;
    return { px, bx: px + 74 };
  },

  // screen-space y of the hook, before the view pan is applied
  hookY() { return WATER_Y + this.hook.depth; },

  // where the view should sit so the hook stays readable
  _wantView() {
    const d = Math.max(0, this.hook.depth);
    const target = lerp(505, 350, clamp(d / 340, 0, 1));
    return Math.max(0, WATER_Y + d - target);
  },

  update(dt) {
    this.t += dt;
    const rod = RODS[Player.rod];
    const a = this._anchor();
    this.shake = Math.max(0, this.shake - dt * 3);
    this.hook.x = a.bx;

    // ESC pauses now; putting the rod down is the interact key while you wait
    if (Input.tap('interact') && (this.phase === 'deep' || this.phase === 'sink' ||
        this.phase === 'fail' || this.phase === 'junk')) { this.quit(); return; }

    // drifting silhouettes
    for (const s of this.shapes) {
      s.x += s.dir * s.sp * dt;
      if (s.x < -220) { s.x = VIEW_W + 200; s.depth = rand(120, this.targetDepth + 500); }
      if (s.x > VIEW_W + 220) { s.x = -200; s.depth = rand(120, this.targetDepth + 500); }
    }

    // the watcher fades in and out of the dark below
    this.watcher.a = approach(this.watcher.a, this.watcher.want, dt * .35);
    if (this.watcher.a < .02 && this.watcher.want === 0 && chance(dt * .25)) {
      this.watcher.x = rand(200, VIEW_W - 200);
      this.watcher.depth = this.hook.depth + rand(105, 150);
    }

    // ease the view toward wherever the hook is
    const want = this._wantView();
    Game.viewY += (want - Game.viewY) * Math.min(1, dt * 3.4);

    switch (this.phase) {
      case 'cast':   this._cast(dt, a); break;
      case 'sink':   this._sink(dt, rod); break;
      case 'deep':   this._deep(dt, rod); break;
      case 'bite':   this._bite(dt); break;
      case 'reel':   this._reel(dt, rod); break;
      case 'ambush': this._ambush(dt); break;
      case 'pull':   this._pull(dt); break;
      case 'junk':   this._junk(dt); break;
      case 'fail':   this._fail(dt); break;
    }
  },

  /* ------------------------------- phases ----------------------------- */

  _cast(dt, a) {
    const p = clamp(this.t / .8, 0, 1);
    this.hook.depth = lerp(-120, 0, p) - Math.sin(p * Math.PI) * 60;
    if (p >= 1) {
      Sfx.splash();
      Particles.burst(this.hook.x, WATER_Y, 16, {
        color: '#bfe4f0', vx: rand(-70, 70), vy: -150, g: 620, size: 3, life: .5, fixed: true
      });
      this.phase = 'sink'; this.t = 0;
    }
  },

  _sink(dt, rod) {
    // slow at first, then the line just keeps going
    const speed = 150 + Math.min(300, this.hook.depth * .55);
    this.hook.depth += speed * dt;
    if (chance(dt * 8)) {
      Particles.burst(this.hook.x + rand(-6, 6), this.hookY(), 1, {
        color: 'rgba(200,228,240,.6)', vy: -40, g: -30, size: 2, life: .9, water: true
      });
    }
    // the watcher shows itself once you are properly deep
    if (this.hook.depth > 420 && Player.rod >= 2 && this.watcher.want === 0 && chance(dt * .5)) {
      this.watcher.want = 1;
      this.watcher.depth = this.hook.depth + rand(105, 150);
      Sfx.tone({ f: 46, f2: 34, dur: 2.2, type: 'sine', vol: .18 });
    }
    if (this.hook.depth >= this.targetDepth) {
      this.hook.depth = this.targetDepth;
      this.phase = 'deep'; this.t = 0;
      this.waitFor = (this.intro ? 1.4 : rand(1.8, 5.0)) * (Player.lantern ? .55 : 1);
      Sfx.reel();
    }
  },

  _deep(dt, rod) {
    this.hook.depth = this.targetDepth + Math.sin(this.t * 1.4) * 7;
    this.hook.tug = approach(this.hook.tug, 0, dt * 40);

    if (chance(dt * .6)) {
      this.hook.tug = 5;
      Particles.burst(this.hook.x, this.hookY(), 2, {
        color: 'rgba(190,220,236,.7)', vy: -30, g: -20, size: 2, life: .6, water: true
      });
    }
    // creeping dread: the deeper your rod, the more often it looks at you
    if (Player.rod >= 2 && this.watcher.want === 0 && chance(dt * (Player.rod >= 3 ? .35 : .12))) {
      this.watcher.want = 1;
      this.watcher.depth = this.hook.depth + rand(105, 150);
      this.watcher.x = rand(200, VIEW_W - 200);
      Sfx.tone({ f: 44, f2: 32, dur: 2.6, type: 'sine', vol: .2 });
    } else if (this.watcher.want === 1 && this.t > 3 && chance(dt * .2)) {
      this.watcher.want = 0;
    }

    if (this.t >= this.waitFor) {
      this.phase = 'bite'; this.t = 0;
      this.target = this.intro ? MINNOW : this.girlDue() ? GIRL : this.special ? this._specialCatch() : rollCatch(RODS[Player.rod].depth, Player.luck);
      Sfx.bite();
      this.hook.tug = 22;
      Cam.kick(this.target.gentle ? 1 : 4);
      this.watcher.want = 0;
      Particles.burst(this.hook.x, this.hookY(), 14, {
        color: '#cfeaf4', vy: -120, g: -40, size: 3, life: .7, water: true
      });
    }
  },

  _bite(dt) {
    this.hook.tug = 16 + Math.sin(this.t * 30) * 8;
    this.hook.depth = this.targetDepth + Math.sin(this.t * 22) * 10;
    if (Input.tap('interact') || Input.tap('confirm')) {
      if (this.target.junk) { this.phase = 'junk'; this.t = 0; Sfx.splash(); }
      else this._beginReel();
      return;
    }
    if (this.t > 1.05) {
      this.phase = 'fail'; this.t = 0;
      this.msg = 'It spat the hook.';
      this.hook.tug = 0;
      Sfx.deny();
    }
  },

  // Nerys comes up once, somewhere around the second or third rod
  girlDue() {
    if (Player.girlMet || Player.beatBoss) return false;
    return Player.rod >= 2 || (Player.rod >= 1 && Player.totalKills >= 6);
  },

  _fail(dt) {
    if (this.t > 1.6) {
      this.phase = 'deep'; this.t = 0;
      this.waitFor = rand(1.6, 4.0) * (Player.lantern ? .55 : 1);
      this.msg = '';
    }
  },

  // what a special catch looks like on the line: it comes straight up, like junk
  _specialCatch() {
    if (this.special === 'excalibur') return { junk: true, special: 'excalibur', name: 'something heavy and bright', value: 0, gentle: true };
    const L = Lore.nextBottle();
    return { junk: true, special: 'bottle', lore: L.id, name: 'a bottle with a page in it', value: 0, gentle: true };
  },

  _junk(dt) {
    // junk just comes straight up
    this.hook.depth = Math.max(0, this.hook.depth - 620 * dt);
    if (this.target.special && this.t > 2.2) {
      const T = this.target;
      this.quit();
      if (T.special === 'excalibur') Game.foundExcalibur();
      else { Game.toast(NARRATION.bottle); Lore.find(T.lore); }
      return;
    }
    if (this.t > 2.2) {
      Player.coins += this.target.value;
      Floaters.add(VIEW_W / 2, 300, '+' + this.target.value + '§', { color: '#f0cf8a', size: 24, fixed: true });
      Sfx.coin();
      // drop it back down rather than snapping the view to depth
      this.phase = 'sink'; this.t = 0;
      this.msg = '';
    }
  },

  _beginReel() {
    this.phase = 'reel';
    this.t = 0;
    const rod = RODS[Player.rod];
    const m = this.target;
    const small = m === MINNOW, girl = m === GIRL;
    this.barFrac = (small ? 190 : girl ? 170 : rod.bar) / 300;
    this.by = .6; this.bvy = 0;
    this.fy = .5; this.fvy = 0; this.fTarget = .5; this.fTimer = 0;
    this.fSpeed = small ? .12 : girl ? .18 : (0.26 + m.depth * 0.085 + (m.boss ? 0.18 : 0));
    // the scripted first monster is a touch gentler: it is also the tutorial
    if (!m.gentle && this.intro) this.fSpeed *= .85;
    this.prog = small ? .15 : girl ? .3 : .34;
    this.tension = 0;
    this.startDepth = this.hook.depth;
    Sfx.reel();
  },

  _reel(dt, rod) {
    const m = this.target;
    const half = this.barFrac / 2;
    const lo = half, hi = 1 - half;

    this.fTimer -= dt;
    if (this.fTimer <= 0) {
      this.fTimer = rand(.35, 1.15);
      this.fTarget = chance(.25) ? rand(lo, hi) : clamp(this.fy + rand(-.42, .42), lo, hi);
    }
    const acc = (this.fTarget - this.fy) * (7 + m.depth * 2.2);
    this.fvy += acc * dt;
    this.fvy *= (1 - Math.min(.9, dt * 5.4));
    this.fy = clamp(this.fy + this.fvy * dt * this.fSpeed * 3.2, lo, hi);
    if (this.fy <= lo || this.fy >= hi) this.fvy *= .4;

    // reel on the jump or interact binding, or the fixed confirm keys
    const pulling = Input.held('jump') || Input.held('interact') || Input.held('confirm');
    this.bvy += (pulling ? -2.35 : 2.05) * dt;
    this.bvy *= (1 - Math.min(.9, dt * 2.4));
    this.by += this.bvy * dt;
    if (this.by < lo) { this.by = lo; this.bvy = Math.max(0, this.bvy) * .35; }
    if (this.by > hi) { this.by = hi; this.bvy = Math.min(0, this.bvy) * .35; }

    const inBar = Math.abs(this.fy - this.by) <= half + 1e-6;
    const small = m === MINNOW;
    if (inBar) {
      this.prog += dt * (small ? .5 : 0.30) * rod.reel;
      this.tension = Math.max(0, this.tension - dt * 1.2);
      if (chance(dt * 12)) Sfx.reel();
    } else {
      this.prog -= dt * (m.gentle ? .07 : (0.19 + m.depth * 0.012));
      this.tension = Math.min(1, this.tension + dt * .55);
      this.shake = this.tension * 3;
    }
    this.prog = clamp(this.prog, 0, 1);

    // you can see it coming up the water column
    this.hook.depth = lerp(this.startDepth, 0, ease(this.prog)) + Math.sin(this.t * 9) * 6;
    this.hook.tug = 8 + this.tension * 10;

    if (chance(dt * 10)) {
      Particles.burst(this.hook.x + rand(-10, 10), this.hookY(), 1, {
        color: 'rgba(200,230,244,.7)', vy: 40, g: 30, size: 2, life: .5, water: true
      });
    }

    // halfway up with the little fish, the sea takes an interest
    if (small && this.intro && this.prog >= .45) { this._startAmbush(); return; }

    if (this.prog >= 1) {
      this.phase = 'pull'; this.t = 0;
      Sfx.splash();
      // whatever is on the line breaks the surface; only monsters roar
      if (!m.gentle) { Sfx.roar(); Cam.kick(9); }
      Particles.burst(this.hook.x, WATER_Y, m.gentle ? 16 : 40, {
        color: '#d8eef8', vx: rand(-220, 220), vy: rand(-460, -160), g: 900,
        size: rand(3, 8), life: rand(.6, 1.2), fixed: true
      });
    } else if (this.prog <= 0) {
      this.phase = 'fail'; this.t = 0;
      this.msg = 'The line goes slack. Gone.';
      this.hook.depth = this.targetDepth;
      this.hook.tug = 0;
      Sfx.deny();
    }
  },

  /* --------------------------- the ambush ----------------------------
     The first catch. A perfectly ordinary little fish is on the line and
     halfway up when something comes out of the dark, takes it, hook and
     all, and dives. Then you have to haul that up instead.              */

  _startAmbush() {
    this.phase = 'ambush';
    this.t = 0;
    this.eaten = false;
    this.warned = false;
    // always out of the open water on the left: the rod is on the right of the frame
    this.ambushFrom = -1;
    this.msg = 'A fish. An actual, normal, edible fish.';
  },

  _ambush(dt) {
    const t = this.t;
    if (!this.eaten) {
      // the line goes still; the little fish keeps struggling on it
      this.hook.tug = 4 + Math.sin(t * 14) * 3;
      if (t > 1.1 && !this.warned) {
        this.warned = true;
        this.msg = '';
        Sfx.tone({ f: 44, f2: 30, dur: 1.8, type: 'sine', vol: .26 });
        Cam.kick(2);
      }
      if (t > 2.3) {
        this.eaten = true;
        this.yankFrom = this.hook.depth;
        this.target = MONSTERS[0];
        this.msg = 'Something else has the line!';
        Sfx.bite(); Sfx.thud(); Sfx.roar();
        Cam.kick(12);
        const hy = this.hookY();
        Particles.burst(this.hook.x, hy, 26, {
          color: 'rgba(206,232,244,.85)', vx: rand(-160, 160), vy: rand(-160, 60), g: -20,
          size: rand(2, 5), life: rand(.5, 1.1), water: true
        });
        Particles.burst(this.hook.x, hy, 10, {
          color: '#7a2030', vx: rand(-90, 90), vy: rand(-70, 70), g: 0, size: rand(2, 4), life: .9, water: true
        });
      }
      return;
    }
    // it dives with the hook in its mouth
    const p = clamp((t - 2.3) / .5, 0, 1);
    this.hook.depth = lerp(this.yankFrom, this.yankFrom + 150, easeOut(p));
    this.hook.tug = 10 + Math.sin(t * 30) * 8;
    if (t > 3.8) {
      this.msg = '';
      this._beginReel();
    }
  },

  /* --------------------------- the haul up ---------------------------- */

  _pull(dt) {
    // the view comes back up to the deck
    this.hook.depth = Math.max(-70, this.hook.depth - 240 * dt);
    if (this.t > 1.9) {
      if (this.intro) Player.introDone = true;
      Cam.locked = false;
      Game.viewY = 0;
      if (this.target === GIRL) Game.startGirlScene();
      else Game.startBattle(this.target);
    }
  },

  /* ------------------------------ drawing ----------------------------- */

  rodAngle() {
    if (this.phase === 'cast') return lerp(-2.1, -0.35, clamp(this.t / .8, 0, 1));
    if (this.phase === 'reel') return -0.30 + Math.sin(this.t * 16) * .06 - this.prog * .1;
    if (this.phase === 'pull') return -0.9 - Math.min(1.2, this.t * .25);
    if (this.phase === 'ambush') return this.eaten ? -0.1 + Math.sin(this.t * 30) * .08 : -0.34;
    if (this.phase === 'bite') return -0.42 + Math.sin(this.t * 26) * .05;
    return -0.36 + Math.sin(this.t * 1.8) * .03;
  },
  rodBend() {
    if (this.phase === 'reel') return 16 + this.tension * 12;
    if (this.phase === 'pull') return 30;
    if (this.phase === 'ambush') return this.eaten ? 34 : 10;
    if (this.phase === 'bite') return 12;
    if (this.phase === 'sink' || this.phase === 'deep') return 5;
    return 0;
  },

  // what the underwater renderer needs to know
  waterInfo() {
    return { shapes: this.shapes, watcher: this.watcher };
  },

  /* line and hook, drawn inside the world transform (water-space) */
  // how the boy holds the rod right now
  rodPose() {
    return {
      rodAngle: this.rodAngle(), rodBend: this.rodBend(),
      frontArm: -0.55 + (this.phase === 'reel' ? Math.sin(this.t * 14) * .08 : 0)
    };
  },

  drawLine(g) {
    const a = this._anchor();
    const tip = Figures.rodTip(Object.assign({ t: Player.animT, face: Player.face, squash: bodySquash(Player) }, this.rodPose()));
    const tipX = a.px + tip.x;
    const tipY = Player.y + tip.y;
    const hx = this.hook.x, hy = this.hookY() + this.hook.tug;

    g.save();
    // a pool of lantern-light travelling down with the bait, so the eye has
    // somewhere to go in all that black
    if (this.hook.depth > 30) {
      Art._glowBlob(g, hx, hy, 150, 'rgba(150,205,230,.5)', .2);
    }

    // the line itself: taut and bright above water, dimmer as it goes down
    const lg = g.createLinearGradient(0, tipY, 0, Math.max(tipY + 40, hy));
    lg.addColorStop(0, 'rgba(246,250,255,.95)');
    lg.addColorStop(.25, 'rgba(226,240,250,.85)');
    lg.addColorStop(1, 'rgba(198,224,240,.7)');
    const bowY = this.phase === 'reel' ? 10 : 30;
    const cpx = (tipX + hx) / 2 + 16, cpy = lerp(tipY, hy, .4) + bowY;
    // a soft halo under the line so it never vanishes into the dark
    g.strokeStyle = 'rgba(140,190,220,.22)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(tipX, tipY);
    g.quadraticCurveTo(cpx, cpy, hx, hy);
    g.stroke();
    g.strokeStyle = lg;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(tipX, tipY);
    g.quadraticCurveTo(cpx, cpy, hx, hy);
    g.stroke();

    // where it pierces the surface
    if (this.hook.depth > -20) {
      g.strokeStyle = 'rgba(220,240,250,.5)'; g.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const r = 7 + i * 8 + Math.sin(this.t * 3 + i) * 2;
        g.globalAlpha = .4 - i * .1;
        g.beginPath(); g.ellipse(hx, WATER_Y, r, r * .28, 0, 0, 6.2832); g.stroke();
      }
      g.globalAlpha = 1;
    }

    // the hook, its bait, and whatever is presently attached to it
    g.save();
    g.translate(hx, hy);

    // a small ordinary fish on the line, for as long as it lasts
    const minnowOn = this.target === MINNOW &&
      (this.phase === 'reel' || this.phase === 'bite' || (this.phase === 'ambush' && !this.eaten));
    if (minnowOn) {
      g.save();
      g.rotate(Math.sin(this.t * (this.phase === 'ambush' ? 14 : 6)) * .3 - .4);
      Art.fishIcon(g, 0, 12, 1.7, MINNOW.body, MINNOW.belly);
      g.restore();
    }
    if (this.target === GIRL && (this.phase === 'reel' || this.phase === 'bite')) {
      // a person, hanging off the hook by her hair, coming up out of the dark
      g.save();
      g.globalAlpha = clamp(.3 + this.prog * .8, .3, 1);
      Art.girl(g, 0, 70, { pose: 'rise', t: this.t, scale: .8, noShadow: true, face: Math.sin(this.t * .7) > 0 ? 1 : -1 });
      g.restore();
    } else if (this.target !== MINNOW && this.phase === 'reel') {
      // a suggestion of the thing you have hooked, hauled up out of the black
      const d = this.target;
      const scale = clamp(.25 + this.prog * .8, .25, 1);
      g.save();
      g.globalAlpha = clamp(this.prog * 1.4, .25, .95);
      g.translate(0, 40 * scale);
      g.scale(scale * .55, scale * .55);
      g.rotate(Math.sin(this.t * 3) * .18);
      try {
        Art.monster(g, {
          x: 0, y: 0, face: -1, rot: 0, len: d.len, def: d, flash: 0,
          gape: .3 + Math.sin(this.t * 5) * .2, seed: 11, thrashAmt: 2.2, noShadow: true
        }, this.t);
      } catch (e) {}
      g.restore();
    }

    // hook + bait — scaled up a little so it stays findable at depth
    g.save();
    g.scale(1.5, 1.5);
    g.strokeStyle = '#e4e8ee'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, -10); g.lineTo(0, 2);
    g.quadraticCurveTo(8, 10, 0, 13);
    g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = '#c07a4c';
    g.beginPath(); g.ellipse(1, 4, 5, 7, .3, 0, 6.2832); g.fill();
    g.fillStyle = 'rgba(255,220,180,.5)';
    g.beginPath(); g.ellipse(-.5, 2, 2, 3, .3, 0, 6.2832); g.fill();
    g.restore();
    Art._glowBlob(g, 0, 4, Player.lantern ? 100 : 56, Player.lantern ? '#ffc46a' : '#ffd9a8', .5);
    g.restore();

    // the "!" on a bite
    if (this.phase === 'bite') {
      const s = 1 + Math.sin(this.t * 22) * .12;
      g.save();
      g.translate(hx, hy - 58); g.scale(s, s);
      Text.draw(g, '!', 0, 0, {
        size: 48, align: 'center', color: '#ffe066', weight: 'bold',
        outline: 'rgba(0,0,0,.85)', outlineW: 6, font: 'Georgia, serif'
      });
      g.restore();
      // something big rising under the hook
      if (!this.target.gentle) {
        g.save();
        g.globalAlpha = clamp(this.t * 1.2, 0, .55);
        g.fillStyle = '#01050d';
        g.beginPath();
        g.ellipse(hx, hy + 150 - this.t * 90, 180, 46, 0, 0, 6.2832);
        g.fill();
        g.restore();
      }
    }
    if (this.phase === 'ambush') this._drawAmbusher(g, hx, hy);
    g.restore();
  },

  // the Gnashfin coming out of the dark for the little fish, then holding the line
  _drawAmbusher(g, hx, hy) {
    const d = MONSTERS[0];
    const L = d.len * .85;
    const dir = this.ambushFrom;          // -1: arrives from the left
    let off, gape;
    if (!this.eaten) {
      const p = clamp((this.t - 1.1) / 1.2, 0, 1);
      off = lerp(dir * 560, 0, ease(p));
      gape = lerp(.2, .95, p);
    } else {
      off = Math.sin(this.t * 24) * 6;
      gape = .12;
    }
    g.save();
    try {
      Art.monster(g, {
        // placed so its snout sits on the hook, body trailing back the way it came
        x: hx + off + dir * L * .46, y: hy + 6, face: -dir, rot: 0, len: L, def: d,
        flash: this.eaten && this.t - 2.3 < .15 ? 1 : 0,
        gape, seed: 5, thrashAmt: this.eaten ? 3 : 1.4, noShadow: true
      }, this.t);
    } catch (e) {}
    g.restore();
  },

  /* ------------------------------ the HUD ----------------------------- */

  drawUI(g) {
    const d = Math.max(0, Math.round(this.hook.depth / 50));

    if (this.phase === 'cast') this._tip(g, 'Casting…');
    else if (this.phase === 'sink') this._tip(g, 'Paying out line…   ' + d + ' fathoms', '#9fd4e4');
    else if (this.phase === 'deep') this._tip(g, 'Holding at ' + d + ' fathoms.   [' + keyLabel(ACTIONS.interact[0]) + '] reel in', '#9fd4e4');
    else if (this.phase === 'bite') this._tip(g, 'SOMETHING TOOK IT — press [E]!', '#ffe066');
    else if (this.phase === 'fail') this._tip(g, this.msg, '#e28a8a');
    else if (this.phase === 'junk') this._tip(g, 'You reel up ' + this.target.name + '.', '#b8c4dc');
    else if (this.phase === 'ambush' && this.msg) this._tip(g, this.msg, this.eaten ? '#ff9a9a' : '#e8e3d6');
    else if (this.phase === 'pull') {
      if (this.target === GIRL) this._tip(g, 'It is coming up… it has hands.', '#9ff0ff');
      else this._tip(g, 'It is coming up…', '#ff9a9a');
    }

    if (this.phase !== 'reel') return;

    /* ----------------------- the reeling gauge ----------------------- */
    const gx = 92, gy = 84, gw = 58, gh = 300;
    const sh = (Math.random() * 2 - 1) * this.shake;

    panel(g, gx - 22 + sh, gy - 44, gw + 104, gh + 78, { alpha: .92 });
    const heading = this.target === MINNOW ? 'A SMALL FISH' : this.target === GIRL ? "IT ISN'T FIGHTING" : this.target.name.toUpperCase();
    Text.draw(g, heading,
      gx + gw / 2 + 30 + sh, gy - 16, {
        size: 15, align: 'center', color: '#f0cf8a', weight: 'bold', font: 'Verdana, sans-serif'
      });

    g.save();
    roundRect(g, gx + sh, gy, gw, gh, 6);
    const wg = g.createLinearGradient(0, gy, 0, gy + gh);
    wg.addColorStop(0, '#123047'); wg.addColorStop(1, '#050c1c');
    g.fillStyle = wg; g.fill();
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 3;
    for (let i = 1; i < 10; i++) {
      g.beginPath(); g.moveTo(gx + sh, gy + i * gh / 10); g.lineTo(gx + gw + sh, gy + i * gh / 10); g.stroke();
    }
    const barH = this.barFrac * gh;
    const barY = gy + this.by * gh - barH / 2;
    const inBar = Math.abs(this.fy - this.by) <= this.barFrac / 2 + 1e-6;
    roundRect(g, gx + 4 + sh, barY, gw - 8, barH, 5);
    g.fillStyle = inBar ? 'rgba(126,214,150,.42)' : 'rgba(126,180,214,.26)';
    g.fill();
    g.strokeStyle = inBar ? 'rgba(150,240,178,.9)' : 'rgba(150,190,224,.55)';
    g.lineWidth = 3; g.stroke();
    Art.fishIcon(g, gx + gw / 2 + sh, gy + this.fy * gh, 1.25,
      this.target.body, this.target.belly);
    g.restore();

    g.strokeStyle = '#c8a45c'; g.lineWidth = 3;
    roundRect(g, gx + sh, gy, gw, gh, 6); g.stroke();

    const px = gx + gw + 22 + sh;
    g.fillStyle = 'rgba(8,10,20,.85)';
    roundRect(g, px, gy, 26, gh, 5); g.fill();
    const ph = this.prog * gh;
    const pg = g.createLinearGradient(0, gy + gh - ph, 0, gy + gh);
    pg.addColorStop(0, '#8ce0a4'); pg.addColorStop(1, '#3f9e68');
    g.fillStyle = pg;
    roundRect(g, px + 3, gy + gh - ph + 3, 20, Math.max(0, ph - 6), 4); g.fill();
    g.strokeStyle = '#c8a45c'; g.lineWidth = 3;
    roundRect(g, px, gy, 26, gh, 5); g.stroke();
    Text.draw(g, 'LINE', px + 13, gy + gh + 20, { size: 11, align: 'center', color: '#9aa7c4', font: 'Verdana, sans-serif' });

    if (this.tension > .35) {
      g.globalAlpha = (this.tension - .35) * 1.4 * (0.6 + Math.sin(this.t * 18) * .4);
      Text.draw(g, 'TENSION', gx + gw / 2 + 30 + sh, gy + gh + 40, {
        size: 16, align: 'center', color: '#ff6a6a', weight: 'bold', font: 'Verdana, sans-serif'
      });
      g.globalAlpha = 1;
    }

    this._tip(g, 'Hold [SPACE] to reel — keep it inside the bar');
  },

  _tip(g, s, color) {
    const w = Text.width(g, s, { size: 17, font: 'Verdana, sans-serif' }) + 40;
    panel(g, VIEW_W / 2 - w / 2, VIEW_H - 62, w, 38, { alpha: .88 });
    Text.draw(g, s, VIEW_W / 2, VIEW_H - 37, {
      size: 17, align: 'center', color: color || '#dfe4f0', font: 'Verdana, sans-serif'
    });
  }
};

// the one ordinary fish in the entire game
const MINNOW = {
  id: 'minnow', name: 'a small fish', depth: 1, len: 60, girth: .3, gentle: true,
  hp: 1, value: 6, dmg: 0, speed: 10, plan: 'eel', eyes: 2,
  body: [140, 156, 120], belly: [222, 226, 198], fin: [110, 124, 96], eye: '#2a2028',
  atk: ['lunge'], flavour: 'A fish.'
};

// not a fish at all
const GIRL = {
  id: 'girl', name: 'someone', depth: 2, len: 70, girth: .3, gentle: true,
  body: [58, 104, 88], belly: [185, 212, 204]
};
