'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');

const SOUNDS = ['setUnderwater', 'plunge', 'climbOut', 'suitUp', 'breathe', 'lowAir', 'creak', 'sonar', 'moan',
  'growl', 'chomp', 'rush', 'inkSquirt', 'pulseBoom', 'fireUnder', 'reelOut', 'reelIn', 'zapUnder', 'dashUnder',
  'hitWet', 'creatureDie', 'hurtUnder', 'blackout', 'motherRoar', 'broodSqueal', 'inhale', 'bubbleBlip'];

// a game with (fake) Web Audio switched on and unlocked, every sound call recorded
function withAudio(opts) {
  const h = loadGame(Object.assign({ draw: false, audio: true, seed: 3 }, opts));
  h.press('KeyZ');
  h.sandbox.__sfx = [];
  h.eval(`(() => { for (const k of ${JSON.stringify(SOUNDS)}) { const f = Sfx[k]; Sfx[k] = function (...a) { __sfx.push([k].concat(a)); return f.apply(this, a); }; } })()`);
  return { h, g: h.g, calls: name => h.sandbox.__sfx.filter(c => c[0] === name) };
}

function diving(gear, opts) {
  const s = withAudio(opts);
  s.h.startVoyage();
  Object.assign(s.g.Player, { beatBoss: true, suit: 0, diveWeapon: 0 }, gear);
  s.g.Game.state = 'dive';
  s.g.Dive.start();
  s.g.Dive.enterWater();
  s.g.Dive.mobs.length = 0;
  s.D = s.g.Dive; s.p = s.g.Dive.p;
  return s;
}

describe('the underwater mix', () => {
  test('every effect goes through a bus, then the muffle, then the master volume', () => {
    const { g } = withAudio();
    const S = g.Sfx;
    assert.ok(S.bus.connections.includes(S.muffle));
    assert.ok(S.muffle.connections.includes(S.master));
    assert.equal(S.muffle.type, 'lowpass');
    assert.equal(S.muffle.frequency.value, g.OPEN_HZ);
  });

  test('going under closes the muffle and starts the deep-water rumble; coming up undoes both', () => {
    const { g } = withAudio();
    const S = g.Sfx;
    S.setUnderwater(true);
    assert.equal(S.muffle.frequency.value, g.MUFFLED_HZ);
    assert.ok(S.bed, 'the rumble is playing');
    assert.equal(S.bed.src.loop, true);
    S.setUnderwater(false);
    assert.equal(S.muffle.frequency.value, g.OPEN_HZ);
    assert.equal(S.bed, null);
  });

  test('if audio unlocks while already underwater, it starts muffled', () => {
    const h = loadGame({ draw: false, audio: true });
    h.g.Sfx.setUnderwater(true);
    h.press('KeyZ');
    assert.equal(h.g.Sfx.muffle.frequency.value, h.g.MUFFLED_HZ);
    assert.ok(h.g.Sfx.bed);
  });

  test('every underwater sound builds its sound without complaint', () => {
    const { h, g } = withAudio();
    const S = g.Sfx;
    const before = h.audio.nodes.length;
    assert.doesNotThrow(() => {
      S.plunge(); S.climbOut(); S.suitUp(); S.breathe(); S.lowAir(false); S.lowAir(true); S.creak(false); S.creak(true);
      S.sonar(); S.moan(); S.growl(300, .6); S.chomp(.5); S.rush(1); S.inkSquirt(.4); S.pulseBoom(.8);
      for (const style of ['harpoon', 'spread', 'chain', 'pierce', 'wave']) S.fireUnder(style);
      S.reelOut(); S.reelIn(); S.zapUnder(); S.dashUnder(); S.hitWet(true); S.creatureDie(400);
      S.hurtUnder(); S.blackout(); S.motherRoar(); S.broodSqueal(); S.inhale(); S.bubbleBlip();
    });
    assert.ok(h.audio.nodes.length - before > 60);
  });

  test('muted, none of them make a sound', () => {
    const { h, g } = withAudio();
    g.Settings.set('muted', true);
    const before = h.audio.nodes.length;
    g.Sfx.breathe(); g.Sfx.growl(200, 1); g.Sfx.fireUnder('wave'); g.Sfx.hurtUnder();
    assert.equal(h.audio.nodes.length, before);
  });
});

