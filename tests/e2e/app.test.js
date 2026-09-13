'use strict';
/* The desktop app as a user gets it: one window, a title menu, and a page
   locked down so the game can reach nothing on the machine. */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../helpers/app');

describe('the desktop app', () => {
  let profile, app, page;
  const errors = [];

  before(async () => {
    profile = A.tempProfile();
    ({ app, page } = await A.launch(profile));
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  after(async () => { await A.close(app); A.removeProfile(profile); });

  test('opens one window called Deep Supper, 1280x720 inside, that cannot shrink below 640x360', async () => {
    assert.equal(app.windows().length, 1);
    assert.equal(await page.title(), 'Deep Supper');
    const bounds = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return { content: w.getContentBounds(), visible: w.isVisible() };
    });
    // Windows display scaling can round the content size by a pixel
    assert.ok(Math.abs(bounds.content.width - 1280) <= 2, 'width ' + bounds.content.width);
    assert.ok(Math.abs(bounds.content.height - 720) <= 2, 'height ' + bounds.content.height);
    assert.equal(bounds.visible, true);

    const small = await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setContentSize(200, 100);
      await new Promise(r => setTimeout(r, 300));
      const b = w.getContentBounds();
      w.setContentSize(1280, 720);
      await new Promise(r => setTimeout(r, 300));
      return b;
    });
    assert.ok(small.width >= 638 && small.height >= 358, 'shrank to ' + small.width + 'x' + small.height);
  });

  test('boots into the title menu, with Quit because it is the app', async () => {
    const menu = await page.evaluate(() => ({ state: Game.state, items: Menu.items('main').map(i => i.label) }));
    assert.equal(menu.state, 'menu');
    assert.deepEqual(menu.items, ['New voyage', 'Options', 'Credits', 'Quit']);
  });

  test('the page has no Node.js, only the three-call native bridge', async () => {
    const env = await page.evaluate(() => ({
      require: typeof require, process: typeof process, module: typeof module,
      native: Object.keys(window.native).sort(), isApp: window.native.isApp
    }));
    assert.equal(env.require, 'undefined');
    assert.equal(env.process, 'undefined');
    assert.equal(env.module, 'undefined');
    assert.deepEqual(env.native, ['isApp', 'isFullscreen', 'quit', 'setFullscreen']);
    assert.equal(env.isApp, true);
  });

  test('there is no menu bar', async () => {
    assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu()), null);
  });

  test('the game loop is running on its own', async () => {
    const t0 = await page.evaluate(() => Game.t);
    await page.waitForTimeout(500);
    const t1 = await page.evaluate(() => Game.t);
    assert.ok(t1 - t0 > .25, 'game time advanced ' + (t1 - t0));
  });

  test('the canvas uses whole-number pixel scaling at the default size', async () => {
    const c = await page.evaluate(() => ({ w: canvas.width, h: canvas.height, dpr: devicePixelRatio }));
    assert.equal(c.w % 480, 0, 'canvas ' + c.w + 'x' + c.h + ' at dpr ' + c.dpr);
    assert.equal(c.w / c.h, 16 / 9);
  });

  test('the page cannot navigate away or open new windows', async () => {
    const before = page.url();
    await page.evaluate(() => { try { location.href = 'https://example.com/'; } catch (e) {} });
    await page.waitForTimeout(500);
    assert.equal(page.url(), before);
    const opened = await page.evaluate(() => window.open('https://example.com/') === null);
    assert.equal(opened, true);
    await page.waitForTimeout(300);
    assert.equal(app.windows().length, 1);
  });

  test('it booted and ran without a single script error', async () => {
    await page.reload();
    await A.until(page, () => typeof Game !== 'undefined' && Game.state === 'menu');
    await page.waitForTimeout(800);
    assert.deepEqual(errors, []);
  });
});

describe('only one copy runs at a time', () => {
  test('launching again with the first still open exits instead of opening a second window', async () => {
    const { spawn } = require('child_process');
    const profile = A.tempProfile();
    const { app } = await A.launch(profile);
    try {
      const exe = process.env.DEEPSUPPER_EXE || require('electron');
      const args = process.env.DEEPSUPPER_EXE ? [] : [A.ROOT];
      const second = spawn(exe, args, { env: A.appEnv(profile), stdio: 'ignore' });
      const code = await new Promise((resolve, reject) => {
        const t = setTimeout(() => { second.kill(); reject(new Error('second copy kept running')); }, 20000);
        second.on('exit', c => { clearTimeout(t); resolve(c); });
      });
      assert.equal(code, 0);
      assert.equal(app.windows().length, 1);
    } finally {
      await A.close(app);
      A.removeProfile(profile);
    }
  });
});
