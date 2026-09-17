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

/* ----------------------- the pixel-art pipeline --------------------------
   Game code works in 960x540 coordinates throughout. A frame goes through
   three canvases:

   1. hires   everything is drawn here, at SS x the game resolution. Canvas
              antialiases every edge it draws, but here each antialiased
              band is a sliver a quarter of a final pixel wide.
   2. buffer  the pixel grid (PW x PH). hires is point-sampled down into it
              with smoothing off: one sample from the middle of each pixel,
              which lands inside a shape rather than on its blurred edge.
              That is what makes the edges hard instead of mushy.
   3. canvas  the visible one, sized in device pixels to a whole-number
              multiple of the buffer where the window allows, so every
              pixel comes out the same size.

   PIX is the size of one pixel in game units (2 -> 480x270).              */

const PIX = 2;
const PW = VIEW_W / PIX;   // 480
const PH = VIEW_H / PIX;   // 270

/* Live values the engine reads every frame. Settings.apply writes them;
   nothing here reads Settings directly, so the engine runs (and tests run)
   without the settings module present.                                    */
const Prefs = {
  shake: 1,              // screen shake multiplier
  particlesLow: false,   // fewer particles per burst
  damageNumbers: true,
  textCps: 42,           // dialogue characters per second
  showFps: false,
  scaling: 'sharp',      // 'sharp': whole-number scale where it fits; 'fill'
  quality: 'auto'        // 'auto' | 'high' | 'low' supersampling
};

// supersampling. 2 leaves blended pixels on about a quarter of edges, 1 on
// about half; 2 costs roughly three times the fill work, so it steps down
// on its own if the machine starts dropping frames (see watchFrames).
let SS = 2;

const hires = document.createElement('canvas');
const bctx = hires.getContext('2d');
function setSupersample(n) {
  SS = n;
  hires.width = VIEW_W * SS;
  hires.height = VIEW_H * SS;
  bctx.imageSmoothingEnabled = false;   // resizing a canvas resets its state
}
setSupersample(SS);

/* Called with each raw frame delta. If more than a third of the last ~90
   visible frames ran long, the fill work is too much for this machine:
   drop to 1x supersampling once and stay there.                           */
const _frameLog = [];
function watchFrames(rawDt) {
  if (Prefs.quality !== 'auto') return;
  if (SS === 1 || document.visibilityState !== 'visible') return;
  if (rawDt > .25) return;                 // a tab switch, not a slow frame
  _frameLog.push(rawDt > .022 ? 1 : 0);
  if (_frameLog.length < 90) return;
  const slow = _frameLog.reduce((a, b) => a + b, 0);
  _frameLog.length = 0;
  if (slow > 30) setSupersample(1);
}

// 'high' pins 2x, 'low' pins 1x, 'auto' starts at 2x and may step down
function setQuality(q) {
  Prefs.quality = q;
  _frameLog.length = 0;
  const want = q === 'low' ? 1 : 2;
  if (SS !== want) setSupersample(want);
}

const buffer = document.createElement('canvas');
buffer.width = PW;
buffer.height = PH;
const pctx = buffer.getContext('2d');
pctx.imageSmoothingEnabled = false;

// replaces setTransform(1,0,0,1,0,0) — back to plain game space, not identity
function resetTransform(g) { g.setTransform(SS, 0, 0, SS, 0, 0); }

// snap a game-space coordinate onto the pixel grid
function snap(v) { return Math.round(v / PIX) * PIX; }

// hires -> pixel grid -> screen, nearest-neighbour both ways
function present() {
  pctx.imageSmoothingEnabled = false;
  pctx.drawImage(hires, 0, 0, hires.width, hires.height, 0, 0, PW, PH);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buffer, 0, 0, PW, PH, 0, 0, canvas.width, canvas.height);
}

/* Size the visible canvas in real device pixels. A whole-number scale gives
   every pixel identical size; a fractional one makes some columns wider
   than others, which reads as dirt. Use the whole number unless it would
   leave the game much smaller than the window.                            */
