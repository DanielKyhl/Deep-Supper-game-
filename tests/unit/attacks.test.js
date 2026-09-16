'use strict';
/* Two attacks every creature shares, one its body makes its own, and the
   bosses' attacks you have to answer instead of dodge. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');

/* --------------------------------- helpers --------------------------------- */

function skillGame() {
  const h = loadGame({ draw: false, seed: 3 });
  h.startVoyage();
  const g = h.g;
  const out = { h, g, S: g.Skill, result: undefined };
  out.start = spec => g.Skill.start(spec, ok => { out.result = ok; });
  // run a frame of the skill alone, the way a fight does
  out.step = (seconds) => { const n = Math.max(1, Math.round((seconds || 1 / 60) * 60)); for (let i = 0; i < n; i++) { g.Skill.update(1 / 60); g.Input.endFrame(); } };
  out.press = code => { h.keyDown(code); g.Skill.update(1 / 60); g.Input.endFrame(); h.keyUp(code); };
  return out;
}

// a deck fight past the intro, the monster holding still until told
function fight(id, opts) {
  opts = Object.assign({ draw: false, seed: 13 }, opts);
  const h = loadGame(opts);
  h.startVoyage();
  const g = h.g;
  Object.assign(g.Player, { weapon: 5, maxHp: 50, hp: 50 });
  g.Player.x = 900;
  g.Cam.snap(900);
  g.Game.startBattle(g.monsterDef(id));
  const B = g.Battle;
  B.phase = 'fight';
  Object.assign(B.m, { state: 'idle', cool: 1e9, t: 0, y: B.restY });
  return { h, g, B, m: B.m, P: g.Player };
}
// wind a monster up into an attack and run it until it is over (or `until` holds)
function attack(s, atk, seconds, until) {
  const { B, m, g } = s;
  Object.assign(m, { state: 'tele', atk, t: 0 });
  for (let i = 0; i < (seconds || 4) * 60; i++) {
    B._updateMonster(1 / 60);
    B._updateHazards(1 / 60, true);
    s.P.invuln = Math.max(0, s.P.invuln - 1 / 60);
    if (until && until()) return true;
    if (m.state === 'recover' || m.state === 'idle') return true;
  }
  return false;
}

function diver(gear) {
  const h = loadGame({ draw: false, seed: 7 });
  h.startVoyage();
  Object.assign(h.g.Player, { beatBoss: true, suit: 3, diveWeapon: 0, weapon: 0, maxHp: 50, hp: 50 }, gear);
  h.g.Game.state = 'dive';
  h.g.Dive.start();
  h.g.Dive.enterWater();
  h.g.Dive.mobs.length = 0;
  Object.assign(h.g.Dive.p, { x: 1500, y: 1400, air: 1e9, invuln: 0 });
  return { h, g: h.g, D: h.g.Dive, p: h.g.Dive.p, P: h.g.Player };
}
function creature(s, id, dx, dy) {
  const def = s.g.monsterDef(id);
  const m = s.D.makeMob(def, s.p.x + dx, s.p.y + dy, s.g.diveZoneAt(s.p.y));
  Object.assign(m, { state: 'hunt', t: 0, cool: 1e9, face: dx > 0 ? -1 : 1 });
  return m;
}
function diveAttack(s, m, atk, seconds, each) {
  Object.assign(m, { state: 'tele', atk, t: 0 });
  for (let i = 0; i < (seconds || 3) * 60; i++) {
    s.D._mob(m, 1 / 60);
    s.D._projectiles(1 / 60);
    s.p.x += s.p.vx / 60; s.p.y += s.p.vy / 60;
    s.p.invuln = Math.max(0, s.p.invuln - 1 / 60);
    if (each) each(i);
    if (m.state === 'recover') return true;
  }
  return false;
}

/* --------------------------------- skill checks --------------------------------- */

