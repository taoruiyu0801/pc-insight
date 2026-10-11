import { useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import { native } from "../../api";
import { PageHeader } from "../../app/PageHeader";
import { useNotices, useRanges } from "../../data/context";
import { bounds, shortDate, weekday } from "../../lib/dates";
import { duration, percent } from "../../lib/format";
import { download } from "../../lib/download";
import {
  Button,
  DateNav,
  Duration,
  ErrorBlock,
  FiveLaneMark,
  LoadingBlock,
  Segmented,
} from "../../components/ui/exports";
import { assembleReport, reportDates } from "./assemble";
import {
  methodNotes,
  reportFileName,
  reportMarkdown,
  type ReportModel,
} from "./report-model";
import "./reports.css";

export function ReportsPage({
  date,
  today,
  setDate,
}: {
  date: string;
  today: string;
  setDate: (d: string) => void;
}) {
  const [kind, setKind] = useState<"day" | "week">("day");
  const dates = reportDates(kind, date);
  const ranges = useRanges(dates.map((d) => bounds(d)));
  const state = assembleReport(kind, date, ranges.get, !native, ranges.version);
  const { notices } = useNotices();

  const exportNow = () => {
    // The model is read synchronously from the same state the preview renders;
    // there is no second query that could cover a different range.
    if (state.status !== "ready") return;
    try {
      download(reportFileName(state.model), reportMarkdown(state.model));
      notices.push("success", `已导出 ${reportFileName(state.model)}`);
    } catch (e) {
      notices.push(
        "error",
        `导出失败：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  return (
    <div className="page">
      <PageHeader
        kicker="回顾报告"
        title={kind === "week" ? "最近七日回顾" : "每日回顾"}
        tools={
          <>
            <Segmented
              label="报告范围"
              value={kind}
              onChange={setKind}
              options={[
                { value: "day", label: "每日" },
                { value: "week", label: "最近七日" },
              ]}
            />
            <DateNav
              date={date}
              today={today}
              onChange={setDate}
              label={kind === "week" ? "七日的最后一天" : "报告日期"}
            />
            <Button
              variant="primary"
              icon={<ArrowDownToLine size={15} aria-hidden />}
              disabled={state.status !== "ready"}
              title={
                state.status === "ready"
                  ? undefined
                  : "全部日期的数据恢复有效后才能导出"
              }
              onClick={exportNow}
            >
              导出 Markdown
            </Button>
          </>
        }
      >
        <p className="page-lede">
          预览与导出的文件来自同一份报告：同一日期范围、同一套口径。导出只含汇总统计，不含逐条窗口标题。
        </p>
      </PageHeader>

      {state.status === "loading" && (
        <LoadingBlock
          label={
            kind === "week"
              ? `正在汇总七日数据（${state.loaded}/${state.total}）…`
              : `正在读取 ${shortDate(date)} 的记录…`
          }
        />
      )}
      {state.status === "error" && (
        <ErrorBlock
          title={`${state.failedDates.map(shortDate).join("、")} 读取失败，报告未生成`}
          message={state.message}
          onRetry={ranges.retry}
        />
      )}
      {state.status === "stale" && (
        <div className="range-notice warn" role="status">
          <p>下方为缓存数据，暂不可导出。</p>
          {state.failedDates.length > 0 && (
            <p>
              {state.failedDates.map(shortDate).join("、")} 读取失败：
              {state.message}
            </p>
          )}
          {state.invalidatedDates.length > 0 && (
            <p>
              {state.invalidatedDates.map(shortDate).join("、")}{" "}
              的修改后数据尚未读回。
            </p>
          )}
          <button
            type="button"
            className="link-button"
            disabled={state.refreshing}
            onClick={ranges.retry}
          >
            {state.refreshing ? "正在重试…" : "重试"}
          </button>
        </div>
      )}
      {(state.status === "ready" || state.status === "stale") && (
        <ReportPaper model={state.model} refreshing={state.refreshing} />
      )}
    </div>
  );
}

function ReportPaper({
  model: m,
  refreshing,
}: {
  model: ReportModel;
  refreshing: boolean;
}) {
  const t = m.totals;
  const headline = t.activeMs
    ? m.kind === "week"
      ? `七天里，${duration(t.focusMs)} 与目标相关`
      : `这一天，${duration(t.focusMs)} 与目标相关`
    : m.kind === "week"
      ? "这七天没有电脑活动记录"
      : "这一天没有电脑活动记录";
  return (
    <article className="paper" aria-labelledby="paper-h">
      <header className="paper-masthead">
        <FiveLaneMark size={22} />
        <span>PC Insight · 工作回顾</span>
        <span className="paper-range tabular">{m.rangeLabel}</span>
      </header>
      {refreshing && (
        <p className="paper-refresh secondary-text small" role="status">
          正在更新数据…
        </p>
      )}
      <h2 id="paper-h" className="paper-title">
        {headline}
      </h2>
      <p className="paper-lede">
        {t.activeMs
          ? `共记录 ${duration(t.activeMs)} 电脑活动，专注占 ${percent(t.focusMs, t.activeMs)}%。另有 ${duration(t.idleMs)} 离开或休息。`
          : "没有记录并不代表没有工作——只是这段时间没有在这台电脑上被记录。"}
      </p>

      <dl className="paper-figures">
        <div>
          <dt>目标相关时间</dt>
          <dd>
            <Duration ms={t.focusMs} />
          </dd>
        </div>
        <div>
          <dt>
            深度工作<sup>2</sup>
          </dt>
          <dd>
            <Duration ms={t.deepMs} />
          </dd>
        </div>
        <div>
          <dt>
            待确认<sup>3</sup>
          </dt>
          <dd>
            <Duration ms={t.unknownMs} />
          </dd>
        </div>
        <div className="machine">
          <dt>
            后台任务运行<sup>4</sup>
          </dt>
          <dd>
            <Duration ms={t.backgroundMs} />
          </dd>
        </div>
      </dl>

      {m.kind === "week" && (
        <section className="paper-section">
          <h3>逐日</h3>
          <table className="paper-table">
            <thead>
              <tr>
                <th scope="col">日期</th>
                <th scope="col">电脑活动</th>
                <th scope="col">专注</th>
                <th scope="col">深度工作</th>
                <th scope="col">待确认</th>
              </tr>
            </thead>
            <tbody>
              {m.days.map((d) => (
                <tr key={d.date}>
                  <th scope="row">
                    {shortDate(d.date)}{" "}
                    <span className="secondary-text">{weekday(d.date)}</span>
                  </th>
                  <td className="tabular">
                    {d.totals.activeMs ? duration(d.totals.activeMs) : "—"}
                  </td>
                  <td className="tabular">
                    {d.totals.activeMs ? duration(d.totals.focusMs) : "—"}
                  </td>
                  <td className="tabular">
                    {d.totals.activeMs ? duration(d.totals.deepMs) : "—"}
                  </td>
                  <td className="tabular">
                    {d.totals.activeMs ? duration(d.totals.unknownMs) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="paper-section">
        <h3>目标下记录时间</h3>
        <p className="secondary-text small">
          包含相关、打断及待确认，不等于净相关时长。
        </p>
        {m.projects.length ? (
          <ol className="toc">
            {m.projects.map((p, i) => (
              <li key={p.id}>
                <span className="toc-no tabular">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="toc-name">
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="toc-leader" aria-hidden />
                <span className="toc-value tabular">{duration(p.ms)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="secondary-text">没有归入项目的活动。</p>
        )}
      </section>

      <section className="paper-section">
        <h3>观察</h3>
        <ol className="observations">
          {m.observations.map((o, i) => (
            <li key={i}>
              <span className="obs-no tabular">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p>{o}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="paper-notes">
        <h3>统计口径</h3>
        <ol>
          {methodNotes.map((n, i) => (
            <li key={i}>
              <sup>{i + 1}</sup> {n}
            </li>
          ))}
        </ol>
        <p className="paper-sign">
          本地统计生成 · 无 AI 推测{m.demo ? " · 演示数据" : ""} ·
          导出不含逐条窗口标题
        </p>
      </footer>
    </article>
  );
}
