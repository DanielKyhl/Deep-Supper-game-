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

// move the menu cursor to an item by id and press ENTER
async function choose(page, id) {
  const n = await page.evaluate(id => Menu.items(Menu.top()).length, id);
  for (let i = 0; i < n * 2; i++) {
    const on = await page.evaluate(id => {
      const items = Menu.items(Menu.top());
      const sel = Menu.sel[Menu.top()];
      const it = items[sel === undefined ? Menu.firstSelectable(items) : sel];
      return !!it && (it.id === id || it.key === id || it.action === id);
    }, id);
    if (on) break;
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(60);
  }
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

module.exports = { ROOT, tempProfile, removeProfile, appEnv, launch, close, until, hold, choose, startVoyage };
