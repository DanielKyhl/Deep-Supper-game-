'use strict';
/* ========================================================================
   core.js — canvas, math, input, audio, particles, shared helpers
   ======================================================================== */

const VIEW_W = 960, VIEW_H = 540;

// World layout (world-space pixels; the boat is longer than the screen)
const HORIZON_Y = 300;   // where sky meets sea
const DECK_Y    = 400;   // the surface characters stand on (feet line)
const WATER_Y   = 470;   // the surface your line goes through
const WATER_TOP = 500;   // where the underwater column starts drawing
const BOAT_L    = 0;
const BOAT_R    = 1900;
const WALK_L    = 74;    // player movement clamp
const WALK_R    = 1826;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

/* ---------------------------------- math -------------------------------- */

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { if (b === undefined) { b = a; a = 0; } return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function chance(p) { return Math.random() < p; }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }
function approach(v, target, step) { return v < target ? Math.min(v + step, target) : Math.max(v - step, target); }
function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOut(t) { return 1 - (1 - t) * (1 - t); }
function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* --------------------------------- colour ------------------------------- */

function mix(c1, c2, t) {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t))
  ];
}
function css(c, a) {
  return a === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
// darken/lighten an [r,g,b]
function shade(c, amt) {
  if (amt >= 0) return mix(c, [255, 255, 255], amt);
  return mix(c, [0, 0, 0], -amt);
}

/* --------------------------------- input -------------------------------- */

const ACTIONS = {
  left:     ['ArrowLeft', 'KeyA'],
  right:    ['ArrowRight', 'KeyD'],
  up:       ['ArrowUp', 'KeyW'],
  down:     ['ArrowDown', 'KeyS'],
  jump:     ['Space', 'ArrowUp', 'KeyW'],
  attack:   ['KeyJ', 'KeyX'],
  roll:     ['KeyK', 'ShiftLeft', 'ShiftRight', 'KeyC'],
  interact: ['KeyE', 'KeyF'],
  confirm:  ['Enter', 'Space', 'KeyE'],
  cancel:   ['Escape', 'Backspace'],
  use:      ['KeyQ'],
  mute:     ['KeyM'],
  music:    ['KeyN']
};
const BLOCKED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace', 'Tab']);

const Input = (function () {
  const held = new Set();
  const tapped = new Set();
  let anyTapped = false;

  addEventListener('keydown', e => {
    if (BLOCKED.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    held.add(e.code);
    tapped.add(e.code);
    anyTapped = true;
    Sfx.unlock();
  });
  addEventListener('keyup', e => held.delete(e.code));
  addEventListener('blur', () => { held.clear(); });
  canvas.addEventListener('mousedown', () => Sfx.unlock());

  return {
    held(a) { const k = ACTIONS[a]; for (let i = 0; i < k.length; i++) if (held.has(k[i])) return true; return false; },
    tap(a) { const k = ACTIONS[a]; for (let i = 0; i < k.length; i++) if (tapped.has(k[i])) return true; return false; },
    anyTap() { return anyTapped; },
    endFrame() { tapped.clear(); anyTapped = false; }
  };
})();

/* --------------------------------- audio -------------------------------- */

const Sfx = {
  ac: null, master: null, muted: false, ready: false,

  unlock() {
    if (!this.ac) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ac = new AC();
        this.master = this.ac.createGain();
        this.master.gain.value = 0.3;
        this.master.connect(this.ac.destination);
        this.ready = true;
      } catch (e) { return; }
    }
    if (this.ac.state === 'suspended') this.ac.resume();
    if (typeof Music !== 'undefined') Music.ensure();
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.3;
    if (typeof Music !== 'undefined') Music.setMuted(this.muted);
    return this.muted;
  },
  tone(o) {
    if (!this.ready || this.muted) return;
    const ac = this.ac, t = ac.currentTime;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.dur || .15));
    const v = (o.vol === undefined ? .3 : o.vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.atk || .008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || .15));
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + (o.dur || .15) + .02);
  },
  noise(o) {
    if (!this.ready || this.muted) return;
    const ac = this.ac, t = ac.currentTime, dur = o.dur || .2;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.f || 900, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f2), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(o.vol === undefined ? .3 : o.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },

  step()   { this.tone({ f: 110, f2: 70, dur: .05, type: 'triangle', vol: .09 }); },
  swing()  { this.noise({ f: 2600, f2: 500, dur: .16, filter: 'bandpass', vol: .22 }); },
  hit()    { this.tone({ f: 190, f2: 60, dur: .14, type: 'square', vol: .2 }); this.noise({ f: 1400, f2: 200, dur: .12, vol: .2 }); },
  crit()   { this.tone({ f: 420, f2: 90, dur: .2, type: 'sawtooth', vol: .22 }); },
  hurt()   { this.tone({ f: 300, f2: 90, dur: .28, type: 'sawtooth', vol: .24 }); },
  coin()   { this.tone({ f: 880, dur: .07, type: 'square', vol: .16 }); setTimeout(() => this.tone({ f: 1320, dur: .12, type: 'square', vol: .14 }), 60); },
  cast()   { this.noise({ f: 400, f2: 3000, dur: .3, filter: 'bandpass', vol: .16 }); },
  splash() { this.noise({ f: 1800, f2: 220, dur: .35, vol: .24 }); },
  bite()   { this.tone({ f: 700, dur: .06, type: 'square', vol: .2 }); setTimeout(() => this.tone({ f: 700, dur: .06, type: 'square', vol: .2 }), 110); },
  reel()   { this.tone({ f: 160, dur: .03, type: 'square', vol: .05 }); },
  landed() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone({ f, dur: .16, type: 'triangle', vol: .18 }), i * 80)); },
  roar()   { this.tone({ f: 90, f2: 42, dur: .9, type: 'sawtooth', vol: .3 }); this.noise({ f: 500, f2: 80, dur: .9, vol: .18 }); },
  buy()    { [440, 660, 880].forEach((f, i) => setTimeout(() => this.tone({ f, dur: .12, type: 'square', vol: .14 }), i * 70)); },
  deny()   { this.tone({ f: 160, f2: 120, dur: .16, type: 'square', vol: .16 }); },
  select() { this.tone({ f: 760, dur: .04, type: 'square', vol: .09 }); },
  thud()   { this.tone({ f: 70, f2: 40, dur: .28, type: 'sine', vol: .34 }); this.noise({ f: 300, f2: 60, dur: .3, vol: .22 }); },
  whoosh() { this.noise({ f: 700, f2: 2400, dur: .25, filter: 'bandpass', vol: .14 }); },
  heal()   { [660, 880, 990].forEach((f, i) => setTimeout(() => this.tone({ f, dur: .18, type: 'sine', vol: .16 }), i * 90)); },
  text()   { this.tone({ f: 520 + Math.random() * 120, dur: .018, type: 'square', vol: .035 }); }
};

