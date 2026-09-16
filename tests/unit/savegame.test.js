'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');

const SAVE = 'deepsupper.save.v1';
const valid = extra => Object.assign({
  version: 1, savedAt: 123, coins: 250, hp: 3, maxHp: 6, rod: 2, weapon: 1,
  bandages: 2, lockets: 1, totalKills: 4, sold: 3, casts: 9,
  lantern: true, luck: false, beatBoss: false, introDone: true,
  crateOpen: true, x: 900,
  catches: [{ id: 'gnashfin', name: 'Gnashfin', weight: 120, value: 50, body: [1, 2, 3], belly: [4, 5, 6], len: 240 }],
  kills: { gnashfin: 3, bristlejaw: 1 }
}, extra);

describe('SaveGame.sanitize', () => {
  const { h, g } = loadGame({ draw: false });
  const sane = raw => plain(g.SaveGame.sanitize(h.eval('(' + JSON.stringify(raw) + ')')));

  test('rejects anything that is not a version 1 save object', () => {
    for (const raw of [null, 7, 'save', [], {}, { version: 2 }, { version: '1' }]) {
      assert.equal(g.SaveGame.sanitize(h.eval('(' + JSON.stringify(raw) + ')')), null, JSON.stringify(raw));
    }
  });

  test('a valid save passes through intact', () => {
    const d = sane(valid());
    assert.equal(d.coins, 250);
    assert.equal(d.rod, 2);
    assert.equal(d.weapon, 1);
    assert.equal(d.introDone, true);
    assert.equal(d.x, 900);
    assert.deepEqual(d.kills, { gnashfin: 3, bristlejaw: 1 });
    assert.equal(d.catches.length, 1);
  });

  test('integers are rounded and clamped to what the game supports', () => {
    const d = sane(valid({ coins: -40, rod: 99, weapon: -7, bandages: 3.6, hp: 50, maxHp: 8 }));
    assert.equal(d.coins, 0);
    assert.equal(d.rod, g.RODS.length - 1);
    assert.equal(d.weapon, -1);
    assert.equal(d.bandages, 4);
    assert.equal(d.hp, 8, 'hp never above max');
  });

  test('missing or non-numeric numbers take the field minimum', () => {
    const d = sane({ version: 1, coins: 'lots', rod: null });
    assert.equal(d.coins, 0);
    assert.equal(d.rod, 0);
    assert.equal(d.weapon, -1);
  });

  test('booleans only count when they are literally true', () => {
    const d = sane(valid({ lantern: 'yes', luck: 1, beatBoss: true }));
    assert.equal(d.lantern, false);
    assert.equal(d.luck, false);
    assert.equal(d.beatBoss, true);
  });

  test('max health never drops below the starting five', () => {
    const d = sane(valid({ maxHp: 2, hp: 2 }));
    assert.equal(d.maxHp, 5);
    assert.equal(d.hp, 2);
  });

  test('owning any weapon means the crate was opened', () => {
    assert.equal(sane(valid({ crateOpen: false, weapon: 0 })).crateOpen, true);
    assert.equal(sane(valid({ crateOpen: false, weapon: -1 })).crateOpen, false);
  });

  test('position is clamped to the deck, or defaults to the middle', () => {
    assert.equal(sane(valid({ x: -500 })).x, g.WALK_L);
    assert.equal(sane(valid({ x: 99999 })).x, g.WALK_R);
    assert.equal(sane(valid({ x: 'port' })).x, 640);
  });

  test('kills only count known monsters with positive tallies', () => {
    const d = sane(valid({ kills: { gnashfin: 2.7, kraken: 5, bristlejaw: -1, palefinger: 'many' } }));
    assert.deepEqual(d.kills, { gnashfin: 2 });
  });

  test('catches are rebuilt from monster data, dropping unknown ones', () => {
    const d = sane(valid({
      catches: [
        { id: 'gnashfin', name: 'HACKED', weight: 5e9, value: -3, body: [9, 9, 9], len: 1 },
        { id: 'megalodon', weight: 1, value: 1 },
        null
      ]
    }));
    assert.equal(d.catches.length, 1);
    const c = d.catches[0];
    assert.equal(c.name, 'Gnashfin');
    assert.equal(c.len, 240);
    assert.deepEqual(c.body, [86, 130, 122]);
    assert.equal(c.weight, 100000);
    assert.equal(c.value, 0);
  });

  test('saves from before diving existed get the suit the Old One left', () => {
    const d = sane({ version: 1, beatBoss: true, coins: 3 });
    assert.equal(d.suit, 0);
    assert.equal(d.diveWeapon, 0);
    const early = sane({ version: 1, beatBoss: false });
    assert.equal(early.suit, -1);
    assert.equal(early.diveWeapon, -1);
  });

  test('diving gear is clamped to what exists, and owning a suit means owning a harpoon', () => {
    const d = sane(valid({ beatBoss: true, suit: 40, diveWeapon: 99, beatMother: 'yes' }));
    assert.equal(d.suit, g.SUITS.length - 1);
    assert.equal(d.diveWeapon, g.DIVE_WEAPONS.length - 1);
    assert.equal(d.beatMother, false);
    assert.equal(sane(valid({ beatBoss: true, suit: 2, diveWeapon: -1 })).diveWeapon, 0);
  });

  test('the hold is capped so a huge file cannot bloat the game', () => {
    const many = Array.from({ length: 500 }, () => ({ id: 'gnashfin', weight: 10, value: 10 }));
    assert.equal(sane(valid({ catches: many })).catches.length, 200);
  });
});