describe('answering a skill check', () => {
  test('a ring: press as it meets its mark, and it counts', () => {
    const s = skillGame();
    s.start({ kind: 'ring', label: 'X', action: 'attack', count: 1, shrink: .5, window: .1, at: () => ({ x: 100, y: 100 }) });
    s.step(.5);
    s.press('KeyJ');
    assert.equal(s.S.active.result, true);
    s.step(.5);
    assert.equal(s.result, true, 'told once it has shown how it went');
    assert.equal(s.S.active, null);
  });

  test('a ring: too early, too late, or not at all is a miss', () => {
    for (const when of [.2, .75]) {
      const s = skillGame();
      s.start({ kind: 'ring', label: 'X', action: 'attack', count: 1, shrink: .5, window: .1, at: () => ({ x: 0, y: 0 }) });
      s.step(when);
      if (s.S.active.result === null) s.press('KeyJ');
      s.step(.6);
      assert.equal(s.result, false, 'pressed at ' + when);
    }
    const s = skillGame();
    s.start({ kind: 'ring', label: 'X', action: 'attack', count: 1, shrink: .5, window: .1, at: () => ({ x: 0, y: 0 }) });
    s.step(1.5);
    assert.equal(s.result, false, 'never pressed');
  });

  test('two rings need two good presses', () => {
    const s = skillGame();
    s.start({ kind: 'ring', label: 'X', action: 'attack', count: 2, shrink: .5, window: .1, at: () => ({ x: 0, y: 0 }) });
    s.step(.5); s.press('KeyJ');
    assert.equal(s.S.active.result, null);
    s.step(.75); s.press('KeyJ');
    s.step(.6);
    assert.equal(s.result, true);
  });

  test('keys: each in turn, in time; a wrong key or a slow one fails', () => {
    const good = skillGame();
    good.start({ kind: 'keys', label: 'X', seq: ['left', 'jump', 'right'], per: .6 });
    for (const code of ['KeyA', 'Space', 'KeyD']) { good.step(.2); good.press(code); }
    good.step(.6);
    assert.equal(good.result, true);

    const wrong = skillGame();
    wrong.start({ kind: 'keys', label: 'X', seq: ['left', 'jump'], per: .6 });
    wrong.step(.2); wrong.press('KeyD'); wrong.step(.6);
    assert.equal(wrong.result, false);

    const slow = skillGame();
    slow.start({ kind: 'keys', label: 'X', seq: ['left', 'jump'], per: .6 });
    slow.step(.2); slow.press('KeyA'); slow.step(1.2);
    assert.equal(slow.result, false);
  });

  test('keys underwater: the jump keys count as swimming up', () => {
    const s = skillGame();
    s.start({ kind: 'keys', label: 'X', seq: ['up', 'down'], per: .6, alias: { jump: 'up' } });
    s.step(.2); s.press('KeyW'); s.step(.2); s.press('KeyS'); s.step(.6);
    assert.equal(s.result, true);
  });

  test('hold: holding against the pull lasts it out; doing nothing gets you dragged in', () => {
    const held = skillGame();
    held.start({ kind: 'hold', label: 'X', dur: 3, pull: 1, strength: 2.4, keys: ['left', 'right'] });
    held.h.keyDown('KeyA');
    held.step(3.7);
    held.h.keyUp('KeyA');
    assert.equal(held.result, true);

    const idle = skillGame();
    idle.start({ kind: 'hold', label: 'X', dur: 3, pull: -1, strength: 2.4, keys: ['right', 'left'] });
    idle.step(3.7);
    assert.equal(idle.result, false);
  });

  test('every kind draws soundly', () => {
    const h = loadGame({ draw: true, seed: 2 });
    h.startVoyage();
    const g = h.g, rec = h.hires(), bctx = h.eval('bctx');
    for (const spec of [
      { kind: 'ring', label: 'PARRY', action: 'attack', count: 2, shrink: .8, window: .1, at: () => ({ x: 300, y: 300 }) },
      { kind: 'keys', label: 'KEYS', seq: ['left', 'right', 'up', 'down'], per: .8 },
      { kind: 'hold', label: 'HOLD', dur: 3, pull: 1, strength: 2, keys: ['left', 'right'] }
    ]) {
      g.Skill.start(spec, () => {});
      g.Skill.update(.3);
      rec.reset();
      g.Skill.draw(bctx);
      assert.equal(rec.depth(), 0, spec.kind);
      g.Skill.active = null;
    }
  });
});

/* ------------------------------ on deck: their own ------------------------------ */

