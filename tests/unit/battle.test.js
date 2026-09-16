'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, near } = require('../helpers/harness');

// a fight against `id`, past the intro, with the monster holding still
function fight(id, opts) {
  opts = Object.assign({ draw: false, seed: 13 }, opts);
  const h = loadGame(opts);
  h.startVoyage();
  const g = h.g;
  g.Player.weapon = opts.weapon === undefined ? 0 : opts.weapon;
  g.Player.x = 900;
  g.Cam.snap(900);
  const def = g.MONSTERS.find(m => m.id === (id || 'gnashfin'));
  g.Game.startBattle(def);
  const B = g.Battle;
  if (!opts.intro) {
    B.phase = 'fight';
    B.m.state = 'idle'; B.m.cool = 1e9; B.m.t = 0;
    B.m.y = B.restY;
  }
  return { h, g, B, m: B.m, P: g.Player };
}
const fixedRandom = (h, v) => h.eval('Math.random = () => ' + v);
const idx = (g, id) => g.WEAPONS.findIndex(w => w.id === id);

describe('starting a fight', () => {
  test('sets up the arena on screen and the monster at full health', () => {
    const { g, B, m, P } = fight('bristlejaw', { intro: true });
    assert.equal(g.Game.state, 'battle');
    assert.equal(B.phase, 'intro');
    assert.equal(B.arenaL, g.Cam.x + 80);
    assert.equal(B.arenaR, g.Cam.x + g.VIEW_W - 80);
    assert.equal(m.hp, 76);
    assert.equal(m.maxHp, 76);
    assert.ok(P.x >= B.arenaL && P.x <= B.arenaR);
    assert.equal(g.Cam.locked, true);
  });

  test('the monster rests on the deck according to its size', () => {
    const { g, B } = fight('gnashfin');
    near(B.restY, g.DECK_Y - 240 * .13 - 16, 1e-9);
    assert.equal(B.len, 240);
  });

  test('each monster keeps a stable seed across fights', () => {
    const a = fight('tidemaw').m.seed, b = fight('tidemaw').m.seed;
    assert.equal(a, b);
    assert.ok(a >= 1 && a <= 97);
  });

  test('during the intro the monster lands and you cannot act', () => {
    const { h, B, P } = fight('gnashfin', { intro: true });
    const x = P.x;
    h.keyDown('KeyD');
    h.frames(1);
    assert.equal(P.x, x);
    h.keyUp('KeyD');
    h.frames(1.4);
    assert.equal(B.phase, 'fight');
    assert.equal(B.m.state, 'idle');
  });
});

describe('the player in battle', () => {
  test('moves with the (rebindable) move keys and faces the way he moves', () => {
    const { h, P } = fight();
    const from = P.x;
    h.keyDown('KeyA'); h.frames(.2); h.keyUp('KeyA');
    assert.equal(P.face, -1);
    assert.ok(P.x < from);
    h.keyDown('KeyD'); h.frames(.1);
    assert.equal(P.face, 1);
  });

  test('cannot leave the arena', () => {
    const { h, B, P } = fight();
    P.x = B.arenaL + 3;
    h.keyDown('KeyA'); h.frames(.5);
    assert.equal(P.x, B.arenaL);
  });

  test('rolling moves fast, grants a moment of invulnerability, then cools down', () => {
    const { h, P } = fight();
    const from = P.x;
    h.tap('KeyK');
    assert.ok(P.invuln > 0);
    assert.ok(P.rollCd > 0);
    h.frames(.4);
    assert.ok(P.x > from + 100, 'rolled from ' + from + ' to ' + P.x);
    const x = P.x;
    P.rollCd = .3;
    h.tap('KeyK');
    assert.ok(P.rollT <= 0 && Math.abs(P.x - x) < 1, 'no roll while cooling down');
  });

  test('attacking needs a weapon', () => {
    const armed = fight();
    armed.h.tap('KeyJ');
    assert.equal(armed.P.bState, 'attack');
    const bare = fight('gnashfin', { weapon: -1 });
    bare.h.tap('KeyJ');
    assert.notEqual(bare.P.bState, 'attack');
  });

  test('swing timing depends on style and weapon speed', () => {
    const { g, B, P } = fight();
    const dur = (id, step) => { P.weapon = idx(g, id); B._swing(step || 0); return P.attackDur; };
    near(dur('dipnet'), .32, 1e-9);
    near(dur('cleaver'), .44 / .78, 1e-9);
    near(dur('harpoon'), .26 / 1.22, 1e-9);
    near(dur('dipnet', 2), .32 * 1.4, 1e-9);
  });

  test('pressing attack late in a swing chains a combo', () => {
    const { h, P } = fight();
    h.tap('KeyJ');
    h.frames(.2);
    h.tap('KeyJ');
    h.until(() => P.combo === 1, 1);
    assert.equal(P.combo, 1);
    assert.equal(P.bState, 'attack');
  });

  test('bandages work mid-fight, with a short cooldown', () => {
    const { h, P } = fight();
    P.hp = 1; P.bandages = 3;
    h.tap('KeyQ');
    assert.equal(P.hp, 3);
    h.tap('KeyQ');
    assert.equal(P.hp, 3, 'cooldown');
    h.frames(.6);
    h.tap('KeyQ');
    assert.equal(P.hp, 5);
    assert.equal(P.bandages, 1);
  });
});

