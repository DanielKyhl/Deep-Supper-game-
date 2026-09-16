'use strict';
/* The bosses' skill checks, fought through with real keys and whole frames:
   parried, failed, and answered all the way to the end of a fight. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

function oldOne(seed) {
  const h = loadGame({ draw: false, seed: seed || 5 });
  h.startVoyage();
  F.readDialogue(h);
  h.g.Game.giveFishingGear();
  Object.assign(h.g.Player, { maxHp: 30, hp: 30 });
  h.g.Game.startBattle(h.g.MONSTERS.find(m => m.boss));
  assert.ok(h.until(() => h.g.Battle.phase === 'fight', 5));
  return h;
}

describe('answering the bosses', () => {
  test("the Old One's jaw comes down; pressing J as the ring closes parries it, and it stands open to the tooth", () => {
    const h = oldOne();
    const g = h.g, B = g.Battle, m = B.m;
    Object.assign(m, { state: 'tele', atk: 'jaw', t: 0, cool: 1e9 });
    assert.ok(h.until(() => g.Skill.active, 3));
    const hp = g.Player.hp;
    // wait for the ring to meet its mark, then press the real key
    assert.ok(h.until(() => Math.abs(g.Skill.active.local - g.Skill.active.shrink) < .02, 3));
    h.tap('KeyJ');
    assert.ok(h.until(() => !g.Skill.active, 2));
    assert.equal(g.Player.hp, hp);
    assert.ok(B.parried > 0);
    // now hit it while it reels: the parry makes it count for more
    const before = m.hp;
    g.Player.x = m.x - m.face * (B.len * .45 + 20) - m.face * 10;
    g.Player.face = m.x > g.Player.x ? 1 : -1;
    for (let i = 0; i < 90 && m.hp === before; i++) { if (i % 20 === 0) h.press('KeyJ'); h.frame(); }
    assert.ok(m.hp < before, 'the parried Old One was hit');
  });

  test('the breach, failed with a wrong key, throws him; the drag, held with the real key, does not', () => {
    const h = oldOne(7);
    const g = h.g, B = g.Battle, m = B.m;
    B.bossPhase = 3;
    Object.assign(m, { state: 'tele', atk: 'breach', t: 0, cool: 1e9 });
    assert.ok(h.until(() => g.Skill.active, 3));
    h.frames(.2);
    const want = g.Skill.active.seq[0];
    h.tap(want === 'left' ? 'KeyD' : 'KeyA');
    assert.ok(h.until(() => !g.Skill.active, 2));
    assert.equal(g.Player.hp, 28, 'thrown for two hearts');

    g.Player.invuln = 0;
    B.lastSkill = -99;
    Object.assign(m, { state: 'tele', atk: 'drag', t: 0, cool: 1e9 });
    assert.ok(h.until(() => g.Skill.active, 3));
    const against = g.ACTIONS[g.Skill.active.keys[0]][0];
    h.keyDown(against);
    assert.ok(h.until(() => !g.Skill.active, 6));
    h.keyUp(against);
    assert.equal(g.Player.hp, 28, 'held on');
  });

  test('a whole fight with the Old One, skill checks and all, won by a player who answers them', () => {
    const h = oldOne(11);
    const asked = new Set();
    const start = h.g.Skill.start;
    h.g.Skill.start = function (spec, done) { asked.add(spec.label); return start.call(this, spec, done); };
    h.g.Player.maxHp = 40; h.g.Player.hp = 40;
    assert.equal(F.fightBot(h, 400), true);
    assert.ok(asked.size >= 1, 'it asked for an answer at least once');
    assert.ok([...asked].every(l => ['PARRY THE JAW', 'KEEP YOUR FEET', 'PULL FREE'].includes(l)), [...asked].join(', '));
  });

  test("the Mother's coils, answered with the swim keys, W for up", () => {
    const h = loadGame({ draw: false, seed: 6 });
    F.chooseMenu(h, 'dev');
    F.chooseMenu(h, 'devMother');
    assert.ok(h.until(() => h.g.Dive.underwater && h.g.Game.fade.dir === 0, 3));
    const g = h.g, D = g.Dive;
    D.mobs.length = 0;
    h.keyDown('KeyD');
    assert.ok(h.until(() => D.phase === 'scene', 10));
    h.keyUp('KeyD');
    h.keyDown('Escape');
    assert.ok(h.until(() => D.phase === 'swim', 8));
    h.keyUp('Escape');
    Object.assign(g.Player, { maxHp: 20, hp: 20 });
    D.p.invuln = 0;
    Object.assign(D.boss, { state: 'tele', atk: 'coil', t: 0, lastSkill: -99 });
    assert.ok(h.until(() => g.Skill.active, 3));
    const code = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
    while (g.Skill.active && g.Skill.active.result === null) {
      h.frames(.15);
      h.tap(code[g.Skill.active.seq[g.Skill.active.i]]);
    }
    assert.ok(h.until(() => !g.Skill.active, 2));
    assert.equal(g.Player.hp, 20);
    assert.equal(D.boss.state, 'rest');
  });
});
