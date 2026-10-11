import type { Stats } from "../../../../../packages/types";
import { useDay, useProjectIndex } from "../../app/hooks";
import { PageHeader, RangeNotice } from "../../app/PageHeader";
import { useRanges, type RangeResult } from "../../data/context";
import {
  bounds,
  rangeLabel,
  shortDate,
  weekDates,
  weekday,
} from "../../lib/dates";
import { duration, percent } from "../../lib/format";
import { categoryLabel } from "../../lib/semantics";
import {
  DateHeading,
  DateNav,
  ErrorBlock,
  LoadingBlock,
  Meter,
} from "../../components/ui/exports";
import { Investment } from "../projects/Investment";
import "./analytics.css";

export function AnalyticsPage({
  date,
  today,
  setDate,
  live,
}: {
  date: string;
  today: string;
  setDate: (d: string) => void;
  live: RangeResult;
}) {
  const day = useDay(date);
  const data = day.data;
  const projects = useProjectIndex(live.data?.projects ?? data?.projects);

  return (
    <div className="page">
      <PageHeader
        kicker="工作分析"
        title={<DateHeading date={date} today={today} />}
        tools={<DateNav date={date} today={today} onChange={setDate} />}
      />
      <RangeNotice view={day} date={date} />
      <section className="section" aria-labelledby="day-h">
        <header className="section-head">
          <h2 id="day-h" className="section-title">
            所选日{" "}
            <span className="section-note">
              {shortDate(date)} {weekday(date)} · 00:00–24:00
            </span>
          </h2>
        </header>
        {!data ? (
          !day.error && <LoadingBlock label="正在读取所选日的统计…" />
        ) : (
          <div className={day.transitional ? "is-transitional" : ""}>
            <DayMeasures s={data.stats} />
            <div className="two-col">
              <div>
                <h3 className="sub-title">目标下记录时间</h3>
                <Investment stats={data.stats} projects={projects} />
              </div>
              <div>
                <h3 className="sub-title">活动类别</h3>
                <Categories s={data.stats} />
              </div>
            </div>
          </div>
        )}
      </section>
      <WeekSection endDate={date} />
      <aside className="method">
        <h2 className="sub-title">口径</h2>
        <p>
          人的时间只来自主注意力轨道；辅助窗口只提供上下文。后台任务按区间去重，并行时间是任务与人的其他活动的交集。无目标或无法判断的活动保持待确认，不算作专注或分心。这里没有效率评分。
        </p>
      </aside>
    </div>
  );
}

function DayMeasures({ s }: { s: Stats }) {
  const items = [
    {
      label: "深度工作",
      value: duration(s.deepMs),
      note: "当日连续相关活动 ≥ 25 分钟的时段之和",
    },
    {
      label: "最长连续专注",
      value: duration(s.longestFocusMs),
      note: "任何待确认、离开或无关片段都会打断连续",
    },
    {
      label: "无关片段 / 活动小时",
      value: s.activeMs ? s.fragmentation.toFixed(1) : "—",
      note: s.activeMs ? "碎片化观察，不是评分" : "没有电脑活动，无法计算",
    },
    {
      label: "待确认",
      value: duration(s.unknownMs),
      note: s.unknownMs
        ? "可在活动详情中纠正，或补充关键词与规则"
        : "所有活动都有明确判断",
    },
    {
      label: "窗口内容切换",
      value: `${s.switches} 次`,
      note: "相邻且应用或标题不同的主注意力片段",
    },
  ];
  return (
    <dl className="measures">
      {items.map((i) => (
        <div key={i.label} className="measure">
          <dt>{i.label}</dt>
          <dd className="measure-value tabular">{i.value}</dd>
          <dd className="measure-note">{i.note}</dd>
        </div>
      ))}
    </dl>
  );
}

