'use strict';
/* ========================================================================
   settings.js — player options and the save file, both persisted.

   Everything read back from storage is treated as untrusted: it is merged
   over the defaults field by field and every value is checked against a
   spec, so an old, hand-edited or half-written file can never leave the
   game in a state it can't handle.
   ======================================================================== */

const SETTINGS_KEY = 'deepsupper.settings.v1';
const SAVE_KEY = 'deepsupper.save.v1';       // the autosave, which Continue loads
const SLOT_COUNT = 3;                        // manual save slots
const GAME_VERSION = '1.1.0';

function slotKey(n) { return 'deepsupper.slot' + n + '.v1'; }

/* --------------------------------- storage ------------------------------ */

// localStorage when it works (it persists inside the desktop app too),
// otherwise an in-memory map so the game still runs.
const Store = {
  _mem: {},
  get(key) {
    try { const v = window.localStorage.getItem(key); if (v !== null) return v; } catch (e) { /* blocked */ }
    return Object.prototype.hasOwnProperty.call(this._mem, key) ? this._mem[key] : null;
  },
  set(key, value) {
    this._mem[key] = value;
    try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  },
  remove(key) {
    delete this._mem[key];
    try { window.localStorage.removeItem(key); } catch (e) { /* blocked */ }
  },
  readJSON(key) {
    const raw = this.get(key);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
};

/* --------------------------------- controls ----------------------------- */

// the actions a player may rebind, in the order the Controls screen lists them
const REBINDABLE = ['left', 'right', 'jump', 'down', 'up', 'attack', 'roll', 'interact', 'use'];

const ACTION_LABELS = {
  left: 'Move left', right: 'Move right', jump: 'Jump / reel / swim up', attack: 'Attack',
  roll: 'Roll / dash', interact: 'Interact / set hook', use: 'Bandage',
  up: 'Swim up (also)', down: 'Swim down'
};

const DEFAULT_BINDINGS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space', 'KeyW'],
  down: ['KeyS', 'ArrowDown'],
  up: ['ArrowUp'],
  attack: ['KeyJ', 'KeyX'],
  roll: ['KeyK', 'ShiftLeft'],
  interact: ['KeyE', 'KeyF'],
  use: ['KeyQ']
};

// keys the player can never take over: menus and system shortcuts need them
const RESERVED_KEYS = ['Escape', 'Enter', 'KeyM', 'KeyN', 'F11'];

