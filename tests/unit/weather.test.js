'use strict';
/* Storms at sea, and the sea at night being quietly wrong. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

function atSea(opts) {
  const h = loadGame(Object.assign({ draw: false, seed: 4 }, opts));
  h.startVoyage();
  F.readDialogue(h);
  const g = h.g;
  g.Game.atSea(); g.Game.state = 'play';
  return { h, g, W: g.Weather, O: g.Omens };
}
const runFor = (h, s) => h.frames(s, 1 / 20);

describe('storms', () => {
  test('in tests the sky stays calm unless a storm is asked for', () => {
    const { h, W } = atSea();
    runFor(h, 400);
    assert.equal(W.phase, 'calm');
    assert.equal(W.storm, 0);
  });

  test('when the dice allow it, a storm rolls in, rages, and blows over', () => {
    const { h, g, W } = atSea();
    g.SeaDice.chance = () => true;
    runFor(h, g.WEATHER.every + 1);
    assert.equal(W.phase, 'rising');
    g.SeaDice.chance = () => false;
    runFor(h, g.WEATHER.rise + 1);
    assert.equal(W.phase, 'raging');
    assert.equal(W.storm, 1);
    assert.equal(W.raging(), true);
    runFor(h, W.hold + 1);
    assert.equal(W.phase, 'falling');
    runFor(h, g.WEATHER.fall + 1);
    assert.equal(W.phase, 'calm');
    assert.equal(W.storm, 0);
  });

  test('while it rages, lightning strikes now and then, and thunder follows the flash', () => {
    const { h, g, W } = atSea({ audio: true });
    W.begin(); W.phase = 'raging'; W.storm = 1; W.hold = 1e9;
    let strikes = 0;
    const strike = W.strike;
    W.strike = function (...a) { strikes++; return strike.apply(this, a); };
    runFor(h, 60);
    assert.ok(strikes >= 3 && strikes <= 14, strikes + ' strikes in a minute');
    const b = strike.call(W);
    assert.equal(W.flash, 1);
    assert.ok(b.pts.length > 4 && b.pts[b.pts.length - 1][1] < g.HORIZON_Y);
    assert.equal(W.thunder.length > 0, true);
    runFor(h, 2.5);
    assert.equal(W.thunder.length, 0, 'it rolled');
  });

  test('a strike can show something long under the water, for as long as the flash lasts', () => {
    const { h, W } = atSea();
    W.strike(true);
    assert.ok(W.reveal && W.reveal.shape.len >= 700);
    runFor(h, 1);
    assert.equal(W.reveal, null);
  });

  test('a storm makes bites come faster and bigger things take the bait, and heaves the swell', () => {
    const { g, W } = atSea();
    assert.equal(W.biteWait(), 1);
    assert.equal(W.luckyWater(), false);
    assert.equal(W.swell(), 1);
    W.storm = 1;
    assert.ok(W.biteWait() < .7);
    assert.equal(W.luckyWater(), true);
    assert.ok(W.swell() > 1.5);
    // and the wait for a bite really is shorter
    g.Player.x = g.FISH_X; g.Player.totalKills = 1; g.Player.introDone = true; g.Player.weapon = 0;
    g.Game.state = 'fish';
    g.Fishing.start();
    for (let i = 0; i < 400 && g.Fishing.phase !== 'deep'; i++) g.Fishing.update(1 / 30);
    assert.ok(g.Fishing.waitFor <= 5 * .65 + 1e-9, 'waited ' + g.Fishing.waitFor);
  });

  test('no weather in the harbour, in cutscenes or on the menu, and none on the voyage home', () => {
    const { h, g, W } = atSea();
    g.CUT.harbourX = 300;
    g.SeaDice.chance = () => true;
    runFor(h, 60);
    assert.equal(W.phase, 'calm');
    g.CUT.harbourX = -1400;
    W.begin(); W.storm = .8;
    Object.assign(g.Player, { beatBoss: true, beatMother: true, suit: 3, diveWeapon: 4 });
    g.Game.startFinale();
    assert.equal(W.storm, 0);
  });

  test('lightning flashes follow the setting: full, soft or off', () => {
    const { g, W } = atSea();
    W.flash = 1;
    g.Settings.set('flashes', 'full');
    assert.equal(W.flashLevel(), 1);
    g.Settings.set('flashes', 'soft');
    assert.ok(W.flashLevel() > 0 && W.flashLevel() < .5);
    g.Settings.set('flashes', 'off');
    assert.equal(W.flashLevel(), 0);
    assert.ok(g.Menu.items('graphics').some(i => i.key === 'flashes'));
  });

  test('a stormy frame, a strike and a shape all draw balanced', () => {
    const { h, g, W } = atSea({ draw: true });
    const rec = h.hires();
    W.begin(); W.phase = 'raging'; W.storm = 1; W.hold = 1e9;
    W.strike(true);
    rec.reset();
    assert.doesNotThrow(() => h.frame());
    assert.equal(rec.depth(), 0);
  });
});

describe('strange things at night', () => {
  test('in tests nothing strange happens by chance', () => {
    const { h, O } = atSea();
    runFor(h, 600);
    assert.equal(O.active, null);
  });

  test('on a quiet night, one comes when it is due; never in a storm, never while someone is talking, never when turned off', () => {
    const { h, g, O, W } = atSea();
    g.SeaDice.chance = p => p === g.OMEN.chance;
    runFor(h, g.OMEN.first + 1);
    assert.ok(O.active, 'something happened');
    assert.equal(g.Player.omens, 1);

    const quiet = () => { O.active = null; O.next = 0; };
    quiet(); W.storm = 1;
    runFor(h, 1);
    assert.equal(O.active, null, 'not in a storm');
    W.storm = 0;
    quiet(); g.Dialogue.show('', 'something');
    runFor(h, .2);
    assert.equal(O.active, null, 'not mid-dialogue');
    g.Dialogue.hide();
    quiet(); g.Settings.set('unease', false);
    runFor(h, 1);
    assert.equal(O.active, null, 'not when turned off');
    assert.ok(g.Menu.items('gameplay').some(i => i.key === 'unease'));
  });

  test('none repeats until others have had their turn', () => {
    const { O } = atSea();
    const seen = [];
    for (let i = 0; i < 5; i++) { O.active = null; seen.push(O.begin().id); }
    assert.equal(new Set(seen).size, 5);
  });

  test('the lantern gutters out and comes back; the bell swings on its own; the knocks come three times', () => {
    const { h, g, O } = atSea({ audio: true });
    g.Player.x = 1400;
    const o = O.begin('lantern');
    assert.equal(o.x, 1452, 'the nearest lantern');
    o.t = 1.5;
    assert.equal(O.dim(1452), 1);
    assert.equal(O.dim(812), 0);
    o.t = 3.19;
    assert.ok(O.dim(1452) < .1);
    O.active = null;
    O.begin('bell');
    O.active.t = .3;
    assert.notEqual(O.bellSwing(), 0);
    O.active = null;
    let knocks = 0;
    const knock = g.Sfx.knock;
    g.Sfx.knock = () => { knocks++; };
    O.begin('knock');
    runFor(h, 2.5);
    g.Sfx.knock = knock;
    assert.equal(knocks, 3);
    assert.equal(O.active, null, 'and it is over');
  });

  test('Dorran only remarks on it when he is near enough to have seen', () => {
    const { g, O } = atSea();
    g.Player.x = 1800;
    assert.equal(O.begin('dorran'), null);
    g.Player.x = g.STALL_X + 100;
    g.Game.bark.text = '';
    assert.ok(O.begin('dorran'));
    assert.ok(g.DORRAN.deck.omen.includes(g.Game.bark.text));
  });

  test('how many strange things he has seen is saved', () => {
    const { h, g } = atSea();
    g.Player.omens = 7;
    const S = h.eval('SaveGame');
    assert.equal(S.sanitize(JSON.parse(JSON.stringify(S.snapshot()))).omens, 7);
  });

  test('every one of them draws balanced', () => {
    const { h, g, O } = atSea({ draw: true });
    const rec = h.hires();
    for (const id of Object.keys(g.OMENS)) {
      g.Player.x = g.STALL_X; g.Game.bark.text = '';
      O.active = null;
      const o = O.begin(id);
      assert.ok(o, id);
      o.t = g.OMENS[id].dur / 2;
      rec.reset();
      assert.doesNotThrow(() => h.frame(), id);
      assert.equal(rec.depth(), 0, id);
    }
  });
});
