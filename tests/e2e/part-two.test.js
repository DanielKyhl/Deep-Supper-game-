'use strict';
/* The newer parts of the game, in the real desktop app with a real
   keyboard: dialogue that waits, save slots, the test shortcuts, diving,
   and the Mother at the bottom. */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../helpers/app');

async function backToTitle(page) {
  await page.keyboard.press('Escape');
  await A.until(page, () => Game.state === 'pause');
  await A.choose(page, 'title');
  await A.until(page, () => Game.state === 'menu' && Game.fade.dir === 0, null, 5000);
}

describe('dialogue and save slots in the app', () => {
  let profile, app, page;
  before(async () => { profile = A.tempProfile(); ({ app, page } = await A.launch(profile)); });
  after(async () => { await A.close(app); A.removeProfile(profile); });

  test('a line on deck stays until a key is pressed, then moves on', async () => {
    await A.choose(page, 'new');
    await A.until(page, () => Game.state === 'cutscene');
    await page.keyboard.down('Escape');
    await A.until(page, () => Game.state === 'play', null, 5000);
    await page.keyboard.up('Escape');
    await A.until(page, () => Dialogue.active && Dialogue.done, null, 8000);
    const first = await page.evaluate(() => Dialogue.full);
    await page.waitForTimeout(3000);
    assert.equal(await page.evaluate(() => Dialogue.full), first, 'still waiting three seconds later');
    await page.keyboard.press('KeyE');
    await A.until(page, first => Dialogue.full !== first || !Dialogue.active, first, 3000);
  });

  test('Save game puts the voyage in a slot', async () => {
    for (let i = 0; i < 6 && await page.evaluate(() => Dialogue.active); i++) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(150);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => { Player.coins = 808; });
    await page.keyboard.press('Escape');
    await A.until(page, () => Game.state === 'pause');
    await A.choose(page, 'save');
    await A.choose(page, 'slot1');
    await A.until(page, () => Menu.notice.indexOf('slot 1') >= 0);
    assert.equal(await page.evaluate(() => SaveGame.readSlot(1).coins), 808);
  });

  test('back at the title, Load game restores the slot', async () => {
    // one key per frame: wait for each step back before the next
    await page.keyboard.press('Escape');
    await A.until(page, () => Menu.top() === 'pause');
    await page.keyboard.press('Escape');
    await A.until(page, () => Game.state === 'play');
    await page.evaluate(() => { Player.coins = 1; });
    await backToTitle(page);
    assert.ok((await page.evaluate(() => Menu.items('main').map(i => i.label))).includes('Load game'));
    await A.choose(page, 'load');
    await A.choose(page, 'slot1');
    await A.until(page, () => Game.state === 'play' && Game.fade.dir === 0, null, 5000);
    assert.equal(await page.evaluate(() => Player.coins), 808);
  });
});

describe('test shortcuts, diving and the Mother in the app', () => {
  let profile, app, page;
  before(async () => { profile = A.tempProfile(); ({ app, page } = await A.launch(profile)); });
  after(async () => { await A.close(app); A.removeProfile(profile); });

  test('Fight the Old One drops you into the boss fight with the best of everything', async () => {
    await A.choose(page, 'dev');
    await A.choose(page, 'devOldOne');
    await A.until(page, () => Game.state === 'battle', null, 5000);
    const s = await page.evaluate(() => ({ boss: Battle.def.id, weapon: WEAPONS[Player.weapon].id, rod: Player.rod }));
    assert.deepEqual(s, { boss: 'leviathan', weapon: 'tooth', rod: 3 });
    await backToTitle(page);
  });

  test('Start diving: walk to the bow, press E, and he goes over the side', async () => {
    await A.choose(page, 'dev');
    await A.choose(page, 'devDiving');
    await A.until(page, () => Game.state === 'play' && Game.fade.dir === 0, null, 5000);
    await page.keyboard.down('KeyD');
    await A.until(page, () => Player.x > FISH_X - 60, null, 5000);
    await page.keyboard.up('KeyD');
    await page.keyboard.press('KeyE');
    await A.until(page, () => Game.state === 'dive', null, 2000);
    await A.until(page, () => Dive.underwater && Dive.phase === 'swim' && Game.fade.dir === 0, null, 10000);
  });

  test('holding S swims him down, and the depth reading goes up', async () => {
    await page.evaluate(() => { Dive.mobs.length = 0; });
    const y0 = await page.evaluate(() => Dive.p.y);
    await A.hold(page, 'KeyS', 1200);
    const y1 = await page.evaluate(() => Dive.p.y);
    assert.ok(y1 - y0 > 150, 'swam down ' + (y1 - y0));
  });

  test('E at the ladder climbs back aboard', async () => {
    await page.evaluate(() => { Object.assign(Dive.p, { x: DIVE_LADDER_X, y: 40, vx: 0, vy: 0 }); });
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyE');
    await A.until(page, () => Game.state === 'play' && !Dive.underwater, null, 5000);
    assert.match(await page.evaluate(() => Game.toastText), /Back aboard/);
    await backToTitle(page);
  });

  test('Swim to the Mother: swimming into the gate starts her scene', async () => {
    await A.choose(page, 'dev');
    await A.choose(page, 'devMother');
    await A.until(page, () => Dive.underwater && Dive.phase === 'swim' && Game.fade.dir === 0, null, 6000);
    await page.evaluate(() => { Dive.mobs.length = 0; });
    await page.keyboard.down('KeyD');
    await A.until(page, () => Dive.phase === 'scene', null, 8000);
    await page.keyboard.up('KeyD');
    const s = await page.evaluate(() => ({ boss: !!Dive.boss, girl: Dive.girl.visible, music: Music.themeName }));
    assert.equal(s.boss, true);
    assert.equal(s.girl, true);
  });

  test('holding ESC skips her speech, and the fight is on', async () => {
    await page.keyboard.down('Escape');
    await A.until(page, () => Dive.phase === 'swim', null, 6000);
    await page.keyboard.up('Escape');
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({ state: Dive.boss.state, hp: Dive.boss.hp === Dive.boss.maxHp, music: Music.themeName }));
    assert.notEqual(s.state, 'scene');
    assert.equal(s.hp, true);
    assert.equal(s.music, 'abyss');
  });
});
