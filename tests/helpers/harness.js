'use strict';
/* ========================================================================
   Test harness: loads the real game scripts into a Node `vm` sandbox.

   The game is written as plain browser scripts that share globals, exactly
   as index.html loads them. Rather than rewrite it as modules for testing,
   this builds just enough of a browser around it — a canvas whose 2D
   context records instead of drawing, a keyboard and mouse you can drive,
   localStorage, and optionally a fake Web Audio graph — then runs every
   <script> from index.html, in order, in one shared realm.

   Top-level `const` bindings aren't properties of the global object, so
   they're read back by evaluating their names inside the realm (g.Game,
   g.Player, ...). Frames are driven by hand: requestAnimationFrame is a
   no-op here, and nothing advances unless a test calls frame().
   ======================================================================== */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

// the scripts, in exactly the order index.html loads them
function scriptOrder() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
}

// small seeded PRNG (mulberry32) so random-driven tests are repeatable
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------- a recording 2D context --------------------- */

function fakeContext(canvas) {
  const state = {
    fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1,
    font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
    globalCompositeOperation: 'source-over', imageSmoothingEnabled: true,
    lineCap: 'butt', lineJoin: 'miter', filter: 'none', miterLimit: 10
  };
  const calls = Object.create(null);
  const log = [];
  let logging = false;
  let depth = 0;
  let minDepth = 0;

  const special = {
    save() { depth++; },
    restore() { depth--; if (depth < minDepth) minDepth = depth; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return {}; },
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    measureText(s) { return { width: String(s).length * 6 }; },
    isPointInPath() { return false; }
  };

  const api = {
    calls, log,
    depth: () => depth,
    minDepth: () => minDepth,
    startLog() { log.length = 0; logging = true; },
    stopLog() { logging = false; return log.slice(); },
    reset() { for (const k in calls) delete calls[k]; log.length = 0; depth = 0; minDepth = 0; }
  };

  return new Proxy({}, {
    get(_, key) {
      if (key === '__fake') return api;
      if (key === 'canvas') return canvas;
      if (typeof key === 'symbol') return undefined;
      if (key in state) return state[key];
      return function (...args) {
        calls[key] = (calls[key] || 0) + 1;
        if (logging) log.push({ fn: key, args, fillStyle: state.fillStyle, alpha: state.globalAlpha });
        return special[key] ? special[key](...args) : undefined;
      };
    },
    set(_, key, value) {
      if (logging) log.push({ set: key, value });
      state[key] = value;
      return true;
    }
  });
}

function fakeCanvas(width, height) {
  const listeners = Object.create(null);
  const canvas = {
    width: width || 300,
    height: height || 150,
    style: {},
    __listeners: listeners,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    // the game canvas occupies 960x540 CSS pixels at the origin, so mouse
    // coordinates handed to tests map 1:1 onto game coordinates
    getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 540 }; }
  };
  const ctx = fakeContext(canvas);
  canvas.getContext = () => ctx;
  return canvas;
}

/* ------------------------------- fake audio ------------------------------ */

function fakeAudioClass(record) {
  function param(v) {
    return {
      value: v, setValueAtTime() {}, linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {}, cancelScheduledValues() {}
    };
  }
  function node(kind) {
    const n = {
      kind, connections: [],
      connect(to) { n.connections.push(to); return to; },
      disconnect() {}, start() { record.started++; }, stop() {},
      gain: param(1), frequency: param(440), detune: param(0), Q: param(1),
      threshold: param(-24), ratio: param(12), type: 'sine', buffer: null
    };
    record.nodes.push(n);
    return n;
  }
  return class FakeAudioContext {
    constructor() {
      record.contexts++;
      this.state = 'running';
      this.sampleRate = 44100;
      this.currentTime = 0;
      this.destination = node('destination');
    }
    resume() { this.state = 'running'; }
    createGain() { return node('gain'); }
    createOscillator() { return node('oscillator'); }
    createBiquadFilter() { return node('filter'); }
    createDynamicsCompressor() { return node('compressor'); }
    createBufferSource() { return node('bufferSource'); }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  };
}

/* --------------------------------- loader -------------------------------- */

