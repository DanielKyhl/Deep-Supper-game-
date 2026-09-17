'use strict';
/* Achievements: kept apart from the saves, earned by how things stand or by
   what happens, shown as they come, and listed on their own screen. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');
const F = require('../helpers/flows');

const KEY = 'deepsupper.achievements.v1';
function onDeck(opts) {
  const h = loadGame(Object.assign({ draw: false, seed: 9 }, opts));
  h.startVoyage();
  F.readDialogue(h);
  return { h, g: h.g, A: h.g.Achievements, P: h.g.Player };
}

describe('the list', () => {
  test('thirty-one of them, each with a fixed id, a name, and a line that fits its card', () => {
    const { g, A } = onDeck();
    const L = g.ACHIEVEMENTS;
    assert.equal(A.total(), 31);
    assert.equal(new Set(L.map(a => a.id)).size, L.length);
    for (const a of L) {
      assert.match(a.id, /^[a-z0-9_]+$/, a.id);
      assert.ok(a.name && a.desc, a.id);
      assert.ok(g.Text.wrap(null, a.desc, A.CARD_TEXT, { size: 12, font: 'Verdana, sans-serif' }).length <= 2, a.id + ' does not fit on two lines');
      assert.ok(g.Text.width(null, a.name, { size: 16 }) <= A.CARD_TEXT, a.id + ' name is too long');
    }
    assert.ok(L.some(a => a.hidden), 'some are secret');
    for (const [event, id] of Object.entries(plain(g.ACHIEVEMENT_EVENTS))) if (id) assert.ok(A.def(id), event + ' earns a real one');
  });
});

describe('earning them', () => {
  test('by how things stand, once a second, and shown one at a time as a card', () => {
    const { h, g, A, P } = onDeck();
    assert.equal(A.has('first_catch'), false);
    P.totalKills = 1;
    P.coins = 12000;
    h.frames(1.2);
    assert.equal(A.has('first_catch'), true);
    assert.equal(A.has('rich'), true);
    assert.ok(A.toast, 'a card is up');
    const first = A.toast.def.id;
    h.frames(4.2);
    assert.ok(A.toast && A.toast.def.id !== first, 'then the next');
    h.frames(4.2);
    assert.equal(A.toast, null);
  });

  test('by what happens: a parry, a salvage fee, a bleed-out, a heavy kill, poison, a storm catch, a close call on air', () => {
    const { g, A } = onDeck();
    for (const [event, id] of [['parry', 'parry'], ['salvage', 'salvage'], ['bleedKill', 'bleedout'], ['heavyKill', 'windup'], ['poisoned', 'poisoned'], ['stormCatch', 'weathered'], ['fine', 'fine'], ['silhouette', 'something_big'], ['record', 'record']]) {
      assert.equal(A.has(id), false, id);
      A.event(event);
      assert.equal(A.has(id), true, id);
    }
  });

  test('the real moments tell it: parrying the jaw, paying the fee, climbing out with no air left', () => {
    const { h, g, A, P } = onDeck();
    // the fee
    P.coins = 400;
    g.Game.startBattle(g.monsterDef('gnashfin'));
    g.Game.endBattle(false);
    assert.equal(A.has('salvage'), true);
    // no air
    Object.assign(P, { beatBoss: true, suit: 0, diveWeapon: 0 });
    g.Game.state = 'dive'; g.Dive.start(); g.Dive.enterWater();
    g.Dive.p.air = 2;
    g.Dive.climb();
    assert.equal(A.has('fine'), true);
  });

  test('beating the Old One without losing a heart is its own; losing one is not', () => {
    const a = onDeck();
    a.g.Game.startBattle(a.g.monsterDef('leviathan'));
    a.g.Battle.phase = 'fight';
    a.g.Battle._die();
    assert.equal(a.A.has('flawless'), true);

    const b = onDeck();
    b.g.Game.startBattle(b.g.monsterDef('leviathan'));
    b.g.Battle.phase = 'fight';
    b.P.invuln = 0;
    b.g.Battle._hurtPlayer(1, b.P.x + 50);
    b.g.Battle._die();
    assert.equal(b.A.has('flawless'), false);
  });

  test("the last one comes by itself once every other is earned", () => {
    const { g, A } = onDeck();
    for (const a of g.ACHIEVEMENTS) if (a.id !== 'complete') A.got[a.id] = 1;
    A.check();
    assert.equal(A.has('complete'), true);
  });

  test('a voyage started from a test shortcut earns nothing', () => {
    const h = loadGame({ draw: false, seed: 2 });
    F.chooseMenu(h, 'dev');
    F.chooseMenu(h, 'devOldOne');
    assert.ok(h.until(() => h.g.Game.state === 'battle', 3));
    assert.equal(h.g.Player.shortcut, true);
    h.frames(2);
    assert.equal(h.g.Achievements.count(), 0, 'not even the rod it handed over');
    assert.equal(h.g.SaveGame.snapshot().shortcut, true, 'and it stays marked in the save');
  });
});

describe('keeping them', () => {
  test('they are kept apart from saves: a new voyage keeps them, and so does another game on this computer', () => {
    const { h, g, A, P } = onDeck();
    P.totalKills = 1;
    A.check();
    assert.ok(JSON.parse(h.storage.get(KEY)).got.first_catch > 0);
    g.Game.newGame();
    assert.equal(A.has('first_catch'), true);
    const again = loadGame({ draw: false, storage: Object.fromEntries(h.storage) });
    again.g.Achievements.load();
    assert.equal(again.g.Achievements.has('first_catch'), true);
  });

  test('a damaged file keeps only real ones', () => {
    const h = loadGame({ draw: false, storage: { [KEY]: JSON.stringify({ got: { first_catch: 5, made_up: 3, rich: 'yes' } }) } });
    const A = h.g.Achievements;
    A.load();
    assert.deepEqual(Object.keys(A.got), ['first_catch']);
    const broken = loadGame({ draw: false, storage: { [KEY]: '{nope' } });
    broken.g.Achievements.load();
    assert.equal(broken.g.Achievements.count(), 0);
  });

  test('a storefront can listen for each one as it is earned', () => {
    const { A, P } = onDeck();
    const heard = [];
    A.onUnlock(def => heard.push(def.id));
    A.onUnlock(() => { throw new Error('a broken listener'); });
    P.sold = 1;
    assert.doesNotThrow(() => A.check());
    assert.deepEqual(heard, ['first_sale']);
  });
});

describe('the screen', () => {
  test('from the title and the pause menu; arrows turn the page, ESC closes', () => {
    const { h, g, A } = onDeck();
    g.Game.pause();
    const item = g.Menu.items('pause').find(i => i.id === 'achievements');
    assert.match(item.label, /Achievements {2}\(\d+\/31\)/);
    item.run();
    assert.ok(A.book);
    h.tap('ArrowRight');
    assert.equal(A.book.page, 1);
    h.tap('ArrowLeft'); h.tap('ArrowLeft');
    assert.equal(A.book.page, A.pages() - 1, 'wraps round');
    h.tap('Escape');
    assert.equal(A.book, null);
    assert.equal(g.Game.state, 'pause');
    assert.ok(g.Menu.items('main').some(i => i.id === 'achievements'));
  });

  test('every page and the card draw balanced', () => {
    const { h, g, A } = onDeck({ draw: true });
    const rec = h.hires(), bctx = h.eval('bctx');
    A.got.first_catch = 1; A.got.something_big = 1;
    A.open();
    for (let p = 0; p < A.pages(); p++) {
      A.book.page = p;
      rec.reset();
      A.drawBook(bctx);
      assert.equal(rec.depth(), 0, 'page ' + p);
    }
    A.toast = { def: A.def('first_catch'), t: 1 };
    rec.reset();
    A.drawToast(bctx);
    assert.equal(rec.depth(), 0);
  });
});