function computeCanvasSize(cssW, cssH, dpr, mode) {
  const availW = Math.max(160, cssW) * dpr;
  const availH = Math.max(90, cssH) * dpr;
  const fit = Math.min(availW / PW, availH / PH);
  let scale = Math.floor(fit);
  if (mode === 'fill' || scale < 1 || scale / fit < .7) scale = fit;
  const w = Math.round(PW * scale), h = Math.round(PH * scale);
  return { w, h, cssW: w / dpr, cssH: h / dpr, scale };
}

function fitCanvas() {
  const s = computeCanvasSize(window.innerWidth, window.innerHeight,
    window.devicePixelRatio || 1, Prefs.scaling);
  if (canvas.width !== s.w || canvas.height !== s.h) {
    canvas.width = s.w;
    canvas.height = s.h;
  }
  canvas.style.width = s.cssW + 'px';
  canvas.style.height = s.cssH + 'px';
}
addEventListener('resize', fitCanvas);
fitCanvas();

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

/* Gameplay actions come from the player's bindings (see Settings) and are
   replaced wholesale by Input.setBindings. Menu and system actions are
   fixed, so a player can never rebind themselves out of the menus.       */
const ACTIONS = {
  left:      ['KeyA', 'ArrowLeft'],
  right:     ['KeyD', 'ArrowRight'],
  jump:      ['Space', 'KeyW'],
  attack:    ['KeyJ', 'KeyX'],
  roll:      ['KeyK', 'ShiftLeft'],
  interact:  ['KeyE', 'KeyF'],
  use:       ['KeyQ'],
  up:        ['ArrowUp'],          // swimming; jump's keys swim up too
  down:      ['KeyS', 'ArrowDown'],

  menuUp:    ['ArrowUp', 'KeyW'],
  menuDown:  ['ArrowDown', 'KeyS'],
  menuLeft:  ['ArrowLeft', 'KeyA'],
  menuRight: ['ArrowRight', 'KeyD'],
  confirm:   ['Enter', 'Space', 'KeyE'],
  cancel:    ['Escape', 'Backspace'],
  mute:      ['KeyM'],
  music:     ['KeyN'],
  fullscreen:['F11']
};
const BLOCKED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace', 'Tab', 'F11']);

const Input = (function () {
  const held = new Set();
  const tapped = new Set();
  let anyTapped = false;
  let capture = null;                   // a pending "press a key" request
  const mouse = { x: -1, y: -1, moved: false, click: false, down: false, inside: false };

  /* Where the pointer is, in game pixels. Returns false when it has not
     actually moved: browsers send a mousemove when the page changes under a
     still pointer, and a still pointer must never take the menu cursor off
     whatever the keys have chosen. */
  function toGame(e) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const x = (e.clientX - r.left) / r.width * VIEW_W;
    const y = (e.clientY - r.top) / r.height * VIEW_H;
    const still = Math.abs(x - mouse.x) < .5 && Math.abs(y - mouse.y) < .5;
    mouse.x = x; mouse.y = y;
    mouse.inside = x >= 0 && y >= 0 && x <= VIEW_W && y <= VIEW_H;
    return !still;
  }

  addEventListener('keydown', e => {
    if (BLOCKED.has(e.code)) e.preventDefault();
    Sfx.unlock();
    if (e.repeat) return;
    if (capture) {                      // rebinding: this key goes to the menu, nowhere else
      const cb = capture; capture = null;
      cb(e.code);
      return;
    }
    held.add(e.code);
    tapped.add(e.code);
    anyTapped = true;
  });
  addEventListener('keyup', e => held.delete(e.code));
  addEventListener('blur', () => { held.clear(); mouse.down = false; });
  addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
  canvas.addEventListener('mousemove', e => { if (toGame(e)) mouse.moved = true; });
  canvas.addEventListener('mousedown', e => {
    Sfx.unlock();
    toGame(e);
    if (e.button === 0) { mouse.click = true; mouse.down = true; }
  });

  return {
    held(a) { const k = ACTIONS[a]; if (!k) return false; for (let i = 0; i < k.length; i++) if (held.has(k[i])) return true; return false; },
    tap(a) { const k = ACTIONS[a]; if (!k) return false; for (let i = 0; i < k.length; i++) if (tapped.has(k[i])) return true; return false; },
    anyTap() { return anyTapped; },
    mouse() { return mouse; },
    capturing() { return capture !== null; },
    captureNext(cb) { capture = cb; },
    cancelCapture() { capture = null; },
    setBindings(b) {
      for (const a in b) if (Array.isArray(b[a]) && b[a].length) ACTIONS[a] = b[a].slice();
      held.clear();
    },
    endFrame() { tapped.clear(); anyTapped = false; mouse.moved = false; mouse.click = false; }
  };
})();

