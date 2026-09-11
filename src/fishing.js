'use strict';
/* ========================================================================
   fishing.js — cast, wait, hook, and the reeling struggle
   ======================================================================== */

const FISH_X = 1700;   // where the boy stands to fish (world x)

const Fishing = {
  phase: 'cast',   // cast | wait | bite | reel | pull | junk | fail
  t: 0,
  bob: { x: 0, y: 0, vy: 0, dip: 0 },
  waitFor: 2,
  target: null,       // monster def or junk
  msg: '',
  // reel minigame
  fy: .5, fvy: 0, fTarget: .5, fTimer: 0, fSpeed: .3,
  by: .7, bvy: 0, barFrac: .3,
  prog: .32, tension: 0, shake: 0,
  lure: [],

  start() {
    this.phase = 'cast';
    this.t = 0;
    this.msg = '';
    this.target = null;
    Player.state = 'idle';
    Player.face = 1;
    Player.x = FISH_X;
    Cam.locked = true;
    this.bob.x = 0; this.bob.y = 0; this.bob.vy = 0; this.bob.dip = 0;
    this.lure.length = 0;
    const rod = RODS[Player.rod];
    for (let i = 0; i < 3 + rod.depth; i++) {
      this.lure.push({ p: rand(0, 6.28), r: rand(40, 130), sp: rand(.4, 1.1), s: rand(.5, 1.2), d: rand(0, 1) });
    }
    Sfx.cast();
  },

  quit() {
    Cam.locked = false;
    Game.state = 'play';
    Player.state = 'idle';
  },

  // screen coords of the rod tip / bobber
  _anchor() {
    const px = Player.x - Cam.x;
    return { px, bx: px + 74, by: 486 };
  },

  update(dt) {
    this.t += dt;
    const rod = RODS[Player.rod];
    const a = this._anchor();
    this.shake = Math.max(0, this.shake - dt * 3);

    // you can always put the rod down, except mid-struggle
    if (Input.tap('cancel') && (this.phase === 'wait' || this.phase === 'fail' ||
        this.phase === 'junk' || this.phase === 'cast')) { this.quit(); return; }

    if (this.phase === 'cast') {
      // arc the bobber out over the rail
      const p = clamp(this.t / .75, 0, 1);
      this.bob.x = lerp(a.px + 20, a.bx, p);
      this.bob.y = lerp(DECK_Y - 34, a.by, p) - Math.sin(p * Math.PI) * 86;
      if (p >= 1) {
        Sfx.splash();
        Particles.burst(this.bob.x, this.bob.y, 14, {
          color: '#bfe4f0', vx: 0, vy: -120, g: 560, size: 3, life: .5, fixed: true
        });
        this.phase = 'wait';
        this.t = 0;
        this.waitFor = rand(1.4, 4.2) * (Player.lantern ? .55 : 1);
        this.msg = '';
      }
      return;
    }

    // bobber floats
    this.bob.x = a.bx;
    const wob = Math.sin(this.t * 2.6) * 3 + Math.sin(this.t * 5.1) * 1.4;
    this.bob.y = a.by + wob + this.bob.dip;

    if (this.phase === 'wait') {
      this.bob.dip = approach(this.bob.dip, 0, dt * 40);
      // teasing nibbles
      if (chance(dt * .8)) {
        this.bob.dip = 5;
        Particles.burst(this.bob.x, this.bob.y + 4, 3, {
          color: 'rgba(190,220,236,.8)', vy: -30, g: 200, size: 2, life: .35, fixed: true
        });
      }
      if (this.t >= this.waitFor) {
        this.phase = 'bite';
        this.t = 0;
        this.target = rollCatch(rod.depth, Player.luck);
        Sfx.bite();
        this.bob.dip = 16;
        Cam.kick(2);
        Particles.burst(this.bob.x, this.bob.y + 6, 12, {
          color: '#cfeaf4', vy: -160, g: 620, size: 3, life: .55, fixed: true
        });
      }
      return;
    }

    if (this.phase === 'bite') {
      this.bob.dip = 14 + Math.sin(this.t * 34) * 6;
      if (Input.tap('interact') || Input.tap('confirm')) {
        if (this.target.junk) {
          this.phase = 'junk'; this.t = 0;
          Sfx.splash();
        } else {
          this._beginReel();
        }
        return;
      }
      if (this.t > .95) {
        this.phase = 'fail'; this.t = 0;
        this.msg = 'It spat the hook.';
        this.bob.dip = 0;
        Sfx.deny();
      }
      return;
    }

    if (this.phase === 'fail') {
      if (this.t > 1.5) { this.phase = 'wait'; this.t = 0; this.waitFor = rand(1.2, 3.4) * (Player.lantern ? .55 : 1); this.msg = ''; }
      return;
    }

    if (this.phase === 'junk') {
      if (this.t > 1.9) {
        Player.coins += this.target.value;
        Floaters.add(VIEW_W / 2, 300, '+' + this.target.value + '§', { color: '#f0cf8a', size: 24, fixed: true });
        Sfx.coin();
        this.phase = 'wait'; this.t = 0; this.waitFor = rand(1.2, 3.2); this.msg = '';
      }
      return;
    }

    if (this.phase === 'reel') { this._reel(dt, rod); return; }

    if (this.phase === 'pull') {
      if (this.t > 1.9) {
        Cam.locked = false;
        Game.startBattle(this.target);
      }
      return;
    }
  },

  _beginReel() {
    this.phase = 'reel';
    this.t = 0;
    const rod = RODS[Player.rod];
    const m = this.target;
    this.barFrac = rod.bar / 300;
    this.by = .6; this.bvy = 0;
    this.fy = .5; this.fvy = 0; this.fTarget = .5; this.fTimer = 0;
    this.fSpeed = 0.26 + m.depth * 0.085 + (m.boss ? 0.13 : 0);
    this.prog = .34;
    this.tension = 0;
    Sfx.reel();
  },

  _reel(dt, rod) {
    const m = this.target;

    // The bar's centre can only travel within [half, 1-half], so the fish has to
    // live in that same band — otherwise it can pin itself against the very top or
    // bottom of the track where no amount of reeling can ever cover it.
    const half = this.barFrac / 2;
    const lo = half, hi = 1 - half;

    // --- the fish ---
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

    // --- the bar ---
    const pulling = Input.held('confirm') || Input.held('interact') || Input.held('up');
    this.bvy += (pulling ? -2.35 : 2.05) * dt;
    this.bvy *= (1 - Math.min(.9, dt * 2.4));
    this.by += this.bvy * dt;
    if (this.by < lo) { this.by = lo; this.bvy = Math.max(0, this.bvy) * .35; }
    if (this.by > hi) { this.by = hi; this.bvy = Math.min(0, this.bvy) * .35; }

    // --- overlap --- (<=, so a fish parked on the band edge still counts)
    const inBar = Math.abs(this.fy - this.by) <= half + 1e-6;
    if (inBar) {
      this.prog += dt * 0.30 * rod.reel;
      this.tension = Math.max(0, this.tension - dt * 1.2);
      if (chance(dt * 12)) Sfx.reel();
    } else {
      this.prog -= dt * (0.19 + m.depth * 0.012);
      this.tension = Math.min(1, this.tension + dt * .55);
      this.shake = this.tension * 3;
    }
    this.prog = clamp(this.prog, 0, 1);

    // rod bend + bobber tug
    this.bob.dip = 8 + Math.sin(this.t * 20) * 4 + this.tension * 8;
    if (chance(dt * 6)) {
      Particles.burst(this.bob.x, this.bob.y, 2, {
        color: 'rgba(200,230,244,.8)', vy: -50, g: 300, size: 2, life: .4, fixed: true
      });
    }

    if (this.prog >= 1) {
      this.phase = 'pull'; this.t = 0;
      Sfx.splash(); Sfx.roar();
      Cam.kick(9);
      Particles.burst(this.bob.x, this.bob.y, 46, {
        color: '#d8eef8', vx: rand(-220, 220), vy: rand(-520, -180), g: 900, size: rand(3, 8), life: rand(.6, 1.2), fixed: true
      });
    } else if (this.prog <= 0) {
      this.phase = 'fail'; this.t = 0;
      this.msg = 'The line goes slack. Gone.';
      this.bob.dip = 0;
      Sfx.deny();
    }
  },

  /* ------------------------------ drawing ----------------------------- */

  // the rod angle the boy holds, by phase
  rodAngle() {
    if (this.phase === 'cast') return lerp(-2.1, -0.35, clamp(this.t / .75, 0, 1));
    if (this.phase === 'reel') return -0.30 + Math.sin(this.t * 16) * .06 - this.prog * .1;
    if (this.phase === 'pull') return -0.9 - this.t * .25;
    if (this.phase === 'bite') return -0.42 + Math.sin(this.t * 26) * .05;
    return -0.36 + Math.sin(this.t * 1.8) * .03;
  },
  rodBend() {
    if (this.phase === 'reel') return 16 + this.tension * 12;
    if (this.phase === 'pull') return 30;
    if (this.phase === 'bite') return 10;
    return 0;
  },

  // line + bobber, drawn over the water
  drawLine(g) {
    const a = this._anchor();
    // rod tip: roughly where the rod graphic ends
    const ang = this.rodAngle();
    const tipX = a.px + 8 + Math.cos(ang) * 78;
    const tipY = DECK_Y - 32 + 16 + Math.sin(ang) * 78 + 10;

    g.save();
    g.strokeStyle = 'rgba(232,240,250,.62)';
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(tipX, tipY);
    const sag = this.phase === 'reel' ? 8 - this.prog * 6 : 22;
    g.quadraticCurveTo((tipX + this.bob.x) / 2, (tipY + this.bob.y) / 2 + sag, this.bob.x, this.bob.y);
    g.stroke();

    if (this.phase === 'pull') {
      // something enormous coming up
      const p = clamp(this.t / 1.9, 0, 1);
      g.fillStyle = 'rgba(6,12,26,' + (0.2 + p * .5) + ')';
      g.beginPath();
      g.ellipse(this.bob.x, this.bob.y + 30 - p * 40, 60 + p * 190, 16 + p * 60, 0, 0, 6.2832);
      g.fill();
      if (p > .55) {
        g.fillStyle = 'rgba(255,80,80,' + ((p - .55) * 2) + ')';
        g.beginPath(); g.arc(this.bob.x - 40, this.bob.y - p * 30, 5, 0, 6.2832); g.fill();
        g.beginPath(); g.arc(this.bob.x + 40, this.bob.y - p * 30, 5, 0, 6.2832); g.fill();
      }
      g.restore();
      return;
    }

    // bobber
    const bx = this.bob.x, by = this.bob.y;
    g.fillStyle = 'rgba(10,20,34,.4)';
    g.beginPath(); g.ellipse(bx, by + 5, 12, 4, 0, 0, 6.2832); g.fill();
    g.fillStyle = '#d64b4b';
    g.beginPath(); g.arc(bx, by, 6, Math.PI, 0); g.fill();
    g.fillStyle = '#f0ece0';
    g.beginPath(); g.arc(bx, by, 6, 0, Math.PI); g.fill();
    g.strokeStyle = '#2a2028'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(bx, by, 6, 0, 6.2832); g.stroke();
    g.fillStyle = '#7a8290'; g.fillRect(bx - 1, by - 11, 2, 6);

    // ripple rings
    g.strokeStyle = 'rgba(210,234,244,.4)'; g.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const r = ((this.t * 26 + i * 20) % 60);
      g.globalAlpha = clamp(1 - r / 60, 0, 1) * .5;
      g.beginPath(); g.ellipse(bx, by + 4, r, r * .3, 0, 0, 6.2832); g.stroke();
    }
    g.globalAlpha = 1;

    // shapes circling the lure
    if (this.phase === 'wait' || this.phase === 'bite') {
      for (const l of this.lure) {
        const ang2 = this.t * l.sp + l.p;
        const lx = bx + Math.cos(ang2) * l.r;
        const ly = by + 16 + Math.sin(ang2 * .8) * 10 + l.d * 22;
        g.globalAlpha = .22 + Math.sin(this.t + l.p) * .06;
        g.fillStyle = '#020814';
        g.save();
        g.translate(lx, ly); g.scale(Math.cos(ang2) > 0 ? 1 : -1, 1);
        g.beginPath(); g.ellipse(0, 0, 26 * l.s, 6 * l.s, 0, 0, 6.2832); g.fill();
        g.beginPath();
        g.moveTo(-26 * l.s, 0); g.lineTo(-38 * l.s, -8 * l.s); g.lineTo(-38 * l.s, 8 * l.s);
        g.closePath(); g.fill();
        g.restore();
        g.globalAlpha = 1;
      }
    }

    // the "!" on a bite
    if (this.phase === 'bite') {
      const s = 1 + Math.sin(this.t * 22) * .12;
      g.save();
      g.translate(bx, by - 46); g.scale(s, s);
      Text.draw(g, '!', 0, 0, {
        size: 46, align: 'center', color: '#ffe066', weight: 'bold',
        outline: 'rgba(0,0,0,.85)', outlineW: 6, font: 'Georgia, serif'
      });
      g.restore();
    }
    g.restore();
  },

  drawUI(g) {
    // prompts
    if (this.phase === 'wait') {
      this._tip(g, 'Waiting for a bite…   [ESC] reel in');
    } else if (this.phase === 'bite') {
      this._tip(g, 'A BITE!  Press [E] to set the hook!', '#ffe066');
    } else if (this.phase === 'fail') {
      this._tip(g, this.msg, '#e28a8a');
    } else if (this.phase === 'cast') {
      this._tip(g, 'Casting…');
    } else if (this.phase === 'junk') {
      this._tip(g, 'You reel up ' + this.target.name + '.', '#b8c4dc');
    } else if (this.phase === 'pull') {
      this._tip(g, 'Something is coming up…', '#ff9a9a');
    }

    if (this.phase !== 'reel') return;

    /* ----------------------- the reeling gauge ----------------------- */
    const gx = 92, gy = 84, gw = 58, gh = 300;
    const sh = (Math.random() * 2 - 1) * this.shake;

    panel(g, gx - 22 + sh, gy - 44, gw + 104, gh + 78, { alpha: .92 });

    Text.draw(g, this.target.name.toUpperCase(), gx + gw / 2 + 30 + sh, gy - 16, {
      size: 15, align: 'center', color: '#f0cf8a', weight: 'bold', font: 'Verdana, sans-serif'
    });

    // water track
    g.save();
    roundRect(g, gx + sh, gy, gw, gh, 6);
    const wg = g.createLinearGradient(0, gy, 0, gy + gh);
    wg.addColorStop(0, '#123047'); wg.addColorStop(1, '#050c1c');
    g.fillStyle = wg; g.fill();
    g.clip();

    // depth lines
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      g.beginPath(); g.moveTo(gx + sh, gy + i * gh / 10); g.lineTo(gx + gw + sh, gy + i * gh / 10); g.stroke();
    }

    // the catch bar
    const barH = this.barFrac * gh;
    const barY = gy + this.by * gh - barH / 2;
    const inBar = Math.abs(this.fy - this.by) < this.barFrac / 2;
    roundRect(g, gx + 4 + sh, barY, gw - 8, barH, 5);
    g.fillStyle = inBar ? 'rgba(126,214,150,.42)' : 'rgba(126,180,214,.26)';
    g.fill();
    g.strokeStyle = inBar ? 'rgba(150,240,178,.9)' : 'rgba(150,190,224,.55)';
    g.lineWidth = 2; g.stroke();

    // the fish
    const fyPix = gy + this.fy * gh;
    Art.fishIcon(g, gx + gw / 2 + sh, fyPix, 1.25,
      this.target.body, this.target.belly);

    g.restore();

    g.strokeStyle = '#c8a45c'; g.lineWidth = 2;
    roundRect(g, gx + sh, gy, gw, gh, 6); g.stroke();

    // progress column
    const px = gx + gw + 22 + sh;
    g.fillStyle = 'rgba(8,10,20,.85)';
    roundRect(g, px, gy, 26, gh, 5); g.fill();
    const ph = this.prog * gh;
    const pg = g.createLinearGradient(0, gy + gh - ph, 0, gy + gh);
    pg.addColorStop(0, '#8ce0a4'); pg.addColorStop(1, '#3f9e68');
    g.fillStyle = pg;
    roundRect(g, px + 3, gy + gh - ph + 3, 20, Math.max(0, ph - 6), 4); g.fill();
    g.strokeStyle = '#c8a45c'; g.lineWidth = 2;
    roundRect(g, px, gy, 26, gh, 5); g.stroke();
    Text.draw(g, 'LINE', px + 13, gy + gh + 20, { size: 11, align: 'center', color: '#9aa7c4', font: 'Verdana, sans-serif' });

    // tension warning
    if (this.tension > .35) {
      g.globalAlpha = (this.tension - .35) * 1.4 * (0.6 + Math.sin(this.t * 18) * .4);
      Text.draw(g, 'TENSION', gx + gw / 2 + 30 + sh, gy + gh + 40, {
        size: 16, align: 'center', color: '#ff6a6a', weight: 'bold', font: 'Verdana, sans-serif'
      });
      g.globalAlpha = 1;
    }

    this._tip(g, 'Hold [SPACE] to reel — keep the fish inside the bar');
  },

  _tip(g, s, color) {
    const w = Text.width(g, s, { size: 17, font: 'Verdana, sans-serif' }) + 40;
    panel(g, VIEW_W / 2 - w / 2, VIEW_H - 62, w, 38, { alpha: .88 });
    Text.draw(g, s, VIEW_W / 2, VIEW_H - 37, {
      size: 17, align: 'center', color: color || '#dfe4f0', font: 'Verdana, sans-serif'
    });
  }
};
