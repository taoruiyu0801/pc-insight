// Visual + interaction pass for the browser demo, driven through headless Edge.
//
//   npm i --no-save playwright-core@1.56.1        (not a project dependency)
//   npx vite --config apps/desktop/vite.config.ts --port 1430
//   node scripts/visual-check.mjs artifacts/fieldnotes-screenshots [welcome,empty,main,faults,widget,sizes,stress,popup]
//
// Uses only explicit dev fixtures (?fixture=sample|stress, frozen ?clock=) — never a real database.
// Set EDGE_PATH to override the browser executable, PC_INSIGHT_URL to override the server.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2];
const only = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const BASE = process.env.PC_INSIGHT_URL ?? "http://127.0.0.1:1430/";
const CLOCK = "clock=2026-10-08T16:30";
const log = [];
const note = (k, v) => {
  log.push(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  console.log(k, v);
};

const browser = await chromium.launch({
  executablePath:
    process.env.EDGE_PATH ??
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});

async function page(
  url,
  { width = 1360, height = 920, dsf = 1, reduced = true } = {},
) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dsf,
    reducedMotion: reduced ? "reduce" : "no-preference",
    locale: "zh-CN",
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => note("PAGEERROR", `${url} ${e.message}`));
  p.on(
    "console",
    (m) => m.type() === "error" && note("CONSOLE", `${url} ${m.text()}`),
  );
  await p.goto(BASE + url);
  await p.waitForTimeout(700);
  return p;
}
const shot = async (p, name, full = false) => {
  await p.waitForTimeout(250);
  if (!full) return p.screenshot({ path: path.join(out, `${name}.png`) });
  const vp = p.viewportSize();
  const h = await p.evaluate(() => {
    const m = document.querySelector(".main");
    return m ? m.scrollHeight : document.documentElement.scrollHeight;
  });
  await p.setViewportSize({ width: vp.width, height: Math.max(vp.height, h) });
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(out, `${name}.png`) });
  await p.setViewportSize(vp);
};
const nav = async (p, name) => {
  await p.getByRole("button", { name, exact: true }).click();
  await p.waitForTimeout(400);
};
const run = (name) => !only || only.split(",").includes(name);

if (run("welcome")) {
  const p = await page("");
  await shot(p, "00-welcome");
  await p.context().close();
}

if (run("empty")) {
  const p = await page(`?demo=1&${CLOCK}`);
  await shot(p, "01-overview-first-run");
  await nav(p, "我的项目");
  await shot(p, "01b-projects-empty");
  await nav(p, "回顾报告");
  await shot(p, "01c-report-empty-day");
  await p.context().close();
}

