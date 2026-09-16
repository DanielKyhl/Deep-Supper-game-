'use strict';
/* The end of the game, the way a player gets there: back up the ladder after
   the Mother, along the deck to the wheel, home to the harbour, through the
   credits, and a save that remembers it all. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

const beaten = { beatBoss: true, beatMother: true, suit: 3, diveWeapon: 4, weapon: 5, totalKills: 60, casts: 90 };

// read every line as it finishes and hold SPACE through the credits, frame by frame
function readToTheEnd(h, check, dt) {
  const g = h.g;
  let credits = false;
  for (let i = 0; i < 60 * 400 && g.Game.state === 'cutscene'; i++) {
    if (g.CUT.credits && !credits) { credits = true; h.keyDown('Space'); }
    if (g.Dialogue.active && g.Dialogue.done && g.Dialogue.hold > .1) h.tap('Enter');
    else if (check) check(i); else h.frame(dt);
  }
  h.keyUp('Space');
  assert.ok(h.until(() => g.Game.state === 'play' && g.Game.fade.dir === 0, 5), 'back on deck');
  return credits;
}

describe('the end of the game', () => {
  test('up the ladder after the Mother, told to go home, along the deck to the wheel, home, the credits, and Continue remembers', () => {
    const h = loadGame({ draw: false, seed: 12 });
    h.startVoyage();
    F.readDialogue(h);
    const g = h.g;
    Object.assign(g.Player, beaten);
    g.Player.kills = { gnashfin: 2, trenchmaw: 1 };

    // over the side and straight back up the ladder
    F.walkTo(h, g.FISH_X, 40);
    h.tap('KeyE');
    assert.ok(h.until(() => g.Dive.underwater && g.Dive.phase === 'swim' && g.Game.fade.dir === 0, 8), 'in the water');
    g.Dive.mobs.length = 0;
    Object.assign(g.Dive.p, { x: g.DIVE_LADDER_X, y: 40, vx: 0, vy: 0 });
    h.tap('KeyE');
    assert.ok(h.until(() => g.Game.state === 'play' && g.Game.fade.dir === 0, 5), 'back aboard');
    assert.equal(g.Dialogue.full, g.NARRATION.homeward[0]);
    F.readDialogue(h);
    assert.equal(g.Game.objective(), 'Take the Margaret home: the wheel is in the wheelhouse');

    // aft to the wheelhouse, and take the wheel
    F.walkTo(h, g.FINALE.helmX, 30);
    assert.equal(g.Game.spotLabel(g.Game.nearestSpot()), 'Sail home');
    h.tap('KeyE');
    assert.equal(g.Game.state, 'cutscene');
    h.frames(.5);
    assert.equal(g.Music.themeName || g.Music.pending, 'ending');

    assert.equal(readToTheEnd(h), true, 'the credits rolled');
    assert.equal(g.Player.sawEnding, true);
    assert.equal(g.Game.objective(), 'Lanthorne is lit again. The sea is yours.');
    assert.match(g.Game.toastText, /still yours/);

    // he can still walk the deck and go back to sea
    F.walkTo(h, g.FISH_X, 40);
    assert.equal(g.Game.spotLabel(g.Game.nearestSpot()), 'Dive');

    // and the ending is part of the save
    const again = loadGame({ storage: Object.fromEntries(h.storage), draw: false });
    F.chooseMenu(again, 'continue');
    assert.ok(again.until(() => again.g.Game.state === 'play' && again.g.Game.fade.dir === 0, 3));
    assert.equal(again.g.Player.sawEnding, true);
    assert.equal(again.g.Player.kills.gnashfin, 2);
  });

  test('every frame of the finale renders soundly, dawn, harbour and credits included, and ESC still skips from the credits', () => {
    const h = loadGame({ seed: 13 });
    F.chooseMenu(h, 'dev');
    F.chooseMenu(h, 'devFinale');
    const g = h.g, rec = h.hires();
    assert.ok(h.until(() => g.Game.state === 'cutscene' && g.Game.endingRun, 3));
    Object.assign(g.Player.kills, { gnashfin: 1, broodsister: 3 });
    const sound = label => {
      rec.reset();
      assert.doesNotThrow(() => h.frame(1 / 30), label);
      assert.equal(rec.depth(), 0, label + ': unbalanced save/restore');
    };
    let frames = 0;
    for (let i = 0; i < 30 * 300 && !g.CUT.credits; i++) {
      if (g.Dialogue.active && g.Dialogue.done && g.Dialogue.hold > .1) h.tap('Enter');
      else { sound('finale frame ' + i + ' step ' + g.CUT.i); frames++; }
    }
    assert.ok(g.CUT.credits, 'reached the credits');
    for (let i = 0; i < 30 * 20; i++) sound('credits frame ' + i);
    assert.ok(g.CUT.credits.y > 400, 'they rolled');
    h.hold('Escape', 1.2);
    assert.ok(h.until(() => g.Game.state === 'play' && g.Game.fade.dir === 0, 5));
    assert.equal(g.Player.sawEnding, true);
    assert.ok(frames > 30 * 40, 'a proper voyage home: ' + frames + ' frames');
  });
});