function Categories({ s }: { s: Stats }) {
  const rows = Object.entries(s.categoryMs)
    .filter(([, ms]) => ms > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!rows.length) return <p className="secondary-text">没有电脑活动。</p>;
  return (
    <ul className="cat-list">
      {rows.map(([c, ms]) => (
        <li key={c}>
          <span className="cat-name">{categoryLabel(c)}</span>
          <Meter
            value={ms}
            max={s.activeMs}
            tone="neutral"
            label={`${categoryLabel(c)} ${percent(ms, s.activeMs)}%`}
          />
          <span className="tabular cat-value">
            {duration(ms)} <small>{percent(ms, s.activeMs)}%</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Nice axis maximum in whole hours (at least 1 h), so bar heights read against labelled gridlines. */
function axisMax(ms: number): number {
  const h = Math.max(1, Math.ceil(ms / 3_600_000));
  const step = h <= 4 ? 1 : h <= 8 ? 2 : 4;
  return Math.ceil(h / step) * step * 3_600_000;
}

function WeekSection({ endDate }: { endDate: string }) {
  const dates = weekDates(endDate);
  const week = useRanges(dates.map((d) => bounds(d)));
  const rows = dates.map((d, i) => ({ date: d, entry: week.entries[i] }));
  const loaded = rows.filter((r) => r.entry?.data);
  const failed = rows.filter(
    (r) => !r.entry?.data && r.entry?.error && !r.entry.fetching,
  );
  const max = axisMax(
    Math.max(0, ...loaded.map((r) => r.entry!.data!.stats.activeMs)),
  );
  const gridHours = Array.from(
    { length: max / 3_600_000 + 1 },
    (_, i) => i,
  ).filter((h, _, a) => a.length <= 5 || h % (a.length > 9 ? 4 : 2) === 0);
  const refreshing = rows.some((r) => r.entry?.fetching && r.entry.data);

  return (
    <section className="section" aria-labelledby="week-h">
      <header className="section-head">
        <h2 id="week-h" className="section-title">
          最近七日{" "}
          <span className="section-note">
            {rangeLabel(dates[0], endDate)} · 每日电脑活动的构成（小时）
            {refreshing ? " · 正在更新" : ""}
          </span>
        </h2>
      </header>
      {failed.length > 0 && (
        <ErrorBlock
          compact
          title={`${failed.map((f) => shortDate(f.date)).join("、")} 读取失败`}
          message={failed[0].entry!.error!}
          onRetry={week.retry}
        />
      )}
      <figure className="week-chart" aria-labelledby="week-cap">
        <div className="week-plot" aria-hidden>
          {gridHours.map((h) => (
            <span
              key={h}
              className="week-grid"
              style={{ bottom: `${(h * 3_600_000 * 100) / max}%` }}
            >
              <em className="tabular">{h}h</em>
            </span>
          ))}
          {rows.map(({ date, entry }) => {
            const s = entry?.data?.stats;
            return (
              <div key={date} className="week-col">
                {s ? (
                  s.activeMs ? (
                    <div
                      className="week-bar"
                      style={{ height: `${(s.activeMs / max) * 100}%` }}
                    >
                      <i
                        className="wk-unknown"
                        style={{ flexGrow: s.unknownMs }}
                      />
                      <i
                        className="wk-unrelated"
                        style={{ flexGrow: s.distractedMs + s.interruptionMs }}
                      />
                      <i className="wk-focus" style={{ flexGrow: s.focusMs }} />
                    </div>
                  ) : (
                    <span className="week-zero">0</span>
                  )
                ) : entry?.error ? (
                  <span className="week-missing">失败</span>
                ) : (
                  <span className="week-missing">读取中</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="week-axis" aria-hidden>
          {rows.map(({ date }) => (
            <span key={date} className={date === endDate ? "is-current" : ""}>
              <strong className="tabular">{shortDate(date)}</strong>
              <small>{weekday(date)}</small>
            </span>
          ))}
        </div>
        <figcaption id="week-cap" className="week-legend">
          <span>
            <i className="legend-swatch wk-focus" aria-hidden /> 专注
          </span>
          <span>
            <i className="legend-swatch wk-unrelated" aria-hidden /> 分心与打断
          </span>
          <span>
            <i className="legend-swatch wk-unknown" aria-hidden /> 待确认
          </span>
          <span className="secondary-text">
            柱高 = 当日电脑活动；“0”表示已读取且没有记录。
          </span>
        </figcaption>
      </figure>
      {loaded.length === 0 && failed.length === 0 && (
        <LoadingBlock label="正在读取七日数据…" />
      )}
      <details className="data-table">
        <summary>查看数值表</summary>
        <table>
          <caption className="visually-hidden">最近七日每日统计</caption>
          <thead>
            <tr>
              <th scope="col">日期</th>
              <th scope="col">电脑活动</th>
              <th scope="col">专注</th>
              <th scope="col">分心与打断</th>
              <th scope="col">待确认</th>
              <th scope="col">深度工作</th>
              <th scope="col">后台任务</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ date, entry }) => {
              const s = entry?.data?.stats;
              return (
                <tr key={date}>
                  <th scope="row">
                    {shortDate(date)} {weekday(date)}
                  </th>
                  {s ? (
                    <>
                      <td className="tabular">{duration(s.activeMs)}</td>
                      <td className="tabular">{duration(s.focusMs)}</td>
                      <td className="tabular">
                        {duration(s.distractedMs + s.interruptionMs)}
                      </td>
                      <td className="tabular">{duration(s.unknownMs)}</td>
                      <td className="tabular">{duration(s.deepMs)}</td>
                      <td className="tabular">{duration(s.backgroundMs)}</td>
                    </>
                  ) : (
                    <td colSpan={6} className="secondary-text">
                      {entry?.error ? `读取失败：${entry.error}` : "读取中"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </section>
  );
}
