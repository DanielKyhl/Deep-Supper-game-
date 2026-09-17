'use strict';
/* Gear in hand: anything he owns can be taken back in hand in place of the
   best of it, on the pause menu's Gear screen or at Dorran's stall, and the
   rod, weapon, suit and launcher in hand are the ones the game uses. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');

function onDeck(player, opts) {
  const h = loadGame(Object.assign({ draw: false, seed: 14 }, opts));
  h.startVoyage();
  const g = h.g;
  g.Dialogue.hide(); g.Game.msgs = [];
  Object.assign(g.Player, { introDone: true, totalKills: 3, girlMet: true }, player);
  return { h, g, P: g.Player };
}

describe('what he has in hand', () => {
  test('with nothing picked it is the best he owns, and before the crate there is no weapon to pick', () => {
    const { g, P } = onDeck({ weapon: -1 });
    assert.deepEqual(plain(g.gearOwned('weapon')), []);
    assert.equal(g.gearIndex('weapon'), -1);
    assert.equal(g.deckWeapon().id, g.WEAPONS[0].id, 'bare hands swing like the net, as before');
    Object.assign(P, { rod: 2, weapon: 3 });
    assert.equal(g.rodDef().id, g.RODS[2].id);
    assert.equal(g.deckWeapon().id, g.WEAPONS[3].id);
  });

  test('picking an older one puts it in hand; picking the best goes back to following the best', () => {
    const { g, P } = onDeck({ weapon: 3 });
    assert.equal(g.gearPick('weapon', 1), true);
    assert.equal(P.useWeapon, 1);
    assert.equal(g.deckWeapon().id, 'gaff');
    assert.equal(g.gearPick('weapon', 3), true);
    assert.equal(P.useWeapon, -1);
  });

  test("he can't pick what he doesn't own, Excalibur included until the sea hands it up", () => {
    const { g, P } = onDeck({ weapon: 2 });
    assert.equal(g.gearPick('weapon', 4), false);
    assert.equal(g.gearPick('weapon', g.WEAPONS.length), false);
    assert.equal(g.gearPick('suit', 0), false, 'no suit before part two');
    P.excalibur = true;
    assert.equal(g.gearPick('weapon', g.WEAPONS.length), true);
    assert.equal(g.deckWeapon(), g.EXCALIBUR);
  });

  test('cycling goes round everything he owns, with Excalibur last, and one thing alone does not cycle', () => {
    const { g, P } = onDeck({ weapon: 2, excalibur: true });
    assert.deepEqual(plain(g.gearOwned('weapon')), [0, 1, 2, g.WEAPONS.length]);
    assert.equal(g.deckWeapon(), g.EXCALIBUR, 'the sword is the best he has');
    g.gearCycle('weapon', 1);
    assert.equal(g.deckWeapon().id, 'dipnet', 'wraps to the start');
    g.gearCycle('weapon', -1);
    assert.equal(g.deckWeapon(), g.EXCALIBUR);
    g.gearCycle('weapon', -1);
    assert.equal(g.deckWeapon().id, 'cleaver');
    P.rod = 0;
    assert.equal(g.gearCycle('rod', 1), false);
  });

  test('a pick he no longer owns (a damaged save) falls back to the best', () => {
    const { g, P } = onDeck({ weapon: 2, useWeapon: 5 });
    assert.equal(g.gearIndex('weapon'), 2);
  });
});

describe('the gear in hand is the gear used', () => {
  test('the rod in hand sets how deep the line goes and what can take it', () => {
    const { g, P } = onDeck({ rod: 3, weapon: 0, useRod: 0 });
    P.x = g.FISH_X;
    g.Game.state = 'fish';
    const F = g.Fishing;
    F.start();
    assert.ok(F.targetDepth <= g.ROD_DEPTH[0], 'only as deep as the bamboo rod: ' + F.targetDepth);
    for (let i = 0; i < 60 * 30 && F.phase !== 'bite'; i++) F.update(1 / 60);
    assert.equal(F.phase, 'bite');
    assert.ok(F.target.junk || F.target.depth <= 1, 'something from the shallows: ' + F.target.id);
  });

  test('Excalibur only kills in one blow when it is the weapon in hand', () => {
    for (const [pick, oneBlow] of [[-1, true], [5, false]]) {
      const { h, g, P } = onDeck({ weapon: 5, excalibur: true, useWeapon: pick });
      g.Game.startBattle(g.monsterDef('choir'));
      const B = g.Battle;
      h.until(() => B.phase === 'fight', 5);
      const m = B.m;
      m.state = 'recover'; m.recDur = 99;
      P.x = m.x - m.def.len * .45 - 30; P.face = 1;
      h.tap('KeyJ');
      h.until(() => B.phase === 'win' || P.bState !== 'attack', 1);
      assert.equal(B.phase === 'win', oneBlow, 'use ' + pick + ': ' + m.hp + ' left');
    }
  });

  test('underwater, the suit and launcher in hand are the ones he dives with', () => {
    const { g } = onDeck({ beatBoss: true, suit: 3, diveWeapon: 4, useSuit: 0, useDiveWeapon: 1 });
    assert.equal(g.Dive.suit().id, g.SUITS[0].id);
    assert.equal(g.Dive.weapon().id, g.DIVE_WEAPONS[1].id);
  });

  test('the HUD names what is in hand', () => {
    const { h, g } = onDeck({ rod: 2, weapon: 3, useRod: 1, useWeapon: 0 }, { draw: true });
    const said = [], draw = g.Text.draw;
    g.Text.draw = function (ctx, s) { said.push(String(s)); return draw.apply(this, arguments); };
    h.frame();
    g.Text.draw = draw;
    assert.ok(said.includes(g.RODS[1].name), said.filter(s => /Rod/.test(s)).join(', '));
    assert.ok(said.includes(g.WEAPONS[0].name));
  });
});

describe("at Dorran's stall", () => {
  function atStall(player) {
    const t = onDeck(Object.assign({ weapon: 2, rod: 2, coins: 5000 }, player));
    t.g.Shop.open(); t.g.Shop.tab = 1;
    t.S = t.g.Shop;
    t.select = pred => { t.S.sel = t.S.rows().findIndex(pred); assert.ok(t.S.sel >= 0); };
    return t;
  }

  test('E on something he owns takes it in hand, for nothing, and Dorran has a word about it', () => {
    const { g, P, S, select } = atStall();
    select(r => r.kind === 'rod' && r.idx === 0);
    S.act();
    assert.equal(g.gearIndex('rod'), 0);
    assert.equal(P.coins, 5000);
    assert.ok(g.DORRAN.equip.indexOf(S.line) >= 0, S.line);
    S.act();
    assert.ok(g.DORRAN.inHand.indexOf(S.line) >= 0, 'already in hand');
  });

  test("the footer says E will use an owned thing instead, and the row in hand says IN USE", () => {
    const t = onDeck({ weapon: 2, rod: 2 }, { draw: true });
    const S = t.g.Shop;
    S.open(); S.tab = 1;
    const drawn = () => {
      const out = [], draw = t.g.Text.draw;
      t.g.Text.draw = function (ctx, s) { out.push(String(s)); return draw.apply(this, arguments); };
      try { S.draw(t.h.eval('bctx')); } finally { t.g.Text.draw = draw; }
      return out;
    };
    S.sel = S.rows().findIndex(r => r.kind === 'rod' && r.idx === 0);
    assert.ok(drawn().some(s => s.includes('[E] use this instead')));
    S.sel = S.rows().findIndex(r => r.kind === 'rod' && r.idx === 2);
    const now = drawn();
    assert.ok(now.some(s => s.includes('[E] confirm')));
    assert.ok(now.includes('IN USE'));
  });

  test('buying something new puts it in hand, even with an older one picked', () => {
    const { g, P, S, select } = atStall({ useWeapon: 0 });
    select(r => r.kind === 'weapon' && r.idx === 3);
    S.act();
    assert.equal(P.weapon, 3);
    assert.equal(g.deckWeapon().id, g.WEAPONS[3].id);
  });

  test('Excalibur has a row once found, to take back in hand after putting it down', () => {
    const { g, S, select } = atStall({ excalibur: true, useWeapon: 1 });
    select(r => r.kind === 'weapon' && r.idx === g.WEAPONS.length);
    S.act();
    assert.equal(g.deckWeapon(), g.EXCALIBUR);
  });
});

describe('the Gear screen', () => {
  function gearScreen(player, state) {
    const t = onDeck(player);
    if (state) t.g.Game.state = state;
    t.g.Game.pause();
    t.g.Menu.push('gear');
    t.M = t.g.Menu;
    t.rows = () => t.M.items('gear');
    return t;
  }

  test('on deck it lists what he owns and cycles it with the arrow keys, saying what each does, and saves the choice', () => {
    const { h, g, M, rows } = gearScreen({ rod: 2, weapon: 3 });
    assert.deepEqual(plain(rows().filter(r => r.kind === 'gear').map(r => r.label)), ['Rod', 'On deck'], 'no suit before part two');
    M.sel.gear = rows().findIndex(r => r.slot === 'weapon');
    h.tap('ArrowRight');
    assert.equal(g.deckWeapon().id, 'dipnet');
    assert.equal(g.SaveGame.read().useWeapon, 0);
    h.tap('ArrowLeft');
    assert.equal(g.deckWeapon().id, 'harpoon');
    assert.ok(rows().some(r => r.kind === 'text' && r.label === g.gearStat('weapon', g.WEAPONS[3])), 'a line on what it does');
    assert.equal(M.valueText(rows()[M.sel.gear]), '‹ ' + g.WEAPONS[3].name + ' ›');
    h.tap('Enter');
    assert.equal(g.deckWeapon().id, 'dipnet', 'ENTER cycles on, wrapping round');
  });

  test('paused mid-cast, it shows the gear but will not change it', () => {
    const { h, g, M, rows } = gearScreen({ rod: 2, weapon: 3 }, 'fish');
    M.sel.gear = rows().findIndex(r => r.slot === 'rod');
    h.tap('ArrowRight');
    assert.equal(g.rodDef().id, g.RODS[2].id);
    assert.match(M.notice, /only be changed on deck/);
    assert.ok(rows().some(r => r.kind === 'text' && /only be changed on deck/.test(r.label)));
    assert.equal(M.valueText(rows()[M.sel.gear]), g.RODS[2].name, 'no arrows');
  });

  test('the pause menu has it, and every row draws inside the screen', () => {
    const { h, g, M } = gearScreen({ rod: 3, weapon: 5, excalibur: true, beatBoss: true, suit: 3, diveWeapon: 4 });
    assert.ok(M.items('pause').some(i => i.id === 'gear'));
    M.draw(h.eval('bctx'));
    assert.equal(M.hits.filter(x => x.arrows).length, 4);
    for (const x of M.hits) assert.ok(x.arrows ? x.arrows.x0 > x.x + 120 : true, 'the name and the value do not collide');
  });
});

describe('saves', () => {
  test('what is in hand survives a save and a load; out-of-range picks are dropped', () => {
    const { g } = onDeck({ rod: 3, weapon: 5, useRod: 1, useWeapon: 2 });
    const d = plain(g.SaveGame.snapshot());
    g.Player.reset();
    g.SaveGame.restore(g.SaveGame.sanitize(d));
    assert.deepEqual([g.gearIndex('rod'), g.gearIndex('weapon')], [1, 2]);
    const bad = g.SaveGame.sanitize(Object.assign({}, d, { useRod: 99, useWeapon: 'tooth' }));
    assert.equal(bad.useRod, g.RODS.length - 1);
    assert.equal(bad.useWeapon, -1);
    const old = Object.assign({}, d);
    delete old.useRod; delete old.useWeapon;
    assert.equal(g.SaveGame.sanitize(old).useRod, -1, 'a save from before this follows the best');
  });
});