/* -------------------------------- camera -------------------------------- */

const Cam = {
  x: 0, shake: 0, shakeX: 0, shakeY: 0, locked: false,
  snap(tx) { this.x = clamp(tx - VIEW_W / 2, 0, BOAT_R - VIEW_W); },
  follow(tx, dt, speed) {
    if (this.locked) return;
    const want = clamp(tx - VIEW_W / 2, 0, BOAT_R - VIEW_W);
    this.x += (want - this.x) * Math.min(1, (speed || 5) * dt);
  },
  kick(n) { this.shake = Math.max(this.shake, n); },
  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 26);
    const s = this.shake;
    this.shakeX = (Math.random() * 2 - 1) * s;
    this.shakeY = (Math.random() * 2 - 1) * s * .7;
  }
};

/* ------------------------------- particles ------------------------------ */

const Particles = {
  list: [],
  clear() { this.list.length = 0; },
  add(x, y, o) {
    o = o || {};
    this.list.push({
      x, y,
      vx: o.vx === undefined ? rand(-40, 40) : o.vx,
      vy: o.vy === undefined ? rand(-90, -20) : o.vy,
      g: o.g === undefined ? 340 : o.g,
      life: 0, max: o.life || rand(.4, .9),
      size: o.size || rand(2, 5),
      color: o.color || '#fff',
      shape: o.shape || 'rect',
      drag: o.drag === undefined ? 0.2 : o.drag,
      spin: rand(-6, 6), rot: rand(0, 6.3),
      fixed: !!o.fixed || !!o.water,
      water: !!o.water        // lives in the water column, drawn under the pan
    });
  },
  burst(x, y, n, o) { for (let i = 0; i < n; i++) this.add(x, y, o); },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life += dt;
      if (p.life >= p.max) { this.list.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.vx -= p.vx * p.drag * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  },
  draw(g, camX, layer) {
    const wantWater = layer === 'water';
    for (const p of this.list) {
      if (!!p.water !== wantWater) continue;
      const a = 1 - p.life / p.max;
      g.save();
      g.globalAlpha = a;
      g.fillStyle = p.color;
      const px = p.fixed ? p.x : p.x - camX;
      if (p.shape === 'circle') {
        g.beginPath(); g.arc(px, p.y, p.size * a, 0, 6.2832); g.fill();
      } else {
        g.translate(px, p.y); g.rotate(p.rot);
        g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * (p.shape === 'streak' ? 2.4 : 1));
      }
      g.restore();
    }
  }
};

