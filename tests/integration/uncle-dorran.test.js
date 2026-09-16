'use strict';
/* The boy doesn't talk. His Uncle Dorran does, at length: through the
   opening, across the deck, over the counter, and at the end of part one,
   where he answers Dad for him. Played with real keys and whole frames. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

// record who says each line that reaches the dialogue box
function listen(h) {
  const said = [];
  h.sandbox.__said = said;
  h.eval('(() => { const s = Dialogue.show; Dialogue.show = function (who, text) { __said.push({ who, text }); return s.apply(this, arguments); }; })()');
  return said;
}
const speakers = said => [...new Set(said.map(l => l.who))].sort();

// press ENTER through a cutscene, however long it runs
function readThrough(h, state, seconds) {
  for (let i = 0; i < 60 * (seconds || 240) && h.g.Game.state === state; i++) {
    if (h.g.Dialogue.active && h.g.Dialogue.done && h.g.Dialogue.hold > .2) h.tap('Enter');
    else h.frame();
  }
}

describe('Uncle Dorran, and a boy who says nothing', () => {
  test('from the title to the first sale, the boy never says a word, and Dorran does most of the talking', () => {
    const h = loadGame({ seed: 1, draw: false });
    const said = listen(h);
    F.newVoyageFromMenu(h);
    readThrough(h, 'cutscene');
    assert.equal(h.g.Game.state, 'play');
    assert.equal(h.g.Dialogue.who, 'Dorran', 'he is the first to speak on deck');
    assert.match(h.g.Dialogue.full, /bare hands/);
    F.readDialogue(h);

    F.walkTo(h, h.g.FISH_X, 40);
    h.tap('KeyE');
    assert.match(h.g.Dialogue.full, /Empty hands/);
    F.readDialogue(h);
    F.openCrate(h);
    F.castLine(h);
    F.landIntroCatch(h);
    assert.equal(F.fightBot(h, 90), true);
    assert.ok(h.g.DORRAN.deck.won.includes(h.g.Game.bark.text), 'he shouts about the catch: ' + h.g.Game.bark.text);

    F.openStall(h);
    assert.equal(h.g.Shop.line, h.g.DORRAN.remark.first);
    h.tap('Enter');
    assert.ok(h.g.Player.coins > 0);
    assert.doesNotMatch(h.g.Shop.line, /[{}]/);
    assert.notEqual(h.g.Shop.line, h.g.DORRAN.remark.first);

    assert.deepEqual(speakers(said), ['Dad', 'Dorran']);
    assert.ok(said.filter(l => l.who === 'Dorran').length >= 10, 'Dorran said ' + said.filter(l => l.who === 'Dorran').length + ' lines');
  });

  test('walking along the deck he calls out from his stall, in a bubble over it, and hushes when you open it', () => {
    const h = loadGame({ seed: 3, draw: true });
    h.startVoyage();
    F.readDialogue(h);
    h.g.Player.weapon = 0;
    F.walkTo(h, 1400);
    h.frames(12);                                 // long enough that he may call again
    const typed = [];
    const draw = h.g.Text.draw;
    h.g.Text.draw = function (ctx, s) { typed.push(String(s)); return draw.apply(this, arguments); };
    F.walkTo(h, 900);
    h.frames(1.5);
    h.g.Text.draw = draw;
    const B = h.g.Game.bark;
    assert.ok(h.g.DORRAN.deck.near.includes(B.text), 'called out: ' + B.text);
    const firstWords = B.text.split(' ')[0];
    assert.ok(typed.some(s => s.startsWith(firstWords)), 'the bubble is drawn: ' + firstWords);
    F.openStall(h);
    assert.equal(B.text, '', 'he has something else to say now');
    assert.ok(h.g.Shop.line.length > 0);
  });

  test('left browsing, he rambles; sell him a nine-eyed thing and it is fish; load a save and he has forgotten his news', () => {
    const h = loadGame({ seed: 5, draw: false });
    h.startVoyage();
    F.readDialogue(h);
    const g = h.g, D = g.DORRAN;
    Object.assign(g.Player, { weapon: 0, girlMet: true, sold: 3 });
    g.Player.catches.push(g.makeTrophy(g.monsterDef('penance')), g.makeTrophy(g.monsterDef('choir')));
    h.tap('Escape');
    F.chooseMenu(h, 'save');
    F.chooseMenu(h, 'slot1');
    h.tap('Escape'); h.tap('Escape');

    F.openStall(h);
    assert.equal(g.Shop.line, D.remark.girl);
    h.frames(g.Shop.SILENCE + .5);
    assert.ok(D.mutter.includes(g.Shop.line), 'rambling: ' + g.Shop.line);
    h.tap('Enter');
    const sold = g.Shop.line;
    assert.ok([...D.sell, ...D.sellBig, ...D.sellAll].some(t => t.split('{')[0].length === 0 || sold.startsWith(t.split('{')[0])), sold);
    h.tap('Escape');
    F.openStall(h);
    assert.notEqual(g.Shop.line, D.remark.girl, 'he only says it once');
    h.tap('Escape');

    h.tap('Escape');
    F.chooseMenu(h, 'load');
    F.chooseMenu(h, 'slot1');
    F.chooseMenu(h, 'yes');
    assert.ok(h.until(() => g.Game.state === 'play' && g.Game.fade.dir === 0, 3));
    F.openStall(h);
    assert.equal(g.Shop.line, D.remark.girl, 'news to him all over again');
  });

  test('back up the ladder from a dive, he has something to say about it across the deck', () => {
    const h = loadGame({ seed: 7, draw: false });
    h.startVoyage();
    F.readDialogue(h);
    const g = h.g;
    Object.assign(g.Player, { beatBoss: true, suit: 0, diveWeapon: 0, weapon: 5 });
    F.walkTo(h, g.FISH_X, 40);
    h.tap('KeyE');
    assert.ok(h.until(() => g.Dive.underwater && g.Dive.phase === 'swim' && g.Game.fade.dir === 0, 6));
    g.Dive.mobs.length = 0;
    Object.assign(g.Dive.p, { x: g.DIVE_LADDER_X, y: 40, vx: 0, vy: 0 });
    h.frame();
    h.tap('KeyE');
    assert.ok(h.until(() => g.Game.state === 'play', 4));
    assert.ok(g.DORRAN.deck.aboard.includes(g.Game.bark.text), g.Game.bark.text);
  });

  test('the end of part one, read in full: Dorran answers Dad for the boy, and Dad gets nothing back', () => {
    const h = loadGame({ seed: 3, draw: false });
    h.startVoyage();
    Object.assign(h.g.Player, { weapon: 5, rod: 3, maxHp: 9, hp: 9 });
    const said = listen(h);
    h.g.Game.startEnding();
    let title = null;
    for (let i = 0; i < 60 * 200 && h.g.Game.state === 'cutscene'; i++) {
      if (h.g.CUT.titleCard) title = h.g.CUT.titleCard.title;
      if (h.g.Dialogue.active && h.g.Dialogue.done && h.g.Dialogue.hold > .2) h.tap('Enter');
      else h.frame();
    }
    assert.equal(title, 'END OF PART ONE');
    assert.deepEqual(speakers(said), ['Dad', 'Dorran']);
    const at = text => said.findIndex(l => l.text === text);
    assert.equal(said[at('What is that.') + 1].text, 'Supper!');
    assert.equal(said[at("Look at me. Say you won't.") + 1].text, '...You never do say anything, do you.');
    assert.equal(said[said.length - 1].who, 'Dad');
  });
});
