'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');

function atStall(setup) {
  const h = loadGame({ draw: false, seed: 4 });
  h.startVoyage();
  const g = h.g;
  g.Player.weapon = 0;
  if (setup) setup(g.Player, g);
  g.Shop.open();
  return { h, g, S: g.Shop, P: g.Player };
}
const catchOf = (g, id) => g.makeTrophy(g.MONSTERS.find(m => m.id === id));
const selectRow = (S, pred) => { S.sel = S.rows().findIndex(pred); assert.ok(S.sel >= 0, 'row not found'); };

describe('opening the stall', () => {
  test('opens on SELL when there is something in the hold', () => {
    const { g, S } = atStall((P, g) => P.catches.push(catchOf(g, 'gnashfin')));
    assert.equal(g.Game.state, 'shop');
    assert.equal(S.tab, 0);
    assert.ok(S.line.length > 0, 'Dorran says hello');
  });

  test('opens on GEAR when the hold is empty', () => {
    assert.equal(atStall().S.tab, 1);
  });

  test('ESC leaves, back to the deck, and saves', () => {
    const { h, g } = atStall();
    h.storage.clear();
    h.tap('Escape');
    assert.equal(g.Game.state, 'play');
    assert.ok(h.storage.has('deepsupper.save.v1'));
  });

  test('left and right switch tabs, wrapping round', () => {
    const { h, S } = atStall();
    h.tap('ArrowRight');
    assert.equal(S.tab, 2);
    h.tap('ArrowRight');
    assert.equal(S.tab, 0);
    h.tap('ArrowLeft');
    assert.equal(S.tab, 2);
  });
});

describe('selling', () => {
  test('an empty hold shows a single row you cannot select', () => {
    const { S } = atStall();
    S.tab = 0;
    const rows = S.rows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'none');
    assert.equal(S.selectable(rows[0]), false);
  });

  test('one catch has no "sell all" row; two or more do, with the right total', () => {
    const one = atStall((P, g) => P.catches.push(catchOf(g, 'gnashfin')));
    assert.ok(!one.S.rows().some(r => r.kind === 'all'));
    const two = atStall((P, g) => P.catches.push(catchOf(g, 'gnashfin'), catchOf(g, 'bristlejaw')));
    const all = two.S.rows()[0];
    assert.equal(all.kind, 'all');
    assert.equal(all.value, two.P.catches[0].value + two.P.catches[1].value);
  });

  test('selling one catch pays its value and removes it', () => {
    const { S, P } = atStall((P, g) => P.catches.push(catchOf(g, 'gnashfin'), catchOf(g, 'tidemaw')));
    const tide = P.catches[1];
    selectRow(S, r => r.kind === 'fish' && r.name === 'Tidemaw');
    S.act();
    assert.equal(P.coins, tide.value);
    assert.equal(P.sold, 1);
    assert.deepEqual(plain(P.catches.map(c => c.id)), ['gnashfin']);
  });

  test('selling the whole haul pays everything and empties the hold', () => {
    const { S, P } = atStall((P, g) => P.catches.push(catchOf(g, 'gnashfin'), catchOf(g, 'bristlejaw'), catchOf(g, 'netbiter')));
    const total = P.catches.reduce((a, c) => a + c.value, 0);
    S.sel = 0;
    S.act();
    assert.equal(P.coins, total);
    assert.equal(P.sold, 3);
    assert.equal(P.catches.length, 0);
  });

  test('after the last sale the cursor lands somewhere valid', () => {
    const { S, P } = atStall((P, g) => P.catches.push(catchOf(g, 'gnashfin')));
    S.sel = 0;
    S.act();
    assert.equal(P.catches.length, 0);
    assert.ok(S.sel >= 0 && S.sel < S.rows().length);
  });
});

describe('the gear tab', () => {
  test('lists rods then arms under headings the cursor skips', () => {
    const { h, S } = atStall();
    const rows = S.rows();
    assert.equal(rows[0].kind, 'head');
    assert.equal(rows.filter(r => r.kind === 'rod').length, 4);
    assert.equal(rows.filter(r => r.kind === 'weapon').length, 6);
    S.sel = S.firstSelectable();
    assert.equal(S.sel, 1);
    for (let i = 0; i < 30; i++) {
      h.press('ArrowDown'); S.update(1 / 60); h.g.Input.endFrame();
      assert.ok(S.selectable(S.rows()[S.sel]));
    }
  });

  test('only the next upgrade is for sale; later ones are locked', () => {
    const { S } = atStall();
    const rods = S.rows().filter(r => r.kind === 'rod');
    assert.deepEqual(plain(rods.map(r => [r.owned, r.locked])),[[true, false], [false, false], [false, true], [false, true]]);
  });

  test('buying the next rod spends the coins and equips it', () => {
    const { S, P } = atStall(P => { P.coins = 100; });
    selectRow(S, r => r.kind === 'rod' && r.idx === 1);
    S.act();
    assert.equal(P.rod, 1);
    assert.equal(P.coins, 15);
  });

  test("you can't buy what you can't afford", () => {
    const { S, P } = atStall(P => { P.coins = 84; });
    selectRow(S, r => r.kind === 'rod' && r.idx === 1);
    S.act();
    assert.equal(P.rod, 0);
    assert.equal(P.coins, 84);
    assert.match(S.line, /1 more/);
  });

  test('locked and owned items are refused without charging', () => {
    const { S, P } = atStall(P => { P.coins = 5000; });
    selectRow(S, r => r.kind === 'rod' && r.idx === 3);
    S.act();
    assert.equal(P.rod, 0);
    assert.match(S.line, /One step/);
    selectRow(S, r => r.kind === 'weapon' && r.idx === 0);
    S.act();
    assert.equal(P.coins, 5000);
    assert.match(S.line, /got one/);
  });

  test('buying the next weapon upgrades what you fight with', () => {
    const { S, P } = atStall(P => { P.coins = 120; });
    selectRow(S, r => r.kind === 'weapon' && r.idx === 1);
    S.act();
    assert.equal(P.weapon, 1);
    assert.equal(P.coins, 0);
  });
});

describe('the goods tab', () => {
  test('bandages stack up to five', () => {
    const { S, P } = atStall(P => { P.coins = 1000; });
    S.tab = 2;
    selectRow(S, r => r.id === 'bandage');
    for (let i = 0; i < 7; i++) S.act();
    assert.equal(P.bandages, 5);
    assert.equal(P.coins, 1000 - 5 * 24);
  });

  test('each heart locket adds a heart and costs more than the last', () => {
    const { S, P } = atStall(P => { P.coins = 5000; });
    S.tab = 2;
    selectRow(S, r => r.id === 'locket');
    const p1 = S.rows()[S.sel].price;
    S.act();
    assert.equal(P.maxHp, 6);
    assert.equal(P.hp, 6);
    const p2 = S.rows()[S.sel].price;
    assert.equal(p1, 150);
    assert.equal(p2, Math.round(150 * 1.55));
  });

  test('the lantern and the charm are one-offs', () => {
    const { S, P } = atStall(P => { P.coins = 5000; });
    S.tab = 2;
    selectRow(S, r => r.id === 'lantern');
    S.act(); S.act();
    selectRow(S, r => r.id === 'charm');
    S.act();
    assert.equal(P.lantern, true);
    assert.equal(P.luck, true);
    assert.equal(P.coins, 5000 - 95 - 210);
  });
});