describe('hitboxes', () => {
  test('thrust weapons hit a long, narrow, level band', () => {
    const { g, B, P } = fight('gnashfin', { weapon: 3 });
    P.x = 500; P.y = g.DECK_Y; P.face = 1;
    const hb = B._playerHitbox();
    assert.equal(hb.h, 34);
    assert.equal(hb.y, g.DECK_Y - 54);
    near(hb.w, 64 * 1.48, 1e-9);
  });

  test('chops cover a tall overhead area', () => {
    const { g, B, P } = fight('gnashfin', { weapon: 2 });
    P.y = g.DECK_Y;
    const hb = B._playerHitbox();
    assert.equal(hb.h, 96);
    assert.equal(hb.y, g.DECK_Y - 96);
  });

  test('swings change shape through the combo', () => {
    const { g, B, P } = fight();
    P.y = g.DECK_Y;
    P.combo = 0; const a = B._playerHitbox();
    P.combo = 1; const b = B._playerHitbox();
    P.combo = 2; const c = B._playerHitbox();
    assert.equal(a.h, 58);
    assert.equal(b.y, a.y - 10);
    assert.equal(c.h, 74);
  });

  test('facing left mirrors the hitbox to the other side', () => {
    const { B, P } = fight();
    P.x = 500; P.face = 1;
    const r = B._playerHitbox();
    P.face = -1;
    const l = B._playerHitbox();
    assert.equal(r.x, 506);
    assert.equal(l.x + l.w, 494);
  });
});

