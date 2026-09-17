'use strict';
/* Multi-step player journeys for the integration tests. Everything here
   goes through real key presses and whole frames, the way a player would;
   none of it pokes state except where noted. */

const assert = require('node:assert/strict');

// a menu row by id on whatever screen is on top
function selectMenu(h, id) {
  const M = h.g.Menu;
  const items = M.items(M.top());
  const want = items.findIndex(i => i.id === id || i.key === id || i.action === id || i.label === id);
  assert.ok(want >= 0, 'no menu item ' + id + ' on ' + M.top());
  for (let i = 0; i < items.length * 2 && M.sel[M.top()] !== want; i++) h.tap('ArrowDown');
  assert.equal(M.sel[M.top()], want, 'could not reach ' + id);
}

function chooseMenu(h, id) {
  selectMenu(h, id);
  h.tap('Enter');
}

function waitFade(h) { h.until(() => h.g.Game.fade.dir <= 0, 3); h.frames(.5); }

// title menu -> new voyage -> the opening is running
function newVoyageFromMenu(h) {
  chooseMenu(h, 'new');
  if (h.g.Menu.top() === 'confirmNew') chooseMenu(h, 'yes');
  assert.ok(h.until(() => h.g.Game.state === 'cutscene', 3), 'opening did not start');
}

// hold ESC through the opening
function skipOpening(h) {
  h.keyDown('Escape');
  h.until(() => h.g.Game.state !== 'cutscene', 3);
  h.keyUp('Escape');
  h.frame();
  assert.equal(h.g.Game.state, 'play');
}

// press ENTER through whatever is being said on deck
function readDialogue(h) {
  for (let i = 0; i < 40 && (h.g.Dialogue.active || h.g.Game.msgs.length); i++) {
    h.until(() => h.g.Dialogue.done && h.g.Dialogue.hold > .15, 10);
    h.tap('Enter');
  }
  assert.equal(h.g.Dialogue.active, false, 'dialogue would not close');
}

function walkTo(h, x, tolerance) {
  const P = h.g.Player;
  tolerance = tolerance || 20;
  const code = P.x > x ? 'KeyA' : 'KeyD';
  h.keyDown(code);
  h.until(() => Math.abs(P.x - x) <= tolerance || (code === 'KeyA' ? P.x < x : P.x > x), 15);
  h.keyUp(code);
  h.frame();
}

function openCrate(h) {
  walkTo(h, 392);
  h.tap('KeyE');
  readDialogue(h);
  assert.equal(h.g.Player.weapon, 0);
}

function castLine(h) {
  walkTo(h, h.g.FISH_X, 40);
  h.tap('KeyE');
  assert.equal(h.g.Game.state, 'fish', 'cast did not start');
}

function waitForBite(h, seconds) {
  const ok = h.until(() => h.g.Fishing.phase === 'bite', seconds || 30);
  assert.ok(ok, 'nothing bit (phase ' + h.g.Fishing.phase + ')');
}

function setHook(h) { h.tap('KeyE'); }

// the scripted first catch, all the way to the fight starting
function landIntroCatch(h) {
  const F = h.g.Fishing;
  waitForBite(h);
  setHook(h);
  h.autoReel(30);
  assert.equal(F.phase, 'ambush');
  assert.ok(h.until(() => F.phase === 'reel', 6));
  h.autoReel(60);
  assert.ok(h.until(() => h.g.Game.state === 'battle', 4), 'no fight after landing');
}

/* Answer whatever skill check is up, the way a steady player would: press as
   the ring meets its mark, press each key as it comes up, and hold against a
   pull. Returns true while one is up (the bot should do nothing else then).
   Pass { fail: true } to get it wrong on purpose. */
