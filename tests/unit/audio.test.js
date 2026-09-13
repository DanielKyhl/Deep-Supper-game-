'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, near, plain } = require('../helpers/harness');

describe('Sfx', () => {
  test('gainValue scales with level and drops to zero when muted', () => {
    const { g } = loadGame({ draw: false });
    g.Sfx.setLevels(1, false);
    near(g.Sfx.gainValue(), .47);
    g.Sfx.setLevels(.5, false);
    near(g.Sfx.gainValue(), .235);
    g.Sfx.setLevels(.5, true);
    assert.equal(g.Sfx.gainValue(), 0);
  });

  test('setLevels clamps the level and updates a live master gain', () => {
    const { h, g } = loadGame({ draw: false, audio: true });
    h.press('KeyZ');                 // any key unlocks audio
    g.Sfx.setLevels(3, false);
    assert.equal(g.Sfx.level, 1);
    near(g.Sfx.master.gain.value, .47);
    g.Sfx.setLevels(-1, false);
    assert.equal(g.Sfx.level, 0);
  });

  test('sounds are silent no-ops before audio is unlocked', () => {
    const { h, g } = loadGame({ draw: false, audio: true });
    assert.doesNotThrow(() => { g.Sfx.hit(); g.Sfx.splash(); g.Sfx.roar(); });
    assert.equal(h.audio.contexts, 0);
  });

  test('the first input creates exactly one audio context and starts the music graph', () => {
    const { h, g } = loadGame({ draw: false, audio: true });
    h.press('KeyA');
    h.press('KeyB');
    h.click(10, 10);
    assert.equal(h.audio.contexts, 1);
    assert.equal(g.Sfx.ready, true);
    assert.ok(g.Music.out, 'music output node exists');
    assert.ok(g.Sfx.master.connections.length === 1);
  });

  test('once unlocked, effects build oscillator and noise graphs', () => {
    const { h, g } = loadGame({ draw: false, audio: true });
    h.press('KeyA');
    g.Sfx.setLevels(1, false);
    const before = h.audio.nodes.length;
    g.Sfx.hit();
    const made = h.audio.nodes.slice(before).map(n => n.kind);
    assert.ok(made.includes('oscillator'));
    assert.ok(made.includes('bufferSource'));
    assert.ok(made.includes('filter'));
  });

  test('muted effects build nothing', () => {
    const { h, g } = loadGame({ draw: false, audio: true });
    h.press('KeyA');
    g.Sfx.setLevels(1, true);
    const before = h.audio.nodes.length;
    g.Sfx.hit(); g.Sfx.thud(); g.Sfx.cast();
    assert.equal(h.audio.nodes.length, before);
  });

  test('without Web Audio at all, unlocking is harmless', () => {
    const { h, g } = loadGame({ draw: false });
    assert.doesNotThrow(() => h.press('KeyA'));
    assert.equal(g.Sfx.ready, false);
  });

  test('a suspended context is resumed on input', () => {
    const { h, g } = loadGame({ draw: false, audio: true });
    h.press('KeyA');
    g.Sfx.ac.state = 'suspended';
    h.press('KeyA');
    assert.equal(g.Sfx.ac.state, 'running');
  });
});

