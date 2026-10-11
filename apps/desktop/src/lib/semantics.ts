// Labels and visual tones for values that arrive over IPC. Every lookup has a
// fallback: the backend may add states/statuses/sources the UI does not know yet,
// and an unknown value must render as "unrecognised", never blank or crash.

export type Tone =
  | "focus"
  | "interrupt"
  | "distract"
  | "unknown"
  | "idle"
  | "job"
  | "support"
  | "neutral";

export const categories: Record<string, string> = {
  learning: "学习",
  coding: "编程",
  research: "科研",
  entertainment: "娱乐",
  communication: "沟通",
  system: "系统",
  unknown: "未分类",
};

export const categoryOrder = Object.keys(categories);

export function categoryLabel(category: string): string {
  return categories[category] ?? `其他类别（${category}）`;
}

export interface StateInfo {
  key: string;
  label: string;
  tone: Tone;
  known: boolean;
}

const stateTable: Record<string, Omit<StateInfo, "key" | "known">> = {
  focused: { label: "专注", tone: "focus" },
  interruption: { label: "短暂打断", tone: "interrupt" },
  micro: { label: "短切换", tone: "interrupt" },
  distracted: { label: "分心", tone: "distract" },
  unknown: { label: "待确认", tone: "unknown" },
  idle: { label: "离开 / 休息", tone: "idle" },
};

export function stateInfo(state: string, idle = false): StateInfo {
  if (idle) return { key: "idle", known: true, ...stateTable.idle };
  const hit = stateTable[state];
  return hit
    ? { key: state, known: true, ...hit }
    : {
        key: state,
        known: false,
        label: `未识别状态（${state || "空"}）`,
        tone: "neutral",
      };
}

/** Legend order for the status lane. */
export const stateLegend = [
  "focused",
  "interruption",
  "distracted",
  "unknown",
  "idle",
];

export const relations: Record<string, string> = {
  related: "与目标相关",
  unrelated: "与目标无关",
  unknown: "待确认",
};

export function relationLabel(relation: string): string {
  return relations[relation] ?? `未识别（${relation}）`;
}

export interface JobStatusInfo {
  label: string;
  running: boolean;
  tone: "running" | "done" | "failed" | "neutral";
}

const jobTable: Record<string, JobStatusInfo> = {
  running: { label: "运行中", running: true, tone: "running" },
  completed: { label: "已完成", running: false, tone: "done" },
  failed: { label: "失败", running: false, tone: "failed" },
  stopped: { label: "已停止", running: false, tone: "neutral" },
  interrupted: { label: "意外中断", running: false, tone: "failed" },
};

export function jobStatusInfo(status: string): JobStatusInfo {
  return (
    jobTable[status] ?? {
      label: `未识别状态（${status || "空"}）`,
      running: false,
      tone: "neutral",
    }
  );
}

export const jobTools = [
  "codex",
  "claude",
  "python",
  "ffmpeg",
  "npm",
  "other",
] as const;

export function toolLabel(tool: string): string {
  return tool === "other" ? "其他" : tool;
}

export function sourceLabel(source: string): string {
  switch (source) {
    case "native":
      return "Windows 本机采样";
    case "activitywatch":
      return "ActivityWatch";
    case "demo":
      return "示例数据";
    default:
      return source ? `其他来源（${source}）` : "未注明来源";
  }
}

export const ruleFields: Record<string, string> = {
  app: "应用",
  title: "标题",
  domain: "域名",
};

export function ruleFieldLabel(field: string): string {
  return ruleFields[field] ?? field;
}

export function appName(process: string): string {
  return process.replace(/\.exe$/i, "");
}