/* ------------------------------ floating text --------------------------- */

const Floaters = {
  list: [],
  clear() { this.list.length = 0; },
  add(x, y, text, o) {
    o = o || {};
    this.list.push({ x, y, text, life: 0, max: o.life || 1.0, color: o.color || '#fff', size: o.size || 20, vy: o.vy || -46, fixed: !!o.fixed });
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.life += dt; f.y += f.vy * dt; f.vy *= (1 - dt * 1.6);
      if (f.life >= f.max) this.list.splice(i, 1);
    }
  },
  draw(g, camX) {
    for (const f of this.list) {
      const a = clamp(1 - (f.life / f.max) * 1.3, 0, 1);
      Text.draw(g, f.text, f.fixed ? f.x : f.x - camX, f.y, {
        size: f.size, color: f.color, align: 'center', weight: 'bold',
        font: 'Verdana, sans-serif', alpha: a, outline: 'rgba(0,0,0,.7)', outlineW: 4
      });
    }
  }
};

/* --------------------------------- text --------------------------------- */

const Text = {
  draw(g, str, x, y, o) {
    o = o || {};
    g.save();
    if (o.alpha !== undefined) g.globalAlpha = o.alpha;
    const size = o.size || 18;
    g.font = `${o.weight || 'normal'} ${o.italic ? 'italic ' : ''}${size}px ${o.font || 'Georgia, serif'}`;
    g.textAlign = o.align || 'left';
    g.textBaseline = o.baseline || 'alphabetic';
    if (o.shadow) { g.fillStyle = o.shadow; g.fillText(str, x + (o.sdx || 2), y + (o.sdy || 2)); }
    if (o.outline) {
      g.lineWidth = o.outlineW || 3;
      g.strokeStyle = o.outline;
      g.lineJoin = 'round';
      g.strokeText(str, x, y);
    }
    g.fillStyle = o.color || '#fff';
    g.fillText(str, x, y);
    g.restore();
  },
  width(g, str, o) {
    o = o || {};
    g.save();
    g.font = `${o.weight || 'normal'} ${o.size || 18}px ${o.font || 'Georgia, serif'}`;
    const w = g.measureText(str).width;
    g.restore();
    return w;
  },
  wrap(g, str, maxW, o) {
    const words = str.split(' ');
    const lines = []; let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (this.width(g, test, o) > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
};

/* --------------------------------- shapes -------------------------------- */

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Wooden UI panel used by dialogue / shop / menus
function panel(g, x, y, w, h, o) {
  o = o || {};
  g.save();
  g.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, o.top || 'rgba(24,28,46,.95)');
  grad.addColorStop(1, o.bottom || 'rgba(12,15,28,.97)');
  roundRect(g, x, y, w, h, o.r === undefined ? 6 : o.r);
  g.fillStyle = grad; g.fill();
  g.lineWidth = 2; g.strokeStyle = o.border || '#c8a45c'; g.stroke();
  g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.08)';
  roundRect(g, x + 4, y + 4, w - 8, h - 8, 4); g.stroke();
  g.restore();
}