if (run("main")) {
  const p = await page(`?demo=1&fixture=sample&${CLOCK}&recording=1`);
  await shot(p, "02-overview", true);
  await nav(p, "时间线");
  await shot(p, "03-timeline", true);
  // zoom presets and brush
  await p.getByRole("button", { name: "1 小时" }).click();
  await shot(p, "03b-timeline-zoom-1h");
  await p.getByRole("button", { name: "完整记录" }).click();
  // keyboard on attention lane
  const lane = p.locator(".lane-track.lane-attention");
  await lane.focus();
  for (let i = 0; i < 5; i++) await p.keyboard.press("ArrowRight");
  note(
    "lane-announce",
    await p.locator(".spectrum .visually-hidden[aria-live]").innerText(),
  );
  await shot(p, "03c-timeline-keyboard-cursor");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(300);
  note("drawer-after-enter", await p.locator(".drawer-title").innerText());
  await shot(p, "04-activity-drawer");
  // edit then try to close: should ask
  await p.locator(".drawer select").first().selectOption("research");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  note("confirm-on-dirty-close", await p.locator(".dialog-title").innerText());
  await shot(p, "04b-drawer-discard-confirm");
  await p.getByRole("button", { name: "继续编辑" }).click();
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: "放弃修改" }).click();
  await p.waitForTimeout(200);
  note("drawer-closed", (await p.locator(".drawer").count()) === 0);

  // dense chooser: click the 1-minute interruption at full range
  const box = await p.locator(".lane-track.lane-state").boundingBox();
  const ruler = await p.locator(".ruler").boundingBox();
  const t0 = new Date(2026, 9, 8, 9).getTime(),
    t1 = new Date(2026, 9, 8, 15).getTime();
  const t = new Date(2026, 9, 8, 11, 41, 30).getTime();
  await p.mouse.click(
    ruler.x + ((t - t0) / (t1 - t0)) * ruler.width,
    box.y + box.height / 2,
  );
  await p.waitForTimeout(250);
  note("chooser", await p.locator(".chooser").innerText());
  await shot(p, "05-timeline-chooser");
  await p.keyboard.press("Escape");

  // search: no result then clear
  await p.getByPlaceholder("搜索应用、标题或域名").fill("不存在的内容xyz");
  await p.waitForTimeout(250);
  await shot(p, "06-timeline-no-results", false);
  note("no-results", await p.locator(".table-empty").innerText());
  await p.getByRole("button", { name: "清空筛选" }).first().click();

  await nav(p, "工作分析");
  await shot(p, "07-analytics", true);
  await nav(p, "我的项目");
  await shot(p, "08-projects", true);
  await p.getByRole("button", { name: "新建项目" }).first().click();
  await p.waitForTimeout(200);
  // focus trap check
  const inside = [];
  for (let i = 0; i < 14; i++) {
    await p.keyboard.press("Tab");
    inside.push(
      await p.evaluate(() => !!document.activeElement?.closest(".dialog")),
    );
  }
  note("dialog-focus-trapped", inside.every(Boolean));
  await p.getByRole("button", { name: "创建项目" }).click();
  await shot(p, "09-project-dialog-validation");
  await p
    .getByRole("textbox", { name: "项目名称" })
    .fill(
      "单光子雪崩二极管（SPAD）阵列时间相关计数实验数据预处理与长期稳定性分析",
    );
  await p
    .getByRole("textbox", { name: "识别关键词" })
    .fill("SPAD, TCSPC，单光子\n雪崩");
  await shot(p, "09b-project-dialog-filled");
  await p.getByRole("button", { name: "创建项目" }).click();
  await p.waitForTimeout(400);
  note(
    "projects-after-create",
    await p.locator(".project-index .pi-name").allInnerTexts(),
  );
  await shot(p, "09c-projects-after-create", true);

  await nav(p, "今日概览");
  await p.getByRole("button", { name: "开始后台任务" }).click();
  await p
    .getByRole("textbox", { name: "任务名称" })
    .fill("Codex 生成数据清洗脚本");
  await shot(p, "10-job-dialog");
  await p.getByRole("button", { name: "开始计时" }).dblclick();
  await p.waitForTimeout(400);
  if (await p.locator(".drawer").count()) await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  const running = await p.locator(".job-row.is-running").count();
  note("running-jobs-after-double-click", running);
  await shot(p, "10b-overview-running-job", true);
  await p
    .locator(".job-row.is-running")
    .getByRole("button", { name: "完成" })
    .dblclick();
  await p.waitForTimeout(400);
  note("running-after-finish", await p.locator(".job-row.is-running").count());

  await nav(p, "回顾报告");
  await shot(p, "11-report-day", true);
  await p.getByRole("radio", { name: "最近七日" }).click();
  await p.waitForTimeout(400);
  await shot(p, "11b-report-week", true);
  const [dl] = await Promise.all([
    p.waitForEvent("download"),
    p.getByRole("button", { name: "导出 Markdown" }).click(),
  ]);
  const file = path.join(out, dl.suggestedFilename());
  await dl.saveAs(file);
  const md = fs.readFileSync(file, "utf8");
  const preview = await p.locator(".paper").innerText();
  note("export-file", dl.suggestedFilename());
  note(
    "export-has-titles",
    md.includes("Switching concepts") || md.includes("CCNA 学习笔记.md"),
  );
  const focusMd = md.match(/目标相关时间：(.+)/)?.[1];
  note("export-focus", focusMd);
  note("preview-contains-range", preview.includes("10月2日"));

  await nav(p, "偏好设置");
  await shot(p, "12-settings", true);
  await p
    .getByRole("textbox", { name: "排除标题关键词" })
    .fill("InPrivate\n无痕\n网银");
  await p.waitForTimeout(150);
  await shot(p, "12b-settings-dirty");
  await nav(p, "今日概览");
  await p.waitForTimeout(200);
  note("leave-guard", await p.locator(".dialog-title").innerText());
  await shot(p, "12c-settings-leave-guard");
  await p.getByRole("button", { name: "继续编辑" }).click();
  await p.getByRole("button", { name: "保存偏好" }).click();
  await p.waitForTimeout(400);
  note("save-state", await p.locator(".save-state").innerText());
  await p.getByRole("button", { name: "添加规则" }).click();
  await p.getByRole("textbox", { name: "包含关键词" }).fill("bilibili");
  await shot(p, "13-rule-dialog");
  await p.getByRole("button", { name: "添加规则" }).last().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /删除规则/ }).click();
  await shot(p, "13b-rule-delete-confirm");
  await p.getByRole("button", { name: "删除规则" }).last().click();
  await p.waitForTimeout(300);
  note("rules-after-delete", await p.locator(".rules-table").count());
  await p.context().close();
}