describe('hurting the monster', () => {
  function inReach(s) { s.m.x = s.P.x + 100; s.m.y = s.B.restY; s.P.face = 1; }

  test('a hit in reach deals weapon damage once per swing', () => {
    const s = fight();
    fixedRandom(s.h, .5);
    inReach(s);
    s.P.combo = 0;
    s.B._tryHit();
    assert.equal(s.m.hp, 58 - 8);
    assert.equal(s.P.attackDone, true);
    assert.equal(s.m.hits, 1);
    assert.ok(s.B.hitstop > 0);
  });

  test('swinging at nothing does nothing', () => {
    const s = fight();
    s.m.x = s.P.x + 600;
    s.B._tryHit();
    assert.equal(s.m.hp, 58);
    assert.equal(s.P.attackDone, false);
  });

  test('a monster still recovering from its own attack takes extra damage', () => {
    const s = fight();
    fixedRandom(s.h, .5);
    inReach(s);
    s.m.state = 'recover';
    s.B._tryHit();
    assert.equal(s.m.hp, 58 - Math.round(8 * 1.35));
  });

  test('critical hits hit harder', () => {
    const s = fight();
    fixedRandom(s.h, .01);                 // crit, and the lowest damage roll
    inReach(s);
    s.B._tryHit();
    assert.equal(s.m.hp, 58 - Math.round(8 * (.88 + .24 * .01) * 1.75));
  });

  test('damage numbers appear only when the setting is on', () => {
    const s = fight();
    inReach(s);
    s.g.Floaters.clear();
    s.g.Prefs.damageNumbers = false;
    s.B._tryHit();
    assert.equal(s.g.Floaters.list.length, 0);
    s.g.Prefs.damageNumbers = true;
    s.P.attackDone = false;
    inReach(s);
    s.B._tryHit();
    assert.ok(s.g.Floaters.list.length >= 1);
  });

  test('the killing blow wins, fills the hold and counts the kill', () => {
    const s = fight();
    inReach(s);
    s.m.hp = 1;
    s.B._tryHit();
    assert.equal(s.B.phase, 'win');
    assert.equal(s.m.state, 'dead');
    assert.equal(s.P.catches.length, 1);
    assert.equal(s.P.catches[0].id, 'gnashfin');
    assert.equal(s.P.kills.gnashfin, 1);
    assert.equal(s.P.totalKills, 1);
    assert.equal(s.B.reward, s.P.catches[0]);
  });

  test('after winning, the fight ends and you are back on deck', () => {
    const s = fight();
    inReach(s);
    s.m.hp = 1;
    s.B._tryHit();
    s.h.frames(3.1);
    assert.equal(s.g.Game.state, 'play');
    assert.match(s.g.Game.toastText, /Gnashfin/);
    assert.equal(s.g.Cam.locked, false);
  });
});

describe('getting hurt', () => {
  test('a hit costs health, knocks you away and grants invulnerability', () => {
    const { B, P, g } = fight();
    P.hp = 5;
    B._hurtPlayer(2, P.x + 100);
    assert.equal(P.hp, 3);
    near(P.invuln, 1.05, 1e-9);
    assert.equal(P.knock, -340);
    assert.equal(P.bState, 'hurt');
    assert.equal(g.Game.hurtFlash, 1);
  });

  test('invulnerable, or outside the fight phase, nothing lands', () => {
    const { B, P } = fight();
    P.hp = 5; P.invuln = .5;
    B._hurtPlayer(1, P.x);
    assert.equal(P.hp, 5);
    P.invuln = 0; B.phase = 'intro';
    B._hurtPlayer(1, P.x);
    assert.equal(P.hp, 5);
  });

  test('dropping to zero loses the fight, and losing sends you home whole', () => {
    const s = fight();
    s.P.hp = 1;
    s.B._hurtPlayer(3, s.P.x - 50);
    assert.equal(s.P.hp, 0);
    assert.equal(s.B.phase, 'lose');
    s.h.frames(3.1);
    assert.equal(s.g.Game.state, 'play');
    assert.equal(s.P.hp, s.P.maxHp);
    assert.equal(s.g.Dialogue.active, true);
  });

  test('a lunging head in your path hurts', () => {
    const s = fight();
    s.P.hp = 5; s.P.x = 900; s.P.y = s.g.DECK_Y;
    Object.assign(s.m, { state: 'lunge', face: -1, vx: -600, t: 0, x: 990 });
    s.B._updateMonster(1 / 60);
    assert.equal(s.P.hp, 4);
  });

  test('spit globs hit you and burst; ones that miss splash on the deck', () => {
    const s = fight();
    s.P.hp = 5;
    s.B.globs.push({ x: s.P.x, y: s.P.y - 20, vx: 0, vy: 0, r: 12, t: 0 });
    s.B.globs.push({ x: s.P.x + 400, y: s.g.DECK_Y - 2, vx: 0, vy: 0, r: 12, t: 0 });
    s.B._updateProjectiles(1 / 60, true);
    assert.equal(s.P.hp, 4);
    assert.equal(s.B.globs.length, 0);
  });

  test('shockwaves travel along the deck and hit whoever is standing on it', () => {
    const s = fight();
    s.P.hp = 5;
    s.B.waves.push({ x: s.P.x - 30, dir: 1, t: 0 });
    for (let i = 0; i < 10; i++) s.B._updateProjectiles(1 / 60, true);
    assert.equal(s.P.hp, 4);
  });
});

