import type { Activity, Snapshot } from "../../packages/types";
import { bounds, localDate } from "../../apps/desktop/src/format";
import { emptyStats } from "../../apps/desktop/src/demo";

const base = bounds(localDate())[0];
const minute = 60_000;
const activity = (
  id: string,
  from: number,
  to: number,
  process: string,
  title: string,
  intentId: string | null,
  state: string,
  role: "primary" | "supporting" = "primary",
): Activity => ({
  id,
  source: "demo",
  start: base + from * minute,
  end: base + to * minute,
  process,
  title,
  domain:
    process === "msedge.exe"
      ? state === "distracted"
        ? "bilibili.com"
        : "netacad.com"
      : "",
  intentId,
  role,
  idle: state === "idle",
  area: role === "supporting" ? 0.46 : 0.54,
  category:
    state === "distracted"
      ? "entertainment"
      : state === "interruption"
        ? "communication"
        : intentId === "research"
          ? "research"
          : intentId === "project"
            ? "coding"
            : "learning",
  relation:
    state === "focused"
      ? "related"
      : state === "distracted" || state === "interruption"
        ? "unrelated"
        : "unknown",
  state,
  confidence: 0.95,
  reason:
    state === "focused"
      ? "演示：匹配当前目标关键词"
      : state === "idle"
        ? "演示：休息时间"
        : "演示：与当前目标类别无关",
});
export const sampleDemo: Snapshot = {
  collectorSource: "演示",
  awStatus: "演示模式不连接本机服务",
  activities: [
    activity(
      "a1",
      540,
      579,
      "msedge.exe",
      "Cisco · Switching concepts",
      "cisco",
      "focused",
    ),
    activity(
      "a2",
      579,
      607,
      "Typora.exe",
      "CCNA 学习笔记.md",
      "cisco",
      "focused",
    ),
    activity(
      "a3",
      607,
      611,
      "msedge.exe",
      "Bilibili · 视频推荐",
      "cisco",
      "distracted",
    ),
    activity(
      "a4",
      611,
      641,
      "Typora.exe",
      "CCNA 学习笔记.md",
      "cisco",
      "focused",
    ),
    activity("a5", 641, 656, "休息", "", null, "idle"),
    activity(
      "a6",
      656,
      701,
      "Code.exe",
      "PC Insight · Session engine",
      "project",
      "focused",
    ),
    activity("a7", 701, 702, "WeChat.exe", "微信", "project", "interruption"),
    activity(
      "a8",
      702,
      740,
      "Code.exe",
      "PC Insight · Analytics",
      "project",
      "focused",
    ),
    activity(
      "a9",
      780,
      824,
      "Zotero.exe",
      "SPAD · Literature review",
      "research",
      "focused",
    ),
    activity(
      "a10",
      824,
      848,
      "Typora.exe",
      "SPAD research notes",
      "research",
      "focused",
    ),
    activity(
      "s1",
      540,
      607,
      "Typora.exe",
      "CCNA 学习笔记.md",
      "cisco",
      "focused",
      "supporting",
    ),
    activity(
      "s2",
      611,
      641,
      "msedge.exe",
      "Cisco · Switching concepts",
      "cisco",
      "focused",
      "supporting",
    ),
    activity(
      "s3",
      656,
      740,
      "msedge.exe",
      "Rust documentation",
      "project",
      "focused",
      "supporting",
    ),
  ],
  sessions: [],
  jobs: [
    {
      id: "j1",
      tool: "codex",
      name: "实现 Session 合并引擎",
      projectId: "project",
      start: base + 557 * minute,
      end: base + 628 * minute,
      lastSeen: base + 628 * minute,
      status: "completed",
      foregroundMs: 0,
      backgroundMs: 71 * minute,
      parallelMs: 71 * minute,
    },
    {
      id: "j2",
      tool: "python",
      name: "SPAD 数据预处理",
      projectId: "research",
      start: base + 790 * minute,
      end: base + 830 * minute,
      lastSeen: base + 830 * minute,
      status: "completed",
      foregroundMs: 0,
      backgroundMs: 40 * minute,
      parallelMs: 40 * minute,
    },
  ],
  stats: emptyStats(),
  projects: [
    {
      id: "cisco",
      name: "Cisco CCNA 学习",
      category: "learning",
      color: "#55846e",
      keywords: ["Cisco", "CCNA", "netacad"],
    },
    {
      id: "project",
      name: "PC Insight",
      category: "coding",
      color: "#748eae",
      keywords: ["PC Insight", "newtool", "Rust"],
    },
    {
      id: "research",
      name: "SPAD 研究",
      category: "research",
      color: "#9a87b1",
      keywords: ["SPAD"],
    },
  ],
  rules: [],
  settings: {
    collectorSource: "auto",
    sampleSeconds: 2,
    idleSeconds: 180,
    retentionDays: 60,
    recordTitles: true,
    excludedApps: [],
    excludedTitles: ["InPrivate", "Incognito", "无痕"],
    browserToken: "demo-no-real-token",
  },
  recording: false,
  breaking: false,
  intentId: "cisco",
  lastSample: null,
  currentApp: null,
  error: null,
  bridgeReady: false,
  bridgeError: null,
  browserConnected: false,
  databasePath: "演示模式 · 仅保存在本次浏览器页面内",
};
