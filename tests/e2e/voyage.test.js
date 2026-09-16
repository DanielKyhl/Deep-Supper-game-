'use strict';
/* Playing the packaged game with a real keyboard: start a voyage, walk,
   open the crate, fish, pause, save, quit and come back. */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../helpers/app');

describe('a voyage in the app', () => {
  let profile, app, page;

  before(async () => {
    profile = A.tempProfile();
    ({ app, page } = await A.launch(profile));
  });
  after(async () => { await A.close(app); A.removeProfile(profile); });

  test('New voyage fades into the opening cutscene', async () => {
    await A.choose(page, 'new');
    await A.until(page, () => Game.state === 'cutscene');
    const s = await page.evaluate(() => ({ dad: CUT.dad.visible, running: CUT.running }));
    assert.deepEqual(s, { dad: true, running: true });
  });

  test('holding ESC skips the opening and puts you on deck', async () => {
    await page.keyboard.down('Escape');
    await A.until(page, () => Game.state === 'play', null, 5000);
    await page.keyboard.up('Escape');
    assert.equal(await page.evaluate(() => Game.night), 1);
    assert.equal(await page.evaluate(() => Dialogue.who), '', 'the boy says nothing; the story is told in narration');
    await page.evaluate(() => Settings.set('textSpeed', 'instant'));
    for (let i = 0; i < 6 && await page.evaluate(() => Dialogue.active); i++) {
      await page.waitForTimeout(250);
      await page.keyboard.press('Enter');
    }
    await A.until(page, () => !Dialogue.active);
  });

  test('A walks him left facing left, D walks him right facing right', async () => {
    const x0 = await page.evaluate(() => Player.x);
    await A.hold(page, 'KeyA', 400);
    const left = await page.evaluate(() => ({ x: Player.x, face: Player.face }));
    assert.ok(left.x < x0 - 40, 'moved left ' + (x0 - left.x));
    assert.equal(left.face, -1);
    await A.hold(page, 'KeyD', 400);
    const right = await page.evaluate(() => ({ x: Player.x, face: Player.face }));
    assert.ok(right.x > left.x + 40);
    assert.equal(right.face, 1);
  });

  test('walking the pixel-art deck at night, a whole frame is drawn in a few milliseconds', async () => {
    await page.evaluate(() => {
      window.__frameMs = [];
      const frame = Game.frame;
      Game.frame = function (...a) {
        const t0 = performance.now();
        const r = frame.apply(this, a);
        window.__frameMs.push(performance.now() - t0);
        return r;
      };
      window.__restoreFrame = () => { Game.frame = frame; };
    });
    await A.hold(page, 'KeyD', 1500);
    await A.hold(page, 'KeyA', 1000);
    const ms = await page.evaluate(() => { window.__restoreFrame(); return window.__frameMs; });
    assert.ok(ms.length > 60, 'only ' + ms.length + ' frames ran');
    const sorted = ms.slice(1).sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    assert.ok(median < 6, 'median frame ' + median.toFixed(2) + ' ms');
    assert.equal(await page.evaluate(() => Game.night), 1);
  });

  test('E at the crate takes the dip net', async () => {
    await page.keyboard.down('KeyA');
    await A.until(page, () => Player.x < 420, null, 8000);
    await page.keyboard.up('KeyA');
    await page.keyboard.press('KeyE');
    await A.until(page, () => Player.weapon === 0);
    for (let i = 0; i < 8 && await page.evaluate(() => Dialogue.active); i++) {
      await page.waitForTimeout(250);
      await page.keyboard.press('Enter');
    }
    assert.equal(await page.evaluate(() => Game.crateOpen), true);
  });

  test('walking up to the stall, Dorran calls out; at the counter he talks, a word at a time', async () => {
    await A.until(page, () => Game.barkCd <= 0 && !Game.bark.text, null, 15000);
    await page.keyboard.down('KeyD');
    await A.until(page, () => Game.bark.text !== '', null, 5000);
    const called = await page.evaluate(() => ({ text: Game.bark.text, near: DORRAN.deck.near.includes(Game.bark.text) }));
    assert.ok(called.near, 'called out: ' + called.text);
    await A.until(page, () => Player.x > 730, null, 8000);
    await page.keyboard.up('KeyD');
    await page.keyboard.press('KeyE');
    await A.until(page, () => Game.state === 'shop');
    const early = await page.evaluate(() => ({ shown: Shop.shown, len: Shop.line.length }));
    await page.waitForTimeout(2500);
    const later = await page.evaluate(() => ({ shown: Shop.shown, len: Shop.line.length, bubble: Game.bark.text }));
    assert.ok(early.shown < early.len, 'still getting his words out: ' + early.shown + '/' + early.len);
    assert.equal(later.shown, later.len);
    assert.equal(later.bubble, '');
    await page.keyboard.press('Escape');
    await A.until(page, () => Game.state === 'play');
  });

  test('E at the bow casts the line', async () => {
    await page.keyboard.down('KeyD');
    await A.until(page, () => Player.x > FISH_X - 60, null, 10000);
    await page.keyboard.up('KeyD');
    await page.keyboard.press('KeyE');
    await A.until(page, () => Game.state === 'fish');
    await A.until(page, () => Fishing.phase === 'sink' || Fishing.phase === 'deep', null, 5000);
  });

  test('ESC mid-cast pauses, and Resume carries on fishing', async () => {
    await page.keyboard.press('Escape');
    await A.until(page, () => Game.state === 'pause');
    const t = await page.evaluate(() => Fishing.t);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => Fishing.t), t, 'fishing is frozen');
    await A.choose(page, 'resume');
    await A.until(page, () => Game.state === 'fish');
  });

  test('Save and return to title lands on the menu with Continue first', async () => {
    await page.evaluate(() => { Player.coins = 123; });
    await page.keyboard.press('Escape');
    await A.until(page, () => Game.state === 'pause');
    await A.choose(page, 'title');
    await A.until(page, () => Game.state === 'menu', null, 5000);
    assert.equal(await page.evaluate(() => Menu.items('main')[0].label), 'Continue');
  });

  test('after quitting and relaunching, Continue brings the voyage back', async () => {
    await A.close(app);
    ({ app, page } = await A.launch(profile));
    await A.choose(page, 'continue');
    await A.until(page, () => Game.state === 'play', null, 5000);
    const p = await page.evaluate(() => ({ coins: Player.coins, weapon: Player.weapon, crate: Game.crateOpen }));
    assert.deepEqual(p, { coins: 123, weapon: 0, crate: true });
  });
});