describe('SaveGame: manual slots', () => {
  test('a slot round-trips a voyage and is separate from the autosave', () => {
    const { h, g } = loadGame({ draw: false });
    g.Player.coins = 41;
    assert.equal(g.SaveGame.saveSlot(2), true);
    assert.ok(h.storage.has('deepsupper.slot2.v1'));
    assert.equal(g.SaveGame.exists(), false, 'the autosave was not touched');
    assert.equal(g.SaveGame.readSlot(2).coins, 41);
    assert.equal(g.SaveGame.readSlot(1), null);
  });

  test('only slots 1 to 3 exist', () => {
    const { g } = loadGame({ draw: false });
    assert.equal(g.SLOT_COUNT, 3);
    for (const n of [0, 4, -1, 1.5, '1', null]) {
      assert.equal(g.SaveGame.saveSlot(n), false, String(n));
      assert.equal(g.SaveGame.readSlot(n), null);
    }
  });

  test('clearing one slot leaves the others alone', () => {
    const { g } = loadGame({ draw: false });
    g.SaveGame.saveSlot(1); g.SaveGame.saveSlot(3);
    g.SaveGame.clearSlot(1);
    assert.equal(g.SaveGame.readSlot(1), null);
    assert.ok(g.SaveGame.readSlot(3));
  });

  test('anySlot is true once any slot holds a valid voyage', () => {
    const { g } = loadGame({ draw: false, storage: { 'deepsupper.slot2.v1': '{broken' } });
    assert.equal(g.SaveGame.anySlot(), false, 'a corrupt slot counts as empty');
    g.SaveGame.saveSlot(3);
    assert.equal(g.SaveGame.anySlot(), true);
  });

  test('describe names the gear and the coins, or says empty', () => {
    const { g } = loadGame({ draw: false });
    assert.equal(g.SaveGame.describe(null), '— empty —');
    Object.assign(g.Player, { rod: 2, coins: 340 });
    g.SaveGame.saveSlot(1);
    assert.equal(g.SaveGame.describe(g.SaveGame.readSlot(1)), 'Deepline Rod · 340§');
    Object.assign(g.Player, { beatBoss: true, suit: 1, diveWeapon: 0 });
    g.SaveGame.saveSlot(2);
    assert.equal(g.SaveGame.describe(g.SaveGame.readSlot(2)), 'Brass Helmet Rig · 340§', 'divers are described by their suit');
  });

  test('stamp gives a short day, month and time', () => {
    const { g } = loadGame({ draw: false });
    assert.match(g.SaveGame.stamp({ savedAt: Date.now() }), /^\d{1,2} [A-Z][a-z]{2} \d\d:\d\d$/);
    assert.equal(g.SaveGame.stamp(null), '');
    assert.equal(g.SaveGame.stamp({ savedAt: 0 }), '');
  });

  test('every character in a slot description is in the font', () => {
    const { g } = loadGame({ draw: false });
    g.SaveGame.saveSlot(1);
    const d = g.SaveGame.readSlot(1);
    for (const ch of g.SaveGame.describe(d) + g.SaveGame.stamp(d) + g.SaveGame.describe(null)) {
      assert.ok(g.GLYPHS[ch] !== undefined || g.GLYPHS[ch.toUpperCase()] !== undefined, JSON.stringify(ch));
    }
  });
});