describe('monster behaviour', () => {
  test('an idle monster picks an attack from its list when its cooldown runs out', () => {
    const { B, m, P } = fight('netbiter');
    m.cool = .01;
    B._updateMonster(.05);
    assert.equal(m.state, 'tele');
    assert.ok(B.def && ['lunge', 'slam', 'shell'].includes(m.atk), m.atk);
    assert.equal(m.target, P.x);
  });

  test('a telegraphed lunge launches toward the side it faces', () => {
    const { B, m, P } = fight();
    P.x = 600; m.x = 1100;
    Object.assign(m, { state: 'tele', atk: 'lunge', t: 0 });
    for (let i = 0; i < 60 && m.state === 'tele'; i++) B._updateMonster(1 / 60);
    assert.equal(m.state, 'lunge');
    assert.equal(m.face, -1);
    assert.ok(m.vx < 0);
  });

  test('a slam comes down, makes two shockwaves and recovers', () => {
    const { B, m } = fight();
    Object.assign(m, { state: 'slam', t: 0, target: m.x, y: B.restY - 140 });
    for (let i = 0; i < 60 && m.state === 'slam'; i++) B._updateMonster(1 / 60);
    assert.equal(m.state, 'recover');
    assert.equal(B.waves.length, 2);
  });

  test('ordinary monsters use the two shared attacks and their body plan\'s own', () => {
    const { B } = fight('glasseye');
    assert.deepEqual([...B._atkPool()], ['lunge', 'slam', 'lure']);
  });
});

describe('the Old One', () => {
  test('starts in phase one with no deck-wide attacks', () => {
    const { B } = fight('leviathan');
    assert.equal(B.bossPhase, 1);
    assert.ok(!B._atkPool().includes('sweep') && !B._atkPool().includes('spew'));
  });

  test('below two thirds health it stops playing', () => {
    const { B, m } = fight('leviathan');
    m.hp = m.maxHp * .6;
    B._checkBossPhase();
    assert.equal(B.bossPhase, 2);
    assert.equal(B.rage, true);
    assert.equal(m.atk, 'roar');
    assert.equal(B.banner.text, 'IT STOPS PLAYING');
    assert.ok(B._atkPool().includes('sweep'));
  });

  test('below a third it remembers your father, and every attack is a heavy one', () => {
    const { B, m } = fight('leviathan');
    m.hp = m.maxHp * .2;
    B._checkBossPhase();
    assert.equal(B.bossPhase, 3);
    assert.equal(B.banner.text, 'IT REMEMBERS YOUR FATHER');
    assert.ok(!B._atkPool().includes('spit'));
    assert.ok(B._atkPool().includes('spew'));
  });

  test('phases never go backwards', () => {
    const { B, m } = fight('leviathan');
    m.hp = m.maxHp * .2;
    B._checkBossPhase();
    m.hp = m.maxHp;
    B._checkBossPhase();
    assert.equal(B.bossPhase, 3);
  });

  test('ordinary monsters never change phase', () => {
    const { B, m } = fight('penance');
    m.hp = 1;
    B._checkBossPhase();
    assert.equal(B.bossPhase, 1);
    assert.equal(B.rage, false);
  });

  test('beating it for the first time plays the ending', () => {
    const s = fight('leviathan');
    s.m.x = s.P.x + 100; s.m.y = s.B.restY; s.P.face = 1;
    s.m.hp = 1;
    s.B._tryHit();
    s.h.frames(3.1);
    assert.equal(s.P.beatBoss, true);
    assert.equal(s.g.Game.state, 'cutscene');
    assert.equal(s.g.Game.endingRun, true);
  });
});
