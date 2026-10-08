import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  Snapshot,
  Project,
  Rule,
  Correction,
  Settings,
} from "../../../packages/types";
import { demo, demoSnapshot, addDemoJob } from "./demo";
export const native = isTauri();
const makeId = () => crypto.randomUUID();
export const api = {
  snapshot: (start: number, end: number): Promise<Snapshot> =>
    native
      ? invoke("snapshot", { start, end })
      : Promise.resolve(demoSnapshot(start, end)),
  recording: async (recording: boolean, breaking = false) => {
    if (native) return invoke("set_recording", { recording, breaking });
    demo.recording = recording;
    demo.breaking = recording && breaking;
  },
  intent: async (intentId: string | null) => {
    if (native) return invoke("set_intent", { intentId });
    demo.intentId = intentId;
  },
  project: async (project: Project) => {
    if (native) return invoke("save_project", { project });
    const i = demo.projects.findIndex((p) => p.id === project.id);
    if (i >= 0) demo.projects[i] = project;
    else demo.projects.push({ ...project, id: makeId() });
  },
  rule: async (rule: Rule) => {
    if (native) return invoke("save_rule", { rule });
    demo.rules.push({ ...rule, id: makeId() });
  },
  deleteRule: async (ruleId: string) => {
    if (native) return invoke("delete_rule", { ruleId });
    demo.rules = demo.rules.filter((r) => r.id !== ruleId);
  },
  correct: async (correction: Correction) => {
    if (native) return invoke("correct_activity", { correction });
    const a = demo.activities.find((a) => a.id === correction.activityId);
    if (a) {
      if (correction.overrideIntent) a.intentId = correction.intentId ?? null;
      a.category = correction.category;
      a.relation = correction.relation;
      a.state =
        correction.relation === "related"
          ? "focused"
          : correction.relation === "unrelated"
            ? a.end - a.start >= 180_000
              ? "distracted"
              : "interruption"
            : "unknown";
      a.reason = "人工纠正（演示）";
    }
  },
  settings: async (settings: Settings) => {
    if (native) return invoke("save_settings", { settings });
    demo.settings = settings;
  },
  startJob: async (name: string, tool: string, projectId: string | null) => {
    if (native) return invoke("start_job", { name, tool, projectId });
    addDemoJob(name, tool, projectId);
  },
  finishJob: async (jobId: string, status: string) => {
    if (native) return invoke("finish_job", { jobId, status });
    const j = demo.jobs.find((j) => j.id === jobId);
    if (j) {
      j.end = Date.now();
      j.status = status;
    }
  },
  importAw: async (start: number, end: number): Promise<number> => {
    if (native) return invoke("import_activitywatch", { start, end });
    throw new Error("ActivityWatch 导入需要 Windows 桌面版");
  },
  widget: async () => {
    if (native) return invoke("toggle_widget");
    window.open("?demo=1&widget=1", "pc-insight-mini", "width=340,height=220");
  },
  dashboard: async () => {
    if (native) return invoke("show_dashboard");
    window.open("?demo=1", "_blank");
  },
  autostart: async (): Promise<boolean> =>
    native ? invoke("autostart_status") : false,
  setAutostart: async (enabled: boolean) => {
    if (native) return invoke("set_autostart", { enabled });
    throw new Error("开机启动仅在 Windows 桌面版中可设置");
  },
};
