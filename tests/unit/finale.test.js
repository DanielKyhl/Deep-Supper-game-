'use strict';
/* The voyage home and the credits: when the wheel offers it, what is said on
   the way, what the credits list, and where it all leaves the voyage. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');
const F = require('../helpers/flows');

// on deck with the story so far behind him
function onDeck(opts, player) {
  const h = loadGame(Object.assign({ draw: false, seed: 8 }, opts));
  h.startVoyage();
  F.readDialogue(h);
  Object.assign(h.g.Player, player || {});
  return h;
}
const beaten = { beatBoss: true, beatMother: true, suit: 3, diveWeapon: 4, weapon: 5, totalKills: 40 };

// run the finale to its end the way a reader would, holding a key through the credits;
// returns every line shown on the way and whether the credits rolled
function playThrough(h) {
  const g = h.g, said = [];
  const show = g.Dialogue.show;
  g.Dialogue.show = function (who, text) { said.push([who, text]); return show.call(this, who, text); };
  let rolled = false, title = null;
  try {
    for (let i = 0; i < 60 * 400 && g.Game.state === 'cutscene'; i++) {
      if (g.CUT.credits) { rolled = true; if (i % 2 === 0) h.keyDown('Space'); }
      if (g.CUT.titleCard) title = g.CUT.titleCard.title;
      if (g.Dialogue.active && g.Dialogue.done && g.Dialogue.hold > .1) h.press('Enter');
      h.frame();
    }
    h.keyUp('Space');
    h.until(() => g.Game.state === 'play' && g.Game.fade.dir === 0, 5);
  } finally { g.Dialogue.show = show; }
  return { said, rolled, title };
}

describe('the way home', () => {
  test('the wheel offers nothing until the last boss is beaten, then offers to sail home', () => {
    const h = onDeck({}, { beatBoss: true, suit: 3, diveWeapon: 4 });
    const g = h.g;
    g.Player.x = g.FINALE.helmX;
    assert.equal(g.Game.nearestSpot(), null);
    g.Player.beatMother = true;
    const spot = g.Game.nearestSpot();
    assert.equal(spot.id, 'helm');
    assert.equal(g.Game.spotLabel(spot), 'Sail home');
    g.Game.useSpot(spot);
    assert.equal(g.Game.state, 'cutscene');
    assert.equal(g.Game.endingRun, true, 'with the ending music');
  });

  test('FINALE.ready alone decides it, so the ending can move later in the story', () => {
    const h = onDeck({}, beaten);
    const g = h.g;
    g.Player.x = g.FINALE.helmX;
    g.FINALE.ready = () => false;
    assert.equal(g.Game.nearestSpot(), null, 'the Mother beaten is no longer enough');
    assert.notEqual(g.Game.objective(), 'Take the Margaret home: the wheel is in the wheelhouse');
    g.Player.beatMother = false;
    g.FINALE.ready = () => true;
    assert.equal(g.Game.nearestSpot().id, 'helm');
  });

  test('the objective sends him to the wheel, and lets him be once the ending is seen', () => {
    const h = onDeck({}, beaten);
    assert.equal(h.g.Game.objective(), 'Take the Margaret home: the wheel is in the wheelhouse');
    h.g.Player.sawEnding = true;
    assert.equal(h.g.Game.objective(), 'Lanthorne is lit again. The sea is yours.');
  });

  test('climbing aboard after the Mother, the narration says it is time to go home, once', () => {
    const h = onDeck({}, beaten);
    const g = h.g;
    g.Game.state = 'dive';
    g.Dive.backOnDeck('Back aboard.', g.DORRAN.deck.aboard);
    assert.equal(g.Dialogue.active, true);
    assert.equal(g.Dialogue.who, '');
    assert.equal(g.Dialogue.full, g.NARRATION.homeward[0]);
    assert.equal(g.Game.bark.text, '', 'Dorran keeps quiet for it');
    F.readDialogue(h);
    g.Dive.backOnDeck('Back aboard.', g.DORRAN.deck.aboard);
    assert.equal(g.Dialogue.active, false, 'not a second time');
    assert.notEqual(g.Game.bark.text, '');
  });
});

describe('the finale, played through', () => {
  test('home at dawn, THE END, the credits, then back on deck in daylight with the ending seen and saved', () => {
    const h = onDeck({}, beaten);
    const g = h.g;
    g.Player.x = g.FINALE.helmX;
    g.Game.startFinale();
    const run = playThrough(h);
    assert.equal(run.title, 'THE END');
    assert.equal(run.rolled, true, 'the credits rolled');
    assert.ok(run.said.some(([who, text]) => who === 'Dad' && /You went down/.test(text)));
    assert.ok(run.said.some(([who, text]) => who === '' && /turns for home/.test(text)));
    assert.ok(!run.said.some(([who]) => who === 'The boy' || who === 'Boy'), 'the boy says nothing, even now');
    assert.equal(g.Game.state, 'play');
    assert.equal(g.Player.sawEnding, true);
    assert.equal(g.Game.night, .12);
    assert.equal(g.CUT.harbourX, 300, 'moored in the harbour');
    assert.equal(g.CUT.credits, null);
    assert.equal(h.eval('SaveGame.read()').sawEnding, true);
  });

  test('Dad only reads the watch if the boy found it on the Shelf', () => {
    const withWatch = onDeck({}, Object.assign({}, beaten, { lore: ['watch'] }));
    withWatch.g.Game.startFinale();
    const a = playThrough(withWatch).said.map(s => s[1]).join('\n');
    assert.match(a, /Keep time, and come home/);
    assert.doesNotMatch(a, /with my boy inside it/);

    const without = onDeck({}, beaten);
    without.g.Game.startFinale();
    const b = playThrough(without).said.map(s => s[1]).join('\n');
    assert.doesNotMatch(b, /Keep time/);
    assert.match(b, /with my boy inside it/);
  });

  test('holding ESC skips the lot and leaves everything exactly where the ending would', () => {
    const h = onDeck({}, beaten);
    const g = h.g;
    g.Game.startFinale();
    h.frames(2);
    h.hold('Escape', 1.2);
    assert.ok(h.until(() => g.Game.state === 'play' && g.Game.fade.dir === 0, 5));
    assert.equal(g.Player.sawEnding, true);
    assert.equal(g.Game.night, .12);
    assert.equal(g.CUT.credits, null);
    assert.equal(g.CUT.signal.a, 0);
    assert.equal(g.Cam.locked, false);
    assert.equal(g.Game.endingRun, false);
  });

  test('the test shortcut puts him at the wheel with everything beaten and starts it', () => {
    const h = loadGame({ draw: false, seed: 2 });
    F.chooseMenu(h, 'dev');
    F.chooseMenu(h, 'devFinale');
    assert.ok(h.until(() => h.g.Game.state === 'cutscene' && h.g.Game.endingRun, 3));
    assert.equal(h.g.Player.beatMother, true);
    assert.equal(h.g.Player.x, h.g.FINALE.helmX);
  });
});

describe('the credits', () => {
  test('the crew, every creature he met by name and count, the rest as ???, and the voyage in numbers', () => {
    const h = onDeck({}, Object.assign({}, beaten, { casts: 40, totalKills: 31, sold: 12, coins: 777, excalibur: true, lore: ['meg', 'watch'] }));
    const g = h.g;
    g.Player.kills = { gnashfin: 3, trenchmaw: 1 };
    const rows = g.Credits.rows();
    const crew = rows.filter(r => r.kind === 'person').map(r => r.text);
    assert.deepEqual(plain(crew), ['The boy', 'Dad', 'Uncle Dorran', 'Nerys of Lanthorne']);
    const items = rows.filter(r => r.kind === 'crowd').flatMap(r => r.items);
    assert.equal(items.length, g.MONSTERS.length + g.DIVE_MONSTERS.length, 'everything that lives in this sea');
    const find = id => items.find(it => it.def.id === id);
    assert.equal(find('gnashfin').seen, true);
    assert.equal(find('gnashfin').n, 3);
    assert.equal(find('leviathan').seen, true, 'beating the Old One counts as meeting it');
    assert.equal(find('mother').seen, true);
    assert.equal(items.filter(it => it.seen).length, 4);
    const stat = name => rows.find(r => r.kind === 'stat' && r.text === name).value;
    assert.equal(stat('Lines cast'), '40');
    assert.equal(stat('Monsters killed'), '31');
    assert.equal(stat('Letters found'), '1 of ' + g.Lore.total('letter'));
    assert.equal(stat('Relics found'), '1 of ' + g.Lore.total('relic'));
    assert.equal(stat('Excalibur'), 'pulled from the sea');
    assert.equal(stat('Coins to your name'), '777§');
    assert.equal(rows[rows.length - 1].text, 'Thank you for playing.');
  });

  test('they roll at their own pace, much faster while a key is held, and settle on the last line before ending', () => {
    const h = onDeck({}, beaten);
    const g = h.g, C = g.Credits;
    const timeToEnd = fast => {
      const c = C.start();
      if (fast) h.keyDown('Space');
      let t = 0, settled = null;
      while (!C.update(c, 1 / 30) && t < 600) { t += 1 / 30; if (settled === null && c.y >= c.stop) settled = t; }
      if (fast) h.keyUp('Space');
      assert.equal(c.y, c.stop, 'stopped exactly on the last line');
      assert.ok(t - settled >= C.HOLD / (fast ? C.FAST : 1) - .1, 'and held it');
      return t;
    };
    const slow = timeToEnd(false), quick = timeToEnd(true);
    assert.ok(slow > 40, 'a proper roll: ' + slow.toFixed(1) + 's');
    assert.ok(quick < slow / 5, quick.toFixed(1) + 's held vs ' + slow.toFixed(1) + 's');
  });

  test('every row draws, balanced, and the creatures come out sized to their slots', () => {
    const h = onDeck({ draw: true }, beaten);
    const g = h.g, rec = h.hires(), bctx = h.eval('bctx');
    for (const m of g.MONSTERS.concat(g.DIVE_MONSTERS)) g.Player.kills[m.id] = 1;
    const c = g.Credits.start();
    for (let y = 0; y <= c.stop; y += 90) {
      c.y = y; c.fade = 1;
      rec.reset();
      assert.doesNotThrow(() => g.Credits.draw(bctx, c), 'at ' + y);
      assert.equal(rec.depth(), 0, 'unbalanced at ' + y);
    }
    const items = c.rows.filter(r => r.kind === 'crowd').flatMap(r => r.items);
    assert.ok(items.every(it => it.fit), 'every creature was sized');
    for (const it of items) {
      const [w, hh] = g.Beast.measure(it.pose);
      assert.ok(w <= 214 && hh <= 104, it.def.id + ' is ' + w + 'x' + hh);
      assert.ok(it.pose.len <= it.def.len, it.def.id + ' never grows past its real size');
    }
  });

  test("Beast.measure sizes a creature without drawing it or touching the animation cache", () => {
    const h = onDeck({}, beaten);
    const B = h.g.Beast, def = h.g.monsterDef('gnashfin');
    const before = B._held.size;
    const pose = { x: 300, y: 200, face: 1, rot: 0, def, gape: .3, flash: 0, seed: 5, thrashAmt: 1 };
    const small = B.measure(Object.assign({}, pose, { len: 80 })), big = B.measure(Object.assign({}, pose, { len: 160 }));
    assert.ok(small[0] > 0 && small[1] > 0);
    assert.ok(big[0] > small[0] * 1.6 && big[0] < small[0] * 2.4, big + ' vs ' + small);
    assert.equal(B._held.size, before);
    assert.equal(B.cache, true);
    assert.equal(pose.x, 300, 'the pose it was given is left alone');
  });
});

describe('saving the ending', () => {
  test('a finished voyage saves as finished, and a damaged flag reads as not', () => {
    const h = onDeck({}, Object.assign({}, beaten, { sawEnding: true }));
    const S = h.eval('SaveGame');
    const snap = S.snapshot();
    assert.equal(snap.sawEnding, true);
    assert.equal(S.sanitize(JSON.parse(JSON.stringify(snap))).sawEnding, true);
    assert.equal(S.sanitize(Object.assign({}, JSON.parse(JSON.stringify(snap)), { sawEnding: 'yes' })).sawEnding, false);
    const old = JSON.parse(JSON.stringify(snap));
    delete old.sawEnding;
    assert.equal(S.sanitize(old).sawEnding, false, 'saves from before there was an ending');
  });
});
