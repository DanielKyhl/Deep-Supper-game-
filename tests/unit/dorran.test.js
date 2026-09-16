'use strict';
/* The boy never says a word; his Uncle Dorran never stops. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');

const SPEAKERS = ['Dad', 'Dorran', 'Nerys', '???'];

// everything a scene's steps would say, without playing any of its actions
function linesOf(h, steps) {
  const g = h.g, said = [];
  const show = g.Dialogue.show;
  g.Dialogue.show = (who, text) => said.push({ who, text });
  try {
    for (const s of steps) if (String(s.update).includes('Dialogue.pressed')) s.enter();
  } finally { g.Dialogue.show = show; }
  return said;
}

// every Game.say made while fn runs, line by line
function talkDuring(h, fn) {
  const g = h.g, said = [];
  const say = g.Game.say;
  g.Game.say = function (...lines) {
    for (const l of lines) said.push(Array.isArray(l) ? { who: l[0], text: l[1] } : { who: '', text: l });
    return say.apply(this, lines);
  };
  try { fn(); } finally { g.Game.say = say; }
  return said;
}

function atStall(setup, opts) {
  const h = loadGame(Object.assign({ draw: false, seed: 4 }, opts));
  h.startVoyage();
  const g = h.g;
  g.Dialogue.hide(); g.Game.msgs = [];
  g.Player.weapon = 0;
  if (setup) setup(g.Player, g);
  g.Shop.open();
  return { h, g, S: g.Shop, P: g.Player, D: g.DORRAN };
}
const trophy = (g, id) => g.makeTrophy(g.monsterDef(id));

describe('the boy says nothing', () => {
  test('every line of every scene belongs to someone else', () => {
    const h = loadGame({ draw: false });
    const g = h.g;
    const D = { boss: {}, girl: {} };
    const scenes = {
      opening: g.buildOpening().steps, nerys: g.buildGirlScene().steps, ending: g.buildEnding().steps,
      mother: g.motherIntroSteps(D).steps, again: g.motherReturnSteps(D).steps, after: g.motherEndSteps(D).steps
    };
    let total = 0;
    for (const [name, steps] of Object.entries(scenes)) {
      for (const l of linesOf(h, steps)) {
        total++;
        assert.ok(SPEAKERS.includes(l.who), name + ': "' + l.text + '" is said by ' + JSON.stringify(l.who));
      }
    }
    assert.ok(total >= 50, 'read ' + total + ' lines');
  });

  test('what he used to think to himself on deck is Dorran shouting it across the deck', () => {
    const h = loadGame({ draw: false, seed: 2 });
    const g = h.g;
    const said = talkDuring(h, () => {
      g.Game.newGame(); g.CUT.skip();                          // the crate hint at the start
      g.Game.useSpot({ id: 'fish' });                          // no net yet
      g.Game.useSpot({ id: 'crate' });                         // the net
      g.Battle.def = g.MONSTERS[0];
      g.Game.endBattle(false);                                 // knocked flat
    });
    assert.ok(said.length >= 8);
    for (const l of said) assert.equal(l.who, 'Dorran', l.text);
    assert.match(said.map(l => l.text).join(' '), /crate by the cabin/);
    assert.match(g.Game.toastText, /dip net/);
  });

  test('with him quiet, everyone else says more, and every line still fits the box in two rows', () => {
    const h = loadGame({ draw: false });
    const g = h.g, D = { boss: {}, girl: {} };
    const lines = [g.buildOpening(), g.buildGirlScene(), g.buildEnding(), g.motherIntroSteps(D), g.motherEndSteps(D)]
      .flatMap(s => linesOf(h, s.steps).map(l => l.text))
      .concat(Object.values(g.DORRAN.talk).flat());
    const width = g.VIEW_W - 156 - 60;
    for (const text of lines) {
      const rows = g.Text.wrap(null, text, width, { size: 21 });
      assert.ok(rows.length <= 2, rows.length + ' rows: ' + text);
    }
  });

  test('everyone else notices how little he says', () => {
    const h = loadGame({ draw: false });
    const g = h.g, D = { boss: {}, girl: {} };
    const all = [g.buildOpening(), g.buildGirlScene(), g.buildEnding(), g.motherEndSteps(D)]
      .map(s => linesOf(h, s.steps).map(l => l.text).join(' ')).join(' ');
    for (const bit of [/Don't look at me like that/, /Do you ever say anything/, /Who ARE you/, /You never do say anything/, /Things don't go wrong around you/]) {
      assert.match(all, bit);
    }
  });

  test('at the end of part one, Dorran answers for him', () => {
    const h = loadGame({ draw: false });
    const lines = linesOf(h, h.g.buildEnding().steps);
    const i = lines.findIndex(l => l.text === 'What is that.');
    assert.deepEqual(lines[i + 1], { who: 'Dorran', text: 'Supper!' });
    const j = lines.findIndex(l => /where did you get that suit/.test(l.text));
    assert.deepEqual(lines[j + 1], { who: 'Dorran', text: 'Came out of the fish.' });
  });
});

describe('Uncle Dorran at his stall', () => {
  test('everything he can say there fits on the one line he has', () => {
    const { h, g, D } = atStall();
    const longest = g.MONSTERS.concat(g.DIVE_MONSTERS).map(m => m.name).sort((a, b) => b.length - a.length)[0];
    const vars = { name: longest, value: 99999, total: 999999, short: 99999 };
    const all = [...D.greet, ...D.greetDiving, ...D.greetDone, ...Object.values(D.remark), ...D.sell, ...D.sellBig, ...D.sellAll,
      ...Object.values(D.buy).flat(), ...D.owned, ...D.locked, ...D.poor, ...D.mutter];
    const room = (h.g.VIEW_W - 184) - 52;
    for (const line of all) {
      for (const fish of D.fish) {
        const s = line.replace(/\{fish\}/g, fish).replace(/\{Fish\}/g, fish).replace(/\{(\w+)\}/g, (m, k) => String(vars[k]));
        const w = g.Text.width(null, '“' + s + '”', { size: 16 });
        assert.ok(w <= room, `${w}px > ${room}px: ${s}`);
      }
    }
  });

  test('he greets you according to how far along things are', () => {
    const { g, S, D } = atStall();
    assert.ok(D.greet.includes(S.line));
    S.remarked = { mother: true, suit: true, girl: true, first: true };
    g.Player.suit = 0;
    S.open();
    assert.ok(D.greetDiving.includes(S.line), S.line);
    g.Player.beatMother = true;
    S.open();
    assert.ok(D.greetDone.includes(S.line), S.line);
  });

  test('he notices news once, the newest first, and forgets the older news he never got to', () => {
    const { g, S, D } = atStall(P => { P.girlMet = true; P.suit = 0; P.beatMother = true; });
    assert.equal(S.line, D.remark.mother);
    S.open();
    assert.ok(D.greetDone.includes(S.line), 'the suit and the girl are forgotten: ' + S.line);
    g.Game.hushDorran();
    S.open();
    assert.equal(S.line, D.remark.mother, 'a new voyage or a loaded one, and he has forgotten he said it');
  });

  test('bring him your first catch and he is proud of you', () => {
    const { S, D } = atStall((P, g) => P.catches.push(trophy(g, 'gnashfin')));
    assert.equal(S.line, D.remark.first);
    S.act();
    S.open();
    assert.notEqual(S.line, D.remark.first);
  });

  test('whatever you sell him, he has a line for it with nothing left unfilled', () => {
    const { g, S, D, P } = atStall((P, g) => { for (const m of g.MONSTERS.concat(g.DIVE_MONSTERS)) P.catches.push(g.makeTrophy(m)); });
    while (P.catches.length) {
      const c = P.catches[0];
      S.sel = S.rows().findIndex(r => r.kind === 'fish' && r.idx === 0);
      S.act();
      assert.ok(S.line.length > 5);
      assert.doesNotMatch(S.line, /[{}]/, S.line);
      assert.equal(S.line[0], S.line[0].toUpperCase());
      const pool = c.value >= 600 ? D.sellBig : D.sell;
      assert.ok(pool.some(t => new RegExp('^' + t.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{\w+\\?\}/g, '.+') + '$', 'i').test(S.line)), c.name + ' (' + c.value + '): ' + S.line);
    }
  });

  test('everything is fish to him: the nine-eyed thing is haddock, or cod, or turbot', () => {
    const { g, S, D, P } = atStall();
    const said = new Set();
    for (let i = 0; i < 60; i++) {
      P.catches.push(trophy(g, 'penance'));
      S.tab = 0; S.sel = S.rows().findIndex(r => r.kind === 'fish');
      S.act();
      said.add(S.line);
    }
    const lines = [...said].join(' ').toLowerCase();
    assert.ok(D.fish.filter(f => lines.includes(f)).length >= 3, lines);
    assert.doesNotMatch(lines, /monster/);
  });

  test('selling the whole haul, he names the total', () => {
    const { S, P, D } = atStall((P, g) => { P.catches.push(trophy(g, 'gnashfin'), trophy(g, 'bristlejaw')); });
    const total = P.catches.reduce((a, c) => a + c.value, 0);
    S.sel = S.rows().findIndex(r => r.kind === 'all');
    S.act();
    assert.match(S.line, new RegExp('^' + total + ' |\\. ' + total + '\\.'));
    assert.ok(D.sellAll.some(t => t.includes('{total}')));
  });

  test('buying anything, he has something to say about that kind of thing', () => {
    const { g, S, D, P } = atStall(P => { P.coins = 1e6; });
    const buy = (kind, pred) => { S.sel = S.rows().findIndex(pred); assert.ok(S.sel >= 0, kind); S.act(); assert.ok(D.buy[kind].includes(S.line), kind + ': ' + S.line); };
    S.tab = 1;
    buy('rod', r => r.kind === 'rod' && r.idx === 1);
    buy('weapon', r => r.kind === 'weapon' && r.idx === 1);
    S.tab = 2;
    for (const type of ['consume', 'maxhp', 'lantern', 'luck']) buy(type, r => r.kind === 'good' && r.def.type === type);
    P.suit = 0; P.diveWeapon = 0; S.tab = 1;
    buy('suit', r => r.kind === 'suit' && r.idx === 1);
    buy('diveweapon', r => r.kind === 'diveweapon' && r.idx === 1);
  });

  test('turning you down: already yours, not yet, and not enough money', () => {
    const { S, P, D } = atStall(P => { P.coins = 50; });
    S.tab = 1;
    S.sel = S.rows().findIndex(r => r.kind === 'weapon' && r.idx === 0); S.act();
    assert.equal(S.line, D.owned[0]);
    S.sel = S.rows().findIndex(r => r.kind === 'rod' && r.idx === 3); S.act();
    assert.equal(S.line, D.locked[0]);
    S.sel = S.rows().findIndex(r => r.kind === 'rod' && r.idx === 1); S.act();
    assert.match(S.line, new RegExp("^That's " + (S.rows()[S.sel].price - 50) + ' short'));
    assert.equal(P.coins, 50);
  });

  test('he gets his words out a little at a time, mumbling, and the quote only closes when he is done', () => {
    const { h, g, S } = atStall(null, { audio: true, draw: true });
    h.press('KeyZ');
    S.say('Where\'d I put my medicine. Oh. It\'s in me.');
    let mumbles = 0;
    const m = g.Sfx.mumble;
    g.Sfx.mumble = function () { mumbles++; return m.apply(this, arguments); };
    h.frames(.3);
    assert.ok(S.shown > 5 && S.shown < S.line.length, 'part way: ' + S.shown);
    const quoted = () => {
      let said = null;
      const draw = g.Text.draw;
      g.Text.draw = function (ctx, s) { if (String(s)[0] === '“') said = String(s); return draw.apply(this, arguments); };
      try { S.draw(h.eval('bctx')); } finally { g.Text.draw = draw; }
      return said;
    };
    const mid = quoted();
    assert.ok(mid.length > 5 && !mid.endsWith('”'), 'still talking: ' + mid);
    assert.ok(S.line.startsWith(mid.slice(1)));
    h.frames(2);
    assert.equal(S.shown, S.line.length);
    assert.equal(quoted(), '“' + S.line + '”');
    assert.ok(mumbles >= S.line.length / 3 - 2, 'mumbled ' + mumbles + ' times');
    g.Sfx.mumble = m;
  });

  test('left in silence, he fills it, and never with the line he has just said', () => {
    const { h, S, D } = atStall();
    const heard = [S.line];
    for (let i = 0; i < 12; i++) {
      h.frames(S.SILENCE + .1);
      assert.notEqual(S.line, heard[heard.length - 1]);
      assert.ok(D.mutter.includes(S.line), S.line);
      heard.push(S.line);
    }
    assert.ok(new Set(heard).size >= 5);
  });

  test('his chatter never touches the dice the sea uses', () => {
    const { h, g, S, P } = atStall((P, g) => { for (let i = 0; i < 6; i++) P.catches.push(trophy(g, 'gnashfin')); });
    h.sandbox.__rolls = 0;
    h.eval('(() => { const r = Math.random; Math.random = function () { __rolls++; return r(); }; })()');
    for (let i = 0; i < 6; i++) { S.tab = 0; S.sel = S.rows().findIndex(r => r.kind === 'fish'); S.act(); }
    for (let i = 0; i < 40 * 60; i++) S.update(1 / 60);
    assert.equal(h.sandbox.__rolls, 0);
    assert.equal(g.Game.state, 'shop');
    assert.equal(P.catches.length, 0);
  });
});

describe('Uncle Dorran on deck', () => {
  function onDeck(x, opts) {
    const h = loadGame(Object.assign({ draw: false, seed: 6 }, opts));
    h.startVoyage();
    const g = h.g;
    g.Dialogue.hide(); g.Game.msgs = [];
    g.Player.weapon = 0;
    g.Player.x = x;
    g.Game.hushDorran();
    g.Game.barkCd = 0;
    return { h, g, G: g.Game, D: g.DORRAN };
  }
  const walk = (h, key, pred) => { h.keyDown(key); h.until(pred, 10); h.keyUp(key); h.frame(); };

  test('walk up to his stall and he calls out; walk away and back and he lets you be for a while', () => {
    const { h, g, G, D } = onDeck(1300);
    walk(h, 'KeyA', () => g.Player.x < 1000);
    assert.ok(D.deck.near.includes(G.bark.text), 'called out: ' + G.bark.text);
    h.frames(G.barkLife(G.bark.text) + .2);
    assert.equal(G.bark.text, '');
    walk(h, 'KeyD', () => g.Player.x > 1300);
    walk(h, 'KeyA', () => g.Player.x < 1000);
    assert.equal(G.bark.text, '', 'not again so soon');
    walk(h, 'KeyD', () => g.Player.x > 1300);
    h.frames(26);
    walk(h, 'KeyA', () => g.Player.x < 1000);
    assert.ok(D.deck.near.includes(G.bark.text), 'but later, yes');
  });

  test('now and then he talks to nobody in particular, if you are close enough to hear', () => {
    const near = onDeck(1100);
    const heard = new Set();
    for (let i = 0; i < 100 * 20; i++) { near.h.frame(1 / 20); if (near.G.bark.text) heard.add(near.G.bark.text); }
    assert.ok(heard.size >= 1 && [...heard].every(l => near.D.deck.idle.includes(l)), [...heard].join(' | '));
    const far = onDeck(1750);
    let said = false;
    for (let i = 0; i < 100 * 20; i++) { far.h.frame(1 / 20); said = said || !!far.G.bark.text; }
    assert.equal(said, false);
  });

  test('a conversation shuts him up, and he waits a moment after it before calling out', () => {
    const { h, G } = onDeck(1100);
    G.dorranShouts('Is it Tuesday? Feels like a Tuesday.');
    G.dorranTalks('noNet');
    h.frame();
    assert.equal(G.bark.text, '');
    assert.ok(G.barkCd >= 7.9);
  });

  test('after a fight, back up the ladder, or waking up on deck, he has the right thing to shout', () => {
    const { g, G, D } = onDeck(1100);
    g.Battle.def = g.MONSTERS[0];
    g.Game.endBattle(true, trophy(g, 'gnashfin'));
    assert.ok(D.deck.won.includes(G.bark.text), G.bark.text);
    g.Dive.backOnDeck('Back aboard.', D.deck.aboard);
    assert.ok(D.deck.aboard.includes(G.bark.text), G.bark.text);
    g.Dive.backOnDeck('You wake on the deck, coughing.', D.deck.woke);
    assert.ok(D.deck.woke.includes(G.bark.text), G.bark.text);
  });

  test('the bubble is typed out over his stall, and stays on screen when he is off it', () => {
    const { h, g, G, D } = onDeck(742);
    const rec = h.hires(), bctx = h.eval('bctx');
    const bubble = () => {
      rec.reset(); rec.startLog(); G.drawBark(bctx);
      const log = rec.stopLog();
      const at = log.findIndex(e => e.set === 'fillStyle' && e.value === '#efe4c8');
      return { box: at >= 0 ? log[at + 1].args : null, text: log.filter(e => e.fn === 'fillText' || e.fn === 'drawImage') };
    };
    for (const line of [...D.deck.near, ...D.deck.idle, ...D.deck.won, ...D.deck.aboard, ...D.deck.woke]) {
      assert.ok(g.Text.wrap(bctx, line, 250, { size: 15 }).length <= 3, line);
    }
    g.Cam.snap(742);
    G.dorranShouts(D.deck.near[0]);
    G.bark.t = .05;
    const early = bubble();
    assert.ok(early.box, 'a bubble');
    G.bark.t = 2;
    const [x, y, w, hgt] = bubble().box;
    assert.ok(Math.abs(x + w / 2 - (742 + 8 - g.Cam.x)) < 40, 'over the stall');
    assert.ok(y + hgt < g.DECK_Y - 140);
    g.Cam.x = 1400;
    const off = bubble().box;
    assert.ok(off[0] >= 10 && off[0] + off[2] <= g.VIEW_W - 10, 'clamped on screen');
  });

  test('the bubble only shows on deck, and never over a dialogue box', () => {
    const { h, g, G, D } = onDeck(1100, { draw: true });
    const rec = h.hires();
    let calls = 0;
    const draw = G.drawBark;
    G.drawBark = function () { calls++; return draw.apply(this, arguments); };
    G.dorranShouts(D.deck.idle[1]);
    G.draw();
    assert.equal(calls, 1);
    g.Shop.open();
    G.draw();
    assert.equal(calls, 1, 'not at the stall');
    g.Shop.close();
    G.dorranShouts(D.deck.idle[1]);
    g.Dialogue.show('Dorran', 'Hm.');
    rec.reset(); rec.startLog(); draw.call(G, h.eval('bctx'));
    assert.equal(rec.stopLog().filter(e => e.set === 'fillStyle' && e.value === '#efe4c8').length, 0);
    G.drawBark = draw;
  });
});
