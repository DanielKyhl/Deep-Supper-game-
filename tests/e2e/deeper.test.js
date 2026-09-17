'use strict';
/* The deeper systems in the real desktop app with a real keyboard: a heavy
   blow held and let go, a sting drawn out with a bandage, the bestiary,
   lightning on the screen and the options that tame it, quiet nights, and
   achievements that are still there when the app opens again, and the
   bucket of chum that brings the Old One back after it has won. */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../helpers/app');

// a fight on deck against `id`, the creature holding back from attacking
async function fightOn(page, id, player) {
  await page.evaluate(([id, player]) => {
    Object.assign(Player, { introDone: true, totalKills: 1, girlMet: true }, player);
    Player.x = 1000;
    Cam.snap(1000);
    Game.startBattle(monsterDef(id));
  }, [id, player]);
  await A.until(page, () => Battle.phase === 'fight', null, 6000);
  await page.evaluate(() => {
    Object.assign(Battle.m, { cool: 1e9, state: 'idle' });
    Object.assign(Player, { x: Battle.m.x - 120, face: 1 });
  });
}

// how bright a band across the top of the screen is, 0 to 255
function skyBrightness(page) {
  return page.evaluate(async () => {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    const x = c.getContext('2d');
    x.drawImage(canvas, 0, 0);
    const d = x.getImageData(0, Math.round(c.height * .05), c.width, Math.round(c.height * .1)).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return sum / (d.length / 4);
  });
}

// from play, through the pause menu, to an options screen
async function openOptions(page, screen) {
  await page.keyboard.press('Escape');
  await A.until(page, () => Game.state === 'pause');
  await A.choose(page, 'options');
  await A.choose(page, screen);
  await A.until(page, s => Menu.top() === s, screen);
}

// step back out of the menus to the deck
async function backToPlay(page) {
  for (let i = 0; i < 5 && await page.evaluate(() => Game.state !== 'play'); i++) {
    const top = await page.evaluate(() => Menu.top());
    await page.keyboard.press('Escape');
    await A.until(page, top => Game.state === 'play' || Menu.top() !== top, top, 3000);
  }
  assert.equal(await page.evaluate(() => Game.state), 'play');
}