describe("on deck, each body's own attack", () => {
  test('the eel coils and springs over you, landing on your other side with a lash each way', () => {
    const s = fight('gnashfin');
    s.m.x = s.P.x + 300; s.m.face = -1;
    let over = false;
    attack(s, 'coil', 3, () => { over = over || s.m.y < s.B.restY - 180; return false; });
    assert.ok(over, 'it went up');
    assert.ok(s.m.x < s.P.x, 'it came down behind him');
    assert.ok(s.B.waves.length >= 2 && s.B.waves.every(w => w.life === .75));
  });

  test("the angler's lure flares, and it lunges for where you were standing", () => {
    const s = fight('bristlejaw');
    s.m.x = s.P.x + 380; s.m.face = -1;
    const hp = s.P.hp;
    let glare = 0;
    attack(s, 'lure', 3, () => { glare = Math.max(glare, s.B.glare); return false; });
    assert.equal(glare, 1);
    assert.ok(s.P.hp < hp, 'standing still, it got him');
    const dodge = fight('bristlejaw');
    dodge.m.x = dodge.P.x + 380; dodge.m.face = -1;
    attack(dodge, 'lure', 3, () => { if (dodge.m.state === 'lure' && dodge.m.t < .05) dodge.P.x -= 260; return false; });
    assert.equal(dodge.P.hp, 50, 'but not where he went');
  });

  test('tentacles come up through the deck where you stand, three times, after a warning', () => {
    const s = fight('palefinger');
    s.m.x = s.P.x + 400;
    let early = false, last = s.P.hp;
    attack(s, 'grasp', 5, () => {
      if (s.P.hp < last && !s.B.spikes.some(k => k.t > k.warn && k.t < k.warn + k.up)) early = true;
      last = s.P.hp;
      return false;
    });
    assert.equal(early, false, 'nothing hurts before the arm is up');
    assert.ok(s.P.hp < 50);
    const moving = fight('palefinger');
    moving.m.x = moving.P.x + 500;
    attack(moving, 'grasp', 5, () => { if (moving.B.spikes.some(k => k.t > k.warn * .6 && k.t < k.warn)) moving.P.x = moving.B.spikes[moving.B.spikes.length - 1].x - 90; return false; });
    assert.equal(moving.P.hp, 50, 'keep moving and they miss');
  });

  test('a crab tucks in and bowls across the deck, off the far edge and back: jump it', () => {
    const s = fight('netbiter');
    s.m.x = s.B.arenaR - 100; s.m.face = -1;
    let bounced = false, jumping = true;
    attack(s, 'shell', 4, () => {
      bounced = bounced || s.m.bounces > 0;
      // hang in the air over its path
      s.P.y = jumping ? s.g.DECK_Y - 90 : s.g.DECK_Y;
      return false;
    });
    assert.ok(bounced);
    assert.equal(s.P.hp, 50, 'in the air, it rolled underneath');
    const ground = fight('netbiter');
    ground.m.x = ground.B.arenaR - 100; ground.m.face = -1;
    attack(ground, 'shell', 4);
    assert.ok(ground.P.hp < 50, 'on the boards, it ran him over');
  });

  test('a jellyfish lets down four curtains of stingers, and leaves one gap', () => {
    const s = fight('nettlejack');
    s.B._curtains();
    const C = s.B.curtains;
    assert.equal(C.length, 4);
    const n = 5, w = (s.B.arenaR - s.B.arenaL) / n;
    const slots = C.map(c => Math.round((c.x - s.B.arenaL) / w - .5));
    const gap = [0, 1, 2, 3, 4].find(i => slots.indexOf(i) < 0);
    s.P.x = s.B.arenaL + w * (gap + .5);
    for (let i = 0; i < 120; i++) s.B._updateHazards(1 / 60, true);
    assert.equal(s.P.hp, 50, 'safe in the gap');
    s.B._curtains();
    s.P.x = s.B.curtains[s.B.curtains.length - 1].x;
    s.P.invuln = 0;
    for (let i = 0; i < 120; i++) s.B._updateHazards(1 / 60, true);
    assert.ok(s.P.hp < 50, 'stung under a curtain');
  });

  test("a ray goes up out of sight; its shadow follows you, stops, and then it comes down there", () => {
    const s = fight('gallowsgill');
    let locked = null, highest = Infinity;
    attack(s, 'swoop', 4, () => {
      highest = Math.min(highest, s.m.y);
      if (s.m.state === 'swoop' && s.m.t > 1.55 && locked === null) locked = s.m.shadowX;
      return false;
    });
    assert.ok(highest < 0, 'off the top of the screen');
    assert.ok(Math.abs(locked - s.P.x) < 40, 'the shadow found him');
    assert.ok(s.P.hp < 50);
    const dodge = fight('gallowsgill');
    attack(dodge, 'swoop', 4, () => { if (dodge.m.state === 'swoop' && dodge.m.t > 1.6) dodge.P.x = dodge.m.shadowX + 260; return false; });
    assert.equal(dodge.P.hp, 50, 'step out of the shadow once it stops');
  });

  test('a maw breathes the deck in: stand still and you go with it', () => {
    const s = fight('tidemaw');
    s.m.x = s.P.x + 360; s.m.face = -1;
    const x = s.P.x;
    attack(s, 'gulp', 1.2, () => s.m.state === 'gulp' && s.m.t > .6);
    assert.ok(s.P.x > x + 40, 'pulled ' + (s.P.x - x));
  });

  test('a husk flings five shards of bone that stick in the boards, and hurt to stand on', () => {
    const s = fight('hollow');
    s.m.x = s.P.x + 300; s.m.face = -1;
    s.P.x -= 400;
    attack(s, 'shards', 3, () => false);
    for (let i = 0; i < 90; i++) s.B._updateHazards(1 / 60, true);
    const stuck = s.B.shards.filter(k => k.stuck);
    assert.equal(s.m.shots, 5, 'five thrown');
    assert.ok(stuck.length >= 3);
    s.P.x = stuck[0].x; s.P.y = s.g.DECK_Y; s.P.invuln = 0;
    s.B._updateHazards(1 / 60, true);
    assert.ok(s.P.hp < 50);
    for (let i = 0; i < 60 * 3; i++) s.B._updateHazards(1 / 60, true);
    assert.equal(s.B.shards.length, 0, 'gone after a few seconds');
  });
});

