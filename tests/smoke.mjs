import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const chromePath = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    if (!existsSync(chromePath)) throw error;
    return chromium.launch({ headless: true, executablePath: chromePath });
  }
}

async function enterGame(page, gender = "male", nickname) {
  await page.locator("[data-intro-timer]").waitFor({ timeout: 30000 });
  await page.keyboard.press("Escape");
  await page.locator(`[data-gender=${gender}]`).click();
  if (nickname) await page.locator("#nickname-input").fill(nickname);
  await page.locator("#start-game").click();
  await page.locator("#hud:not(.hidden)").waitFor();
}

function secondsFromHud(text) {
  const match = text.match(/剩余时间\s*(\d{2}):(\d{2})/);
  assert.ok(match, `倒计时未显示：${text}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
let browser;

try {
  browser = await launchBrowser();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl);
  await enterGame(page, "male", "测试牛马");
  await page.locator("#sound-toggle").click();
  assert.equal(await page.locator("#sound-toggle").getAttribute("aria-label"), "开启音效");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#overlay h1").innerText(), "暂停中");
  const pausedAt = secondsFromHud(await page.locator("#hud").innerText());
  await page.waitForTimeout(1250);
  assert.equal(secondsFromHud(await page.locator("#hud").innerText()), pausedAt, "暂停期间倒计时变化");
  await page.locator("#resume").click();
  await page.waitForTimeout(1250);
  assert.ok(secondsFromHud(await page.locator("#hud").innerText()) < pausedAt, "恢复后倒计时未继续");
  await page.keyboard.press("Escape");
  await page.locator("#leave-now").click();
  assert.equal(await page.locator(".result-profile-copy strong").innerText(), "测试牛马");
  assert.deepEqual(
    await page.locator(".result-panel > section").evaluateAll((nodes) => nodes.map((node) => node.className)),
    ["result-profile", "achievement-section", "result-attributes"],
    "普通结算区块顺序应为工牌、成就框、雷达图",
  );
  assert.equal(await page.locator(".achievement-card--featured .achievement-rank").innerText(), "C");
  assert.match(await page.locator(".achievement-list").innerText(), /早退/);
  assert.deepEqual(await page.locator("canvas.share-preview").evaluate((node) => [node.width, node.height > 1500]), [1080, true]);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator("#orientation-hint").isVisible(), false, "竖屏结算不应被旋转提示遮挡");
  assert.ok(await page.locator("canvas.share-preview").isVisible(), "竖屏结算长图应可预览");
  await page.close();

  const fastPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  fastPage.on("pageerror", (error) => errors.push(error.message));
  await fastPage.route("**/src/main.ts*", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    assert.ok(source.includes("const ROUND_SECONDS = 180;"), "未找到待加速的局时长");
    await route.fulfill({ response, body: source.replace("const ROUND_SECONDS = 180;", "const ROUND_SECONDS = 1.3;") });
  });
  await fastPage.goto(baseUrl);
  await enterGame(fastPage, "female");
  const expected = ["办公室", "会议室", "茶水间", "公司前台", "老板办公室"];
  for (const [index, name] of expected.entries()) {
    assert.match(await fastPage.locator("#hud .hud-row").first().innerText(), new RegExp(name));
    if (index < expected.length - 1) {
      await fastPage.locator("#overtime").waitFor({ timeout: 15000 });
      await fastPage.locator("#overtime").click();
    }
  }
  await fastPage.locator("#overlay h1").filter({ hasText: "加班猝死" }).waitFor({ timeout: 15000 });
  assert.equal(await fastPage.locator(".achievement-section-heading h2").first().innerText(), "最终成就");
  assert.equal(await fastPage.locator(".achievement-card--featured .achievement-rank").innerText(), "S");
  assert.deepEqual(
    await fastPage.locator(".result-panel > section").evaluateAll((nodes) => nodes.map((node) => node.className)),
    ["result-profile", "achievement-section"],
    "猝死结算不应泄露雷达图或过程成就",
  );
  await fastPage.close();

  const rankPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  rankPage.on("pageerror", (error) => errors.push(error.message));
  await rankPage.route("**/src/main.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace("const ROUND_SECONDS = 180;", "const ROUND_SECONDS = 1.3;") });
  });
  await rankPage.goto(baseUrl);
  await enterGame(rankPage);
  await rankPage.locator("#overtime").waitFor({ timeout: 15000 });
  await rankPage.locator("#overtime").click();
  await rankPage.keyboard.press("Escape");
  await rankPage.locator("#leave-now").click();
  assert.deepEqual(await rankPage.locator(".achievement-card .achievement-rank").allTextContents(), ["B", "B"], "第二局下班与中途离场均应为 B 级");
  await rankPage.close();

  const mobile = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  mobile.on("pageerror", (error) => errors.push(error.message));
  await mobile.goto(baseUrl);
  await enterGame(mobile);
  assert.ok(await mobile.locator("#mobile-pause").isVisible(), "手机横屏暂停按钮未显示");
  assert.ok(await mobile.locator("[data-dir=right]").isVisible(), "手机方向键未显示");
  await mobile.locator("#mobile-pause").click();
  assert.equal(await mobile.locator("#overlay h1").innerText(), "暂停中");
  await mobile.close();

  const featurePage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  featurePage.on("pageerror", (error) => errors.push(error.message));
  await featurePage.route("**/src/main.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__testApp = app;` });
  });
  await featurePage.goto(baseUrl);
  await enterGame(featurePage);
  const stacked = await featurePage.evaluate(() => {
    const app = window.__testApp;
    for (let index = 0; index < 25; index++) app.addPot();
    for (let index = 0; index < 4; index++) app.addPancake();
    for (let index = 0; index < 3; index++) app.addRage();
    app.gameScene.updatePlayerVisuals();
    return {
      pots: app.state.pots,
      potVisuals: app.gameScene.potVisuals.length,
      pancakes: app.state.pancakes,
      rage: app.state.rage,
      playerScale: app.gameScene.playerSprite.scaleX / app.gameScene.playerBaseScale,
      tint: app.gameScene.playerSprite.tintTopLeft,
      potBlockWidth: app.gameScene.getBackPotRect().width,
    };
  });
  assert.equal(stacked.pots, 25, "背锅数量不应有上限");
  assert.equal(stacked.potVisuals, 25, "每口锅都应在角色身后叠加绘制");
  assert.equal(stacked.pancakes, 4);
  assert.equal(stacked.rage, 3);
  assert.ok(stacked.playerScale > 1.19, "吃饼变胖应与背锅并存");
  assert.equal(stacked.tint, 0xff6575, "红温着色应与背锅、变胖并存");
  assert.equal(stacked.potBlockWidth, 36, "叠锅不应扩大激光格挡范围");

  const position = () => featurePage.evaluate(() => ({ x: window.__testApp.gameScene.player.x, y: window.__testApp.gameScene.player.y }));
  await featurePage.keyboard.down("a");
  await featurePage.waitForTimeout(100);
  await featurePage.keyboard.down("d");
  const beforeRight = await position();
  await featurePage.waitForTimeout(160);
  const afterRight = await position();
  assert.ok(afterRight.x > beforeRight.x, "同时按左右键时应以后按的右键为准");
  const animation = await featurePage.evaluate(() => {
    const scene = window.__testApp.gameScene;
    return {
      playingRunFrame: scene.playerSprite.texture.key.includes("-run-"),
      allFramesLoaded: ["male", "female"].every((gender) =>
        [0, 1, 2, 3].every((index) => scene.textures.exists(`office-worker-${gender}-run-${index}`))),
    };
  });
  assert.ok(animation.playingRunFrame, "移动时未切换到逐帧动作");
  assert.ok(animation.allFramesLoaded, "男女角色四帧移动动作未全部加载");
  await featurePage.keyboard.up("a");
  await featurePage.keyboard.up("d");
  await featurePage.keyboard.down("s");
  await featurePage.waitForTimeout(100);
  await featurePage.keyboard.down("w");
  const beforeUp = await position();
  await featurePage.waitForTimeout(160);
  const afterUp = await position();
  assert.ok(afterUp.y < beforeUp.y, "同时按上下键时应以后按的上键为准");
  await featurePage.keyboard.up("s");
  await featurePage.keyboard.up("w");

  await featurePage.keyboard.press("Escape");
  assert.ok(await featurePage.locator(".pause-art-image").isVisible(), "暂停插画未显示");
  const pauseVariants = await featurePage.evaluate(() => {
    const app = window.__testApp;
    return ["toilet", "phone"].flatMap((mode) => {
      app.pauseMode = mode;
      return [false, true].map((flipped) => {
        app.renderPause(flipped);
        return new URL(document.querySelector(".pause-art-image").src).pathname;
      });
    });
  });
  assert.equal(new Set(pauseVariants).size, 4, "两种暂停与两种翻车画面应各有独立插画");
  assert.ok(pauseVariants.every((path) => !path.includes("-female")), "男主角暂停不应显示女主角插画");
  await featurePage.close();

  const femalePage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  femalePage.on("pageerror", (error) => errors.push(error.message));
  await femalePage.route("**/src/main.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__testApp = app;` });
  });
  await femalePage.goto(baseUrl);
  await enterGame(femalePage, "female");
  await femalePage.keyboard.press("Escape");
  const femaleVariants = await femalePage.evaluate(() => {
    const app = window.__testApp;
    return ["toilet", "phone"].flatMap((mode) => {
      app.pauseMode = mode;
      return [false, true].map((flipped) => {
        app.renderPause(flipped);
        return new URL(document.querySelector(".pause-art-image").src).pathname;
      });
    });
  });
  assert.equal(new Set(femaleVariants).size, 4, "女主角两种暂停与翻车画面应各有独立插画");
  assert.ok(femaleVariants.every((path) => path.includes("-female")), "女主角暂停应使用女主角专属插画");
  await femalePage.close();

  const laserPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  laserPage.on("pageerror", (error) => errors.push(error.message));
  await laserPage.route("**/src/main.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__testApp = app;` });
  });
  await laserPage.goto(baseUrl);
  await enterGame(laserPage);
  const laserOrder = await laserPage.evaluate(() => {
    const app = window.__testApp;
    const scene = app.gameScene;
    const initialY = scene.player.y;
    scene.spawnLaser({ container: { x: scene.player.x - 100 } });
    const laser = scene.lasers.at(-1);
    const lockedY = laser.lockedY;
    const tellMs = laser.activeAt - laser.bornAt;
    scene.player.y = initialY - 120;
    scene.elapsedMs = laser.activeAt - 1;
    scene.updateLasers(0);
    const warning = { markerVisible: laser.lockMarker.visible, lineY: laser.warning.y, beamAlpha: laser.rect.alpha };
    scene.elapsedMs = laser.activeAt + 1;
    scene.updateLasers(0);
    const fired = { markerVisible: laser.lockMarker.visible, beamY: laser.rect.y, beamAlpha: laser.rect.alpha, rage: app.state.rage };
    scene.player.y = initialY;
    scene.updateLasers(0);
    return { tellMs, lockedY, warning, fired, rageOnReturn: app.state.rage };
  });
  assert.equal(laserOrder.tellMs, 500, "甲方激光应先预警 0.5 秒");
  assert.equal(laserOrder.warning.lineY, laserOrder.lockedY, "预警线应落在先锁定的目标位置");
  assert.equal(laserOrder.warning.markerVisible, true, "发射前应显示锁定标记");
  assert.equal(laserOrder.warning.beamAlpha, 0, "锁定阶段不可提前发射");
  assert.equal(laserOrder.fired.beamY, laserOrder.lockedY, "发射后不得重新追踪目标");
  assert.equal(laserOrder.fired.markerVisible, false, "发射后应隐藏锁定标记");
  assert.ok(laserOrder.fired.beamAlpha > 0, "锁定结束后激光应可见");
  assert.equal(laserOrder.fired.rage, 0, "预警期间躲开锁定线应避开激光");
  assert.equal(laserOrder.rageOnReturn, 1, "重新进入锁定线应受到激光命中");
  await laserPage.close();

  const portrait = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await portrait.goto(baseUrl);
  assert.ok(await portrait.locator("#orientation-hint").isVisible(), "手机竖屏旋转提示未显示");
  await portrait.close();

  assert.deepEqual(errors, [], "浏览器运行时错误");
  console.log("五场景、男女暂停八画面、激光先锁定再发射、Buff 叠加、男女移动帧与手机适配烟雾测试通过。");
} finally {
  await browser?.close();
  await server.close();
}