describe('SaveGame: snapshot, save, read, restore', () => {
  test('snapshot captures every save field from the live player', () => {
    const { g } = loadGame({ draw: false });
    g.Player.coins = 77; g.Player.rod = 1; g.Player.weapon = 2; g.Player.introDone = true; g.Player.x = 812.6;
    g.Player.kills = g.Player.kills || {}; g.Player.kills.gnashfin = 2;
    g.Game.crateOpen = true;
    const s = plain(g.SaveGame.snapshot());
    for (const k of Object.keys(g.SAVE_FIELDS)) assert.ok(k in s, k);
    assert.equal(s.version, 1);
    assert.equal(s.coins, 77);
    assert.equal(s.x, 813);
    assert.equal(s.crateOpen, true);
    assert.deepEqual(s.kills, { gnashfin: 2 });
  });

  test('snapshot copies kills rather than sharing the live object', () => {
    const { g } = loadGame({ draw: false });
    const s = g.SaveGame.snapshot();
    s.kills.gnashfin = 99;
    assert.equal(g.Player.kills.gnashfin, undefined);
  });

  test('exists, save, read and clear work against storage', () => {
    const { h, g } = loadGame({ draw: false });
    assert.equal(g.SaveGame.exists(), false);
    g.Player.coins = 31;
    assert.equal(g.SaveGame.save(), true);
    assert.ok(h.storage.has(SAVE));
    assert.equal(g.SaveGame.exists(), true);
    assert.equal(g.SaveGame.read().coins, 31);
    g.SaveGame.clear();
    assert.equal(g.SaveGame.exists(), false);
  });

  test('a corrupt save file reads as no save', () => {
    const { g } = loadGame({ draw: false, storage: { [SAVE]: '{"version":1,' } });
    assert.equal(g.SaveGame.exists(), false);
    assert.equal(g.SaveGame.read(), null);
  });

  test('restore puts a save onto a fresh player and the crate state onto the game', () => {
    const { h, g } = loadGame({ draw: false });
    g.Player.coins = 5000; g.Player.catches.push({ id: 'x' });
    const d = g.SaveGame.sanitize(h.eval('(' + JSON.stringify(valid()) + ')'));
    assert.equal(g.SaveGame.restore(d), true);
    assert.equal(g.Player.coins, 250);
    assert.equal(g.Player.maxHp, 6);
    assert.equal(g.Player.lantern, true);
    assert.equal(g.Player.x, 900);
    assert.equal(g.Player.catches.length, 1);
    assert.equal(g.Player.catches[0].id, 'gnashfin');
    assert.equal(g.Player.kills.gnashfin, 3);
    assert.equal(g.Game.crateOpen, true);
  });

  test('restore(null) changes nothing', () => {
    const { g } = loadGame({ draw: false });
    g.Player.coins = 12;
    assert.equal(g.SaveGame.restore(null), false);
    assert.equal(g.Player.coins, 12);
  });

  test('a snapshot survives a full save, read and restore unchanged', () => {
    const { g } = loadGame({ draw: false, seed: 2 });
    Object.assign(g.Player, { coins: 640, hp: 4, maxHp: 7, rod: 3, weapon: 4, bandages: 5, lockets: 2, totalKills: 12, sold: 11, casts: 30, lantern: true, luck: true, beatBoss: true, introDone: true, girlMet: true, suit: 2, diveWeapon: 1, beatMother: true, x: 1200 });
    g.Player.catches.push(g.makeTrophy(g.MONSTERS[5]), g.makeTrophy(g.MONSTERS[16]));
    g.Player.kills = { choir: 1, leviathan: 1 };
    g.Game.crateOpen = true;               // it must be: there is a weapon
    const before = plain(g.SaveGame.snapshot());
    g.SaveGame.save();
    g.Player.reset();
    g.SaveGame.restore(g.SaveGame.read());
    const after = plain(g.SaveGame.snapshot());
    delete before.savedAt; delete after.savedAt;
    assert.deepEqual(after, before);
  });
});