if (run("faults")) {
  let p = await page(`?demo=1&fixture=sample&${CLOCK}&fault=snapshot`);
  await p.waitForTimeout(500);
  await shot(p, "14-error-snapshot");
  note("error-text", await p.locator(".state-error").first().innerText());
  await p.context().close();

  p = await page(`?demo=1&fixture=sample&${CLOCK}&fault=after-write`);
  await nav(p, "我的项目");
  await p.getByRole("button", { name: "新建项目" }).first().click();
  await p.getByRole("textbox", { name: "项目名称" }).fill("写入成功刷新失败");
  await p.getByRole("button", { name: "创建项目" }).click();
  await p.waitForTimeout(500);
  note(
    "dialog-closed-after-saved-refresh-failed",
    (await p.locator(".dialog").count()) === 0,
  );
  note("notice", await p.locator(".notices").innerText());
  await shot(p, "15-saved-refresh-failed");
  await p.getByRole("button", { name: "重新读取" }).click();
  await p.waitForTimeout(400);
  note(
    "project-count-after-retry",
    await p.locator(".project-index > li").count(),
  );
  await p.context().close();

  p = await page(`?demo=1&fixture=sample&${CLOCK}&fault=slow`);
  await shot(p, "16-slow-first-load");
  await p.waitForTimeout(3500);
  await nav(p, "回顾报告");
  await p.getByRole("button", { name: "前一天" }).first().click();
  await p.waitForTimeout(200);
  note(
    "export-disabled-while-switching",
    await p.getByRole("button", { name: "导出 Markdown" }).isDisabled(),
  );
  await shot(p, "16b-report-switching-date");
  await p.context().close();
}

if (run("widget")) {
  for (const [name, url] of [
    [
      "17-widget-recording",
      `?demo=1&widget=1&fixture=sample&${CLOCK}&recording=1`,
    ],
    ["17b-widget-paused-empty", `?demo=1&widget=1&${CLOCK}`],
    [
      "17c-widget-long-name",
      `?demo=1&widget=1&fixture=stress&n=1000&${CLOCK}&recording=1`,
    ],
    ["17d-widget-error", `?demo=1&widget=1&${CLOCK}&fault=snapshot`],
  ]) {
    const p = await page(url, { width: 320, height: 200 });
    await p.waitForTimeout(300);
    const overflow = await p.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ]);
    note(`${name}-scroll`, overflow);
    await shot(p, name);
    await p.context().close();
  }
}

if (run("sizes")) {
  for (const [name, w, h, dsf] of [
    ["18-min-1000x700", 1000, 700, 1],
    ["18b-1360x920-125pct", 1360, 920, 1.25],
    ["18c-1000x700-150pct", 1000, 700, 1.5],
    ["18d-zoom200", 680, 460, 2],
  ]) {
    const p = await page(`?demo=1&fixture=sample&${CLOCK}&recording=1`, {
      width: w,
      height: h,
      dsf,
    });
    note(
      `${name}-hscroll`,
      await p.evaluate(
        () =>
          document.querySelector(".main").scrollWidth >
          document.querySelector(".main").clientWidth,
      ),
    );
    await shot(p, name);
    await nav(p, "时间线");
    await shot(p, `${name}-timeline`);
    await p.context().close();
  }
}

if (run("stress")) {
  for (const n of [1000, 5000]) {
    const p = await page(`?demo=1&fixture=stress&n=${n}&${CLOCK}&recording=1`);
    await p.waitForTimeout(800);
    const t0 = Date.now();
    await nav(p, "时间线");
    await p.locator(".lane-track.lane-attention").waitFor();
    const navMs = Date.now() - t0;
    const segs = await p.locator(".seg").count();
    const rows = await p.locator(".activity-table tbody tr").count();
    const zoomT = Date.now();
    await p.getByRole("button", { name: "15 分钟" }).click();
    await p.waitForTimeout(50);
    const zoomMs = Date.now() - zoomT;
    note(`stress-${n}`, { navMs, segs, rows, zoomMs });
    await shot(p, `19-stress-${n}-timeline`);
    await p.context().close();
  }
}

if (run("popup")) {
  const ctx = await browser.newContext({
    viewport: { width: 340, height: 420 },
  });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    const store = {
      local: { token: "", enabled: true },
      session: { status: "等待 PC Insight 桌面版启动" },
    };
    const area = (k) => ({
      get: async () => ({ ...store[k] }),
      set: async (v) => {
        if (window.__failSet) throw new Error("storage quota");
        Object.assign(store[k], v);
      },
    });
    window.chrome = {
      storage: {
        local: area("local"),
        session: area("session"),
        onChanged: { addListener() {} },
      },
    };
  });
  const url = new URL("../apps/browser-extension/popup.html", import.meta.url)
    .href;
  await p.goto(url);
  await p.waitForTimeout(200);
  await p.screenshot({
    path: path.join(out, "20-extension-popup.png"),
    fullPage: true,
  });
  await p.fill("#token", "abc");
  await p.click("button[type=submit]");
  await p.waitForTimeout(100);
  note("popup-status-after-save", await p.locator("#status").innerText());
  await p.screenshot({
    path: path.join(out, "20b-extension-saved.png"),
    fullPage: true,
  });
  await p.evaluate(() => (window.__failSet = true));
  await p.click("button[type=submit]");
  await p.waitForTimeout(100);
  note("popup-status-after-fail", await p.locator("#status").innerText());
  await p.screenshot({
    path: path.join(out, "20c-extension-error.png"),
    fullPage: true,
  });
  await ctx.close();
}

fs.writeFileSync(path.join(out, "log.txt"), log.join("\n") + "\n");
await browser.close();
