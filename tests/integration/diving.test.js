'use strict';
/* The second half of the game as one loop: over the side, down through the
   bands of water, fighting, back up the ladder, selling to Dorran, buying
   a deeper suit, and going back down. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

// a diver on deck by the ladder with the given gear
function diver(opts, gear) {
  const h = loadGame(Object.assign({ draw: false, seed: 11 }, opts));
  h.startVoyage();
  Object.assign(h.g.Player, { beatBoss: true, suit: 0, diveWeapon: 0, weapon: 5, maxHp: 9, hp: 9 }, gear);
  return h;
}

function goUnder(h) {
  F.walkTo(h, h.g.DIVE_X, 40);
  h.tap('KeyE');
  assert.equal(h.g.Game.state, 'dive');
  assert.ok(h.until(() => h.g.Dive.underwater && h.g.Game.fade.dir === 0, 6), 'never got into the water');
}

// swim toward a point with the real keys
function swimTo(h, x, y, seconds) {
  const p = h.g.Dive.p;
  const keys = ['KeyA', 'KeyD', 'KeyW', 'KeyS'];
  for (let i = 0; i < (seconds || 20) * 60; i++) {
    const dx = x - p.x, dy = y - p.y;
    if (Math.hypot(dx, dy) < 40) break;
    const want = { KeyA: dx < -20, KeyD: dx > 20, KeyW: dy < -20, KeyS: dy > 20 };
    for (const k of keys) want[k] ? h.keyDown(k) : h.keyUp(k);
    h.frame();
  }
  for (const k of keys) h.keyUp(k);
  h.frame();
  return Math.hypot(x - p.x, y - p.y);
}

// face a creature and keep stabbing until it is dead
function killIt(h, m, seconds) {
  const p = h.g.Dive.p;
  for (let i = 0; i < (seconds || 30) * 60 && !m.dead && h.g.Dive.phase === 'swim'; i++) {
    const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
    const want = { KeyA: dx < -10, KeyD: dx > 10, KeyW: d > 130 && dy < -20, KeyS: d > 130 && dy > 20 };
    if (d < 130) { want.KeyW = dy < -30; want.KeyS = dy > 30; }
    for (const k of Object.keys(want)) want[k] ? h.keyDown(k) : h.keyUp(k);
    if (d < 170 && i % 6 === 0) h.press('KeyJ');
    if (h.g.Player.hp <= 3 && h.g.Player.bandages > 0 && i % 30 === 0) h.press('KeyQ');
    h.frame();
  }
  for (const k of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) h.keyUp(k);
  return m.dead;
}

describe('diving', () => {
  test('the whole loop: dive, kill, climb aboard, sell, buy a deeper suit, dive deeper', () => {
    const h = diver({}, { bandages: 5 });
    const g = h.g;
    goUnder(h);
    const D = g.Dive;

    // go and find something on the shelf
    const prey = D.mobs.filter(m => m.zone === 1).sort((a, b) => Math.hypot(a.x - D.p.x, a.y - D.p.y) - Math.hypot(b.x - D.p.x, b.y - D.p.y))[0];
    swimTo(h, prey.x - 110, prey.y, 30);
    assert.equal(killIt(h, prey, 40), true, 'could not kill the ' + prey.def.name);
    const trophy = g.Player.catches[g.Player.catches.length - 1];
    assert.equal(trophy.id, prey.def.id);

    // back up the ladder
    assert.ok(swimTo(h, g.DIVE_LADDER_X, 30, 40) < 90, 'could not reach the ladder');
    h.tap('KeyE');
    assert.ok(h.until(() => g.Game.state === 'play', 3));
    assert.equal(g.Game.spotLabel({ id: 'dive' }), 'Dive');

    // sell it, and buy the brass rig with the money
    F.openStall(h);
    h.tap('Enter');
    assert.ok(g.Player.coins >= trophy.value);
    g.Player.coins = Math.max(g.Player.coins, g.SUITS[1].price);
    g.Shop.tab = g.Shop.tabs().findIndex(t => t.id === 'dive');
    g.Shop.sel = g.Shop.rows().findIndex(r => r.kind === 'suit' && r.idx === 1);
    h.tap('Enter');
    h.tap('Escape');
    assert.equal(g.Player.suit, 1);

    // and now the Drop is safe to swim in
    goUnder(h);
    D.mobs.length = 0;
    Object.assign(D.p, { x: 600, y: 1500 });
    const hp = g.Player.hp;
    h.frames(3);
    assert.equal(g.Player.hp, hp, 'the brass rig holds at 30 fathoms');
  });

  test('going through the gap in a shelf is the only way down', () => {
    const h = diver({}, { suit: 3 });
    goUnder(h);
    const D = h.g.Dive, L = h.g.DIVE_LEDGES[0];
    D.mobs.length = 0;
    Object.assign(D.p, { x: 700, y: 850 });
    h.keyDown('KeyS'); h.frames(2); h.keyUp('KeyS');
    assert.ok(D.p.y < L.y, 'stopped by the shelf at ' + D.p.y);
    swimTo(h, L.gapX, 850, 20);
    h.keyDown('KeyS'); h.frames(2); h.keyUp('KeyS');
    assert.ok(D.p.y > L.y + L.h, 'through the gap to ' + D.p.y);
  });

  test('drowning: he sinks, the screen says so, and Dorran hauls him out with the haul gone', () => {
    const h = diver();
    goUnder(h);
    const D = h.g.Dive;
    D.mobs.length = 0;
    h.g.Player.catches.push(h.g.makeTrophy(h.g.monsterDef('reefgnasher')));
    Object.assign(D.p, { x: 1500, y: 700, air: 0 });
    assert.ok(h.until(() => D.phase === 'blackout', 30), 'the suit gave out');
    assert.ok(h.until(() => h.g.Player.hp === 0 && D.p.limp > .5, 2), 'he goes limp');
    F.wakeOnDeck(h);
    assert.equal(h.g.Player.catches.length, 0);
    assert.equal(h.g.Player.hp, h.g.Player.maxHp);
    assert.equal(h.g.Player.x, h.g.DIVE_X, 'laid out by the ladder');
  });

  test('pausing underwater keeps the sea on screen and freezes it', () => {
    const h = diver({ draw: true });
    goUnder(h);
    const D = h.g.Dive;
    const t = D.t, x = D.mobs[0].x;
    h.sandbox.__scene = 0;
    h.eval('(() => { const f = Art.diveScene; Art.diveScene = function (...a) { __scene++; return f.apply(this, a); }; })()');
    h.tap('Escape');
    h.frames(1);
    assert.equal(h.g.Game.state, 'pause');
    assert.ok(h.sandbox.__scene > 30, 'the dive is drawn under the pause menu');
    assert.equal(D.mobs[0].x, x);
    h.tap('Escape');
    h.frames(.2);
    assert.ok(D.t > t);
  });

  test('saving mid-dive and loading puts you on deck with what you had caught', () => {
    const h = diver();
    goUnder(h);
    h.g.Player.catches.push(h.g.makeTrophy(h.g.monsterDef('shelfcrab')));
    h.tap('Escape');
    F.chooseMenu(h, 'save');
    F.chooseMenu(h, 'slot1');
    h.tap('Escape'); h.tap('Escape');
    h.g.Player.catches.length = 0;
    h.tap('Escape');
    F.chooseMenu(h, 'load');
    F.chooseMenu(h, 'slot1');
    F.chooseMenu(h, 'yes');
    assert.ok(h.until(() => h.g.Game.state === 'play', 3));
    assert.equal(h.g.Dive.underwater, false);
    assert.equal(h.g.Player.catches[0].id, 'shelfcrab');
    assert.equal(h.g.Player.suit, 0);
  });

  test('the test shortcut drops you by the ladder, suited, ready to dive', () => {
    const h = loadGame({ draw: false, seed: 3 });
    F.chooseMenu(h, 'dev');
    F.chooseMenu(h, 'devDiving');
    assert.ok(h.until(() => h.g.Game.state === 'play' && h.g.Game.fade.dir === 0, 3));
    assert.equal(h.g.Player.suit, 0);
    assert.equal(h.g.Player.beatBoss, true);
    h.tap('KeyD');
    goUnder(h);
    assert.equal(h.g.Dive.phase, 'swim');
  });

  test('every frame of a dive renders soundly, top to bottom', () => {
    const h = diver({ draw: true, seed: 5 }, { suit: 3, diveWeapon: 4 });
    goUnder(h);
    const D = h.g.Dive, rec = h.hires();
    for (const y of [60, 700, 1500, 2600, 3500, 3950]) {
      Object.assign(D.p, { x: 700, y });
      D._camera(0, true);
      h.press('KeyJ');
      for (let i = 0; i < 20; i++) {
        rec.reset();
        const shown = h.ctx.calls.drawImage || 0;
        h.frame();
        assert.equal(rec.depth(), 0, 'unbalanced at ' + y);
        assert.equal((h.ctx.calls.drawImage || 0) - shown, 1);
      }
    }
  });
});