function keyLabel(code) {
  if (!code) return '—';
  const named = {
    Space: 'SPACE', Enter: 'ENTER', Escape: 'ESC', Backspace: 'BKSP', Tab: 'TAB',
    ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
    AltLeft: 'L-ALT', AltRight: 'R-ALT', ArrowLeft: '←', ArrowRight: '→',
    ArrowUp: '↑', ArrowDown: '↓', CapsLock: 'CAPS', Comma: ',', Period: '.',
    Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
    Minus: '-', Equal: '=', Backquote: '`', Backslash: '\\'
  };
  if (named[code]) return named[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return 'NUM ' + code.slice(6);
  return code.toUpperCase();
}

/* ------------------------------- the schema ----------------------------- */

const SETTINGS_SPEC = {
  // graphics
  fullscreen:    { type: 'bool', def: false },
  scaling:       { type: 'enum', def: 'sharp', values: ['sharp', 'fill'] },
  quality:       { type: 'enum', def: 'auto', values: ['auto', 'high', 'low'] },
  brightness:    { type: 'num', def: 1, min: .7, max: 1.3, step: .05 },
  shake:         { type: 'enum', def: 1, values: [0, .5, 1] },
  particles:     { type: 'enum', def: 'high', values: ['low', 'high'] },
  showFps:       { type: 'bool', def: false },
  flashes:       { type: 'enum', def: 'full', values: ['full', 'soft', 'off'] },
  // audio
  master:        { type: 'num', def: .8, min: 0, max: 1, step: .1 },
  music:         { type: 'num', def: .7, min: 0, max: 1, step: .1 },
  sfx:           { type: 'num', def: .8, min: 0, max: 1, step: .1 },
  muted:         { type: 'bool', def: false },
  musicOff:      { type: 'bool', def: false },
  muteUnfocused: { type: 'bool', def: true },
  // gameplay
  textSpeed:     { type: 'enum', def: 'normal', values: ['slow', 'normal', 'fast', 'instant'] },
  damageNumbers: { type: 'bool', def: true },
  unease:        { type: 'bool', def: true }
};

const TEXT_CPS = { slow: 24, normal: 42, fast: 84, instant: 9999 };

function round2(v) { return Math.round(v * 100) / 100; }

// clamp one value to its spec, or return the default if it can't be used
function sanitizeValue(spec, v) {
  if (spec.type === 'bool') return typeof v === 'boolean' ? v : spec.def;
  if (spec.type === 'enum') return spec.values.indexOf(v) >= 0 ? v : spec.def;
  if (spec.type === 'num') {
    if (typeof v !== 'number' || !isFinite(v)) return spec.def;
    const stepped = spec.min + Math.round((v - spec.min) / spec.step) * spec.step;
    return round2(clamp(stepped, spec.min, spec.max));
  }
  return spec.def;
}

// a binding list must be 1-2 distinct, known-shaped key codes, none reserved
function sanitizeBinding(list, fallback) {
  if (!Array.isArray(list)) return fallback.slice();
  const out = [];
  for (const k of list) {
    if (typeof k !== 'string' || !/^[A-Za-z0-9]+$/.test(k)) continue;
    if (RESERVED_KEYS.indexOf(k) >= 0 || out.indexOf(k) >= 0) continue;
    out.push(k);
    if (out.length === 2) break;
  }
  return out.length ? out : fallback.slice();
}

function defaultSettings() {
  const s = {};
  for (const k in SETTINGS_SPEC) s[k] = SETTINGS_SPEC[k].def;
  s.bindings = {};
  for (const a of REBINDABLE) s.bindings[a] = DEFAULT_BINDINGS[a].slice();
  return s;
}

function sanitizeSettings(raw) {
  const out = defaultSettings();
  if (!raw || typeof raw !== 'object') return out;
  for (const k in SETTINGS_SPEC) if (k in raw) out[k] = sanitizeValue(SETTINGS_SPEC[k], raw[k]);
  if (raw.bindings && typeof raw.bindings === 'object') {
    const saved = REBINDABLE.filter(a => Array.isArray(raw.bindings[a]));
    for (const a of REBINDABLE) out.bindings[a] = sanitizeBinding(raw.bindings[a], DEFAULT_BINDINGS[a]);
    // an action added since the file was saved takes only default keys nobody else has
    const taken = new Set(saved.flatMap(a => out.bindings[a]));
    for (const a of REBINDABLE) {
      if (saved.indexOf(a) >= 0) continue;
      const free = out.bindings[a].filter(k => !taken.has(k));
      if (free.length) out.bindings[a] = free;
      free.forEach(k => taken.add(k));
    }
  }
  return out;
}

/* ------------------------------- Settings ------------------------------- */

const Settings = {
  data: defaultSettings(),
  _hooks: [],

  load() {
    this.data = sanitizeSettings(Store.readJSON(SETTINGS_KEY));
    this.apply();
    return this.data;
  },

  save() {
    return Store.set(SETTINGS_KEY, JSON.stringify(this.data));
  },

  get(key) { return this.data[key]; },

  set(key, value) {
    const spec = SETTINGS_SPEC[key];
    if (!spec) return false;
    this.data[key] = sanitizeValue(spec, value);
    this.apply();
    this.save();
    return true;
  },

  // step a numeric or enum setting one notch in a direction (menus use this)
  nudge(key, dir) {
    const spec = SETTINGS_SPEC[key];
    if (!spec) return;
    const cur = this.data[key];
    if (spec.type === 'bool') return this.set(key, !cur);
    if (spec.type === 'enum') {
      const i = spec.values.indexOf(cur);
      const n = clamp(i + (dir < 0 ? -1 : 1), 0, spec.values.length - 1);
      return this.set(key, spec.values[n]);
    }
    return this.set(key, cur + (dir < 0 ? -spec.step : spec.step));
  },

  /* Rebind an action's primary key. A key can belong to one action only,
     so if another action already uses it, the two actions swap. */
  bind(action, code) {
    if (REBINDABLE.indexOf(action) < 0) return false;
    if (typeof code !== 'string' || RESERVED_KEYS.indexOf(code) >= 0) return false;
    const b = this.data.bindings;
    const old = b[action][0];
    let gaveAway = false;
    for (const other of REBINDABLE) {
      if (other === action) continue;
      const i = b[other].indexOf(code);
      if (i >= 0) {
        if (old && old !== code && b[other].indexOf(old) < 0) { b[other][i] = old; gaveAway = true; }
        else b[other].splice(i, 1);
        if (!b[other].length) b[other] = DEFAULT_BINDINGS[other].filter(k => k !== code).slice(0, 1);
      }
    }
    // the old primary went to the other action, so it can't stay here too
    const rest = b[action].filter(k => k !== code && !(gaveAway && k === old));
    b[action] = [code].concat(rest).slice(0, 2);
    this.apply();
    this.save();
    return true;
  },

  resetBindings() {
    for (const a of REBINDABLE) this.data.bindings[a] = DEFAULT_BINDINGS[a].slice();
    this.apply();
    this.save();
  },

  resetAll() {
    this.data = defaultSettings();
    this.apply();
    this.save();
  },

  // other systems register to hear about changes
  onApply(fn) { this._hooks.push(fn); },

  apply() {
    for (const fn of this._hooks) {
      try { fn(this.data); } catch (e) { /* one broken listener must not stop the rest */ }
    }
  }
};

/* ------------------------------- SaveGame ------------------------------- */

const SAVE_FIELDS = {
  coins:      { type: 'int', min: 0, max: 9999999 },
  hp:         { type: 'int', min: 1, max: 99 },
  maxHp:      { type: 'int', min: 1, max: 99 },
  rod:        { type: 'int', min: 0, max: RODS.length - 1 },
  weapon:     { type: 'int', min: -1, max: WEAPONS.length - 1 },
  bandages:   { type: 'int', min: 0, max: 99 },
  lockets:    { type: 'int', min: 0, max: 99 },
  totalKills: { type: 'int', min: 0, max: 9999999 },
  sold:       { type: 'int', min: 0, max: 9999999 },
  casts:      { type: 'int', min: 0, max: 9999999 },
  lantern:    { type: 'bool' },
  luck:       { type: 'bool' },
  beatBoss:   { type: 'bool' },
  introDone:  { type: 'bool' },
  girlMet:    { type: 'bool' },
  suit:       { type: 'int', min: -1, max: SUITS.length - 1 },
  diveWeapon: { type: 'int', min: -1, max: DIVE_WEAPONS.length - 1 },
  beatMother: { type: 'bool' },
  excalibur:  { type: 'bool' },
  sawEnding:  { type: 'bool' },
  omens:      { type: 'int', min: 0, max: 9999999 }
};

const SaveGame = {
  exists() { return this.read() !== null; },

  // the persistent parts of a run, as plain data
  snapshot() {
    const d = { version: 1, savedAt: Date.now(), crateOpen: !!Game.crateOpen };
    for (const k in SAVE_FIELDS) d[k] = Player[k];
    d.x = Math.round(Player.x);
    d.catches = Player.catches.map(c => ({
      id: c.id, name: c.name, weight: c.weight, value: c.value,
      body: c.body, belly: c.belly, len: c.len
    }));
    d.kills = Object.assign({}, Player.kills);
    d.lore = Player.lore.slice();
    d.records = Object.assign({}, Player.records);
    d.chapters = Player.chapters.slice();
    return d;
  },

  save() {
    return Store.set(SAVE_KEY, JSON.stringify(this.snapshot()));
  },

  // parsed, validated save data, or null when there is nothing usable
  read() {
    const raw = Store.readJSON(SAVE_KEY);
    return this.sanitize(raw);
  },

  sanitize(raw) {
    if (!raw || typeof raw !== 'object' || raw.version !== 1) return null;
    const d = { version: 1, savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0 };
    for (const k in SAVE_FIELDS) {
      const f = SAVE_FIELDS[k], v = raw[k];
      if (f.type === 'bool') d[k] = v === true;
      else d[k] = (typeof v === 'number' && isFinite(v)) ? clamp(Math.round(v), f.min, f.max) : f.min;
    }
    if (d.maxHp < 5) d.maxHp = 5;
    d.hp = clamp(d.hp, 1, d.maxHp);
    d.crateOpen = raw.crateOpen === true || d.weapon >= 0;
    // beating the Old One always leaves you its diving suit and harpoon,
    // including in saves from before there was anything to leave
    if (d.beatBoss && d.suit < 0) d.suit = 0;
    if (d.suit >= 0 && d.diveWeapon < 0) d.diveWeapon = 0;
    d.x = (typeof raw.x === 'number' && isFinite(raw.x)) ? clamp(raw.x, WALK_L, WALK_R) : 640;
    d.kills = {};
    if (raw.kills && typeof raw.kills === 'object') {
      for (const m of allMonsters()) {
        const v = raw.kills[m.id];
        if (typeof v === 'number' && v > 0) d.kills[m.id] = Math.floor(v);
      }
    }
    // the heaviest of each kind landed, and the bestiary chapters already paid for
    d.records = {};
    if (raw.records && typeof raw.records === 'object') {
      for (const m of allMonsters()) {
        const v = raw.records[m.id];
        if (typeof v === 'number' && isFinite(v) && v > 0) d.records[m.id] = clamp(Math.round(v), 1, 100000);
      }
    }
    d.chapters = [];
    if (Array.isArray(raw.chapters)) for (const id of raw.chapters) if (BESTIARY_CHAPTERS.some(c => c.id === id) && d.chapters.indexOf(id) < 0) d.chapters.push(id);
    // letters and relics found: only ones that exist, each once
    d.lore = [];
    if (Array.isArray(raw.lore)) for (const id of raw.lore) if (loreDef(id) && d.lore.indexOf(id) < 0) d.lore.push(id);
    d.catches = [];
    if (Array.isArray(raw.catches)) {
      for (const c of raw.catches.slice(0, 200)) {
        const def = c && monsterDef(c.id);
        if (!def) continue;
        d.catches.push({
          id: def.id, name: def.name, len: def.len, body: def.body, belly: def.belly,
          weight: clamp(Math.round(+c.weight || 0), 1, 100000),
          value: clamp(Math.round(+c.value || 0), 0, 1000000)
        });
      }
    }
    return d;
  },

  /* ---- manual slots: the same data, kept until the player overwrites it ---- */

  validSlot(n) { return Number.isInteger(n) && n >= 1 && n <= SLOT_COUNT; },

  saveSlot(n) {
    if (!this.validSlot(n)) return false;
    return Store.set(slotKey(n), JSON.stringify(this.snapshot()));
  },

  readSlot(n) {
    if (!this.validSlot(n)) return null;
    return this.sanitize(Store.readJSON(slotKey(n)));
  },

  clearSlot(n) { if (this.validSlot(n)) Store.remove(slotKey(n)); },

  anySlot() {
    for (let n = 1; n <= SLOT_COUNT; n++) if (this.readSlot(n)) return true;
    return false;
  },

  // "Deepline Rod · 340§" — what a save holds, in a few words
  describe(d) {
    if (!d) return '— empty —';
    const gear = d.suit >= 0 ? SUITS[d.suit].name : RODS[d.rod].name;
    return gear + ' · ' + d.coins + '§';
  },

  // "16 Sep 19:04"
  stamp(d) {
    if (!d || !d.savedAt) return '';
    const t = new Date(d.savedAt);
    const two = v => (v < 10 ? '0' : '') + v;
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.getMonth()];
    return t.getDate() + ' ' + month + ' ' + two(t.getHours()) + ':' + two(t.getMinutes());
  },

  // put a validated save onto the live Player
  restore(d) {
    if (!d) return false;
    Player.reset();
    for (const k in SAVE_FIELDS) Player[k] = d[k];
    Player.x = d.x;
    Player.catches.length = 0;
    for (const c of d.catches) Player.catches.push(c);
    Player.kills = Object.assign({}, d.kills);
    Player.lore = (d.lore || []).slice();
    Player.records = Object.assign({}, d.records);
    Player.chapters = (d.chapters || []).slice();
    Game.crateOpen = d.crateOpen;
    return true;
  },

  clear() { Store.remove(SAVE_KEY); }
};

