// Browser assertions for the recording/session/review workflow (synthetic data only).
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
const out = process.argv[2] ?? "artifacts/recording-workflow";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.EDGE_PATH ??
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const results = [];
async function run(name, fn) {
  const ctx = await browser.newContext({
    viewport: { width: 1360, height: 920 },
    locale: "zh-CN",
    reducedMotion: "reduce",
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(12000);
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  try {
    await p.goto(
      (process.env.PC_INSIGHT_URL ?? "http://127.0.0.1:1430/") +
        "?demo=1&fixture=sample&clock=2026-10-08T20:00",
    );
    await p.locator(".live-strip").waitFor();
    await p.evaluate(() => {
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((url) => new URL(url).pathname === "/src/demo.ts");
      if (!urls.length) throw new Error("Loaded demo module was not found");
      window.workflowDemoUrl = urls.at(-1);
    });
    await fn(p);
    assert.deepEqual(errors, []);
    await p.screenshot({ path: path.join(out, name + ".png") });
    results.push({ name, passed: true });
    console.log("PASS", name);
  } catch (e) {
    await p
      .screenshot({ path: path.join(out, name + "-failed.png") })
      .catch(() => {});
    results.push({ name, passed: false, error: String(e) });
    console.error("FAIL", name, String(e));
  } finally {
    await ctx.close();
  }
}
async function seed(p) {
  await p.evaluate(async () => {
    const { demo, demoBatches, demoControls } = await import(
      window.workflowDemoUrl
    );
    demoBatches.length = 0;
    demoControls.length = 0;
    demo.projects = [
      {
        id: "p",
        name: "Synthetic course",
        category: "learning",
        keywords: ["Course"],
        color: "#5e7a52",
      },
    ];
    demo.intentId = "p";
    demo.recording = false;
    let t = new Date(2026, 9, 8, 19).getTime();
    const make = (id, ms, process, title, relation, area = 1) => {
      const a = {
        id,
        start: t,
        end: t + ms,
        source: "native",
        role: "primary",
        process,
        title,
        domain: "",
        intentId: "p",
        category: "learning",
        relation,
        state:
          relation === "related"
            ? "focused"
            : relation === "unrelated"
              ? "interruption"
              : "unknown",
        confidence: 0.5,
        reason: "Synthetic fixture",
        idle: false,
        area,
      };
      t += ms;
      return a;
    };
    demo.activities = [
      make("c1", 600000, "msedge.exe", "Course", "related", 0.3),
      make("c2", 300000, "msedge.exe", "Course", "related", 0.4),
      make("chat", 300000, "ChatGPT.exe", "A question", "unknown"),
      make("message", 30000, "Weixin.exe", "Messages", "unrelated"),
      make("dict", 60000, "GoldenDict.exe", "A word", "unknown"),
      make("web", 60000, "msedge.exe", "Unknown website", "unknown"),
      make("c3", 300000, "msedge.exe", "Course", "related"),
    ];
    demo.jobs = [];
  });
  await p.waitForFunction(() =>
    document
      .querySelector(".session-card")
      ?.textContent.includes("Synthetic course"),
  );
}
try {
  await run("start-and-clear-goal", async (p) => {
    await p.locator("#live-intent").selectOption("");
    await p.getByRole("button", { name: "开始记录", exact: true }).click();
    const dialog = p.getByRole("dialog", { name: "选择目标后开始记录" });
    await dialog.waitFor();
    assert.equal(
      await p.evaluate(
        async () => (await import(window.workflowDemoUrl)).demo.recording,
      ),
      false,
    );
    await dialog
      .getByRole("button", { name: "仅记录应用", exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
    assert.match(await p.locator(".live-strip").innerText(), /相关性暂不判断/);
    await p.getByRole("button", { name: "暂停记录", exact: true }).click();
    await p.getByRole("button", { name: "开始记录", exact: true }).click();
    await dialog.waitFor();
    const first = await dialog
      .locator("select option")
      .nth(1)
      .getAttribute("value");
    await dialog.locator("select").selectOption(first);
    await dialog
      .getByRole("button", { name: "选择目标并开始", exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
    await p.locator("#live-intent").selectOption("");
    const confirm = p.getByRole("dialog", { name: "清空当前目标并继续记录？" });
    await confirm.waitFor();
    assert.equal(
      await p.evaluate(
        async () => (await import(window.workflowDemoUrl)).demo.intentId,
      ),
      first,
    );
    await confirm
      .getByRole("button", { name: "仅记录应用", exact: true })
      .click();
    await confirm.waitFor({ state: "detached" });
  });
  await run("session-confirm-undo-and-history", async (p) => {
    await seed(p);
    assert.match(await p.locator(".ledger-main").innerText(), /全天|今日累计/);
    await p.getByRole("button", { name: "查看会话详情", exact: true }).click();
    const drawer = p.locator(".drawer");
    await drawer.waitFor();
    await drawer
      .getByRole("button", { name: "选择辅助学习建议", exact: true })
      .click();
    assert.match(await drawer.innerText(), /预览纠正所选 2 段/);
    await drawer
      .getByRole("button", { name: "预览纠正所选 2 段", exact: true })
      .click();
    const review = p.getByRole("dialog", { name: "预览纠正", exact: true });
    await review
      .getByRole("button", { name: "确认保存纠正", exact: true })
      .waitFor();
    await p.waitForFunction(
      () => !document.querySelector(".dialog-foot .btn-primary")?.disabled,
    );
    assert.match(await review.innerText(), /6 分钟/);
    await p.screenshot({ path: path.join(out, "correction-preview.png") });
    await review
      .getByRole("button", { name: "确认保存纠正", exact: true })
      .click();
    await review.waitFor({ state: "detached" });
    const corrected = await p.evaluate(async () => {
      const { demoBatches, demoSnapshot } = await import(
        window.workflowDemoUrl
      );
      return {
        count: demoBatches.length,
        focus: demoSnapshot(
          new Date(2026, 9, 8).getTime(),
          new Date(2026, 9, 9).getTime(),
        ).stats.focusMs,
      };
    });
    assert.equal(corrected.count, 1);
    assert.equal(corrected.focus, 26 * 60000);
    await drawer.getByRole("button", { name: "关闭详情", exact: true }).click();
    await p.getByRole("button", { name: "时间线", exact: true }).click();
    await p.getByRole("button", { name: "纠正历史", exact: true }).click();
    const history = p.getByRole("dialog", { name: "纠正历史", exact: true });
    await history
      .getByRole("button", { name: "撤销这次纠正", exact: true })
      .click();
    await history
      .getByRole("button", { name: "已撤销", exact: true })
      .waitFor();
    assert.equal(
      await p.evaluate(async () => {
        const { demoSnapshot } = await import(window.workflowDemoUrl);
        return demoSnapshot(
          new Date(2026, 9, 8).getTime(),
          new Date(2026, 9, 9).getTime(),
        ).stats.focusMs;
      }),
      20 * 60000,
    );
  });
  await run("grouped-detail-and-keyword-preview", async (p) => {
    await seed(p);
    await p
      .getByRole("button", { name: "在时间线查看所选会话", exact: true })
      .click();
    assert.match(await p.locator(".spectrum-range").innerText(), /显示范围/);
    assert.match(
      await p.locator(".activity-table-wrap").innerText(),
      /显示 6 组 · 原始 7 段/,
    );
    assert.match(
      await p.locator(".col-time").nth(1).innerText(),
      /\d\d:\d\d:\d\d/,
    );
    await p
      .getByRole("button", { name: "Course", exact: false })
      .filter({ hasText: "合并 2 段" })
      .click();
    const detail = p.locator(".drawer");
    await detail.waitFor();
    await detail.locator("select").first().selectOption("research");
    await detail.getByRole("button", { name: "预览纠正", exact: true }).click();
    const review = p.getByRole("dialog", { name: "预览纠正", exact: true });
    await p.waitForFunction(() =>
      document
        .querySelector(".dialog-body")
        ?.textContent.includes("覆盖 2 条记录"),
    );
    assert.match(await review.innerText(), /15 分钟/);
    await review.getByRole("button", { name: "返回修改", exact: true }).click();
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "放弃修改", exact: true }).click();
    await p.getByRole("button", { name: "我的项目", exact: true }).click();
    await p
      .getByRole("button", { name: "编辑 Synthetic course", exact: true })
      .click();
    await p.getByRole("button", { name: "测试关键词", exact: true }).click();
    await p.waitForFunction(() =>
      document
        .querySelector(".dialog-body")
        ?.textContent.includes("最近七天匹配 3 条记录"),
    );
    assert.match(await p.locator(".dialog-body").innerText(), /没有浏览器域名/);
  });
  await run("correction-saved-refresh-failed", async (p) => {
    await seed(p);
    await p.getByRole("button", { name: "查看会话详情", exact: true }).click();
    await p
      .getByRole("button", { name: "选择辅助学习建议", exact: true })
      .click();
    await p
      .getByRole("button", { name: "预览纠正所选 2 段", exact: true })
      .click();
    const review = p.getByRole("dialog", { name: "预览纠正", exact: true });
    await p.waitForFunction(
      () =>
        document.querySelector(".dialog-foot .btn-primary")?.disabled === false,
    );
    await p.evaluate(async () => {
      const url = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((url) => new URL(url).pathname === "/src/api.ts")
        .at(-1);
      const { api } = await import(url);
      const commit = api.commitCorrections,
        read = api.snapshot;
      window.commitCount = 0;
      let failNext = false;
      api.commitCorrections = async (...args) => {
        window.commitCount++;
        const result = await commit(...args);
        failNext = true;
        return result;
      };
      api.snapshot = (...args) => {
        if (failNext) {
          failNext = false;
          return Promise.reject(new Error("test refresh failure"));
        }
        return read(...args);
      };
    });
    await review
      .getByRole("button", { name: "确认保存纠正", exact: true })
      .click();
    await review.waitFor({ state: "detached" });
    assert.match(await p.locator(".notices").innerText(), /界面数据刷新失败/);
    await p.getByRole("button", { name: "重新读取", exact: true }).click();
    assert.equal(await p.evaluate(() => window.commitCount), 1);
    assert.equal(
      await p.evaluate(
        async () => (await import(window.workflowDemoUrl)).demoBatches.length,
      ),
      1,
    );
  });
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify(results, null, 2),
  );
}
if (results.some((x) => !x.passed)) process.exitCode = 1;
