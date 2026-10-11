// Regression checks for settings edits, failed date switches and cached reports.
// Start the Vite dev server on 1430, then run:
//   node scripts/recovery-check.mjs [output-directory]
// Uses the same optional playwright-core + local Edge as visual-check.mjs.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const output = process.argv[2] ?? "artifacts/frontend-recovery";
const base = process.env.PC_INSIGHT_URL ?? "http://127.0.0.1:1430/";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.EDGE_PATH ??
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const results = [];

async function run(name, check) {
  const context = await browser.newContext({
    viewport: { width: 1360, height: 920 },
    locale: "zh-CN",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`${base}?demo=1&fixture=sample&clock=2026-10-08T16:30`);
    await page.locator(".live-strip").waitFor();
    await page.evaluate(async () => {
      const urls = performance.getEntriesByType("resource").map((e) => e.name);
      const apiUrl = urls
        .filter((url) => new URL(url).pathname === "/src/api.ts")
        .at(-1);
      window.recoveryDemoUrl = urls
        .filter((url) => new URL(url).pathname === "/src/demo.ts")
        .at(-1);
      const { api } = await import(apiUrl);
      const read = api.snapshot;
      const write = api.settings;
      const control = (window.recovery = {
        mode: "pass",
        target: null,
        reads: 0,
        writes: 0,
        pending: [],
        writeMode: "pass",
        pendingWrite: null,
      });
      api.snapshot = (s, e) => {
        if (control.target != null && s !== control.target) return read(s, e);
        control.reads++;
        if (control.mode === "fail")
          return Promise.reject(new Error("测试读取失败"));
        if (control.mode === "hold")
          return new Promise((resolve, reject) => {
            control.pending.push({
              start: s,
              resolve: () => resolve(read(s, e)),
              reject,
            });
          });
        return read(s, e);
      };
      api.settings = (settings) => {
        control.writes++;
        if (control.writeMode === "hold")
          return new Promise((resolve, reject) => {
            control.pendingWrite = {
              resolve: () => resolve(write(settings)),
              reject,
            };
          });
        return write(settings);
      };
    });
    await check(page);
    assert.deepEqual(errors, [], "no page script errors");
    await page.screenshot({ path: path.join(output, `${name}.png`) });
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    await page
      .screenshot({ path: path.join(output, `${name}-failed.png`) })
      .catch(() => {});
    results.push({ name, passed: false, error: String(error) });
    console.error(`FAIL ${name}: ${error}`);
  } finally {
    await context.close();
  }
}

const releaseReads = (page, fail = false) =>
  page.evaluate((reject) => {
    const c = window.recovery;
    c.mode = reject ? "fail" : "pass";
    for (const pending of c.pending.splice(0)) {
      if (reject) pending.reject(new Error("测试读取失败"));
      else pending.resolve();
    }
  }, fail);