/* ------------------------------ the Old One's ------------------------------ */

describe("the Old One's skill checks", () => {
  test('jaw, breach and drag come in by phase, and never two back to back', () => {
    const s = fight('leviathan');
    assert.deepEqual(plain(s.B._atkPool()).filter(a => ['jaw', 'breach', 'drag'].includes(a)), ['jaw']);
    s.B.bossPhase = 2;
    assert.deepEqual(plain(s.B._atkPool()).filter(a => ['jaw', 'breach', 'drag'].includes(a)), ['jaw', 'breach']);
    s.B.bossPhase = 3;
    assert.deepEqual(plain(s.B._atkPool()).filter(a => ['jaw', 'breach', 'drag'].includes(a)), ['jaw', 'breach', 'drag']);
    s.B.lastSkill = s.B.t;
    for (let i = 0; i < 200; i++) assert.ok(!['jaw', 'breach', 'drag'].includes(s.B._chooseAttack()));
  });

  const answered = (atk, answer) => {
    const s = fight('leviathan');
    s.B.bossPhase = 2;
    Object.assign(s.m, { state: 'tele', atk, t: 0 });
    s.h.until(() => s.g.Skill.active, 3);
    assert.ok(s.g.Skill.active, atk + ' asked nothing');
    const F = require('../helpers/flows');
    for (let i = 0; i < 60 * 8 && (s.g.Skill.active || s.m.state === atk); i++) { F.answerSkill(s.h, { fail: !answer }); s.h.frame(); }
    F.answerSkill(s.h);
    return s;
  };

  test('parry the jaw: it reels back open to a harder hit; miss it, and it bites through everything', () => {
    const good = answered('jaw', true);
    assert.equal(good.P.hp, 50);
    assert.ok(good.B.parried > 0 && good.m.state === 'recover');
    const bad = answered('jaw', false);
    assert.equal(bad.P.hp, 48);
  });

  test('keep your feet through the breach, or be thrown by it', () => {
    const good = answered('breach', true);
    assert.equal(good.P.hp, 50);
    const bad = answered('breach', false);
    assert.equal(bad.P.hp, 48);
  });

  test('pull free of the drag, or be hauled into its mouth', () => {
    const good = answered('drag', true);
    assert.equal(good.P.hp, 50);
    const bad = answered('drag', false);
    assert.equal(bad.P.hp, 48);
  });

  test('while one is being answered the fight holds still around it', () => {
    const s = fight('leviathan');
    s.B.globs.push({ x: 500, y: 200, vx: 100, vy: 0, r: 10, t: 0 });
    s.B._skillJaw();
    const x = s.B.globs[0].x, px = s.P.x;
    s.h.keyDown('KeyD');
    s.h.frames(.4);
    s.h.keyUp('KeyD');
    assert.equal(s.B.globs[0].x, x);
    assert.equal(s.P.x, px);
  });
});

/* ------------------------------ below: their own ------------------------------ */

