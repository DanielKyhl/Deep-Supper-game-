'use strict';
/* Swapping gear the way a player does it, and the option screens under a real
   mouse: whole frames, real keys and clicks, and the effects in the game. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

function voyage(player, opts) {
  const h = loadGame(Object.assign({ draw: false, seed: 17 }, opts));
  h.startVoyage();
  F.readDialogue(h);
  Object.assign(h.g.Player, { introDone: true, totalKills: 3, girlMet: true }, player);
  return h;
}

// the row of the screen on top for an item, from the last frame drawn
function rowOf(h, pred) {
  const M = h.g.Menu, items = M.items(M.top());
  return M.hits.find(x => pred(items[x.index]));
}
const mouseUp = h => h.emit('mouseup', { button: 0 });

describe('gear', () => {
  test('ESC, Gear, the arrow keys put the dip net back in hand over the harpoon, and its heavy blow stuns rather than bleeds', () => {
    const h = voyage({ weapon: 3 });
    const g = h.g, P = g.Player;
    h.tap('Escape');
    F.chooseMenu(h, 'gear');
    assert.equal(g.Menu.top(), 'gear');
    F.selectMenu(h, 'On deck');
    h.tap('ArrowRight');
    assert.equal(g.deckWeapon().id, 'dipnet');
    h.tap('Escape'); h.tap('Escape');
    assert.equal(g.Game.state, 'play');

    P.x = 1000; g.Cam.snap(1000);
    g.Game.startBattle(g.monsterDef('tidemaw'));
    assert.ok(h.until(() => g.Battle.phase === 'fight', 5));
    const m = g.Battle.m;
    Object.assign(m, { cool: 1e9, state: 'idle' });
    P.x = m.x - 110; P.face = 1;
    h.keyDown('KeyJ');
    assert.ok(h.until(() => P.chargeReady, 4));
    h.keyUp('KeyJ');
    h.frame();
    assert.equal(P.heavy, true);
    assert.ok(h.until(() => g.Status.stunned(m), 2), 'the Scoop stuns');
    assert.equal(g.Status.bleeding(m), false);
  });

  test('with the mouse, the right arrow on the Rod row takes the bamboo rod, and the next cast only goes as deep as it can', () => {
    const h = voyage({ rod: 3, weapon: 0 }, { draw: true });
    const g = h.g;
    h.tap('Escape');
    F.chooseMenu(h, 'gear');
    h.frame();
    const r = rowOf(h, it => it.slot === 'rod');
    h.click(r.arrows.x1 - 2, r.y + r.h / 2); h.frame(); mouseUp(h); h.frame();
    assert.equal(g.rodDef().id, 'bamboo', 'the › wraps round to the first rod');
    h.tap('Escape'); h.tap('Escape');
    F.castLine(h);
    assert.ok(h.until(() => g.Fishing.phase === 'deep', 10));
    assert.ok(g.Fishing.targetDepth <= g.ROD_DEPTH[0]);
  });

  test("an older rod taken back in hand at Dorran's stall is still in hand after Continue", () => {
    const h = voyage({ rod: 2, weapon: 1 });
    const g = h.g, S = g.Shop;
    F.openStall(h);
    for (let i = 0; i < 6 && !(S.rows()[S.sel].kind === 'rod' && S.rows()[S.sel].idx === 1); i++) h.tap('ArrowDown');
    h.tap('KeyE');
    assert.equal(g.gearIndex('rod'), 1);
    h.tap('Escape');
    const again = loadGame({ draw: false, seed: 17, storage: Object.fromEntries(h.storage) });
    F.chooseMenu(again, 'continue');
    assert.ok(again.until(() => again.g.Game.state === 'play', 3));
    assert.equal(again.g.rodDef().id, again.g.RODS[1].id);
  });
});

describe('the mouse on the options', () => {
  test('Audio: dragging the master slider halfway sets it to half, and the engine hears it', () => {
    const h = loadGame({ draw: true });
    F.chooseMenu(h, 'options');
    F.chooseMenu(h, 'audio');
    h.frame();
    const r = rowOf(h, it => it.key === 'master'), bar = r.bar, y = r.y + r.h / 2;
    h.click(bar.x0 + 2, y); h.frame();
    for (let k = 1; k <= 5; k++) { h.mouseMove(bar.x0 + bar.seg * k - bar.seg / 2, y); h.frame(); }
    mouseUp(h); h.frame();
    assert.equal(h.g.Settings.get('master'), .5);
    assert.ok(Math.abs(h.g.Sfx.level - .5 * .8) < 1e-9);
    h.mouseMove(bar.x1, y); h.frame();
    assert.equal(h.g.Settings.get('master'), .5, 'let go, the slider stays');
  });
});
