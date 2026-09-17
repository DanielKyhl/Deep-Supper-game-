'use strict';
/* Fishing into fighting, as one system: what bites decides what you fight,
   how the fight goes decides what ends up in the hold, and the boss decides
   how the story ends. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

function veteran(opts, gear) {
  const h = loadGame(Object.assign({ draw: false }, opts));
  h.startVoyage();
  Object.assign(h.g.Player, { weapon: 0, totalKills: 1, introDone: true }, gear);
  return h;
}

describe('from a bite to a fight', () => {
  test('whatever takes the hook is what climbs aboard', () => {
    const h = veteran({ seed: 12 });
    let def = null;
    for (let tries = 0; tries < 6 && !def; tries++) {
      F.castLine(h);
      F.waitForBite(h);
      if (h.g.Fishing.target.junk) { h.frames(3); h.tap('KeyE'); h.until(() => h.g.Game.state === 'play', 3); continue; }
      def = h.g.Fishing.target;
      F.setHook(h);
      h.autoReel(60);
    }
    assert.ok(def, 'never hooked a monster');
    assert.ok(h.until(() => h.g.Game.state === 'battle', 4));
    assert.equal(h.g.Battle.def, def);
  });

  test('reeling up junk pays a few coins and the line goes straight back down', () => {
    const h = veteran({ seed: 3 });
    F.castLine(h);
    F.waitForBite(h);
    h.g.Fishing.target = { junk: true, name: 'a waterlogged boot', value: 4, icon: 'boot' };
    F.setHook(h);
    assert.equal(h.g.Fishing.phase, 'junk');
    h.frames(2.5);
    assert.equal(h.g.Player.coins, 4);
    assert.equal(h.g.Fishing.phase, 'sink');
    assert.equal(h.g.Game.state, 'fish');
  });

  test('ignore a bite and it gets away, but something bites again', () => {
    const h = veteran({ seed: 5 });
    F.castLine(h);
    F.waitForBite(h);
    h.frames(1.2);
    assert.equal(h.g.Fishing.phase, 'fail');
    F.waitForBite(h, 12);
    assert.equal(h.g.Game.state, 'fish');
  });

  test('keeping the bar away from the fish lets the line go slack, and you keep fishing', () => {
    const h = veteran({ seed: 6 });
    F.castLine(h);
    F.waitForBite(h);
    h.g.Fishing.target = h.g.MONSTERS[2];
    F.setHook(h);
    const Fi = h.g.Fishing;
    let down = false;
    for (let i = 0; i < 60 * 30 && Fi.phase === 'reel'; i++) {
      const want = Fi.fy > .5;              // fish low: lift the bar away from it
      if (want !== down) { want ? h.keyDown('Space') : h.keyUp('Space'); down = want; }
      h.frame();
    }
    h.keyUp('Space');
    assert.equal(Fi.phase, 'fail');
    assert.match(h.g.Fishing.msg, /slack/);
    assert.equal(h.g.Game.state, 'fish');
  });

  test('putting the rod down leaves you standing at the bow', () => {
    const h = veteran({ seed: 7 });
    F.castLine(h);
    h.until(() => h.g.Fishing.phase === 'deep', 10);
    h.tap('KeyE');
    assert.equal(h.g.Game.state, 'play');
    assert.equal(h.g.Player.x, h.g.FISH_X);
    h.keyDown('KeyA'); h.frames(.3);
    assert.ok(h.g.Player.x < h.g.FISH_X, 'and free to walk off');
  });

  test('the red eyes watch from below on the deep rods, never on the shallow ones', () => {
    const watched = rod => {
      const h = veteran({ seed: 40 + rod }, { rod });
      let seen = false;
      for (let k = 0; k < 4 && !seen; k++) {
        F.castLine(h);
        for (let i = 0; i < 60 * 12 && !seen && h.g.Fishing.phase !== 'bite'; i++) { h.frame(); seen = h.g.Fishing.watcher.want === 1; }
        h.g.Fishing.quit();
      }
      return seen;
    };
    assert.equal(watched(0), false);
    assert.equal(watched(3), true);
  });
});

describe('Nerys', () => {
  test('the Deepline rod brings her up; she talks, dives back in, and it is saved', () => {
    const h = veteran({ seed: 8 }, { rod: 2, totalKills: 9 });
    h.frame();
    F.castLine(h);
    F.waitForBite(h);
    assert.equal(h.g.Fishing.target.id, 'girl');
    F.setHook(h);
    h.autoReel(40);
    assert.ok(h.until(() => h.g.Game.state === 'cutscene', 4));
    h.frame();
    assert.equal(h.g.Music.themeName, 'lanthorne');
    const seen = new Set();
    for (let i = 0; i < 60 * 120 && h.g.Game.state === 'cutscene'; i++) {
      if (h.g.CUT.girl.visible) seen.add(h.g.CUT.girl.pose);
      if (h.g.Dialogue.active && h.g.Dialogue.done && h.g.Dialogue.hold > .2) h.tap('Enter');
      else h.frame();
    }
    assert.equal(h.g.Game.state, 'play');
    for (const pose of ['rise', 'sit', 'stand', 'swim']) assert.ok(seen.has(pose), 'never saw her ' + pose);
    assert.equal(JSON.parse(h.storage.get('deepsupper.save.v1')).girlMet, true);
    assert.equal(h.g.Player.catches.length, 0, 'nobody sells Nerys');

    F.castLine(h);
    F.waitForBite(h);
    assert.notEqual(h.g.Fishing.target.id, 'girl', 'she only comes up once');
  });
});

describe('fights', () => {
  test('a won fight ends with the trophy in the hold and the kill on record', () => {
    const h = veteran({ seed: 1 }, { weapon: 2 });
    h.g.Game.startBattle(h.g.MONSTERS.find(m => m.id === 'palefinger'));
    assert.equal(F.fightBot(h, 90), true);
    assert.equal(h.g.Player.kills.palefinger, 1);
    assert.equal(h.g.Player.catches[0].id, 'palefinger');
    assert.match(h.g.Game.toastText, /Palefinger/);
  });

  test('a lost fight costs the catch but not the voyage', () => {
    const h = veteran({ seed: 2 });
    h.g.Game.startBattle(h.g.MONSTERS.find(m => m.id === 'choir'));
    const B = h.g.Battle;
    h.frames(2.5);
    h.g.Player.hp = 1;
    B.m.cool = 0;
    assert.ok(h.until(() => B.phase === 'lose', 20), 'the Choir should win this');
    h.until(() => h.g.Game.state === 'play', 5);
    assert.equal(h.g.Player.hp, h.g.Player.maxHp);
    assert.equal(h.g.Player.catches.length, 0);
    assert.equal(h.g.Player.totalKills, 1);
  });

  test('getting hit flashes red and the flash fades', () => {
    const h = veteran({ seed: 3 });
    h.g.Game.startBattle(h.g.MONSTERS[0]);
    h.frames(2.5);
    h.g.Battle._hurtPlayer(1, h.g.Player.x + 50);
    assert.equal(h.g.Game.hurtFlash, 1);
    h.frames(.6);
    assert.equal(h.g.Game.hurtFlash, 0);
  });

  test("bandages bought from Dorran save a fight that's going badly", () => {
    const h = veteran({ seed: 4 }, { coins: 100 });
    F.openStall(h);
    h.g.Shop.tab = 2; h.g.Shop.sel = 0;
    h.tap('Enter'); h.tap('Enter');
    h.tap('Escape');
    assert.equal(h.g.Player.bandages, 2);
    h.g.Game.startBattle(h.g.MONSTERS[0]);
    h.frames(2.5);
    h.g.Player.hp = 1;
    h.tap('KeyQ');
    assert.equal(h.g.Player.hp, 3);
  });

  test('the cleaver chops down on things too tall for a thrust', () => {
    const hits = weapon => {
      const h = veteran({ seed: 9 }, { weapon });
      h.eval('Math.random = () => 0.5');
      h.g.Game.startBattle(h.g.MONSTERS.find(m => m.id === 'weepingbell'));
      const B = h.g.Battle;
      h.eval('Battle._updateMonster = function () {}');   // hold it up there
      B.phase = 'fight';
      Object.assign(B.m, { state: 'idle', cool: 1e9, x: h.g.Player.x + 120, y: B.restY - 70 });
      h.g.Player.face = 1;
      h.tap('KeyJ'); h.frames(.6);
      return B.m.maxHp - B.m.hp;
    };
    assert.ok(hits(2) > 0, 'cleaver lands');
    assert.equal(hits(3), 0, 'harpoon passes underneath');
  });

  test('pausing mid-fight freezes both fighters', () => {
    const h = veteran({ seed: 5 });
    h.g.Game.startBattle(h.g.MONSTERS[4]);
    h.frames(3);
    const B = h.g.Battle;
    const snap = [B.t, B.m.x, B.m.state, h.g.Player.x];
    h.tap('Escape');
    h.frames(2);
    assert.deepEqual([B.t, B.m.x, B.m.state, h.g.Player.x], snap);
    h.tap('Escape');
    h.frames(.2);
    assert.ok(B.t > snap[0]);
  });
});

describe('the Old One', () => {
  function bossFight(seed) {
    const h = veteran({ seed }, { weapon: 5, rod: 3, maxHp: 9, hp: 9, bandages: 5 });
    h.g.Game.startBattle(h.g.MONSTERS.find(m => m.boss));
    return h;
  }

  test('the boss gets the boss theme and gets worse as it gets hurt', () => {
    const h = bossFight(1);
    h.frame();
    assert.equal(h.g.Music.themeName, 'boss');
    h.sandbox.__phases = [];
    h.eval('(() => { const f = Battle._checkBossPhase; Battle._checkBossPhase = function () { f.call(this); __phases.push(this.bossPhase + (this.rage ? "!" : "")); }; })()');
    assert.equal(F.fightBot(h, 200), true);
    const seen = new Set(h.sandbox.__phases);
    assert.ok(seen.has('1'), 'fought phase one');
    assert.ok(seen.has('2!'), 'phase two, enraged');
    assert.ok(seen.has('3!'), 'phase three, enraged');
    assert.ok(h.sandbox.__phases.indexOf('2!') < h.sandbox.__phases.indexOf('3!'));
  });

  test('beating it drops a diving suit and a harpoon, ends part one, and you sail out to dive', () => {
    const h = bossFight(3);
    assert.equal(F.fightBot(h, 200), true);
    assert.equal(h.g.Game.state, 'cutscene');
    assert.equal(h.g.Game.endingRun, true);
    h.frame();
    assert.equal(h.g.Music.themeName, 'ending');
    assert.equal(h.g.CUT.drops.visible, true, 'the suit and harpoon lie on the deck');
    assert.equal(JSON.parse(h.storage.get('deepsupper.save.v1')).beatBoss, true);
    h.keyDown('Escape');
    h.until(() => h.g.Game.state === 'play', 10);
    h.keyUp('Escape');
    assert.equal(h.g.Game.state, 'play');
    assert.match(h.g.Game.toastText, /sail out again/);
    assert.equal(h.g.Player.suit, 0);
    assert.equal(h.g.Player.diveWeapon, 0);
    assert.equal(h.g.CUT.drops.visible, false);
    assert.equal(h.g.Player.catches.find(c => c.id === 'leviathan').id, 'leviathan', 'its carcass is in the hold to sell');
    h.g.Player.catches.length = 0;
    assert.match(h.g.Game.objective(), /Dive at the ladder/);
    const save = JSON.parse(h.storage.get('deepsupper.save.v1'));
    assert.equal(save.suit, 0);
    assert.equal(save.diveWeapon, 0);
  });

  test('read in full, the ending has Dad recognise the suit, and ends part one', () => {
    const h = bossFight(3);
    h.g.Game.startEnding();
    const lines = [];
    let title = null;
    for (let i = 0; i < 60 * 200 && h.g.Game.state === 'cutscene'; i++) {
      if (h.g.CUT.titleCard) title = h.g.CUT.titleCard.title;
      if (h.g.Dialogue.active && h.g.Dialogue.done && h.g.Dialogue.hold > .2) { lines.push(h.g.Dialogue.full); h.tap('Enter'); }
      else h.frame();
    }
    const all = lines.join(' ');
    assert.match(all, /diving suit/);
    assert.match(all, /great-grandad/);
    assert.match(all, /Don't you dare/);
    assert.equal(title, 'END OF PART ONE');
    h.until(() => h.g.Game.state === 'play', 3);
    assert.equal(h.g.Player.suit, 0);
  });
});
