import type { Settings } from "../../../../../packages/types";
import { charLength, parseList } from "../../lib/lists";

/** Editable copy of the saved settings. Exclusion lists are edited as text. */
export interface SettingsDraft {
  collectorSource: Settings["collectorSource"];
  sampleSeconds: number;
  idleSeconds: number;
  retentionDays: number;
  recordTitles: boolean;
  excludedApps: string;
  excludedTitles: string;
}

export type DraftErrors = Partial<Record<keyof SettingsDraft, string>>;

export function toDraft(s: Settings): SettingsDraft {
  return {
    collectorSource: s.collectorSource,
    sampleSeconds: s.sampleSeconds,
    idleSeconds: s.idleSeconds,
    retentionDays: s.retentionDays,
    recordTitles: s.recordTitles,
    excludedApps: s.excludedApps.filter((x) => x.trim()).join("\n"),
    excludedTitles: s.excludedTitles.filter((x) => x.trim()).join("\n"),
  };
}

/** The saved browser token always comes from the backend copy, never the draft. */
export function fromDraft(d: SettingsDraft, saved: Settings): Settings {
  return {
    ...saved,
    collectorSource: d.collectorSource,
    sampleSeconds: d.sampleSeconds,
    idleSeconds: d.idleSeconds,
    retentionDays: d.retentionDays,
    recordTitles: d.recordTitles,
    excludedApps: parseList(d.excludedApps),
    excludedTitles: parseList(d.excludedTitles),
  };
}

const comparable = (s: Settings) =>
  JSON.stringify([
    s.collectorSource,
    s.sampleSeconds,
    s.idleSeconds,
    s.retentionDays,
    s.recordTitles,
    s.excludedApps.filter((x) => x.trim()),
    s.excludedTitles.filter((x) => x.trim()),
  ]);

export function isDirty(d: SettingsDraft, saved: Settings): boolean {
  return comparable(fromDraft(d, saved)) !== comparable(saved);
}

/** Mirrors the ranges `save_settings` accepts so errors show beside the field. */
export function draftErrors(d: SettingsDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!["auto", "native", "activitywatch"].includes(d.collectorSource))
    e.collectorSource = "请选择有效的采集来源";
  if (!(d.sampleSeconds >= 1 && d.sampleSeconds <= 5))
    e.sampleSeconds = "采样间隔需在 1–5 秒";
  if (!(d.idleSeconds >= 30 && d.idleSeconds <= 900))
    e.idleSeconds = "离开阈值需在 30–900 秒";
  if (!(d.retentionDays >= 7 && d.retentionDays <= 365))
    e.retentionDays = "保留期需在 7–365 天";
  for (const key of ["excludedApps", "excludedTitles"] as const) {
    const items = parseList(d[key]);
    if (items.length > 100) e[key] = `最多 100 项，当前 ${items.length} 项`;
    else if (items.some((x) => charLength(x) > 200))
      e[key] = "单项不能超过 200 个字符";
  }
  return e;
}

/**
 * Reconciles a draft with a newer saved value from the backend. A clean draft
 * follows the saved value; a dirty draft is kept so polling never overwrites
 * what the user is typing.
 */
export function rebase(
  draft: SettingsDraft,
  base: Settings,
  next: Settings,
): { draft: SettingsDraft; base: Settings; externalChange: boolean } {
  if (comparable(base) === comparable(next))
    return { draft, base, externalChange: false };
  if (!isDirty(draft, base))
    return { draft: toDraft(next), base: next, externalChange: false };
  return { draft, base: next, externalChange: true };
}

export interface SettingsEditor {
  base: Settings;
  draft: SettingsDraft;
  revision: number;
  submission: { settings: Settings; revision: number } | null;
  external: boolean;
  savedWithEdits: boolean;
}

export type SettingsEditAction =
  | { type: "edit"; patch: Partial<SettingsDraft> }
  | { type: "begin"; settings: Settings }
  | { type: "saved" }
  | { type: "failed" }
  | { type: "snapshot"; settings: Settings; fresh: boolean }
  | { type: "discard" };

export function settingsEditor(settings: Settings): SettingsEditor {
  return {
    base: settings,
    draft: toDraft(settings),
    revision: 0,
    submission: null,
    external: false,
    savedWithEdits: false,
  };
}

/** Keep the submitted value separate from edits made while write/refresh awaits. */
export function editSettings(
  state: SettingsEditor,
  action: SettingsEditAction,
): SettingsEditor {
  switch (action.type) {
    case "edit":
      return {
        ...state,
        draft: { ...state.draft, ...action.patch },
        revision: state.revision + 1,
      };
    case "begin":
      return state.submission
        ? state
        : {
            ...state,
            submission: { settings: action.settings, revision: state.revision },
          };
    case "saved": {
      if (!state.submission) return state;
      const edited = state.revision !== state.submission.revision;
      return {
        ...state,
        base: state.submission.settings,
        draft: edited ? state.draft : toDraft(state.submission.settings),
        submission: null,
        external: false,
        savedWithEdits: edited,
      };
    }
    case "failed":
      return { ...state, submission: null };
    case "snapshot": {
      // Even an edit back to the old base belongs to the user while saving.
      // The component reconciles the latest fresh snapshot again after settling.
      if (state.submission || !action.fresh) return state;
      const next = rebase(state.draft, state.base, action.settings);
      if (next.base === state.base) return state;
      return {
        ...state,
        base: next.base,
        draft: next.draft,
        external:
          isDirty(next.draft, next.base) &&
          (next.externalChange || state.external),
      };
    }
    case "discard":
      return state.submission ? state : settingsEditor(state.base);
  }
}
