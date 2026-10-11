import { Coffee, Pause, Play, Plus } from "lucide-react";
import type { Snapshot } from "../../../../../packages/types";
import { api } from "../../api";
import { useMutate, usePending } from "../../data/context";
import { useActions } from "../../app/actions";
import { useNow } from "../../app/hooks";
import { liveStatus } from "../../lib/status";
import { categoryLabel } from "../../lib/semantics";
import { shortDate } from "../../lib/dates";
import { useState } from "react";
import { Confirm } from "../../components/ui/exports";
import { requestRecording } from "../recording/controls";
import { Button } from "../../components/ui";

export function StatusLine({
  live,
  compact = false,
}: {
  live: Snapshot;
  compact?: boolean;
}) {
  const now = useNow(1000);
  const s = liveStatus(live, now);
  return (
    <div
      className={`status-line status-${s.kind} ${compact ? "compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <i className="status-dot" aria-hidden />
      <span className="status-text">
        <strong>{s.label}</strong>
        <span className="status-detail truncate" title={s.detail}>
          {s.detail}
        </span>
        {s.warning && (
          <span className="status-warning truncate" title={s.warning}>
            来源提示：{s.warning}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * Real-time controls. These always act on *now*, whichever date the page is
 * reviewing — the `viewing` prop only adds a note to make that explicit.
 */
export function LiveStrip({
  live,
  viewing,
  today,
}: {
  live: Snapshot;
  viewing: string;
  today: string;
}) {
  const mutate = useMutate();
  const actions = useActions();
  const recordingBusy = usePending("recording");
  const intentBusy = usePending("intent");
  const intent = live.projects.find((p) => p.id === live.intentId);
  const [clearIntent, setClearIntent] = useState(false);

  return (
    <>
      <section className="live-strip" aria-label="此刻的记录控制">
        <div className="live-kicker">
          <span className="kicker">此刻</span>
          {!live.intentId && live.recording && (
            <span className="live-note">仅记录应用 · 相关性暂不判断</span>
          )}
          {viewing !== today && (
            <span className="live-note">
              控制作用于现在，下方是 {shortDate(viewing)} 的回顾
            </span>
          )}
        </div>
        <div className="live-row">
          <StatusLine live={live} />
          {live.projects.length === 0 ? (
            // A goal is always a project. With no projects, a one-option dropdown
            // looks broken, so say what is missing and offer the next step instead.
            <div className="live-goal live-goal-empty">
              <span className="live-goal-label">当前目标</span>
              <span className="live-goal-hint">
                还没有项目，先新建一个再选为目标。
              </span>
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus size={14} aria-hidden />}
                onClick={() => actions.editProject(null)}
              >
                新建项目
              </Button>
            </div>
          ) : (
            <div className="live-goal">
              <label className="live-goal-label" htmlFor="live-intent">
                当前目标
              </label>
              <select
                id="live-intent"
                value={live.intentId ?? ""}
                disabled={intentBusy}
                aria-busy={intentBusy || undefined}
                onChange={(e) => {
                  const id = e.target.value || null;
                  if (!id && live.recording) {
                    setClearIntent(true);
                    return;
                  }
                  const name = live.projects.find((p) => p.id === id)?.name;
                  void mutate("intent", () => api.intent(id), {
                    success: name ? `当前目标：${name}` : "已清除当前目标",
                  });
                }}
              >
                <option value="">未设置目标（相关性待确认）</option>
                {live.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="live-goal-meta truncate">
                {intent
                  ? `${categoryLabel(intent.category)} · ${intent.keywords.length} 个识别关键词`
                  : ""}
              </span>
            </div>
          )}
          <div className="live-actions">
            <Button
              variant="secondary"
              disabled={!live.recording}
              loading={recordingBusy && live.recording}
              icon={<Coffee size={15} aria-hidden />}
              title={live.recording ? undefined : "开始记录后才能休息"}
              onClick={() =>
                void mutate(
                  "recording",
                  () => requestRecording(true, !live.breaking),
                  {
                    success: live.breaking
                      ? "已结束休息"
                      : "开始休息，这段时间记为离开",
                  },
                )
              }
            >
              {live.breaking ? "结束休息" : "休息一下"}
            </Button>
            <Button
              variant="primary"
              loading={recordingBusy && !live.recording}
              disabled={recordingBusy}
              icon={
                live.recording ? (
                  <Pause size={15} aria-hidden />
                ) : (
                  <Play size={15} aria-hidden />
                )
              }
              onClick={() =>
                void mutate(
                  "recording",
                  () => requestRecording(!live.recording),
                  {
                    success: live.recording
                      ? "已暂停记录"
                      : live.intentId
                        ? "已开始记录"
                        : undefined,
                  },
                )
              }
            >
              {live.recording ? "暂停记录" : "开始记录"}
            </Button>
          </div>
        </div>
      </section>
      {clearIntent && (
        <Confirm
          title="清空当前目标并继续记录？"
          body="之后仅记录应用，相关性暂不判断。已有记录的目标不会改变。"
          confirmLabel="仅记录应用"
          pending={intentBusy}
          onCancel={() => setClearIntent(false)}
          onConfirm={() => {
            void mutate("intent", () => api.intent(null, true)).then((r) => {
              if (r.status === "saved" || r.status === "saved-refresh-failed")
                setClearIntent(false);
            });
          }}
        />
      )}
    </>
  );
}