/* --------------------------------- audio -------------------------------- */

// how far the underwater lowpass opens, above and below the surface
const OPEN_HZ = 22000, MUFFLED_HZ = 1100;

const Sfx = {
  ac: null, master: null, bus: null, muffle: null, muted: false, ready: false,
  under: false, bed: null,
  level: .64,          // master x sfx volume, 0..1

  // what the master gain node should be set to right now
  // scaled so the default volumes (80% x 80%) sound as loud as they always did
  gainValue() { return this.muted ? 0 : 0.47 * this.level; },

  /* Effects go bus -> muffle -> master -> speakers. The muffle is a lowpass
     that sits wide open above water and closes right down below it, so
     every sound gets that thick underwater quality without each one
     needing to know where it is playing. */
  unlock() {
    if (!this.ac) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ac = new AC();
        this.master = this.ac.createGain();
        this.master.gain.value = this.gainValue();
        this.master.connect(this.ac.destination);
        this.muffle = this.ac.createBiquadFilter();
        this.muffle.type = 'lowpass';
        this.muffle.frequency.value = this.under ? MUFFLED_HZ : OPEN_HZ;
        this.muffle.connect(this.master);
        this.bus = this.ac.createGain();
        this.bus.connect(this.muffle);
        this.ready = true;
        if (this.under) this._startBed();
      } catch (e) { return; }
    }
    if (this.ac.state === 'suspended') this.ac.resume();
    if (typeof Music !== 'undefined') Music.ensure();
  },
  setLevels(level, muted) {
    this.level = clamp(level, 0, 1);
    this.muted = !!muted;
    if (this.master) this.master.gain.value = this.gainValue();
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
    osc.connect(g); g.connect(this.bus);
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
    src.connect(f); f.connect(g); g.connect(this.bus);
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
  text()   { this.tone({ f: 520 + Math.random() * 120, dur: .018, type: 'square', vol: .035 }); },
  // Dorran getting his words out: low, round and not entirely steady
  mumble() { if (this.ready && !this.muted) this.tone({ f: 130 + Math.random() * 70, f2: 110 + Math.random() * 40, dur: .05, type: 'triangle', vol: .05 }); },

  /* ------------------------------ underwater ------------------------------ */

  // close the muffle and start the rumble of deep water, or open it back up
  setUnderwater(on) {
    on = !!on;
    if (on === this.under) return;
    this.under = on;
    if (!this.ready) return;
    const f = this.muffle.frequency, t = this.ac.currentTime;
    f.cancelScheduledValues(t);
    f.value = on ? MUFFLED_HZ : OPEN_HZ;
    if (on) this._startBed(); else this._stopBed();
  },

  // brown noise through a low filter, swelling slowly: the sound of a lot of water
  _startBed() {
    if (this.bed || !this.ready) return;
    const ac = this.ac, n = ac.sampleRate * 3;
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { last = (last + (Math.random() * 2 - 1) * .02) / 1.02; d[i] = last * 3.5; }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    const g = ac.createGain(); g.gain.value = .22;
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = .09; lg.gain.value = .08;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.bus);
    src.start(); lfo.start();
    this.bed = { src, lfo, g };
  },

  _stopBed() {
    const b = this.bed;
    if (!b) return;
    this.bed = null;
    try { b.g.gain.value = 0; b.src.stop(); b.lfo.stop(); } catch (e) { /* already stopped */ }
  },

  bubbleBlip(v) {
    const f = 450 + Math.random() * 500;
    this.tone({ f, f2: f * 2.3, dur: .05 + Math.random() * .03, type: 'sine', vol: .05 * (v === undefined ? 1 : v) });
  },
  bubbles(n, spread) {
    for (let i = 0; i < n; i++) setTimeout(() => this.bubbleBlip(.8), Math.random() * (spread || 400));
  },
  // in through the regulator with a hiss, out in a stream of bubbles
  breathe() {
    this.noise({ f: 1800, f2: 2400, dur: .7, filter: 'bandpass', vol: .05 });
    setTimeout(() => this.bubbles(5, 500), 1200);
  },
  plunge() {
    this.noise({ f: 700, f2: 180, dur: 1, vol: .3 });
    this.bubbles(10, 900);
  },
  climbOut() {
    this.splash();
    [150, 330, 520].forEach(d => setTimeout(() => this.tone({ f: 1500 + Math.random() * 600, dur: .03, type: 'sine', vol: .05 }), d));
  },
  suitUp() {
    this.tone({ f: 320, f2: 200, dur: .07, type: 'square', vol: .14 });
    setTimeout(() => this.tone({ f: 180, dur: .22, type: 'triangle', vol: .16 }), 90);
    [260, 300, 340].forEach(d => setTimeout(() => this.tone({ f: 1100, dur: .015, type: 'square', vol: .05 }), d));
  },
  // a heartbeat of warning from the gauge on the helmet
  lowAir(urgent) {
    this.tone({ f: urgent ? 1760 : 1480, dur: .06, type: 'square', vol: .06 });
    setTimeout(() => this.tone({ f: urgent ? 1760 : 1480, dur: .06, type: 'square', vol: .06 }), 140);
  },
  // the suit complaining about the weight of water on it
  creak(hard) {
    this.tone({ f: hard ? 60 : 75, f2: 48, dur: hard ? .7 : .45, type: 'sawtooth', vol: hard ? .14 : .08 });
    this.noise({ f: 320, f2: 180, dur: .4, filter: 'bandpass', vol: hard ? .12 : .06 });
  },
  sonar() {
    this.tone({ f: 1320, dur: 1.6, type: 'sine', vol: .035, atk: .004 });
    setTimeout(() => this.tone({ f: 1320, dur: 1.2, type: 'sine', vol: .012, atk: .004 }), 650);
  },
  // something enormous, very far away, singing
  moan() {
    this.tone({ f: 170, f2: 105, dur: 3.2, type: 'sine', vol: .07, atk: .8 });
    this.tone({ f: 342, f2: 214, dur: 2.6, type: 'triangle', vol: .02, atk: .9 });
  },
  hurtUnder() {
    this.tone({ f: 130, f2: 50, dur: .3, type: 'sine', vol: .3 });
    this.noise({ f: 500, f2: 120, dur: .25, vol: .18 });
    this.bubbles(6, 300);
  },
  hitWet(crit) {
    this.tone({ f: crit ? 220 : 150, f2: 60, dur: .14, type: 'sine', vol: .26 });
    this.noise({ f: 900, f2: 200, dur: .14, vol: .16 });
  },
  // creature sounds, deeper for bigger things and quieter further away
  growl(len, level) {
    const f = clamp(210 - len * .3, 34, 170), v = level === undefined ? 1 : level;
    this.tone({ f, f2: f * .7, dur: .6, type: 'sawtooth', vol: .1 * v });
    this.noise({ f: 400, f2: 150, dur: .5, vol: .06 * v });
  },
  chomp(level) {
    const v = level === undefined ? 1 : level;
    this.tone({ f: 140, f2: 55, dur: .12, type: 'square', vol: .14 * v });
    this.noise({ f: 1200, f2: 300, dur: .09, filter: 'bandpass', vol: .12 * v });
  },
  rush(level) { this.noise({ f: 250, f2: 1300, dur: .55, filter: 'bandpass', vol: .18 * (level === undefined ? 1 : level) }); },
  inkSquirt(level) { this.noise({ f: 1100, f2: 260, dur: .22, vol: .12 * (level === undefined ? 1 : level) }); },
  pulseBoom(level) {
    const v = level === undefined ? 1 : level;
    this.tone({ f: 64, f2: 34, dur: .9, type: 'sine', vol: .34 * v });
    this.noise({ f: 220, f2: 80, dur: .8, vol: .16 * v });
  },
  creatureDie(len) {
    const f = clamp(160 - len * .15, 40, 140);
    this.tone({ f, f2: f * .35, dur: 1.3, type: 'sawtooth', vol: .15 });
    this.bubbles(12, 1000);
  },
  blackout() {
    this.tone({ f: 55, dur: .3, type: 'sine', vol: .35 });
    setTimeout(() => this.tone({ f: 50, dur: .35, type: 'sine', vol: .3 }), 420);
    this.bubbles(14, 1200);
  },
  motherRoar() {
    this.tone({ f: 58, f2: 30, dur: 1.8, type: 'sawtooth', vol: .32 });
    this.tone({ f: 116, f2: 70, dur: 1.4, type: 'sawtooth', vol: .12 });
    this.noise({ f: 300, f2: 90, dur: 1.6, vol: .24 });
  },
  broodSqueal() {
    [0, 90, 170].forEach(d => setTimeout(() => this.tone({ f: 900 + Math.random() * 300, f2: 1500, dur: .14, type: 'square', vol: .05 }), d));
  },
  inhale() { this.noise({ f: 300, f2: 1400, dur: 1.7, filter: 'bandpass', vol: .26 }); },

  // each launcher sounds like what it is
  fireUnder(style) {
    switch (style) {
      case 'harpoon':
        this.tone({ f: 190, f2: 60, dur: .14, type: 'square', vol: .22 });
        this.noise({ f: 900, f2: 2600, dur: .18, filter: 'bandpass', vol: .16 });
        break;
      case 'spread':
        this.tone({ f: 240, f2: 120, dur: .1, type: 'square', vol: .12 });
        [0, 45, 90].forEach(d => setTimeout(() => this.noise({ f: 1800, f2: 600, dur: .08, filter: 'bandpass', vol: .14 }), d));
        break;
      case 'chain':
        this.tone({ f: 1600, f2: 220, dur: .22, type: 'sawtooth', vol: .12 });
        this.noise({ f: 4000, f2: 1200, dur: .2, filter: 'highpass', vol: .1 });
        break;
      case 'pierce':
        this.tone({ f: 110, f2: 45, dur: .3, type: 'triangle', vol: .3 });
        this.noise({ f: 600, f2: 3000, dur: .22, filter: 'bandpass', vol: .18 });
        break;
      case 'wave':
        for (const [f, v] of [[392, 1], [930, .4], [1860, .18]]) this.tone({ f, dur: 1.4, type: 'sine', vol: .22 * v, atk: .005 });
        this.tone({ f: 70, f2: 40, dur: .6, type: 'sine', vol: .3 });
        break;
    }
  },
  // the line paying out, and the harpoon clunking home
  reelOut() { [0, 40, 80, 120].forEach(d => setTimeout(() => this.tone({ f: 900, dur: .02, type: 'square', vol: .05 }), d)); },
  reelIn()  { this.tone({ f: 260, f2: 140, dur: .08, type: 'square', vol: .14 }); },
  zapUnder() { this.noise({ f: 5000, f2: 900, dur: .25, filter: 'highpass', vol: .14 }); this.tone({ f: 80, f2: 60, dur: .2, type: 'sawtooth', vol: .1 }); },
  dashUnder() { this.noise({ f: 400, f2: 1600, dur: .3, filter: 'bandpass', vol: .18 }); this.bubbles(4, 250); },

  /* ------------------------ weather, and the night ------------------------ */
  // thunder: a crack when it is close, a long low roll either way
  thunder(near) {
    if (near > .6) this.noise({ f: 2400, f2: 300, dur: .35, vol: .16 });
    this.noise({ f: 260, f2: 60, dur: 2.4, vol: .22 + near * .12 });
    this.tone({ f: 48, f2: 30, dur: 1.8, type: 'sine', vol: .16 });
  },
  rain(level) { this.noise({ f: 5200, f2: 3000, dur: .45, filter: 'highpass', vol: .035 * level }); },
  // the ship's bell, once, softly
  bellToll() {
    this.tone({ f: 587, dur: 2.2, type: 'sine', vol: .07, atk: .01 });
    this.tone({ f: 1480, dur: 1.2, type: 'sine', vol: .025, atk: .01 });
  },
  knock() { this.tone({ f: 90, f2: 55, dur: .16, type: 'triangle', vol: .16 }); this.noise({ f: 300, f2: 80, dur: .1, vol: .08 }); },
  // voices a long way off
  choir() {
    for (const f of [220, 277, 330]) this.tone({ f, f2: f * .98, dur: 4.2, type: 'sine', vol: .018, atk: 1.4 });
  }
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
    const s = this.shake * Prefs.shake;
    // snap to the pixel grid so the view never sits between pixels
    this.x = snap(this.x);
    this.shakeX = snap((Math.random() * 2 - 1) * s);
    this.shakeY = snap((Math.random() * 2 - 1) * s * .7);
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
  burst(x, y, n, o) {
    if (Prefs.particlesLow) n = Math.ceil(n * .4);
    for (let i = 0; i < n; i++) this.add(x, y, o);
  },
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
      const cx = p.fixed ? p.x : p.x - camX;
      // particles are whole-pixel squares on the grid: a rotated two-pixel
      // square is just noise, and anything under a pixel would flicker
      let s = p.shape === 'circle' ? p.size * 2 * Math.max(.4, a) : p.size;
      s = Math.max(PIX, Math.round(s / PIX) * PIX);
      g.fillRect(snap(cx - s / 2), snap(p.y - s / 2), s, p.shape === 'streak' ? s * 2 : s);
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

