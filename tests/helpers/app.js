'use strict';
/* Launching the real desktop app for end-to-end tests.

   By default this runs Electron against the source tree. Set DEEPSUPPER_EXE
   to a packaged build (dist/win-unpacked/Deep Supper.exe) to test that
   instead. Every launch gets a user-data folder of its own, so saves and
   settings from one test never leak into another, or into your real game. */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');

function tempProfile() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'deepsupper-e2e-'));
}

function removeProfile(dir) {
  // Chromium can hold files open for a moment after exit
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* temp folder: leave it */ }
}

function appEnv(profile) {
  const env = Object.assign({}, process.env, { DEEPSUPPER_USER_DATA: profile });
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

async function launch(profile) {
  const env = appEnv(profile);
  const exe = process.env.DEEPSUPPER_EXE;
  const app = await electron.launch(exe
    ? { executablePath: exe, env, timeout: 30000 }
    : { args: [ROOT], cwd: ROOT, env, timeout: 30000 });
  const page = await app.firstWindow();
  await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state === 'menu', null, { timeout: 20000 });
  // the window only shows after its first paint, and until then no frames run:
  // keys pressed before that would pile up into a single frame's input
  await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    for (let i = 0; i < 200 && !w.isVisible(); i++) await new Promise(r => setTimeout(r, 50));
  });
  const t0 = await page.evaluate(() => Game.t);
  await page.waitForFunction(t0 => Game.t > t0 + .1, t0, { timeout: 10000 });
  return { app, page };
}

// close gracefully, giving localStorage a moment to reach the disk
async function close(app) {
  if (!app) return;
  try {
    const page = app.windows()[0];
    if (page) await page.waitForTimeout(250);
    await app.close();
  } catch (e) { /* already gone */ }
}

// wait for a condition inside the page
function until(page, fn, arg, timeout) {
  return page.waitForFunction(fn, arg, { timeout: timeout || 10000, polling: 50 });
}

async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

// hold a key until a condition holds. The game lets go of every key when its
// window loses focus, so if the desktop steals focus mid-walk the key is
// pressed again rather than the test waiting on a boy who has stopped.
async function holdUntil(page, key, fn, arg, timeout) {
  const end = Date.now() + (timeout || 10000);
  for (;;) {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(fn, arg, { timeout: Math.max(50, Math.min(1000, end - Date.now())), polling: 50 });
      await page.keyboard.up(key);
      return;
    } catch (e) {
      await page.keyboard.up(key);
      if (Date.now() >= end) {
        const at = await page.evaluate(() => ({ state: Game.state, x: Math.round(Player.x), dialogue: Dialogue.active })).catch(() => null);
        e.message += ' (holding ' + key + '; ' + JSON.stringify(at) + ')';
        throw e;
      }
    }
  }
}

// move the menu cursor to an item by id and press ENTER
async function choose(page, id) {
  const cursor = () => page.evaluate(id => {
    const items = Menu.items(Menu.top());
    const sel = Menu.sel[Menu.top()];
    const i = sel === undefined ? Menu.firstSelectable(items) : sel;
    const it = items[i];
    return { i, on: !!it && (it.id === id || it.key === id || it.action === id), n: items.length };
  }, id);
  let c = await cursor();
  for (let k = 0; k < c.n * 2 && !c.on; k++) {
    await page.keyboard.press('ArrowDown');
    // one press, one step: wait for the frame that moves the cursor
    await page.waitForFunction(prev => {
      const items = Menu.items(Menu.top());
      const sel = Menu.sel[Menu.top()];
      return (sel === undefined ? Menu.firstSelectable(items) : sel) !== prev;
    }, c.i, { timeout: 3000, polling: 16 });
    c = await cursor();
  }
  if (!c.on) throw new Error('menu item ' + id + ' not found on ' + await page.evaluate(() => Menu.top()));
  await page.keyboard.press('Enter');
  // some choices (Quit) close the whole app, page included
  await page.waitForTimeout(80).catch(() => {});
}

// from the title menu, through a skipped opening, to free play on deck
async function startVoyage(page) {
  await choose(page, 'new');
  if (await page.evaluate(() => Menu.top() === 'confirmNew')) await choose(page, 'yes');
  await until(page, () => Game.state === 'cutscene');
  await page.keyboard.down('Escape');
  await until(page, () => Game.state === 'play', null, 5000);
  await page.keyboard.up('Escape');
  // read through the boy's first thoughts
  await page.evaluate(() => Settings.set('textSpeed', 'instant'));
  for (let i = 0; i < 6 && await page.evaluate(() => Dialogue.active); i++) {
    await page.waitForTimeout(250);
    await page.keyboard.press('Enter');
  }
  await until(page, () => !Dialogue.active);
}

module.exports = { ROOT, tempProfile, removeProfile, appEnv, launch, close, until, hold, holdUntil, choose, startVoyage };
