'use strict';
/* The deeper systems, played the way a player meets them, with real keys and
   whole frames: heavy blows and what they leave behind, stings and bandages,
   records and the bestiary, storms and quiet nights, achievements, and what
   the rebalanced sea pays, and a bucket of chum for a rematch with the Old One. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

function voyage(opts, player) {
  const h = loadGame(Object.assign({ draw: false, seed: 21 }, opts));
  h.startVoyage();
  F.readDialogue(h);
  Object.assign(h.g.Player, { introDone: true, totalKills: 1, girlMet: true }, player);
  return h;
}

// a fight on deck against `id`, the creature holding back from attacking
function fightOn(h, id) {
  const g = h.g;
  g.Player.x = 1000;
  g.Cam.snap(1000);
  g.Game.startBattle(g.monsterDef(id));
  assert.ok(h.until(() => g.Battle.phase === 'fight', 5));
  Object.assign(g.Battle.m, { cool: 1e9, state: 'idle' });
  return g.Battle;
}

// hold J through a swing until the blow has charged, then let go
function heavyBlow(h) {
  const P = h.g.Player;
  h.keyDown('KeyJ');
  assert.ok(h.until(() => P.chargeReady, 4), 'it charged');
  h.keyUp('KeyJ');
  h.frame();
}

describe('heavy blows and what they leave behind', () => {
  test('with the cleaver, a held J winds up a Cleave that bleeds a Tidemaw down to nothing', () => {
    const h = voyage({}, { weapon: 2 });
    const g = h.g, B = fightOn(h, 'tidemaw'), m = B.m, P = g.Player;
    g.Status.roll = () => .999;
    P.x = m.x - 120; P.face = 1;
    heavyBlow(h);
    assert.equal(P.heavy, true);
    assert.ok(h.until(() => P.attackDone, 2), 'the Cleave landed');
    assert.equal(g.Status.bleeding(m), true);
    m.hp = 10;
    assert.ok(h.until(() => B.phase === 'win', 5), 'it bled out');
    assert.ok(g.Achievements.has('bleedout'));
  });

  test("the Weeping Bell's stingers poison him, and Q with a bandage draws it out before it costs a heart", () => {
    const h = voyage({}, { weapon: 1, bandages: 2, hp: 4, maxHp: 5 });
    const g = h.g, B = fightOn(h, 'weepingbell'), P = g.Player;
    P.invuln = 0;
    B.curtains.push({ x: P.x, w: 200, t: .79, warn: .8, on: .55 });
    h.frames(.1);
    assert.equal(g.Status.poisoned(P), true);
    const hp = P.hp;
    h.tap('KeyQ');
    assert.equal(g.Status.poisoned(P), false);
    h.frames(4);
    assert.ok(P.hp >= hp, 'no heart lost to it');
  });
});

describe('records and the bestiary', () => {
  test('a heavier catch than before is announced, and the bestiary counts the kill toward study', () => {
    const h = voyage({}, { weapon: 5 });
    const g = h.g;
    g.Player.records = { netbiter: 60 };
    g.Player.kills = { netbiter: 4 };
    const B = fightOn(h, 'netbiter');
    B.m.hp = 1;
    g.Player.x = B.m.x - 110; g.Player.face = 1;
    h.tap('KeyJ');
    assert.ok(h.until(() => B.phase === 'win', 3));
    assert.ok(g.Player.records.netbiter > 60);
    assert.match(g.Game.toastText, /New record: Netbiter/);
    assert.equal(g.Bestiary.studied(g.monsterDef('netbiter')), true, 'the fifth one');
  });

  test('the last creature of a chapter pays for it, and the pause menu opens the book on that chapter', () => {
    const h = voyage({}, { weapon: 5 });
    const g = h.g, c = g.Bestiary.chapters()[0];
    for (const d of c.list().slice(1)) g.Player.kills[d.id] = 1;
    const coins = g.Player.coins;
    const B = fightOn(h, c.list()[0].id);
    B.m.hp = 1;
    g.Player.x = B.m.x - 110; g.Player.face = 1;
    h.tap('KeyJ');
    assert.ok(h.until(() => B.phase === 'win', 3));
    assert.equal(g.Player.coins, coins + c.reward);
    assert.ok(h.until(() => g.Game.state === 'play', 6));
    F.readDialogue(h);
    h.tap('Escape');
    assert.equal(g.Game.state, 'pause');
    g.Menu.sel.pause = g.Menu.items('pause').findIndex(i => i.id === 'bestiary');
    h.tap('Enter');
    assert.ok(g.Bestiary.book);
    assert.match(g.Menu.items('pause').find(i => i.id === 'bestiary').label, new RegExp('\\(' + c.list().length + '/'));
    h.tap('Escape');
    assert.equal(g.Bestiary.book, null);
  });
});

describe('weather and the night', () => {
  test('a storm rolls in over a real cast: the bite comes quicker and lightning strikes while he waits', () => {
    const h = voyage({}, { weapon: 1, rod: 1 });
    const g = h.g, W = g.Weather;
    W.begin(); W.phase = 'raging'; W.storm = 1; W.hold = 1e9;
    F.castLine(h);
    assert.ok(h.until(() => g.Fishing.phase === 'deep', 10));
    assert.ok(g.Fishing.waitFor <= 5 * .65 + 1e-9);
    W.boltT = .3;                                  // the next strike is close
    assert.ok(h.until(() => W.flash > 0, 3), 'lightning struck');
    assert.ok(h.until(() => g.Fishing.phase === 'bite', 6));
  });

  test('on a quiet night walking the deck, something strange happens, and the sixth earns its achievement', () => {
    const h = voyage();
    const g = h.g, O = g.Omens;
    g.Player.omens = 4;
    g.SeaDice.chance = p => p === g.OMEN.chance;
    O.next = .5;
    h.keyDown('KeyD');
    assert.ok(h.until(() => O.active, 3), 'something happened');
    h.keyUp('KeyD');
    assert.equal(g.Player.omens, 5);
    h.frames(1.2);
    assert.equal(g.Achievements.has('omens'), true);
  });
});

describe('achievements across a voyage', () => {
  test('the first catch of a voyage earns one, the card shows, and the next time the game opens it is still there', () => {
    const h = loadGame({ draw: false, seed: 3 });
    F.newVoyageFromMenu(h);
    F.skipOpening(h);
    F.readDialogue(h);
    F.openCrate(h);
    F.castLine(h);
    F.landIntroCatch(h);
    assert.equal(F.fightBot(h, 120), true);
    h.frames(1.2);
    assert.equal(h.g.Achievements.has('first_catch'), true);
    assert.ok(h.g.Achievements.toast || h.g.Achievements.queue.length);

    const again = loadGame({ draw: false, storage: Object.fromEntries(h.storage) });
    again.g.Achievements.load();
    F.chooseMenu(again, 'achievements');
    assert.ok(again.g.Achievements.book);
    assert.equal(again.g.Achievements.has('first_catch'), true);
  });
});

describe('what the sea pays now', () => {
  test('going down with 20,000§ in his pocket costs the capped fee, not a quarter of it', () => {
    const h = voyage({}, { weapon: 0, coins: 20000 });
    const g = h.g, B = fightOn(h, 'gnashfin');
    g.Player.hp = 1; g.Player.invuln = 0;
    B._hurtPlayer(1, g.Player.x + 40);
    assert.ok(h.until(() => g.Game.state === 'play', 6));
    assert.equal(g.Player.coins, 20000 - g.SALVAGE_CAP);
    assert.equal(g.Achievements.has('salvage'), true);
  });

  test('a second Old One, sold at the stall, fetches well under what the first did', () => {
    const h = voyage({}, { weapon: 5, beatBoss: true, suit: 0, diveWeapon: 0 });
    const g = h.g;
    g.Player.catches.push(g.makeTrophy(g.monsterDef('leviathan')));
    const worth = g.Player.catches[0].value;
    assert.ok(worth < g.monsterDef('leviathan').value * .6, 'worth ' + worth);
    F.openStall(h);
    const coins = g.Player.coins;
    h.tap('Enter');
    h.frames(.3);
    assert.equal(g.Player.coins, coins + worth);
  });
});

describe('a rematch with the Old One', () => {
  // lose to the Old One on deck, and read through what follows
  function beaten(h) {
    const g = h.g, B = fightOn(h, 'leviathan');
    g.Player.hp = 1; g.Player.invuln = 0;
    B._hurtPlayer(1, g.Player.x + 40);
    const lines = [];
    assert.ok(h.until(() => { if (g.Dialogue.active && lines.indexOf(g.Dialogue.full) < 0) lines.push(g.Dialogue.full); return g.Game.state === 'play'; }, 8));
    for (let i = 0; i < 8 && g.Dialogue.active; i++) { if (lines.indexOf(g.Dialogue.full) < 0) lines.push(g.Dialogue.full); h.tap('Enter'); h.frames(.1); h.tap('Enter'); h.frames(.1); }
    return lines;
  }

  test('beaten by it, he buys a Bucket of Chum from Dorran with the keys, and the very next bite is the Old One, spending the bucket', () => {
    const h = voyage({}, { weapon: 5, rod: 3, coins: 2000 });
    const g = h.g, P = g.Player, S = g.Shop;
    const lines = beaten(h);
    assert.ok(lines.some(l => /bucket/.test(l)), lines.join(' | '));

    F.openStall(h);
    for (let i = 0; i < 3 && S.tab !== 2; i++) h.tap('ArrowRight');
    assert.equal(S.tab, 2);
    for (let i = 0; i < 6 && S.rows()[S.sel].id !== 'chum'; i++) h.tap('ArrowDown');
    assert.equal(S.rows()[S.sel].name, 'Bucket of Chum');
    const coins = P.coins;
    h.tap('KeyE');
    assert.equal(P.chum, true);
    assert.equal(P.coins, coins - 250);
    h.tap('Escape');
    assert.equal(g.Game.state, 'play');

    F.castLine(h);
    F.waitForBite(h, 30);
    assert.equal(g.Fishing.target.id, 'leviathan');
    F.setHook(h);
    h.autoReel(90);
    assert.ok(h.until(() => g.Game.state === 'battle', 6), 'the fight is on');
    assert.equal(g.Battle.def.id, 'leviathan');
    assert.equal(P.chum, false);
  });

  test('a bucket bought and not yet used is still in hand after quitting to the title and pressing Continue', () => {
    const h = voyage({}, { weapon: 5, rod: 3, lostOldOne: true, chum: true });
    h.g.Game.autosave();
    const again = loadGame({ draw: false, seed: 21, storage: Object.fromEntries(h.storage) });
    F.chooseMenu(again, 'continue');
    assert.ok(again.until(() => again.g.Game.state === 'play', 3));
    F.readDialogue(again);
    assert.equal(again.g.Player.chum, true);
    F.castLine(again);
    F.waitForBite(again, 30);
    assert.equal(again.g.Fishing.target.id, 'leviathan');
  });
});
