'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');

// free play on deck, no dialogue up, standing mid-boat
function onDeck(opts) {
  const h = loadGame(Object.assign({ draw: false, seed: 5 }, opts));
  h.startVoyage();
  h.g.Player.x = 1100;
  return { h, g: h.g, P: h.g.Player };
}

describe('walking the deck', () => {
  test('A walks left and faces left', () => {
    const { h, P } = onDeck();
    h.keyDown('KeyA');
    h.frames(.25);
    assert.equal(P.face, -1);
    assert.ok(P.x < 1100);
    assert.equal(P.state, 'walk');
  });

  test('D walks right and faces right', () => {
    const { h, P } = onDeck();
    P.face = -1;
    h.keyDown('KeyD');
    h.frames(.25);
    assert.equal(P.face, 1);
    assert.ok(P.x > 1100);
  });

  test('the arrow keys walk too', () => {
    const { h, P } = onDeck();
    h.keyDown('ArrowLeft');
    h.frames(.1);
    assert.equal(P.face, -1);
    h.keyUp('ArrowLeft');
    h.keyDown('ArrowRight');
    h.frames(.1);
    assert.equal(P.face, 1);
  });

  test('letting go stops him and keeps the way he was facing', () => {
    const { h, P } = onDeck();
    h.hold('KeyA', .2);
    const x = P.x;
    h.frames(.2);
    assert.equal(P.x, x);
    assert.equal(P.face, -1);
    assert.equal(P.state, 'idle');
  });

  test('holding both directions cancels out', () => {
    const { h, P } = onDeck();
    h.keyDown('KeyA'); h.keyDown('KeyD');
    h.frames(.2);
    assert.equal(P.x, 1100);
    assert.equal(P.state, 'idle');
  });

  test('walks at a steady 236 px/s', () => {
    const { h, P } = onDeck();
    h.keyDown('KeyD');
    h.frames(.5);
    assert.ok(Math.abs(P.x - (1100 + 236 * .5)) < 5, 'x ' + P.x);
  });

  test('cannot walk off either end of the boat', () => {
    const { h, g, P } = onDeck();
    P.x = g.WALK_L + 5;
    h.keyDown('KeyA'); h.frames(.5); h.keyUp('KeyA');
    assert.equal(P.x, g.WALK_L);
    P.x = g.WALK_R - 5;
    h.keyDown('KeyD'); h.frames(.5);
    assert.equal(P.x, g.WALK_R);
  });

  test('a rebound move key walks; the old primary stays as the second key', () => {
    const { h, g, P } = onDeck();
    g.Settings.bind('left', 'KeyH');
    h.keyDown('ArrowLeft'); h.frames(.2); h.keyUp('ArrowLeft');
    assert.equal(P.x, 1100, 'the dropped second key no longer walks');
    h.keyDown('KeyH'); h.frames(.2); h.keyUp('KeyH');
    assert.ok(P.x < 1100);
    const x = P.x;
    h.keyDown('KeyA'); h.frames(.2);
    assert.ok(P.x < x);
    assert.equal(P.face, -1);
  });
});

describe('jumping', () => {
  test('jumps from the deck, rises, and lands back on it', () => {
    const { h, g, P } = onDeck();
    h.press('Space');
    h.frame();
    assert.ok(P.vy < 0 && P.y < g.DECK_Y);
    h.frames(.15);
    assert.equal(P.state, 'jump');
    h.frames(1);
    assert.equal(P.y, g.DECK_Y);
    assert.equal(P.vy, 0);
  });

  test('cannot jump again in mid-air', () => {
    const { h, P } = onDeck();
    h.press('Space'); h.frame();
    h.frames(.1);
    const vy = P.vy;
    h.press('Space'); h.frame();
    assert.ok(P.vy > vy, 'second press did not relaunch');
  });

  test('a hard landing sets a squash timer', () => {
    const { h, P } = onDeck();
    h.press('Space'); h.frame();
    h.until(() => P.landT > 0, 2);
    assert.ok(P.landT > 0 && P.landT <= .2);
  });
});

describe('bandages on deck', () => {
  test('Q binds two hearts and uses one bandage', () => {
    const { h, P } = onDeck();
    P.hp = 2; P.bandages = 2;
    h.tap('KeyQ');
    assert.equal(P.hp, 4);
    assert.equal(P.bandages, 1);
  });

  test('never heals past maximum health', () => {
    const { h, P } = onDeck();
    P.hp = 4; P.maxHp = 5; P.bandages = 1;
    h.tap('KeyQ');
    assert.equal(P.hp, 5);
  });

  test('at full health nothing is used and a toast explains', () => {
    const { h, g, P } = onDeck();
    P.hp = P.maxHp; P.bandages = 3;
    h.tap('KeyQ');
    assert.equal(P.bandages, 3);
    assert.match(g.Game.toastText, /whole/);
  });

  test('with no bandages, a toast points to Dorran', () => {
    const { h, g, P } = onDeck();
    P.hp = 1; P.bandages = 0;
    h.tap('KeyQ');
    assert.equal(P.hp, 1);
    assert.match(g.Game.toastText, /Dorran/);
  });
});