describe('Music: pitch and harmony', () => {
  const { g } = loadGame({ draw: false });

  test('hz tunes A4 to 440 and doubles every octave', () => {
    near(g.hz('A4'), 440, 1e-9);
    near(g.hz('A5'), 880, 1e-9);
    near(g.hz('A3'), 220, 1e-9);
    near(g.hz('A4', 12), 880, 1e-9);
  });

  test('hz handles naturals, sharps and negative octaves', () => {
    near(g.hz('C4'), 261.6256, 1e-3);
    near(g.hz('A#4'), 466.1638, 1e-3);
    near(g.hz('D0'), 18.354, 1e-3);
  });

  test('hz falls back to 220 on nonsense', () => {
    assert.equal(g.hz('H2'), 220);
    assert.equal(g.hz(''), 220);
    assert.equal(g.hz('Db4'), 220);
  });

  test('_notes builds chord tones, defaulting to minor', () => {
    const maj = plain(g.Music._notes(['A4', 'M'], 0));
    near(maj[0], 440, 1e-9);
    near(maj[1], 554.365, 1e-3);
    near(maj[2], 659.255, 1e-3);
    assert.deepEqual(plain(g.Music._notes(['A4', 'nope'], 0)), plain(g.Music._notes(['A4', 'm'], 0)));
    near(plain(g.Music._notes(['A4', 'm'], 12))[0], 880, 1e-9);
  });

  test('every theme is made of real notes and chord shapes', () => {
    for (const [name, th] of Object.entries(g.THEMES)) {
      assert.ok(th.bpm > 30 && th.bpm < 240, name);
      assert.ok(th.prog.length > 0, name);
      for (const [root, kind] of th.prog) {
        assert.ok(/^[A-G]#?-?\d$/.test(root), name + ' root ' + root);
        assert.ok(g.CHORD[kind], name + ' chord ' + kind);
      }
      if (th.drone) assert.ok(/^[A-G]#?\d$/.test(th.drone));
    }
    for (const t of ['title', 'sea', 'battle', 'boss', 'ending']) assert.ok(g.THEMES[t], 'theme ' + t);
  });
});

describe('Music: engine', () => {
  test('targetGain is zero when muted, disabled or stopped', () => {
    const { h, g } = loadGame({ draw: false, audio: true });
    h.press('KeyA');
    const M = g.Music;
    M.set('sea', { now: true });
    M.setLevel(1); M.setMuted(false); M.setEnabled(true);
    near(M.targetGain(), .8 * .17 * 1.8, 1e-9);
    M.setMuted(true);
    assert.equal(M.targetGain(), 0);
    M.setMuted(false); M.setEnabled(false);
    assert.equal(M.targetGain(), 0);
    M.setEnabled(true); M.stop();
    assert.equal(M.targetGain(), 0);
  });

  test('set remembers a theme before audio exists and applies it once unlocked', () => {
    const { h, g } = loadGame({ draw: false, audio: true });
    const M = g.Music;
    M.set('battle');
    assert.equal(M.themeName, 'battle');
    assert.equal(M.on, false);
    h.press('KeyA');
    assert.equal(M.on, true);
    assert.equal(M.theme, g.THEMES.battle);
    near(M.spb, 60 / 138 / 2, 1e-9);
  });

  test('set ignores unknown themes', () => {
    const { h, g } = loadGame({ draw: false, audio: true });
    h.press('KeyA');
    g.Music.set('sea', { now: true });
    g.Music.set('polka', { now: true });
    assert.equal(g.Music.themeName, 'sea');
  });

  test('themes with a drone start one, themes without stop it', () => {
    const { h, g } = loadGame({ draw: false, audio: true });
    h.press('KeyA');
    g.Music.set('boss', { now: true });
    assert.ok(g.Music.droneOsc && g.Music.droneOsc.length === 3);
    g.Music.set('battle', { now: true });
    assert.equal(g.Music.droneOsc, null);
  });

  test('every theme voices two full passes without throwing', () => {
    const { h, g } = loadGame({ draw: false, audio: true });
    h.press('KeyA');
    for (const [name, th] of Object.entries(g.THEMES)) {
      const before = h.audio.nodes.length;
      for (let step = 0; step < th.bar * th.prog.length * 2; step++) {
        const bar = Math.floor(step / th.bar) % th.prog.length;
        th.voice(g.Music, step * .1, step, bar, step % th.bar, th.prog[bar]);
      }
      assert.ok(h.audio.nodes.length > before, name + ' made no sound');
    }
  });

  test('setLevel clamps to 0..1', () => {
    const { g } = loadGame({ draw: false });
    g.Music.setLevel(4);
    assert.equal(g.Music.level, 1);
    g.Music.setLevel(-2);
    assert.equal(g.Music.level, 0);
  });
});
