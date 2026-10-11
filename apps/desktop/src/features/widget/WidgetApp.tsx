import { useState } from "react";
import { ArrowUpRight, Coffee, Pause, Play, RotateCw } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, native } from "../../api";
import { useLive, useNow, useToday } from "../../app/hooks";
import { useMutate, usePending } from "../../data/context";
import { durationParts } from "../../lib/format";
import { liveStatus } from "../../lib/status";
import { FiveLaneMark } from "../../components/ui/exports";
import "./widget.css";
import { requestRecording } from "../recording/controls";

/**
 * 320×200 always-on-top note. Only the top strip drags the window; buttons sit
 * outside it so a click never starts a drag.
 */
export function WidgetApp() {
  const today = useToday();
  const live = useLive(today);
  const nowMs = useNow(1000);
  const mutate = useMutate();
  const busy = usePending("recording");
  const [error, setError] = useState("");
  const d = live.data;

  const act = async (task: () => Promise<unknown>) => {
    setError("");
    const r = await mutate("recording", task, { inlineError: true });
    if (r.status === "failed") setError(r.error);
    if (r.status === "saved-refresh-failed") setError("已执行，刷新失败");
  };

  const status = d ? liveStatus(d, nowMs) : null;
  const goal = d?.projects.find((p) => p.id === d.intentId);
  return (
    <div className="widget">
      <div
        className="widget-drag"
        data-tauri-drag-region
        onMouseDown={(e) => {
          if (native && e.button === 0) void getCurrentWindow().startDragging();
        }}
      >
        <FiveLaneMark size={14} />
        <span data-tauri-drag-region>
          {native ? "PC Insight" : "PC Insight · 演示"}
        </span>
        <span className="widget-grip" data-tauri-drag-region aria-hidden>
          ⋯
        </span>
      </div>
      {!d ? (
        <>
          <div className="widget-body">
            <p
              className={live.error ? "widget-error" : "widget-muted"}
              role={live.error ? "alert" : "status"}
            >
              {live.error ? `无法读取：${live.error}` : "正在连接…"}
            </p>
          </div>
          {live.error && (
            <div className="widget-actions">
              <button type="button" className="w-btn" onClick={live.retry}>
                <RotateCw size={14} aria-hidden /> 重试
              </button>
              <span />
              <button
                type="button"
                className="w-btn"
                onClick={() => void api.dashboard().catch(() => undefined)}
              >
                主界面 <ArrowUpRight size={14} aria-hidden />
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="widget-body">
            <div
              className="widget-goal truncate"
              title={goal?.name ?? "未设置目标"}
            >
              {goal?.name ?? <span className="widget-muted">未设置目标</span>}
            </div>
            <div
              className="widget-figure tabular"
              aria-label="今日目标相关时间"
            >
              {durationParts(d.stats.focusMs).map((p) => (
                <span key={p.unit}>
                  <b>{p.value}</b>
                  <small>{p.unit}</small>
                </span>
              ))}
              <em>今日相关</em>
            </div>
            {error || live.error ? (
              <p
                className="widget-error truncate"
                role="alert"
                title={error || live.error || ""}
              >
                {error || `刷新失败：${live.error}`}
              </p>
            ) : (
              <p
                className={`widget-status status-${status!.kind} truncate`}
                role="status"
                title={status!.detail}
              >
                <i className="status-dot" aria-hidden />
                {d.recording && !d.intentId
                  ? "仅记录应用 · 相关性暂不判断"
                  : `${status!.label} · ${status!.detail}`}
              </p>
            )}
          </div>
          <div className="widget-actions">
            <button
              type="button"
              className="w-btn primary"
              disabled={busy}
              aria-busy={busy || undefined}
              onClick={() => void act(() => requestRecording(!d.recording))}
            >
              {d.recording ? (
                <Pause size={14} aria-hidden />
              ) : (
                <Play size={14} aria-hidden />
              )}
              {d.recording ? "暂停" : "开始"}
            </button>
            <button
              type="button"
              className="w-btn"
              disabled={busy || !d.recording}
              onClick={() =>
                void act(() => requestRecording(true, !d.breaking))
              }
            >
              <Coffee size={14} aria-hidden />
              {d.breaking ? "结束休息" : "休息"}
            </button>
            <button
              type="button"
              className="w-btn"
              onClick={() =>
                void api.dashboard().catch((e) => setError(String(e)))
              }
            >
              主界面 <ArrowUpRight size={14} aria-hidden />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
