'use strict';
/* Heavy blows: hold the attack key after a swing, let go when it has charged,
   and each weapon hits in its own way. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');

function fight(weapon, id, opts) {
  const h = loadGame(Object.assign({ draw: false, seed: 13 }, opts));
  h.startVoyage();
  const g = h.g;
  g.Player.weapon = g.WEAPONS.findIndex(w => w.id === weapon);
  g.Player.x = 900;
  g.Cam.snap(900);
  g.Game.startBattle(g.monsterDef(id || 'shalebank'));
  const B = g.Battle;
  B.phase = 'fight';
  Object.assign(B.m, { state: 'idle', cool: 1e9, t: 0, y: B.restY });
  g.Status.roll = () => .999;          // nothing by chance: only what the heavy blow brings
  current = h;
  return { h, g, B, m: B.m, P: g.Player };
}
// whole game frames, so a held key is a held key and not a tap every frame
let current = null;
const step = (B, s) => { for (let i = 0; i < Math.max(1, Math.round(s * 60)); i++) current.frame(1 / 60); };

// hold J through a swing until the blow is charged, then let go; `before` runs
// the moment it is ready, and whatever it returns comes back
function chargeAndRelease(h, B, g, before) {
  h.keyDown('KeyJ');
  for (let i = 0; i < 60 * 4 && !g.Player.chargeReady; i++) step(B, 1 / 60);
  assert.equal(g.Player.chargeReady, true, 'charged');
  const out = before ? before() : undefined;
  h.keyUp('KeyJ');
  step(B, 1 / 60);
  return out;
}

describe('charging', () => {
  test('tapping J swings at once; holding it after the swing winds up, slowed, until it is charged', () => {
    const { h, g, B, P } = fight('cleaver');
    h.keyDown('KeyJ');
    step(B, 1 / 60);
    assert.equal(P.bState, 'attack', 'the tap still swings straight away');
    step(B, P.attackDur + .1);
    assert.equal(P.bState, 'charge');
    const x0 = P.x;
    h.keyDown('KeyD');
    step(B, .2);
    h.keyUp('KeyD');
    assert.ok(P.x - x0 > 5 && P.x - x0 < 250 * .2 * .5, 'walks at a crawl: ' + (P.x - x0));
    step(B, g.chargeTime(g.deckWeapon()));
    assert.equal(P.chargeReady, true);
    h.keyUp('KeyJ');
  });

  test('let go too early and nothing happens', () => {
    const { h, g, B, P } = fight('cleaver');
    h.keyDown('KeyJ');
    step(B, 1 / 60);
    step(B, P.attackDur + .15);
    h.keyUp('KeyJ');
    step(B, 1 / 60);
    assert.equal(P.bState === 'attack' && P.heavy, false);
    assert.equal(P.chargeT, 0);
  });

  test('a roll throws the charge away', () => {
    const { h, g, B, P } = fight('gaff');
    h.keyDown('KeyJ');
    step(B, 1 / 60);
    step(B, P.attackDur + .3);
    assert.ok(P.chargeT > 0);
    h.press('KeyK');
    step(B, 1 / 60);
    assert.equal(P.chargeT, 0);
    h.keyUp('KeyJ');
  });

  test('charge time follows how quick the weapon is, within limits', () => {
    const { g } = fight('dipnet');
    const t = id => g.chargeTime(g.WEAPONS.find(w => w.id === id));
    assert.ok(t('chain') > t('harpoon'));
    for (const w of g.WEAPONS) assert.ok(t(w.id) >= .45 && t(w.id) <= .85, w.id);
  });
});

describe('each weapon hits in its own way', () => {
  test('every weapon has a heavy blow with a name and a multiplier', () => {
    const { g } = fight('dipnet');
    for (const w of g.WEAPONS.concat([g.EXCALIBUR])) {
      assert.ok(w.heavy && w.heavy.name && w.heavy.mult >= 1, w.id);
    }
  });

  test('the Cleave hits for about three times a swing and always leaves it bleeding', () => {
    const { h, g, B, m, P } = fight('cleaver');
    P.x = m.x - 110; P.face = 1;
    h.eval('Math.random = () => .5');
    const hp = chargeAndRelease(h, B, g, () => m.hp);
    for (let i = 0; i < 40 && !P.attackDone; i++) step(B, 1 / 60);
    const dealt = hp - m.hp;
    assert.ok(P.attackDone, 'it landed');
    assert.ok(dealt >= 26 * 3 * .88 && dealt <= 26 * 3 * 1.12 * 1.36, 'dealt ' + dealt);
    assert.equal(g.Status.bleeding(m), true);
  });

  test('the Scoop and the Whirl stun; the Whirl reaches both sides at once', () => {
    const net = fight('dipnet');
    net.P.x = net.m.x - 90; net.P.face = 1;
    chargeAndRelease(net.h, net.B, net.g);
    step(net.B, .2);
    assert.equal(net.g.Status.stunned(net.m), true);

    const chain = fight('chain');
    chain.P.x = chain.m.x + 90; chain.P.face = 1;          // facing away from it
    chargeAndRelease(chain.h, chain.B, chain.g);
    for (let i = 0; i < 40 && !chain.P.attackDone; i++) step(chain.B, 1 / 60);
    assert.ok(chain.P.attackDone, 'hit behind him');
    assert.equal(chain.g.Status.stunned(chain.m), true);
  });

  test('the Haul drags it in; the Lunge carries him forward', () => {
    const gaff = fight('gaff');
    gaff.P.x = gaff.m.x - 150; gaff.P.face = 1;
    const x0 = gaff.m.x;
    chargeAndRelease(gaff.h, gaff.B, gaff.g);
    for (let i = 0; i < 40 && !gaff.P.attackDone; i++) step(gaff.B, 1 / 60);
    assert.ok(gaff.P.attackDone);
    assert.ok(gaff.m.x < x0 - 30, 'pulled toward him: ' + (x0 - gaff.m.x));

    const harp = fight('harpoon');
    harp.m.x = harp.B.arenaR - 20;
    harp.P.x = harp.B.arenaL + 60; harp.P.face = 1;
    const px = harp.P.x;
    chargeAndRelease(harp.h, harp.B, harp.g);
    step(harp.B, .5);
    assert.ok(harp.P.x - px > 120, 'lunged ' + (harp.P.x - px));
  });

  test("the Rend is always a crit", () => {
    const { h, g, B, m, P } = fight('tooth');
    P.x = m.x - 100; P.face = 1;
    h.eval('Math.random = () => .99');       // no lucky crit
    const hp = chargeAndRelease(h, B, g, () => m.hp);
    for (let i = 0; i < 40 && !P.attackDone; i++) step(B, 1 / 60);
    assert.ok(hp - m.hp >= 62 * 2.8 * 1.75 * .88, 'dealt ' + (hp - m.hp));
  });

  test('a heavy blow landing mid wind-up knocks the creature out of its attack', () => {
    const { h, g, B, m, P } = fight('cleaver');
    P.x = m.x - 110; P.face = 1;
    chargeAndRelease(h, B, g, () => Object.assign(m, { state: 'tele', atk: 'slam', t: 0, cool: 1e9 }));
    for (let i = 0; i < 40 && !P.attackDone; i++) step(B, 1 / 60);
    assert.ok(P.attackDone);
    assert.equal(m.state, 'recover');
  });

  test('a heavy blow never chains into a combo', () => {
    const { h, g, B, m, P } = fight('gaff');
    P.x = m.x - 400;
    chargeAndRelease(h, B, g);
    assert.equal(P.heavy, true);
    h.press('KeyJ');
    step(B, P.attackDur + .1);
    assert.equal(P.combo, 0);
  });
});

describe('drawing it', () => {
  test('charging, the charge pips, and every heavy blow draw balanced', () => {
    for (const w of ['dipnet', 'gaff', 'cleaver', 'harpoon', 'chain', 'tooth']) {
      const { h, g, B, P } = fight(w, 'gnashfin', { draw: true });
      const rec = h.hires(), bctx = h.eval('bctx');
      Object.assign(P, { bState: 'charge', chargeT: 5, chargeReady: true });
      rec.reset();
      B.drawPlayer(bctx);
      assert.equal(rec.depth(), 0, w + ' charging');
      Object.assign(P, { bState: 'attack', heavy: true, attackDur: .5, attackT: .25 });
      rec.reset();
      B.drawPlayer(bctx);
      assert.equal(rec.depth(), 0, w + ' heavy');
    }
  });
});