function answerSkill(h, opts) {
  const S = h.g.Skill, A = S.active;
  const held = h.__skillHeld || (h.__skillHeld = new Set());
  const release = () => { for (const k of held) h.keyUp(k); held.clear(); };
  if (!A) { release(); return false; }
  const key = action => h.g.ACTIONS[action][0];
  const fail = opts && opts.fail;
  if (A.result === null) {
    if (A.kind === 'ring') {
      const off = A.local - A.shrink;
      if (fail ? (A.local > .1 && A.local < A.shrink - .4) : Math.abs(off) < .02 && A.local >= 0) h.press(key(A.action));
    } else if (A.kind === 'keys') {
      if (A.local > .12) h.press(key(fail ? (A.seq[A.i] === 'left' ? 'right' : 'left') : A.seq[A.i]));
    } else {
      const k = key(fail ? A.keys[1] : A.keys[0]);
      if (!held.has(k)) { h.keyDown(k); held.add(k); }
    }
  }
  return true;
}

/* A simple, decent fighter: close the distance, face the thing, swing when
   in reach, and roll out from under anything telegraphed at close range.
   Returns true on a win. */
function fightBot(h, maxSeconds) {
  const g = h.g, B = g.Battle, P = g.Player;
  const held = new Set();
  const hold = (code, on) => {
    if (on && !held.has(code)) { h.keyDown(code); held.add(code); }
    if (!on && held.has(code)) { h.keyUp(code); held.delete(code); }
  };
  const frames = Math.round((maxSeconds || 90) * 60);
  for (let i = 0; i < frames; i++) {
    if (g.Game.state !== 'battle' || B.phase === 'win' || B.phase === 'lose') break;
    if (answerSkill(h)) { hold('KeyA', false); hold('KeyD', false); h.frame(); continue; }
    const m = B.m;
    const dx = m.x - P.x;
    const reach = 64 * g.WEAPONS[Math.max(0, P.weapon)].reach + B.len * .42;
    const wantFace = dx < 0 ? -1 : 1;
    let left = false, right = false;
    if (B.phase === 'fight' && P.bState !== 'attack') {
      if (Math.abs(dx) > reach * .8) { left = dx < 0; right = dx > 0; }
      else if (P.face !== wantFace) { left = wantFace < 0; right = wantFace > 0; }
    }
    hold('KeyA', left);
    hold('KeyD', right);
    const danger = m.state === 'tele' && Math.abs(dx) < 260 && m.atk !== 'roar';
    if (danger && P.rollCd <= 0 && P.bState !== 'roll') h.press('KeyK');
    else if (B.phase === 'fight' && Math.abs(dx) <= reach && P.face === wantFace && i % 6 === 0) h.press('KeyJ');
    if (P.hp <= 2 && P.bandages > 0 && P.healT <= 0) h.press('KeyQ');
    h.frame();
  }
  hold('KeyA', false); hold('KeyD', false);
  const won = B.phase === 'win' || (g.Game.state !== 'battle' && P.catches.length > 0);
  h.until(() => g.Game.state !== 'battle', 5);
  return won;
}

/* Drowning, from the moment the suit gives out: he sinks, the screen says so,
   Dorran hauls him up, and the reader presses on through what he says. */
function wakeOnDeck(h, seconds) {
  const g = h.g, said = [];
  assert.ok(h.until(() => g.Game.state === 'cutscene' || g.Game.state === 'play', seconds || 30), 'never came round');
  for (let i = 0; i < 24 && g.Game.state === 'cutscene'; i++) {
    h.until(() => (g.Dialogue.active && g.Dialogue.done && g.Dialogue.hold > .15) || g.Game.state !== 'cutscene', 10);
    if (g.Dialogue.active && said.indexOf(g.Dialogue.full) < 0) said.push(g.Dialogue.full);
    h.tap('Enter');
  }
  assert.ok(h.until(() => g.Game.state === 'play', 10), 'still not back on deck');
  return said;
}

function openStall(h) {
  walkTo(h, 742, 60);
  h.tap('KeyE');
  assert.equal(h.g.Game.state, 'shop');
}

module.exports = {
  selectMenu, chooseMenu, waitFade, newVoyageFromMenu, skipOpening, readDialogue,
  walkTo, openCrate, castLine, waitForBite, setHook, landIntroCatch, answerSkill, fightBot, openStall, wakeOnDeck
};