describe('what he hears on a dive', () => {
  test('jumping in plunges and muffles; climbing out opens the sound back up', () => {
    const s = diving();
    assert.equal(s.calls('plunge').length, 1);
    assert.equal(s.g.Sfx.under, true);
    Object.assign(s.p, { x: s.g.DIVE_LADDER_X, y: 30 });
    s.h.tap('KeyE');
    assert.equal(s.calls('climbOut').length, 1);
    s.h.until(() => s.g.Game.state === 'play', 3);
    assert.equal(s.g.Sfx.under, false);
  });

  test('suiting up on deck clanks', () => {
    const s = withAudio();
    s.h.startVoyage();
    Object.assign(s.g.Player, { beatBoss: true, suit: 0, diveWeapon: 0, x: s.g.DIVE_X });
    s.h.tap('KeyE');
    s.h.frames(.8);
    assert.equal(s.calls('suitUp').length, 1);
  });

  test('he breathes every few seconds, and stops when the air runs out', () => {
    const s = diving();
    Object.assign(s.p, { x: 1500, y: 500, air: 999 });
    s.h.frames(12);
    const n = s.calls('breathe').length;
    assert.ok(n >= 2 && n <= 4, 'breathed ' + n + ' times');
    s.h.sandbox.__sfx.length = 0;
    s.p.air = 0; s.g.Player.hp = 99; s.g.Player.maxHp = 99;
    s.h.frames(8);
    assert.equal(s.calls('breathe').length, 0);
  });

  test('the gauge beeps when air is low, and faster once it is gone', () => {
    const s = diving();
    Object.assign(s.p, { x: 1500, y: 500, air: 10 });
    s.h.frames(4);
    const low = s.calls('lowAir').length;
    assert.ok(low >= 2, 'beeped ' + low);
    assert.ok(s.calls('lowAir').every(c => c[1] === false));
    s.h.sandbox.__sfx.length = 0;
    s.p.air = 0; s.g.Player.hp = 99; s.g.Player.maxHp = 99;
    s.h.frames(4);
    assert.ok(s.calls('lowAir').length > low, 'faster when empty');
    assert.ok(s.calls('lowAir').every(c => c[1] === true));
  });

  test('with air to spare, the gauge is silent', () => {
    const s = diving();
    Object.assign(s.p, { x: 1500, y: 500, air: 999 });
    s.h.frames(5);
    assert.equal(s.calls('lowAir').length, 0);
  });

  test('the suit creaks past its depth', () => {
    const s = diving();
    Object.assign(s.p, { x: 600, y: 1200, air: 999 });
    s.g.Player.hp = 99; s.g.Player.maxHp = 99;
    s.h.frames(4);
    assert.ok(s.calls('creak').length >= 3);
    assert.ok(s.calls('creak').some(c => c[1] === true), 'and groans when it gives');
  });

  test('sonar pings and far-off calls only come in deep water', () => {
    const shallow = diving({}, { seed: 4 });
    Object.assign(shallow.p, { x: 1500, y: 300, air: 1e9 });
    shallow.h.frames(60, 1 / 20);
    assert.equal(shallow.calls('sonar').length + shallow.calls('moan').length, 0);
    const deep = diving({ suit: 3 }, { seed: 4 });
    Object.assign(deep.p, { x: 600, y: 2400, air: 1e9 });
    deep.h.frames(60, 1 / 20);
    assert.ok(deep.calls('sonar').length >= 2);
    assert.ok(deep.calls('moan').length >= 1);
  });

  test('a creature growls as it winds up, if it is close enough to hear', () => {
    const s = diving();
    const def = s.g.monsterDef('shelfcrab');
    const nearby = s.D.makeMob(def, 1650, 500, 1);
    const far = s.D.makeMob(def, 3500, 500, 1);
    Object.assign(s.p, { x: 1500, y: 500 });
    for (const m of [nearby, far]) Object.assign(m, { state: 'hunt', cool: .001 });
    s.D._mob(nearby, 1 / 30);
    s.D._mob(far, 1 / 30);
    const growls = s.calls('growl');
    assert.equal(growls.length, 1);
    assert.equal(growls[0][1], def.len);
    assert.ok(growls[0][2] > .5);
  });

  test('each launcher fires with its own sound', () => {
    for (let w = 0; w < 5; w++) {
      const s = diving({ diveWeapon: w });
      Object.assign(s.p, { x: 1500, y: 500 });
      s.h.tap('KeyJ');
      assert.deepEqual(s.calls('fireUnder').map(c => c[1]), [s.g.DIVE_WEAPONS[w].style]);
    }
  });

  test('hits, kills and getting hurt all sound wet', () => {
    const s = diving();
    const m = s.D.makeMob(s.g.monsterDef('bladderjelly'), 1650, 500, 1);
    Object.assign(m, { state: 'stun', stun: 99, hp: 1 });
    Object.assign(s.p, { x: 1500, y: 500, face: 1, invuln: 0 });
    s.h.tap('KeyJ'); s.h.frames(.4);
    assert.equal(s.calls('hitWet').length, 1);
    assert.equal(s.calls('creatureDie').length, 1);
    s.D.hurtPlayer(1, s.p.x + 10, s.p.y);
    assert.equal(s.calls('hurtUnder').length, 1);
  });

  test('the Mother roars when she changes phase', () => {
    const s = diving({ suit: 3 });
    Object.assign(s.p, { x: s.g.CITY_X - 300, y: 3500, air: 999 });
    s.D.startMother();
    s.g.CUT.skip();
    const B = s.D.boss;
    B.hp = B.maxHp * .5;
    s.D._bossPhase();
    assert.equal(s.calls('motherRoar').length, 1);
  });
});