/* Text is drawn with the bitmap font in font.js. The option bag is the one
   the rest of the game already passes around — `size` is a 960-space font
   height, which maps onto a whole number of font pixels so glyphs always
   land square on the buffer grid. `y` stays the baseline, as it was with
   fillText, so no call site had to move.                                  */
const Text = {
  // 960-space pixel size of one font pixel, for a requested font height
  scaleFor(size) {
    // one font pixel is one world pixel for all ordinary text, so letters
    // share the world's pixel density; only headings go bigger
    const s = size || 18;
    const units = s <= 24 ? 1 : s <= 40 ? 2 : s <= 56 ? 3 : s <= 70 ? 4 : 5;
    return units * PIX;
  },

  draw(g, str, x, y, o) {
    o = o || {};
    str = String(str);
    const px = this.scaleFor(o.size);
    const w = Font.width(str, px);
    let dx = x;
    if (o.align === 'center') dx = x - w / 2;
    else if (o.align === 'right') dx = x - w;
    // callers position by baseline; the glyph box sits above it
    let dy = y - FONT_H * px;
    if (o.baseline === 'top') dy = y;
    else if (o.baseline === 'middle') dy = y - FONT_H * px / 2;
    dx = snap(dx); dy = snap(dy);

    g.save();
    if (o.alpha !== undefined) g.globalAlpha = o.alpha;
    if (o.shadow) Font.draw(g, str, dx + px, dy + px, px, o.shadow);
    if (o.outline) {
      g.beginPath();
      if (px <= PIX) {
        // Small text: one solid pixel of shadow straight below. A full
        // outline closes up the counters of 'a', 'e' and '0' at this size,
        // and a diagonal shadow doubles every stroke.
        Font.path(g, str, dx, dy + px, px);
      } else {
        Font.path(g, str, dx - px, dy, px);
        Font.path(g, str, dx + px, dy, px);
        Font.path(g, str, dx, dy - px, px);
        Font.path(g, str, dx, dy + px, px);
      }
      // opaque, so it is a crisp shape and not a translucent smudge
      g.fillStyle = String(o.outline).replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)');
      g.fill();
    }
    Font.draw(g, str, dx, dy, px, o.color || '#fff');
    g.restore();
  },

  width(g, str, o) {
    o = o || {};
    return Font.width(String(str), this.scaleFor(o.size));
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
  g.lineWidth = 3; g.strokeStyle = o.border || '#c8a45c'; g.stroke();
  g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.08)';
  roundRect(g, x + 4, y + 4, w - 8, h - 8, 4); g.stroke();
  g.restore();
}

// '#rrggbb' -> [r,g,b]
function hexRgb(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// how much the boy should squash or stretch right now
function bodySquash(P) {
  if (P.landT > 0) return lerp(.80, 1, 1 - P.landT / .2);
  if (P.y < DECK_Y - 2) return clamp(1 + Math.abs(P.vy) / 3400, 1, 1.13);
  return 1;
}
