import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
fs.mkdirSync("test-results/browser", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.CHECK_ORIGIN || "http://localhost:8787");
await page.screenshot({path:"test-results/browser/desktop-login.png",fullPage:true});
await page.getByRole("button", { name: "体验老师工作台" }).click();
await page.getByRole("heading", { name: /今天辛苦了/ }).waitFor();
await page.screenshot({
  path: "test-results/browser/desktop-dashboard.png",
  fullPage: true,
});
assert.equal(await page.locator(".student-row").count(), 15);
await page.getByRole("button", { name: "集中确认", exact: true }).click();
await page.getByRole("heading", { name: "只看需要你确认的题" }).waitFor();
assert.equal(await page.locator(".question-card").count(), 5);
await page
  .locator(".question-card")
  .first()
  .getByRole("button", { name: "其实是对的" })
  .click();
await page.waitForFunction(
  () => document.querySelectorAll(".question-card").length === 4,
);
await page.screenshot({
  path: "test-results/browser/desktop-review.png",
  fullPage: true,
});
await page
  .locator(".sidebar")
  .getByRole("button", { name: "错题本", exact: true })
  .click();
await page
  .locator(".question-card")
  .first()
  .getByRole("button", { name: /巩固练习/ })
  .click();
await page.getByRole("dialog").waitFor();
assert.equal(await page.locator(".exercise").count(), 3);
await page.getByRole("button", { name: "查看答案与解析" }).click();
assert.equal(await page.locator(".exercise-answer").count(), 3);
await page.getByRole("button", { name: "修改题目、答案或解析" }).click();
const explanationInput = page.getByLabel("第 1 题解析");
await explanationInput.fill(
  (await explanationInput.inputValue()) + "（老师已核对）",
);
await page.getByRole("button", { name: "保存练习", exact: true }).click();
await page
  .locator(".exercise-answer")
  .first()
  .getByText(/老师已核对/)
  .waitFor();
await page.getByRole("button", { name: "关闭", exact: true }).click();
await page
  .locator(".sidebar")
  .getByRole("button", { name: "学情周报", exact: true })
  .click();
await page.getByRole("button", { name: "生成并预览" }).nth(5).click();
await page.getByRole("dialog").waitFor();
await page
  .getByLabel("给家长的一句话（选填）")
  .fill("这周愿意主动订正了，继续保持。");
await page.waitForTimeout(5500);
assert.ok(
  await page
    .getByLabel("给家长的一句话（选填）")
    .evaluate((el) => document.activeElement === el),
  "background refresh must preserve input focus",
);
await page.getByRole("button", { name: "确认内容并生成链接" }).click();
await page.locator(".share-url").waitFor();
const shareUrl = await page.locator(".share-url").innerText(),
  pin = await page.locator(".pin").innerText();
await page.screenshot({
  path: "test-results/browser/desktop-report.png",
  fullPage: true,
});
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
await mobile.addCookies(await context.cookies());
const phone = await mobile.newPage();
phone.on("pageerror", (e) => errors.push(e.message));
await phone.goto(process.env.CHECK_ORIGIN || "http://localhost:8787");
await phone.getByRole("heading", { name: /今天辛苦了/ }).waitFor();
await phone.screenshot({
  path: "test-results/browser/mobile-dashboard.png",
  fullPage: true,
});
await phone.screenshot({
  path: "test-results/browser/mobile-first-screen.png",
});
assert.ok(
  await phone.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth,
  ),
  "mobile must not overflow horizontally",
);
await phone.locator(".mobile-capture").click();
await phone.getByRole("dialog").waitFor();
await phone.screenshot({
  path: "test-results/browser/mobile-upload.png",
  fullPage: true,
});
await phone.getByRole("button", { name: "关闭", exact: true }).click();
await phone
  .locator(".mobile-nav")
  .getByRole("button", { name: "错题本", exact: true })
  .click();
await phone
  .getByRole("heading", { name: "把错题，变成下一次的进步" })
  .waitFor();
await phone.screenshot({
  path: "test-results/browser/mobile-mistakes.png",
  fullPage: true,
});
await phone
  .locator(".mobile-nav")
  .getByRole("button", { name: "学生", exact: true })
  .click();
await phone.locator(".student-card").first().click();
await phone.getByRole("button", { name: "查看逐题批改记录" }).click();
await phone.getByRole("heading", { name: "逐题批改记录" }).waitFor();
await phone.waitForFunction(
  () => document.querySelectorAll(".question-card").length === 8,
);
assert.ok((await phone.getByText("已判正确", { exact: true }).count()) > 0);
await phone.setViewportSize({ width: 360, height: 800 });
assert.ok(
  await phone.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth,
  ),
  "360px must not overflow",
);
await phone.screenshot({
  path: "test-results/browser/mobile-audit-360.png",
  fullPage: true,
});
const parent = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const parentPage = await parent.newPage();
parentPage.on("pageerror", (e) => errors.push(e.message));
await parentPage.goto(shareUrl);
await parentPage.getByLabel("6 位访问码").fill(pin);
await parentPage.getByRole("button", { name: "查看学习周报" }).click();
await parentPage.getByRole("heading", { name: /的学习周报/ }).waitFor();
assert.ok(
  await parentPage.getByText("这周愿意主动订正了，继续保持。").isVisible(),
);
assert.ok(
  await parentPage.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth,
  ),
  "report must not overflow",
);
await parentPage.screenshot({
  path: "test-results/browser/mobile-parent-report.png",
  fullPage: true,
});
assert.deepEqual(errors, []);
console.log(
  JSON.stringify(
    {
      passed: true,
      studentCount: 15,
      review: true,
      practice: true,
      reportSharing: true,
      mobileWidths: [390],
      browserErrors: errors,
      screenshots: "test-results/browser",
    },
    null,
    2,
  ),
);
await browser.close();