describe('the deeper systems in the app', () => {
  let profile, app, page;
  const errors = [];

  before(async () => {
    profile = A.tempProfile();
    ({ app, page } = await A.launch(profile));
    page.on('pageerror', e => errors.push(e.message));
    await A.startVoyage(page);
  });
  after(async () => { await A.close(app); A.removeProfile(profile); });

  test('holding J winds up a Cleave, and letting go swings it: the Tidemaw bleeds', async () => {
    await fightOn(page, 'tidemaw', { weapon: 2 });
    await page.keyboard.down('KeyJ');
    try {
      await A.until(page, () => Player.chargeReady, null, 5000);
      assert.equal(await page.evaluate(() => Player.bState), 'charge');
    } finally {
      await page.keyboard.up('KeyJ');
    }
    await A.until(page, () => Player.heavy, null, 2000);
    await A.until(page, () => Status.bleeding(Battle.m) || Battle.m.hp <= 0, null, 3000);
    const s = await page.evaluate(() => ({ charge: Player.chargeT, hp: Battle.m.hp < Battle.m.maxHp }));
    assert.deepEqual(s, { charge: 0, hp: true });
  });

  test("the Weeping Bell's stingers poison him, and Q with a bandage draws the sting out", async () => {
    await page.evaluate(() => Game.endBattle(true));
    await A.until(page, () => Game.state === 'play', null, 6000);
    await page.evaluate(() => { Dialogue.hide(); Game.msgs = []; });
    await fightOn(page, 'weepingbell', { weapon: 1, bandages: 2, hp: 4, maxHp: 5, invuln: 0 });
    await page.evaluate(() => { Player.invuln = 0; Battle.curtains.push({ x: Player.x, w: 200, t: .79, warn: .8, on: .55 }); });
    await A.until(page, () => Status.poisoned(Player), null, 2000);
    await A.until(page, () => Battle.curtains.length === 0, null, 3000);
    assert.equal(await page.evaluate(() => Status.poisoned(Player)), true, 'still stung, before it costs a heart');
    await page.keyboard.press('KeyQ');
    await A.until(page, () => !Status.poisoned(Player), null, 2000);
    assert.equal(await page.evaluate(() => Player.bandages), 1);
    await page.evaluate(() => Game.endBattle(true));
    await A.until(page, () => Game.state === 'play', null, 6000);
    await page.evaluate(() => { Dialogue.hide(); Game.msgs = []; });
  });

  test('the Bestiary opens from the pause menu: the arrows turn its chapters, ENTER reads an entry, and ESC closes it', async () => {
    await page.keyboard.press('Escape');
    await A.until(page, () => Game.state === 'pause');
    assert.match(await page.evaluate(() => Menu.items('pause').find(i => i.id === 'bestiary').label), /Bestiary {2}\(\d+\/\d+\)/);
    await A.choose(page, 'bestiary');
    await A.until(page, () => !!Bestiary.book);
    await page.keyboard.press('ArrowRight');
    await A.until(page, () => Bestiary.book.chapter === 1, null, 2000);
    await page.keyboard.press('Enter');
    await A.until(page, () => Bestiary.book.page === true, null, 2000);
    await page.keyboard.press('Escape');
    await A.until(page, () => Bestiary.book.page === false, null, 2000);
    await page.keyboard.press('Escape');
    await A.until(page, () => !Bestiary.book, null, 2000);
    assert.equal(await page.evaluate(() => Menu.top()), 'pause');
    await backToPlay(page);
  });

  test('a storm at sea: lightning lights up the screen, and with Lightning flashes off it does not', async () => {
    await page.evaluate(() => {
      Weather.begin();
      Object.assign(Weather, { phase: 'raging', storm: 1, hold: 1e9, boltT: 1e9 });
    });
    await page.waitForTimeout(400);
    const dark = await skyBrightness(page);
    await page.evaluate(() => Weather.strike());
    const lit = await skyBrightness(page);
    assert.ok(lit - dark > 40, 'the flash: ' + dark.toFixed(0) + ' -> ' + lit.toFixed(0));

    await openOptions(page, 'graphics');
    await A.choose(page, 'flashes');      // full -> soft
    await A.until(page, () => Settings.get('flashes') === 'soft');
    await page.keyboard.press('Enter');   // soft -> off
    await A.until(page, () => Settings.get('flashes') === 'off');
    await backToPlay(page);

    await page.waitForTimeout(500);
    const before = await skyBrightness(page);
    const struck = await page.evaluate(() => !!Weather.strike());
    const after = await skyBrightness(page);
    assert.equal(struck, true, 'the bolt still strikes');
    assert.ok(Math.abs(after - before) < 12, 'no flash: ' + before.toFixed(0) + ' -> ' + after.toFixed(0));
    await page.evaluate(() => Weather.reset());
  });

  test('on a quiet night something strange happens, unless Strange things at night is off', async () => {
    const quiet = await page.evaluate(() => { CUT.harbourX = Math.min(CUT.harbourX, -1400); Game.night = 1; return Omens.quiet(); });
    assert.equal(quiet, true);
    await page.evaluate(() => { SeaDice.chance = () => true; Omens.next = .3; });
    await A.until(page, () => !!Omens.active, null, 4000);
    await page.evaluate(() => { Omens.active = null; });

    await openOptions(page, 'gameplay');
    await A.choose(page, 'unease');
    await A.until(page, () => Settings.get('unease') === false);
    await backToPlay(page);
    await page.evaluate(() => { Omens.next = .3; });
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => Omens.active), null, 'nothing, all night');
  });

  test('the fullscreen shortcut is named for the machine: F11, or CTRL+CMD+F on a Mac', async () => {
    const line = await page.evaluate(() => Menu.items('controls').map(i => i.label).find(l => /Fullscreen:/.test(l)));
    assert.match(line, process.platform === 'darwin' ? /Fullscreen: CTRL\+CMD\+F$/ : /Fullscreen: F11$/);
  });

  test('an achievement earned at sea shows its card, and the screen has it', async () => {
    await page.evaluate(() => { Player.sold = 1; });
    await A.until(page, () => Achievements.has('first_sale'), null, 4000);
    await A.until(page, () => !!Achievements.toast, null, 4000);
    assert.equal(await page.evaluate(() => Player.shortcut), false);
    assert.deepEqual(errors, []);
  });

  test('after closing and reopening, the achievement and both settings are still there', async () => {
    await A.close(app);
    ({ app, page } = await A.launch(profile));
    const s = await page.evaluate(() => ({ flashes: Settings.get('flashes'), unease: Settings.get('unease'), sale: Achievements.has('first_sale') }));
    assert.deepEqual(s, { flashes: 'off', unease: false, sale: true });
    await A.choose(page, 'achievements');
    await A.until(page, () => !!Achievements.book);
    await page.keyboard.press('ArrowRight');
    await A.until(page, () => Achievements.book.page === 1, null, 2000);
    await page.keyboard.press('Escape');
    await A.until(page, () => !Achievements.book && Menu.top() === 'main', null, 2000);
  });
});

