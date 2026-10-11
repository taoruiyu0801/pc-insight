import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Crosshair } from "lucide-react";
import type { Activity, Project, Session } from "../../../../../packages/types";
import { duration, time, timeWithSeconds } from "../../lib/format";
import { groupActivities, membersOf } from "../../lib/activity-groups";
import { appName } from "../../lib/semantics";
import { StateBadge } from "../../components/ui";
import "./activities.css";

export const activityKey = (a: Activity) => `${a.id}:${a.start}`;

/** Activity rows: newest first, paged so 5,000-row days stay responsive. */
export function ActivityTable({
  activities,
  projects,
  onOpen,
  onLocate,
  pageSize = 100,
  empty,
  highlightKey,
  caption,
  compact = false,
  sessions = [],
}: {
  activities: Activity[];
  projects: Map<string, Project>;
  onOpen: (a: Activity) => void;
  onLocate?: (a: Activity) => void;
  pageSize?: number;
  empty: ReactNode;
  highlightKey?: string | null;
  caption: string;
  /** Narrow variant for the overview: drops the goal column. */
  compact?: boolean;
  sessions?: Session[];
}) {
  const groups = useMemo(
    () => groupActivities(activities, sessions),
    [activities, sessions],
  );
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(groups.length / pageSize));
  const current = Math.min(page, pages - 1);
  const rows = useMemo(() => {
    const newestFirst = groups.slice().sort((a, b) => b.start - a.start);
    return newestFirst.slice(current * pageSize, (current + 1) * pageSize);
  }, [groups, current, pageSize]);

  if (!activities.length) return <div className="table-empty">{empty}</div>;

  return (
    <div className="activity-table-wrap">
      <p className="secondary-text small">
        显示 {groups.length} 组 · 原始 {activities.length}{" "}
        段；同一窗口的面积变化已合并展示。
      </p>
      <table className={`activity-table ${compact ? "compact" : ""}`}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="col-time">
              时间
            </th>
            <th scope="col">应用与内容</th>
            {!compact && (
              <th scope="col" className="col-goal">
                当时目标
              </th>
            )}
            <th scope="col" className="col-dur">
              时长
            </th>
            <th scope="col" className="col-state">
              状态
            </th>
            {onLocate && (
              <th scope="col" className="col-act">
                <span className="visually-hidden">定位</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const p = projects.get(a.intentId ?? "");
            const key = activityKey(a);
            return (
              <tr
                key={key}
                className={highlightKey === key ? "is-highlight" : ""}
                onClick={() => onOpen(a)}
              >
                <td className="col-time tabular">
                  {timeWithSeconds(a.start)}
                  <span className="dash">–</span>
                  {timeWithSeconds(a.end)}
                </td>
                <td className="col-main">
                  <button
                    type="button"
                    className="row-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(a);
                    }}
                  >
                    <span
                      className="row-title truncate"
                      title={a.title || a.process}
                    >
                      {a.title || appName(a.process)}
                    </span>
                    <span className="row-sub truncate">
                      {appName(a.process)}
                      {a.domain ? ` · ${a.domain}` : ""}
                      {membersOf(a).length > 1
                        ? ` · 合并 ${membersOf(a).length} 段`
                        : ""}
                    </span>
                  </button>
                </td>
                {!compact && (
                  <td className="col-goal">
                    <span className="goal-cell truncate" title={p?.name}>
                      {p ? (
                        <i
                          className="project-mark"
                          style={{ background: p.color }}
                          aria-hidden
                        />
                      ) : null}
                      {p?.name ?? (
                        <span className="secondary-text">无目标</span>
                      )}
                    </span>
                  </td>
                )}
                <td className="col-dur tabular">
                  {duration(a.end - a.start, true)}
                </td>
                <td className="col-state">
                  <StateBadge state={a.state} idle={a.idle} />
                </td>
                {onLocate && (
                  <td className="col-act">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`在时间谱中定位 ${time(a.start)} ${appName(a.process)}`}
                      title="在时间谱中定位"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLocate(a);
                      }}
                    >
                      <Crosshair size={15} aria-hidden />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {pages > 1 && (
        <nav className="pager" aria-label="活动分页">
          <span className="tabular secondary-text">
            第 {current * pageSize + 1}–
            {Math.min(groups.length, (current + 1) * pageSize)} 组，共{" "}
            {groups.length.toLocaleString("zh-CN")} 组
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="上一页"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <span className="tabular">
            {current + 1} / {pages}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="下一页"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </nav>
      )}
    </div>
  );
}