/* ----------------------- pushing settings into the engine ---------------- */

// the desktop app does this natively; a browser uses the Fullscreen API
function setFullscreen(on) {
  const native = window.native;
  if (native && native.setFullscreen) {
    try { native.setFullscreen(!!on); } catch (e) { /* the window is going away */ }
    return;
  }
  try {
    const d = document;
    if (on && !d.fullscreenElement && d.documentElement && d.documentElement.requestFullscreen) {
      const p = d.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(() => {});
    } else if (!on && d.fullscreenElement && d.exitFullscreen) {
      const p = d.exitFullscreen();
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) { /* not allowed without a user gesture: fine, it stays windowed */ }
}

let windowFocused = true;

function applyAudio(d) {
  const silent = d.muted || (d.muteUnfocused && !windowFocused);
  Sfx.setLevels(d.master * d.sfx, silent);
  Music.setLevel(d.master * d.music);
  Music.setMuted(silent);
  Music.setEnabled(!d.musicOff);
}

Settings.onApply(d => {
  Prefs.shake = d.shake;
  Prefs.particlesLow = d.particles === 'low';
  Prefs.damageNumbers = d.damageNumbers;
  Prefs.textCps = TEXT_CPS[d.textSpeed] || TEXT_CPS.normal;
  Prefs.showFps = d.showFps;
  if (Prefs.scaling !== d.scaling) { Prefs.scaling = d.scaling; fitCanvas(); }
  if (Prefs.quality !== d.quality) setQuality(d.quality);
  try { canvas.style.filter = d.brightness === 1 ? '' : 'brightness(' + d.brightness + ')'; } catch (e) { /* no style */ }
  Input.setBindings(d.bindings);
  applyAudio(d);
  if (d.fullscreen !== Settings.appliedFullscreen) {
    Settings.appliedFullscreen = d.fullscreen;
    setFullscreen(d.fullscreen);
  }
});

addEventListener('blur', () => { windowFocused = false; applyAudio(Settings.data); });
addEventListener('focus', () => { windowFocused = true; applyAudio(Settings.data); });

// in the app, the window says when it has really changed; whatever it says wins
if (window.native) {
  addEventListener('nativefullscreenchange', e => {
    const on = !!(e && e.detail);
    Settings.appliedFullscreen = on;
    if (Settings.data.fullscreen !== on) {
      Settings.data.fullscreen = on;
      Settings.save();
    }
  });
}

// in a browser the player can leave fullscreen with ESC behind our back
if (!window.native && typeof document.addEventListener === 'function') {
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && Settings.data.fullscreen) {
      Settings.data.fullscreen = false;
      Settings.appliedFullscreen = false;
      Settings.save();
    }
  });
}