describe('a rematch with the Old One in the app', () => {
  let profile, app, page;
  before(async () => {
    profile = A.tempProfile();
    ({ app, page } = await A.launch(profile));
    await A.startVoyage(page);
  });
  after(async () => { await A.close(app); A.removeProfile(profile); });

  test('the Old One wins, Dorran sells a Bucket of Chum, bought with the keys, and the next bite is the Old One', async () => {
    await fightOn(page, 'leviathan', { weapon: 5, rod: 3, coins: 2000 });
    await page.evaluate(() => { Object.assign(Player, { hp: 1, invuln: 0 }); Battle._hurtPlayer(1, Player.x + 40); });
    await A.until(page, () => Game.state === 'play' && Dialogue.active, null, 10000);
    const lines = [];
    for (let i = 0; i < 8 && await page.evaluate(() => Dialogue.active); i++) {
      await A.until(page, () => Dialogue.done, null, 5000);
      lines.push(await page.evaluate(() => Dialogue.full));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(150);
    }
    assert.ok(lines.some(l => /bucket/.test(l)), lines.join(' | '));

    const key = await page.evaluate(() => Player.x > STALL_X ? 'KeyA' : 'KeyD');
    await A.holdUntil(page, key, () => Math.abs(Player.x - STALL_X) < 60, null, 8000);
    await page.keyboard.press('KeyE');
    await A.until(page, () => Game.state === 'shop');
    for (let i = 0; i < 3 && await page.evaluate(() => Shop.tab !== 2); i++) {
      const tab = await page.evaluate(() => Shop.tab);
      await page.keyboard.press('ArrowRight');
      await A.until(page, tab => Shop.tab !== tab, tab, 2000);
    }
    for (let i = 0; i < 6 && await page.evaluate(() => Shop.rows()[Shop.sel].id !== 'chum'); i++) {
      const sel = await page.evaluate(() => Shop.sel);
      await page.keyboard.press('ArrowDown');
      await A.until(page, sel => Shop.sel !== sel, sel, 2000);
    }
    const coins = await page.evaluate(() => Player.coins);
    await page.keyboard.press('KeyE');
    await A.until(page, () => Player.chum === true, null, 2000);
    assert.equal(await page.evaluate(() => Player.coins), coins - 250);
    await page.keyboard.press('Escape');
    await A.until(page, () => Game.state === 'play');

    await A.holdUntil(page, 'KeyD', () => Player.x > FISH_X - 40, null, 8000);
    await page.keyboard.press('KeyE');
    await A.until(page, () => Game.state === 'fish', null, 2000);
    await A.until(page, () => Fishing.phase === 'bite', null, 30000);
    assert.equal(await page.evaluate(() => Fishing.target.id), 'leviathan');
  });
});