describe('stations and dialogue', () => {
  test('dialogue on screen stops him walking', () => {
    const { h, g, P } = onDeck();
    g.Game.say(['You', 'Hm.']);
    h.keyDown('KeyD');
    h.frames(.3);
    assert.equal(P.x, 1100);
    assert.equal(P.state, 'idle');
  });

  test('ESC on deck pauses the game', () => {
    const { h, g } = onDeck();
    h.tap('Escape');
    assert.equal(g.Game.state, 'pause');
    assert.equal(g.Game.pausedFrom, 'play');
  });

  test('stations only answer when he stands close to them', () => {
    const { g, P } = onDeck();
    P.x = 392;
    assert.equal(g.Game.nearestSpot().id, 'crate');
    P.x = 742 + 100;
    assert.equal(g.Game.nearestSpot().id, 'stall');
    P.x = 1100;
    assert.equal(g.Game.nearestSpot(), null);
    P.x = g.FISH_X - 50;
    assert.equal(g.Game.nearestSpot().id, 'fish');
  });

  test('the empty crate stops being a station once opened', () => {
    const { h, g, P } = onDeck();
    P.x = 392;
    h.tap('KeyE');
    assert.equal(P.weapon, 0);
    assert.equal(g.Game.crateOpen, true);
    assert.equal(g.Game.spotLabel({ id: 'crate' }), null);
    assert.equal(g.Game.nearestSpot(), null);
  });

  test('casting without a weapon is refused', () => {
    const { h, g, P } = onDeck();
    P.x = g.FISH_X;
    h.tap('KeyE');
    assert.equal(g.Game.state, 'play');
    assert.equal(g.Dialogue.active, true);
    assert.equal(P.casts, 0);
  });

  test('with a weapon, the bow station starts fishing', () => {
    const { h, g, P } = onDeck();
    P.weapon = 0; P.x = g.FISH_X - 30;
    h.tap('KeyE');
    assert.equal(g.Game.state, 'fish');
    assert.equal(P.casts, 1);
  });

  test("the stall opens Dorran's shop", () => {
    const { h, g, P } = onDeck();
    P.x = 742;
    h.tap('KeyE');
    assert.equal(g.Game.state, 'shop');
  });

  test('the objective line follows progress', () => {
    const { g, P } = onDeck();
    assert.match(g.Game.objective(), /crate/);
    P.weapon = 0;
    assert.match(g.Game.objective(), /Cast/);
    P.catches.push({ id: 'gnashfin', value: 1 });
    assert.match(g.Game.objective(), /Sell/);
    P.catches.length = 0; P.totalKills = 3;
    assert.match(g.Game.objective(), /Deeper/);
    P.rod = 3;
    assert.match(g.Game.objective(), /still down there/);
    P.beatBoss = true;
    assert.match(g.Game.objective(), /quiet/);
    P.suit = 0;
    assert.match(g.Game.objective(), /Dive at the ladder/);
    P.suit = g.SUITS.length - 1;
    assert.match(g.Game.objective(), /Lanthorne is down there/);
    P.beatMother = true;
    assert.match(g.Game.objective(), /Take the Margaret home/);
    P.sawEnding = true;
    assert.match(g.Game.objective(), /lit again/);
  });

  test('once diving, the HUD shows the suit and the diving weapon', () => {
    const { h, g, P } = onDeck({ draw: true });
    Object.assign(P, { beatBoss: true, suit: 2, diveWeapon: 3, weapon: 5 });
    h.sandbox.__text = [];
    h.eval('(() => { const f = Text.draw; Text.draw = function (g, s, ...a) { __text.push(String(s)); return f.call(this, g, s, ...a); }; })()');
    h.frame();
    assert.ok(h.sandbox.__text.includes('Riveted Pressure Suit'));
    assert.ok(h.sandbox.__text.includes('Narwhal Tusk'));
  });

  test('Player.reset puts every field back to a new voyage', () => {
    const { g, P } = onDeck();
    Object.assign(P, { coins: 99, rod: 3, weapon: 5, hp: 1, maxHp: 9, bandages: 4, lockets: 3, lantern: true, luck: true, beatBoss: true, introDone: true, totalKills: 8, x: 12 });
    P.catches.push({}); P.kills = { a: 1 };
    P.reset();
    assert.deepEqual([P.coins, P.rod, P.weapon, P.hp, P.maxHp, P.bandages, P.lockets, P.lantern, P.luck, P.beatBoss, P.introDone, P.totalKills, P.x, P.catches.length, Object.keys(P.kills).length],
      [0, 0, -1, 5, 5, 0, 0, false, false, false, false, 0, 640, 0, 0]);
  });
});
