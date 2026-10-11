import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  Snapshot,
  Project,
  Rule,
  Correction,
  Settings,
  CorrectionRequest,
  CorrectionPreview,
  CorrectionBatch,
  KeywordPreview,
} from "../../../packages/types";
import {
  demo,
  demoSnapshot,
  addDemoJob,
  demoBatches,
  demoControls,
  demoPreview,
} from "./demo";
import { now } from "./lib/clock";
export const native = isTauri();
const makeId = () => crypto.randomUUID();
export const api = {
  snapshot: (start: number, end: number): Promise<Snapshot> =>
    native
      ? invoke("snapshot", { start, end })
      : Promise.resolve(demoSnapshot(start, end)),
  recording: async (
    recording: boolean,
    breaking = false,
    allowUnassigned = false,
  ): Promise<boolean> => {
    if (native)
      return invoke("set_recording", { recording, breaking, allowUnassigned });
    if (recording && !demo.recording && !demo.intentId && !allowUnassigned)
      return false;
    demoControls.push({
      at: now(),
      kind: !recording ? "pause" : breaking ? "break" : "start",
      intentId: demo.intentId,
    });
    demo.recording = recording;
    demo.breaking = recording && breaking;
    return true;
  },
  intent: async (
    intentId: string | null,
    allowUnassigned = false,
  ): Promise<boolean> => {
    if (native) return invoke("set_intent", { intentId, allowUnassigned });
    if (demo.recording && !intentId && !allowUnassigned) return false;
    if (intentId && !demo.projects.some((p) => p.id === intentId))
      throw new Error("项目不存在");
    if (demo.intentId !== intentId)
      demoControls.push({ at: now(), kind: "intent", intentId });
    demo.intentId = intentId;
    return true;
  },
  requestRecording: async () => {
    if (native) return invoke("request_recording");
    if (new URLSearchParams(location.search).get("widget") === "1")
      window.open("?demo=1&start=1", "_blank");
    else window.dispatchEvent(new Event("request-recording"));
  },
  previewCorrections: async (
    request: CorrectionRequest,
  ): Promise<CorrectionPreview> =>
    native ? invoke("preview_corrections", { request }) : demoPreview(request),
  commitCorrections: async (
    batchId: string,
    request: CorrectionRequest,
    token: string,
    label: string,
  ): Promise<CorrectionBatch> => {
    if (native)
      return invoke("commit_corrections", { batchId, request, token, label });
    const old = demoBatches.find((b) => b.id === batchId);
    if (old) {
      if (
        JSON.stringify(old.request) !== JSON.stringify(request) ||
        old.preview.token !== token
      )
        throw new Error("批次编号已用于另一操作");
      return old;
    }
    const preview = demoPreview(request);
    if (preview.token !== token)
      throw new Error("所选记录或人工判断已更新，请重新预览");
    const batch: CorrectionBatch = {
      id: batchId,
      createdAt: now(),
      undoneAt: null,
      label,
      request: { ...request, ranges: preview.ranges },
      preview,
    };
    demoBatches.push(batch);
    return batch;
  },
  undoCorrection: async (batchId: string) => {
    if (native) return invoke("undo_correction", { batchId });
    const b = demoBatches.find((b) => b.id === batchId);
    if (!b) throw new Error("纠正批次不存在");
    if (b.undoneAt == null) b.undoneAt = now();
  },
  correctionHistory: async (offset = 0): Promise<CorrectionBatch[]> =>
    native
      ? invoke("correction_history", { offset })
      : demoBatches
          .slice()
          .reverse()
          .slice(offset, offset + 25),
  testKeywords: async (
    keywords: string[],
    start: number,
    end: number,
  ): Promise<KeywordPreview> => {
    if (native) return invoke("test_keywords", { keywords, start, end });
    const all = demo.activities.filter(
      (a) => a.start < end && a.end > start && a.role === "primary" && !a.idle,
    );
    const hits = all.filter((a) =>
      keywords.some(
        (k) =>
          k.trim() &&
          `${a.process} ${a.title} ${a.domain}`
            .toLowerCase()
            .includes(k.trim().toLowerCase()),
      ),
    );
    return {
      count: hits.length,
      examples: [...new Set(hits.map((a) => a.title || a.process))].slice(0, 5),
      hasDomains: all.some((a) => !!a.domain),
    };
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
  correct: async (correction: Correction): Promise<void> => {
    if (native) return invoke("correct_activity", { correction });
    const a = demo.activities.find((a) => a.id === correction.activityId);
    if (!a) throw new Error("活动不存在");
    const request: CorrectionRequest = {
      ranges: [{ activityId: a.id, start: a.start, end: a.end }],
      change: {
        category: correction.category,
        relation: correction.relation,
        overrideIntent: correction.overrideIntent ?? false,
        intentId: correction.intentId ?? null,
      },
    };
    const preview = demoPreview(request);
    await api.commitCorrections(
      makeId(),
      { ...request, ranges: preview.ranges },
      preview.token,
      "单条活动纠正",
    );
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
      j.end = now();
      j.status = status;
    }
  },
  importAw: async (start: number, end: number): Promise<number> => {
    if (native) return invoke("import_activitywatch", { start, end });
    throw new Error("ActivityWatch 导入需要 Windows 桌面版");
  },
  widget: async () => {
    if (native) return invoke("toggle_widget");
    // Same inner size as the native widget window (320×200).
    window.open("?demo=1&widget=1", "pc-insight-mini", "width=320,height=200");
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