function loadGame(opts) {
  opts = opts || {};
  const windowListeners = Object.create(null);
  const docListeners = Object.create(null);
  const storage = new Map(Object.entries(opts.storage || {}));

  const localStorage = opts.brokenStorage ? {
    getItem() { throw new Error('storage blocked'); },
    setItem() { throw new Error('storage blocked'); },
    removeItem() { throw new Error('storage blocked'); }
  } : {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: k => { storage.delete(k); },
    clear: () => storage.clear()
  };

  const gameCanvas = fakeCanvas(960, 540);
  const audio = { contexts: 0, nodes: [], started: 0 };

  const sandbox = {
    console,
    performance: { now: () => Date.now() },
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; },
    clearTimeout,
    setInterval: () => 0,          // the music scheduler never ticks in tests
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    innerWidth: opts.width || 1280,
    innerHeight: opts.height || 720,
    devicePixelRatio: opts.dpr || 1,
    navigator: {},
    localStorage,
    addEventListener(type, fn) { (windowListeners[type] = windowListeners[type] || []).push(fn); },
    document: {
      visibilityState: 'visible',
      fullscreenElement: null,
      documentElement: {},
      getElementById: () => gameCanvas,
      createElement: () => fakeCanvas(),
      addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); }
    }
  };
  if (opts.audio) sandbox.AudioContext = fakeAudioClass(audio);
  if (opts.native) sandbox.native = opts.native;
  sandbox.window = sandbox;
  if (opts.seed !== undefined) {
    const m = Object.create(Math);
    m.random = seeded(opts.seed);
    sandbox.Math = m;
  }

  const context = vm.createContext(sandbox);
  const files = scriptOrder();
  for (const f of files) {
    const file = path.join(ROOT, f);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }

  const evalIn = code => vm.runInContext(code, context);
  const g = new Proxy({}, { get: (_, name) => evalIn(String(name)) });

  // drawing is presentation only; unit tests skip it for speed unless asked
  if (opts.draw === false) evalIn('Game.draw = function () {}');

  // The sea's own dice (bottles, Excalibur) are seeded from the clock, so any
  // cast could come up special by chance and a test would fail one run in
  // fifteen. Here they are fixed, and never come up special unless a test
  // asks for rareCatches or rigs them itself.
  evalIn('SeaDice.s = ' + ((((opts.seed || 1) * 2654435761) >>> 0) || 1));
  if (!opts.rareCatches) evalIn('SeaDice.chance = function () { return false; }');
  evalIn('Status.s = ' + ((((opts.seed || 1) * 2246822519) >>> 0) || 7));

  const Game = g.Game;
  const emit = (type, ev) => { for (const fn of (windowListeners[type] || [])) fn(ev); };
  const keyEvent = code => ({ code, key: code, repeat: false, preventDefault() {} });

  const api = {
    g, context, sandbox, storage, audio, files,
    eval: evalIn,
    ctx: gameCanvas.getContext('2d').__fake,
    hires: () => evalIn('bctx').__fake,
    emit,
    emitDocument(type, ev) { for (const fn of (docListeners[type] || [])) fn(ev); },

    frame(dt) { Game.frame(dt === undefined ? 1 / 60 : dt); },
    frames(seconds, dt) {
      dt = dt || 1 / 60;
      const n = Math.max(1, Math.round(seconds / dt));
      for (let i = 0; i < n; i++) Game.frame(dt);
    },
    // run frames until a condition holds; returns whether it did
    until(pred, maxSeconds, dt) {
      dt = dt || 1 / 60;
      const n = Math.round((maxSeconds || 10) / dt);
      for (let i = 0; i < n; i++) { if (pred()) return true; Game.frame(dt); }
      return pred();
    },

    keyDown(code) { emit('keydown', keyEvent(code)); },
    keyUp(code) { emit('keyup', keyEvent(code)); },
    // down and up at once: the key counts as tapped until the next endFrame,
    // for driving one module's update() without running a whole frame
    press(code) { api.keyDown(code); api.keyUp(code); },
    tap(code) { api.keyDown(code); Game.frame(1 / 60); api.keyUp(code); Game.frame(1 / 60); },
    hold(code, seconds) { api.keyDown(code); api.frames(seconds); api.keyUp(code); Game.frame(1 / 60); },

    mouseMove(x, y) { for (const fn of (gameCanvas.__listeners.mousemove || [])) fn({ clientX: x, clientY: y }); },
    click(x, y) {
      api.mouseMove(x, y);
      for (const fn of (gameCanvas.__listeners.mousedown || [])) fn({ clientX: x, clientY: y, button: 0 });
    },

    // hold the reel whenever the fish is above the bar: a perfect player
    autoReel(maxSeconds) {
      const F = g.Fishing;
      let down = false;
      const n = Math.round((maxSeconds || 30) * 60);
      for (let i = 0; i < n && F.phase === 'reel'; i++) {
        const want = F.fy < F.by;
        if (want && !down) { api.keyDown('Space'); down = true; }
        if (!want && down) { api.keyUp('Space'); down = false; }
        Game.frame(1 / 60);
      }
      if (down) api.keyUp('Space');
    },

    // skip past the menu and the opening into free play on deck
    startVoyage() {
      g.Game.newGame();
      g.CUT.skip();
      g.Dialogue.hide();
      g.Game.msgs = [];
      Game.frame(1 / 60);
    }
  };
  api.h = api;     // so tests can write `const { h, g } = loadGame()`
  return api;
}

// values made inside the sandbox have that realm's prototypes, which
// deepStrictEqual rejects; compare their plain JSON shape instead
function plain(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

function near(actual, expected, eps, msg) {
  if (!(Math.abs(actual - expected) <= (eps === undefined ? 1e-9 : eps))) {
    throw new Error((msg ? msg + ': ' : '') + 'expected ' + actual + ' to be within ' + eps + ' of ' + expected);
  }
}

module.exports = { loadGame, seeded, fakeContext, fakeCanvas, ROOT, scriptOrder, plain, near };
