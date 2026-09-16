import { chromium } from "playwright";
import sharp from "sharp";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
await page.goto(process.env.CHECK_ORIGIN || "http://localhost:8787");
await page.getByRole("button", { name: "体验老师工作台" }).click();
await page.getByRole("heading", { name: /今天辛苦了/ }).waitFor();
await page.locator(".mobile-capture").click();
const input = page.locator("input[type=file][multiple]");
const photo = await sharp({
  create: { width: 2600, height: 3600, channels: 3, background: "white" },
})
  .png()
  .toBuffer();
await input.setInputFiles({
  name: "synthetic.png",
  mimeType: "image/png",
  buffer: photo,
});
await page.getByRole("button", { name: "提交 1 页，开始批改" }).waitFor();
assert.equal(await page.locator(".photo-preview").count(), 1);
let requests = [];
await page.route("**/api/jobs", async (route) => {
  requests.push(route.request().postDataBuffer().toString("latin1"));
  await route.fulfill({
    status: requests.length === 1 ? 503 : 202,
    contentType: "application/json",
    body: JSON.stringify(
      requests.length === 1
        ? { error: "模拟网络故障，请重试" }
        : { ids: ["ui-test-job"] },
    ),
  });
});
await page.getByRole("button", { name: "提交 1 页，开始批改" }).click();
await page.getByRole("alert").waitFor();
assert.equal(
  await page.locator(".photo-preview").count(),
  1,
  "failed uploads retain photos",
);
await page.getByRole("button", { name: "提交 1 页，开始批改" }).click();
await page.getByRole("heading", { name: /的 1 页作业已收到/ }).waitFor();
const keys = requests.map(
  (r) => r.match(/name="idempotencyKey"\r\n\r\n([^\r]+)/)?.[1],
);
assert.ok(
  keys[0] && keys[0] === keys[1],
  "retry must retain the idempotency key",
);
assert.ok(
  requests[0].includes("image/jpeg"),
  "client converts the upload to compressed JPEG",
);
await page.getByRole("button", { name: "继续上传这位学生的其他科目" }).click();
assert.equal(await page.locator(".photo-preview").count(), 0);
assert.equal(
  await page.locator(".subject-selector button.active").innerText(),
  "英语",
);
await page.getByRole("button", { name: "关闭", exact: true }).click();
await page
  .locator(".mobile-nav")
  .getByRole("button", { name: "周报", exact: true })
  .click();
await page.getByRole("button", { name: "一键准备全班周报" }).click();
await page.waitForFunction(
  () => document.querySelectorAll(".report-card .status").length === 11,
);
console.log(
  JSON.stringify({
    passed: true,
    mobileUpload: true,
    compression: true,
    failureRecovery: true,
    retryIdempotency: true,
    nextSubject: true,
    batchReports: 11,
    realModelCalls: 0,
  }),
);
await browser.close();
