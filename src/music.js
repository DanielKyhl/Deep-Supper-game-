'use strict';
/* ========================================================================
   music.js — procedural score. No audio files: everything is synthesised
   from oscillators at runtime, in D minor, because the sea is sad.
   ======================================================================== */

const SEMI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function hz(name, shift) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) return 220;
  const midi = SEMI[m[1]] + (parseInt(m[2], 10) + 1) * 12 + (shift || 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const CHORD = {
  m:   [0, 3, 7],
  M:   [0, 4, 7],
  m7:  [0, 3, 7, 10],
  M7:  [0, 4, 7, 11],
  sus: [0, 5, 7],
  dim: [0, 3, 6],
  five:[0, 7],
  tri: [0, 6, 11]   // for when something is wrong
};

/* Each theme: bpm, how many 8th-steps per bar, and a chord per bar.
   voice() decides what actually sounds on a given step.                  */

const THEMES = {

  /* the harbour, before anything has gone wrong */
  title: {
    bpm: 68, bar: 8, vol: 0.85,
    prog: [['D3', 'm'], ['A#2', 'M'], ['F2', 'M'], ['C3', 'M'],
           ['D3', 'm'], ['A#2', 'M'], ['G2', 'm'], ['A2', 'M']],
    mel: [null, 'A4', null, 'D5', null, 'C5', null, 'A4',
          null, 'F4', null, 'A4', null, 'G4', null, null],
    voice(M, t, step, bar, beat, chord) {
      if (beat === 0) M._bass(t, hz(chord[0], -12), 1.9, .20);
      if (beat === 0) M._pad(t, M._notes(chord, 0), 3.2, .045);
      // gentle harp figure
      const arp = [0, 2, 3, 5, 6];
      if (arp.indexOf(beat) >= 0) {
        const ns = M._notes(chord, 24);
        M._pluck(t, ns[(beat * 2 + bar) % ns.length], 1.5, .085);
      }
      const mn = this.mel[(bar * 2 + (beat >= 4 ? 1 : 0)) % this.mel.length];
      if (mn && (beat === 0 || beat === 4)) M._lead(t, hz(mn), 1.4, .07);
    }
  },

  /* on deck at night: sparser, colder, a drone underneath */
  sea: {
    bpm: 62, bar: 8, vol: 0.8, drone: 'D1',
    prog: [['D3', 'm'], ['D3', 'm7'], ['A#2', 'M7'], ['F2', 'M'],
           ['G2', 'm'], ['A#2', 'M'], ['D3', 'm'], ['A2', 'sus']],
    voice(M, t, step, bar, beat, chord) {
      if (beat === 0) M._bass(t, hz(chord[0], -12), 2.4, .17);
      if (beat === 0) M._pad(t, M._notes(chord, 0), 4.2, .05);
      if (beat === 3 || beat === 6) {
        const ns = M._notes(chord, 24);
        M._pluck(t, ns[(beat + bar) % ns.length], 1.9, .06);
      }
      // a bell, rarely, like a buoy a long way off
      if (bar % 4 === 3 && beat === 5) M._bell(t, hz('D5'), 3.4, .05);
      if (beat === 4 && bar % 2 === 1) M._lead(t, hz(chord[0], 12), 1.6, .04);
    }
  },

  /* hauling something up that does not want to come */
  battle: {
    bpm: 138, bar: 8, vol: 1.0,
    prog: [['D2', 'five'], ['D2', 'five'], ['A#1', 'five'], ['A#1', 'five'],
           ['C2', 'five'], ['C2', 'five'], ['G1', 'five'], ['A1', 'five']],
    voice(M, t, step, bar, beat, chord) {
      // driving eighth-note engine
      M._bass(t, hz(chord[0]), .22, beat % 2 === 0 ? .20 : .13, 'sawtooth');
      if (beat === 0 || beat === 3 || beat === 6) M._drum(t, 'kick');
      if (beat === 2 || beat === 6) M._drum(t, 'snare');
      if (beat % 2 === 1) M._drum(t, 'hat');
      if (beat === 0) M._pad(t, M._notes([chord[0], 'm'], 12), 1.2, .05);
      // knife-edge stabs
      const stab = [0, 3, 4, 6];
      if (stab.indexOf(beat) >= 0 && bar % 2 === 1) {
        M._pluck(t, hz(chord[0], 24 + (beat === 4 ? 1 : 0)), .28, .10, 'square');
      }
    }
  },

  /* the thing at the bottom */
  boss: {
    bpm: 92, bar: 8, vol: 1.0, drone: 'D0',
    prog: [['D2', 'tri'], ['D2', 'tri'], ['G#1', 'five'], ['G#1', 'five'],
           ['C2', 'tri'], ['A#1', 'tri'], ['G#1', 'five'], ['A1', 'dim']],
    voice(M, t, step, bar, beat, chord) {
      if (beat === 0 || beat === 4) M._bass(t, hz(chord[0], -12), 1.1, .26, 'sawtooth');
      if (beat === 0) M._pad(t, M._notes(chord, 0), 2.6, .06);
      if (beat === 0 || beat === 5) M._drum(t, 'tom');
      if (beat === 2 || beat === 6) M._drum(t, 'kick');
      // a choir that is not a choir
      if (beat === 4 && bar % 2 === 0) M._pad(t, M._notes(chord, 12), 2.2, .035);
      if (beat === 7) M._pluck(t, hz(chord[0], 25), .5, .07, 'square');
      if (bar % 4 === 2 && beat === 3) M._bell(t, hz('G#4'), 4.0, .05);
    }
  },

  /* Nerys, and the city under the boat: warm, slow, and a long way down */
  lanthorne: {
    bpm: 64, bar: 8, vol: .85,
    prog: [['F2', 'M7'], ['A2', 'm7'], ['A#2', 'M7'], ['C3', 'sus'],
           ['D3', 'm7'], ['A#2', 'M7'], ['G2', 'm7'], ['C3', 'M']],
    voice(M, t, step, bar, beat, chord) {
      if (beat === 0) M._bass(t, hz(chord[0], -12), 2.8, .12);
      if (beat === 0) M._pad(t, M._notes(chord, 12), 4.2, .045);
      const ns = M._notes(chord, 24);
      if (beat % 2 === 0) M._pluck(t, ns[(beat / 2 + bar) % ns.length], 2.2, .06);
      if (beat === 3 || beat === 7) M._bell(t, ns[(bar + beat) % ns.length] * 2, 2.8, .028);
    }
  },

  /* sailing home */
  ending: {
    bpm: 74, bar: 8, vol: .9,
    prog: [['F2', 'M'], ['C3', 'M'], ['D3', 'm7'], ['A#2', 'M7'],
           ['F2', 'M'], ['C3', 'M'], ['A#2', 'M'], ['F2', 'M7']],
    voice(M, t, step, bar, beat, chord) {
      if (beat === 0) M._bass(t, hz(chord[0], -12), 2.2, .18);
      if (beat === 0) M._pad(t, M._notes(chord, 0), 3.6, .055);
      const arp = [0, 1, 3, 4, 6];
      if (arp.indexOf(beat) >= 0) {
        const ns = M._notes(chord, 24);
        M._pluck(t, ns[(beat + bar * 3) % ns.length], 1.4, .075);
      }
      if (beat === 2 && bar % 2 === 0) M._lead(t, hz(chord[0], 28), 1.8, .06);
    }
  }
};

const Music = {
  out: null, comp: null, on: false, muted: false, enabled: true,
  level: .56,          // master x music volume, 0..1
  theme: null, themeName: null, pending: null,
  step: 0, nextTime: 0, timer: null, spb: .4,
  droneOsc: null, droneGain: null, fade: 1,

  /* ---------------------------- lifecycle ---------------------------- */

  ensure() {
    if (this.out || !Sfx.ac) return;
    const ac = Sfx.ac;
    this.comp = ac.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 6;
    this.out = ac.createGain();
    this.out.gain.value = 0;
    this.out.connect(this.comp);
    this.comp.connect(ac.destination);
    if (this.themeName) this._apply(this.themeName, true);
    this._run();
  },

  set(name, opts) {
    if (name === this.themeName && this.on) return;
    if (!THEMES[name]) return;
    if (!this.out) { this.themeName = name; this.ensure(); return; }
    if ((opts && opts.now) || !this.themeName) { this._apply(name, true); return; }
    this.pending = name;
    this._ramp(0, .45);
    clearTimeout(this._sw);
    this._sw = setTimeout(() => {
      if (this.pending) { this._apply(this.pending, false); this.pending = null; }
    }, 470);
  },

  _apply(name, immediate) {
    this.themeName = name;
    this.theme = THEMES[name];
    this.spb = 60 / this.theme.bpm / 2;     // one 8th note
    this.step = 0;
    this.on = true;
    if (Sfx.ac) this.nextTime = Sfx.ac.currentTime + .06;
    this._setDrone(this.theme.drone);
    this._ramp(this.targetGain(), immediate ? .5 : .9);
  },

  stop() {
    this.on = false;
    this._ramp(0, .5);
    this._setDrone(null);
  },

  // the gain the score should sit at, given theme, volume and mute state
  targetGain() {
    if (this.muted || !this.enabled || !this.on) return 0;
    return (this.theme ? (this.theme.vol || 1) : 1) * .17 * this.level * 1.8;
  },

  setMuted(m) {
    this.muted = !!m;
    this._ramp(this.targetGain(), .3);
  },

  setLevel(v) {
    this.level = clamp(v, 0, 1);
    this._ramp(this.targetGain(), .2);
  },

  setEnabled(on) {
    this.enabled = !!on;
    this._ramp(this.targetGain(), .3);
  },

  toggle() {
    this.enabled = !this.enabled;
    this.setMuted(this.muted);
    return this.enabled;
  },

  _ramp(v, time) {
    if (!this.out || !Sfx.ac) return;
    const t = Sfx.ac.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(.0001, this.out.gain.value), t);
    this.out.gain.linearRampToValueAtTime(Math.max(0, v), t + time);
  },

  /* ------------------------------ engine ----------------------------- */

  _run() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.on || !Sfx.ac || !this.theme) return;
      if (Sfx.ac.state === 'suspended') return;
      const ac = Sfx.ac;
      let guard = 0;
      while (this.nextTime < ac.currentTime + .25 && guard++ < 64) {
        this._tick(this.nextTime, this.step);
        this.nextTime += this.spb;
        this.step++;
      }
    }, 25);
  },

  _tick(t, step) {
    const th = this.theme;
    const bar = Math.floor(step / th.bar) % th.prog.length;
    const beat = step % th.bar;
    const chord = th.prog[bar];
    try { th.voice(this, t, step, bar, beat, chord); } catch (e) { /* never let music kill a frame */ }
  },

  // chord tones as frequencies, transposed by `up` semitones
  _notes(chord, up) {
    const ivals = CHORD[chord[1]] || CHORD.m;
    return ivals.map(i => hz(chord[0], i + (up || 0)));
  },

  /* --------------------------- instruments --------------------------- */

  _pluck(t, f, dur, vol, type) {
    const ac = Sfx.ac;
    const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(f, t);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(7000, f * 7), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(180, f * 1.6), t + dur);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + .014);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dur + .05);
  },

  _lead(t, f, dur, vol) {
    const ac = Sfx.ac;
    const o = ac.createOscillator(), g = ac.createGain();
    const vib = ac.createOscillator(), vg = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    vib.frequency.value = 4.6; vg.gain.value = f * .006;
    vib.connect(vg); vg.connect(o.frequency);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + .13);
    g.gain.setValueAtTime(vol, t + dur * .55);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(this.out);
    o.start(t); vib.start(t);
    o.stop(t + dur + .05); vib.stop(t + dur + .05);
  },

  _bass(t, f, dur, vol, type) {
    const ac = Sfx.ac;
    const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    lp.type = 'lowpass'; lp.frequency.value = 420;
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + .02);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dur + .05);
  },

  _pad(t, freqs, dur, vol) {
    const ac = Sfx.ac;
    const g = ac.createGain(), lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(1500, t + dur * .5);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * .35);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    lp.connect(g); g.connect(this.out);
    for (const f of freqs) {
      for (const det of [-5, 5]) {
        const o = ac.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t); o.stop(t + dur + .08);
      }
    }
  },

  _bell(t, f, dur, vol) {
    const ac = Sfx.ac;
    for (const [mul, v] of [[1, 1], [2.76, .35], [5.4, .14]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f * mul;
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + .01);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur * (1 / mul + .3));
      o.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + dur + .1);
    }
  },

  _drum(t, kind) {
    const ac = Sfx.ac;
    if (kind === 'kick' || kind === 'tom') {
      const o = ac.createOscillator(), g = ac.createGain();
      const f0 = kind === 'kick' ? 140 : 190;
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(kind === 'kick' ? 42 : 62, t + .16);
      g.gain.setValueAtTime(kind === 'kick' ? .34 : .24, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + (kind === 'kick' ? .22 : .42));
      o.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + .5);
      return;
    }
    const dur = kind === 'hat' ? .045 : .17;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const dd = buf.getChannelData(0);
    for (let i = 0; i < n; i++) dd[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = kind === 'hat' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'hat' ? 7200 : 1700;
    const g = ac.createGain();
    g.gain.value = kind === 'hat' ? .05 : .12;
    src.connect(f); f.connect(g); g.connect(this.out);
    src.start(t);
  },

  _setDrone(note) {
    const ac = Sfx.ac;
    if (this.droneOsc) {
      const g = this.droneGain, t = ac.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + .6);
      const osc = this.droneOsc;
      setTimeout(() => { try { osc.forEach(o => o.stop()); } catch (e) {} }, 900);
      this.droneOsc = null; this.droneGain = null;
    }
    if (!note || !ac) return;
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(.085, t + 2.2);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 240;
    g.connect(lp); lp.connect(this.out);
    const oscs = [];
    for (const det of [-7, 6]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(note);
      o.detune.value = det;
      o.connect(g); o.start(t);
      oscs.push(o);
    }
    // slow swell, like the boat breathing
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = .07; lg.gain.value = .035;
    lfo.connect(lg); lg.connect(g.gain);
    lfo.start(t); oscs.push(lfo);
    this.droneOsc = oscs; this.droneGain = g;
  }
};