try {
  for (const navigation of ["今日概览", "时间线", "工作分析"]) {
    await run(`history-${navigation}`, async (p) => {
      await p.getByRole("button", { name: navigation, exact: true }).click();
      // Analytics preloads the week. Use a date outside that cache.
      await p.evaluate(() => {
        window.recovery.target = new Date(2026, 8, 30).getTime();
        window.recovery.mode = "fail";
        window.recovery.reads = 0;
      });
      await p.locator("input[type=date]").fill("2026-09-30");
      const notice = p.locator(".range-notice.warn");
      await notice.waitFor();
      assert.match(await notice.innerText(), /9月30日.*读取失败/);
      assert.match(await notice.innerText(), /仍是 10月8日/);
      assert.equal(await p.evaluate(() => window.recovery.reads), 1);
      await p.screenshot({
        path: path.join(output, `history-${navigation}-error.png`),
      });
      await p.evaluate(() => {
        window.recovery.mode = "hold";
      });
      await notice.getByRole("button", { name: "重试", exact: true }).click();
      await p.waitForFunction(() => window.recovery.pending.length > 0);
      assert.equal(await notice.getByRole("button").isDisabled(), true);
      assert.match(await notice.innerText(), /正在重试/);
      await releaseReads(p);
      await notice.waitFor({ state: "detached" });
      assert.match(await p.locator(".page-title").innerText(), /9月30日/);
      assert.equal(await p.locator(".page-body.is-transitional").count(), 0);
    });
  }

  for (const scenario of [
    "new-input",
    "back-to-base",
    "refresh-fails",
    "write-fails",
    "unchanged",
  ]) {
    await run(`settings-${scenario}`, async (p) => {
      await p.getByRole("button", { name: "偏好设置", exact: true }).click();
      const input = p.locator("textarea").first();
      const old = await input.inputValue();
      const save = p.getByRole("button", { name: "保存偏好", exact: true });
      await p.evaluate(() => {
        window.recovery.mode = "hold";
        window.recovery.writeMode = "hold";
      });
      await input.fill("saved.exe");
      await save.click();
      await p.waitForFunction(() => !!window.recovery.pendingWrite);
      assert.equal(await input.isEnabled(), true);
      const typed =
        scenario === "back-to-base"
          ? old
          : scenario === "unchanged"
            ? "saved.exe"
            : "typed-during-save.exe";
      if (scenario !== "unchanged") await input.fill(typed);
      // Attempt a duplicate form submission while the first write is held.
      await p
        .locator(".settings-form")
        .evaluate((form) => form.requestSubmit());
      assert.equal(await p.evaluate(() => window.recovery.writes), 1);
      await p.evaluate((fail) => {
        const pending = window.recovery.pendingWrite;
        if (fail) pending.reject(new Error("测试写入失败"));
        else pending.resolve();
      }, scenario === "write-fails");
      await p.waitForFunction(() => window.recovery.pending.length > 0);
      await releaseReads(p, scenario === "refresh-fails");
      await p.waitForFunction(
        () => !document.querySelector('.save-bar button[aria-busy="true"]'),
      );
      assert.equal(await input.inputValue(), typed);
      const persisted = await p.evaluate(
        async () =>
          (await import(window.recoveryDemoUrl)).demo.settings.excludedApps,
      );
      assert.deepEqual(
        persisted,
        scenario === "write-fails" ? [] : ["saved.exe"],
      );
      if (scenario === "write-fails")
        assert.match(await p.locator(".save-state").innerText(), /保存失败/);
      else if (scenario === "unchanged")
        assert.match(
          await p.locator(".save-state").innerText(),
          /偏好与本机一致/,
        );
      else
        assert.match(
          await p.locator(".save-state").innerText(),
          /仍有新的修改未保存/,
        );
      if (scenario === "refresh-fails") {
        await p.evaluate(() => {
          window.recovery.mode = "pass";
        });
        await p.getByRole("button", { name: "重新读取", exact: true }).click();
        assert.equal(await input.inputValue(), typed);
        assert.equal(await p.evaluate(() => window.recovery.writes), 1);
      }
      if (scenario !== "unchanged") {
        assert.equal(await save.isEnabled(), true);
        await p.getByRole("button", { name: "今日概览", exact: true }).click();
        await p.getByRole("dialog", { name: "离开偏好设置？" }).waitFor();
        await p.getByRole("button", { name: "继续编辑", exact: true }).click();
      }
    });
  }

  for (const kind of ["day", "week"]) {
    await run(`report-${kind}`, async (p) => {
      await p.getByRole("button", { name: "回顾报告", exact: true }).click();
      if (kind === "week")
        await p.getByRole("radio", { name: "最近七日", exact: true }).click();
      const exportButton = p.getByRole("button", {
        name: "导出 Markdown",
        exact: true,
      });
      await p.locator(".paper").waitFor();
      assert.equal(await exportButton.isEnabled(), true);
      // Capture an ordinary poll before failing it; the cached model remains usable.
      await p.evaluate(() => {
        window.recovery.mode = "hold";
      });
      await p.waitForFunction(() => window.recovery.pending.length > 0);
      assert.equal(await exportButton.isEnabled(), true);
      await releaseReads(p, true);
      const notice = p.locator(".range-notice.warn");
      await notice.waitFor();
      assert.match(await notice.innerText(), /缓存数据，暂不可导出/);
      assert.match(await notice.innerText(), /10月8日.*读取失败/);
      assert.equal(await p.locator(".paper").count(), 1);
      assert.equal(await exportButton.isDisabled(), true);
      await p.screenshot({
        path: path.join(output, `report-${kind}-stale.png`),
      });
      await p.evaluate(() => {
        window.recovery.mode = "hold";
      });
      await notice.getByRole("button", { name: "重试", exact: true }).click();
      await p.waitForFunction(() => window.recovery.pending.length > 0);
      assert.equal(await exportButton.isDisabled(), true);
      assert.equal(await notice.getByRole("button").isDisabled(), true);
      await releaseReads(p);
      await notice.waitFor({ state: "detached" });
      assert.equal(await exportButton.isEnabled(), true);
      const downloaded = p.waitForEvent("download");
      await exportButton.click();
      const file = await downloaded;
      const stream = await file.createReadStream();
      let markdown = "";
      for await (const chunk of stream) markdown += chunk;
      assert.match(markdown, /演示数据/);
      assert.doesNotMatch(markdown, /CCNA 学习笔记\.md|SPAD research notes/);
    });
  }

  await run("report-invalidated-week", async (p) => {
    await p.getByRole("button", { name: "回顾报告", exact: true }).click();
    await p.getByRole("radio", { name: "最近七日", exact: true }).click();
    await p.locator(".paper").waitFor();
    await p.getByRole("button", { name: "今日概览", exact: true }).click();
    await p.evaluate(() => {
      window.recovery.mode = "hold";
    });
    await p.getByRole("button", { name: "开始记录", exact: true }).click();
    await p.waitForFunction(() => window.recovery.pending.length > 0);
    await p.getByRole("button", { name: "回顾报告", exact: true }).click();
    await p.getByRole("radio", { name: "最近七日", exact: true }).click();
    const notice = p.locator(".range-notice.warn");
    await notice.waitFor();
    const exportButton = p.getByRole("button", {
      name: "导出 Markdown",
      exact: true,
    });
    assert.equal(await exportButton.isDisabled(), true);
    await p.waitForFunction(() => window.recovery.pending.length === 7);
    await p.evaluate(() => {
      const c = window.recovery;
      const today = new Date(2026, 9, 8).getTime();
      for (const pending of c.pending.filter((x) => x.start === today))
        pending.resolve();
      c.pending = c.pending.filter((x) => x.start !== today);
    });
    await p.waitForFunction(() => {
      const text =
        document.querySelector(".range-notice.warn")?.textContent ?? "";
      return text.includes("10月2日") && !text.includes("10月8日");
    });
    assert.equal(await exportButton.isDisabled(), true);
    await releaseReads(p);
    await notice.waitFor({ state: "detached" });
    assert.equal(await exportButton.isEnabled(), true);
  });
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(output, "results.json"),
    JSON.stringify(results, null, 2),
  );
}
if (results.some((r) => !r.passed)) process.exitCode = 1;
