import type { Project, Stats } from "../../../../../packages/types";
import { duration, percent } from "../../lib/format";

/**
 * Project investment as a table of contents: name, leader dots, time. Shares are
 * of the day's computer activity; time without a goal is listed, not hidden.
 */
export function Investment({
  stats,
  projects,
}: {
  stats: Stats;
  projects: Map<string, Project>;
}) {
  const rows = Object.entries(stats.projectMs)
    .filter(([, ms]) => ms > 0)
    .sort((a, b) => b[1] - a[1]);
  const assigned = rows.reduce((n, [, ms]) => n + ms, 0);
  const unassigned = Math.max(0, stats.activeMs - assigned);
  if (!stats.activeMs)
    return (
      <p className="secondary-text toc-empty">没有电脑活动，暂无投入可整理。</p>
    );
  return (
    <div>
      <p className="secondary-text small">
        包含目标下的相关、打断及待确认活动；不是净相关时长。
      </p>
      <ol className="toc">
        {rows.map(([id, ms], i) => {
          const p = projects.get(id);
          return (
            <li key={id}>
              <span className="toc-no tabular">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="toc-name">
                <i
                  className="project-mark"
                  style={{ background: p?.color ?? "var(--tone-unknown)" }}
                  aria-hidden
                />
                <span className="truncate" title={p?.name}>
                  {p?.name ?? "已不存在的项目"}
                </span>
              </span>
              <span className="toc-leader" aria-hidden />
              <span className="toc-value tabular">
                {duration(ms)}
                <small>{percent(ms, stats.activeMs)}%</small>
              </span>
            </li>
          );
        })}
        {unassigned > 0 && (
          <li className="toc-muted">
            <span className="toc-no" aria-hidden>
              —
            </span>
            <span className="toc-name">
              <i className="project-mark hollow" aria-hidden />
              未设置目标
            </span>
            <span className="toc-leader" aria-hidden />
            <span className="toc-value tabular">
              {duration(unassigned)}
              <small>{percent(unassigned, stats.activeMs)}%</small>
            </span>
          </li>
        )}
      </ol>
    </div>
  );
}
