'use strict';
/* Options that have to survive the app being closed, and the ones that
   reach outside the page: fullscreen and quitting. */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../helpers/app');

const isFullScreen = app => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());
// a Mac animates into and out of fullscreen, so wait for the window to get there
async function fullScreenIs(app, want) {
  for (let i = 0; i < 80; i++) {
    if (await isFullScreen(app) === want) {
      if (process.platform === 'darwin') await new Promise(r => setTimeout(r, 1000));   // let the animation finish
      return true;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

describe('settings in the app', () => {
  let profile, app, page;

  before(async () => {
    profile = A.tempProfile();
    ({ app, page } = await A.launch(profile));
  });
  after(async () => { await A.close(app); A.removeProfile(profile); });

  test('volume set in Options > Audio with the arrow keys', async () => {
    await A.choose(page, 'options');
    await A.choose(page, 'audio');
    assert.equal(await page.evaluate(() => Menu.top()), 'audio');
    for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(60); }
    assert.equal(await page.evaluate(() => Settings.get('master')), .5);
  });

  test('a key rebound on the Controls screen', async () => {
    await page.keyboard.press('Escape');
    await A.choose(page, 'controls');
    await A.choose(page, 'attack');
    assert.equal(await page.evaluate(() => Menu.rebinding), 'attack');
    await page.keyboard.press('KeyL');
    assert.equal(await page.evaluate(() => Settings.data.bindings.attack[0]), 'KeyL');
  });

  test('F11 takes the window fullscreen and back', async () => {
    await page.keyboard.press('F11');
    await A.until(page, () => Settings.get('fullscreen') === true);
    assert.ok(await fullScreenIs(app, true), 'went fullscreen');
    await page.keyboard.press('F11');
    assert.ok(await fullScreenIs(app, false), 'came back');
    assert.equal(await page.evaluate(() => Settings.get('fullscreen')), false);
  });

  test("leaving fullscreen with the window itself, like a Mac's green button, turns the option off too", async () => {
    await page.keyboard.press('F11');
    await A.until(page, () => Settings.get('fullscreen') === true);
    assert.ok(await fullScreenIs(app, true));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
    await A.until(page, () => Settings.get('fullscreen') === false, null, 8000);
    assert.ok(await fullScreenIs(app, false));
  });

  test('M mutes', async () => {
    await page.keyboard.press('KeyM');
    await A.until(page, () => Settings.get('muted') === true);
  });

  test('everything set above is still set after closing and reopening the app', async () => {
    await page.keyboard.press('F11');
    await A.until(page, () => Settings.get('fullscreen') === true);
    await A.close(app);
    ({ app, page } = await A.launch(profile));
    const s = await page.evaluate(() => ({ master: Settings.get('master'), attack: Settings.data.bindings.attack[0], muted: Settings.get('muted'), sfxMuted: Sfx.muted }));
    assert.deepEqual(s, { master: .5, attack: 'KeyL', muted: true, sfxMuted: true });
    assert.ok(await fullScreenIs(app, true), 'reopens fullscreen');
  });

  test('Reset all settings puts the defaults back, windowed', async () => {
    await A.choose(page, 'options');
    await A.choose(page, 'reset');
    await A.choose(page, 'yes');
    await page.waitForTimeout(600);
    const s = await page.evaluate(() => ({ master: Settings.get('master'), attack: Settings.data.bindings.attack[0], muted: Settings.get('muted') }));
    assert.deepEqual(s, { master: .8, attack: 'KeyJ', muted: false });
    assert.ok(await fullScreenIs(app, false), 'windowed again');
  });
});

describe('quitting the app', () => {
  test('Quit on the title menu, confirmed, closes the app', async () => {
    const profile = A.tempProfile();
    const { app, page } = await A.launch(profile);
    try {
      const closed = new Promise(resolve => app.process().once('exit', resolve));
      await A.choose(page, 'quit');
      assert.equal(await page.evaluate(() => Menu.top()), 'confirmQuit');
      await A.choose(page, 'yes');
      await Promise.race([closed, new Promise((_, rej) => setTimeout(() => rej(new Error('app did not quit')), 10000))]);
    } finally {
      await A.close(app);
      A.removeProfile(profile);
    }
  });

  test('Save and quit from the pause menu keeps the voyage for next time', async () => {
    const profile = A.tempProfile();
    let { app, page } = await A.launch(profile);
    try {
      await A.startVoyage(page);
      await page.evaluate(() => { Player.coins = 64; Player.x = 1111; });
      const closed = new Promise(resolve => app.process().once('exit', resolve));
      await page.keyboard.press('Escape');
      await A.until(page, () => Game.state === 'pause');
      await A.choose(page, 'quit');
      await Promise.race([closed, new Promise((_, rej) => setTimeout(() => rej(new Error('app did not quit')), 10000))]);
      ({ app, page } = await A.launch(profile));
      const labels = await page.evaluate(() => Menu.items('main').map(i => i.label));
      assert.equal(labels[0], 'Continue');
      await A.choose(page, 'continue');
      await A.until(page, () => Game.state === 'play', null, 5000);
      assert.deepEqual(await page.evaluate(() => [Player.coins, Player.x]), [64, 1111]);
    } finally {
      await A.close(app);
      A.removeProfile(profile);
    }
  });
});