describe("underwater, each body's own attack", () => {
  test('every creature below has the same two, and one of its own', () => {
    const s = diver();
    for (const def of s.g.DIVE_MONSTERS.filter(d => !d.boss)) {
      const a = plain(s.g.attacksOf(def));
      assert.deepEqual(a.slice(0, 2), ['bite', 'charge']);
      assert.equal(a[2], s.g.DIVE_UNIQUE[def.plan]);
    }
  });

  test('an eel darts three times, from a new angle each time', () => {
    const s = diver();
    const m = creature(s, 'kelpstrangler', 260, 0);
    const dirs = [];
    diveAttack(s, m, 'lash', 3, () => { if (m.state === 'lash') { const d = Math.atan2(m.dirY, m.dirX).toFixed(2); if (dirs[dirs.length - 1] !== d) dirs.push(d); } });
    assert.equal(dirs.length, 3, dirs.join(' '));
  });

  test("an angler's lure draws you in toward its teeth", () => {
    const s = diver();
    const m = creature(s, 'reefgnasher', 320, 0);
    const x = s.p.x;
    diveAttack(s, m, 'lure', 3);
    assert.ok(s.p.x > x + 60 || s.P.hp < 50, 'drawn in ' + (s.p.x - x));
  });

  test('a crab snaps a shock of bubbles straight at you', () => {
    const s = diver();
    const m = creature(s, 'shelfcrab', 300, 0);
    let fired = null;
    diveAttack(s, m, 'snap', 3, () => { fired = fired || s.D.globs.find(b => b.kind === 'bubble'); });
    assert.ok(fired && fired.vx < -600, 'fast, toward him');
    for (let i = 0; i < 60 && s.P.hp === 50; i++) s.D._projectiles(1 / 60);
    assert.ok(s.P.hp < 50);
  });

  test('a ray curves wide and comes back through you', () => {
    const s = diver();
    const m = creature(s, 'sootwing', 380, 0);
    const angles = [];
    diveAttack(s, m, 'glide', 3, () => { if (m.state === 'glide') angles.push(Math.atan2(m.vy, m.vx)); });
    assert.ok(Math.abs(angles[0] - angles[angles.length - 1]) > .8, 'it turned');
  });

  test('a maw sucks you in unless you dash out of it', () => {
    const s = diver();
    const m = creature(s, 'gulperwidow', 360, 0);
    const x = s.p.x;
    diveAttack(s, m, 'gulp', .95, () => false);
    assert.ok(s.p.x > x + 30 || s.P.hp < 50, 'pulled ' + (s.p.x - x));
    const dash = diver();
    const n = creature(dash, 'gulperwidow', 360, 0);
    diveAttack(dash, n, 'gulp', .95, () => { dash.p.dashT = 1; dash.p.vx = -300; });
    assert.ok(dash.p.x < x, 'dashing, he got clear');
  });

  test('a husk fires a fan of five bone shards', () => {
    const s = diver();
    const m = creature(s, 'hallwarden', 300, 0);
    diveAttack(s, m, 'volley', 2);
    const bones = s.D.globs.filter(b => b.kind === 'bone');
    assert.equal(bones.length, 5);
    const angles = bones.map(b => Math.atan2(b.vy, b.vx)).sort((a, b) => a - b);
    assert.ok(angles[4] - angles[0] > .7, 'fanned out');
  });
});

/* ------------------------------ the Mother's ------------------------------ */

describe("the Mother's skill checks", () => {
  function mother() {
    const s = diver({ suit: 3 });
    Object.assign(s.p, { x: s.g.CITY_X - 300, y: 3500 });
    s.D.startMother();
    s.g.CUT.skip();
    s.B = s.D.boss;
    return s;
  }
  const F = require('../helpers/flows');
  const answer = (s, atk, ok) => {
    Object.assign(s.B, { state: 'tele', atk, t: 0 });
    s.h.until(() => s.g.Skill.active, 3);
    assert.ok(s.g.Skill.active, atk);
    for (let i = 0; i < 60 * 8 && s.g.Skill.active; i++) { F.answerSkill(s.h, { fail: !ok }); s.h.frame(); }
    F.answerSkill(s.h);
  };

  test('shoot the eye as the ring closes: it costs her; miss, and it burns', () => {
    const good = mother();
    answer(good, 'stare', true);
    assert.ok(good.B.hp < good.B.maxHp);
    assert.equal(good.P.hp, 50);
    const bad = mother();
    answer(bad, 'stare', false);
    assert.equal(bad.P.hp, 48);
  });

  test('slip the coils with the swim keys, jump keys included', () => {
    const good = mother();
    answer(good, 'coil', true);
    assert.equal(good.P.hp, 50);
    const bad = mother();
    answer(bad, 'coil', false);
    assert.equal(bad.P.hp, 48);
  });

  test('swim against the whirlpool, or be swallowed', () => {
    const good = mother();
    answer(good, 'whirlpool', true);
    assert.equal(good.P.hp, 50);
    const bad = mother();
    answer(bad, 'whirlpool', false);
    assert.equal(bad.P.hp, 48);
  });

  test('she never asks for two answers back to back', () => {
    const s = mother();
    s.B.phase = 3;
    s.B.lastSkill = s.D.t;
    for (let i = 0; i < 200; i++) assert.ok(!['stare', 'whirlpool', 'coil'].includes(s.D._motherPick()));
  });
});
