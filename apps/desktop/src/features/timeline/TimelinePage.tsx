import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { Activity } from "../../../../../packages/types";
import { useActions } from "../../app/actions";
import { useDay, useNow, useProjectIndex } from "../../app/hooks";
import { PageHeader, RangeNotice } from "../../app/PageHeader";
import type { RangeResult } from "../../data/context";
import { bounds, shortDate } from "../../lib/dates";
import { time } from "../../lib/format";
import { stateInfo } from "../../lib/semantics";
import {
  DateHeading,
  DateNav,
  EmptyBlock,
  LoadingBlock,
  Button,
} from "../../components/ui/exports";
import { ActivityTable, activityKey } from "../activities/ActivityTable";
import { JobsSection } from "../jobs/Jobs";
import { LiveStrip } from "../overview/LiveStrip";
import { Timeline } from "./Timeline";
import type { View } from "./layout";

const stateFilters = [
  ["all", "全部状态"],
  ["focus", "专注"],
  ["interrupt", "打断 / 短切换"],
  ["distract", "分心"],
  ["unknown", "待确认"],
  ["idle", "离开 / 休息"],
  ["neutral", "未识别状态"],
] as const;

export function TimelinePage({
  date,
  today,
  setDate,
  live,
  focus,
  focusSession,
}: {
  date: string;
  today: string;
  setDate: (d: string) => void;
  live: RangeResult;
  /** Activity requested from another page. */
  focus: Activity | null;
  focusSession?: View | null;
}) {
  const day = useDay(date);
  const data = day.data;
  const nowMs = useNow(date === today ? 1000 : 60_000);
  const projects = useProjectIndex(live.data?.projects ?? data?.projects);
  const actions = useActions();
  const [view, setView] = useState<View | null>(null);
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState<(typeof stateFilters)[number][0]>("all");
  const [role, setRole] = useState<"primary" | "supporting">("primary");
  const [inView, setInView] = useState(false);
  const [sessionSelection, setSessionSelection] = useState("");
  const [focusKey, setFocusKey] = useState<string | null>(
    focus ? activityKey(focus) : null,
  );
  const spectrumRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  // A new date starts at its full extent.
  useEffect(() => {
    setView(null);
    setInView(false);
    setSessionSelection("");
  }, [date]);
  useEffect(() => {
    if (focusSession) setView(focusSession);
  }, [focusSession, date]);

  const zoomed = !!view;
  const rows = useMemo(() => {
    if (!data) return [];
    return data.activities.filter((a) => {
      if (a.role !== role) return false;
      if (tone !== "all" && stateInfo(a.state, a.idle).tone !== tone)
        return false;
      if (inView && view && (a.end <= view.start || a.start >= view.end))
        return false;
      if (
        deferredQuery &&
        !`${a.title} ${a.process} ${a.domain}`
          .toLowerCase()
          .includes(deferredQuery)
      )
        return false;
      return true;
    });
  }, [data, role, tone, inView, view, deferredQuery]);

  const filtered = !!deferredQuery || tone !== "all" || (inView && zoomed);
  const clear = () => {
    setQuery("");
    setTone("all");
    setInView(false);
  };

  return (
    <div className="page">
      <PageHeader
        kicker="时间线"
        title={<DateHeading date={date} today={today} />}
        tools={<DateNav date={date} today={today} onChange={setDate} />}
      />
      {live.data && <LiveStrip live={live.data} viewing={date} today={today} />}
      <RangeNotice view={day} date={date} />
      {!data ? (
        !day.error && (
          <LoadingBlock label={`正在读取 ${shortDate(date)} 的记录…`} />
        )
      ) : (
        <div
          className={`page-body ${day.transitional ? "is-transitional" : ""}`}
        >
          <section className="section" ref={spectrumRef} aria-labelledby="tl-h">
            <header className="section-head">
              <h2 id="tl-h" className="section-title">
                时间谱{" "}
                <span className="section-note">
                  目标 · 主注意力 · 辅助上下文 · 后台任务 · 工作状态
                </span>
              </h2>
            </header>
            <div className="session-controls">
              <select
                aria-label="选择会话"
                value={sessionSelection}
                onChange={(e) => {
                  setSessionSelection(e.target.value);
                  const s = data.sessions.find((s) => s.id === e.target.value);
                  if (s) setView({ start: s.start, end: s.end });
                }}
              >
                <option value="">选择所选日期的会话</option>
                {data.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {time(s.start)}–{time(s.end)} ·{" "}
                    {projects.get(s.intentId ?? "")?.name ?? "未设置目标"}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={
                  !data.sessions.some((s) => s.id === sessionSelection) ||
                  day.transitional
                }
                onClick={() => {
                  const s = data.sessions.find(
                    (s) => s.id === sessionSelection,
                  );
                  if (s) actions.openSession(s);
                }}
              >
                查看所选会话
              </Button>
              <Button
                size="sm"
                disabled={!data.sessions.length || day.transitional}
                onClick={() => {
                  const s = data.sessions.at(-1)!;
                  setView({ start: s.start, end: s.end });
                }}
              >
                最近一次会话
              </Button>
              <Button size="sm" variant="quiet" onClick={actions.openHistory}>
                纠正历史
              </Button>
            </div>
            {data.activities.length || data.jobs.length ? (
              <Timeline
                key={date}
                data={data}
                projects={projects}
                nowMs={nowMs}
                day={{ start: bounds(date)[0], end: bounds(date)[1] }}
                mode="full"
                view={view}
                onViewChange={setView}
                onOpenActivity={actions.openActivity}
                onOpenJob={actions.openJob}
                focusKey={focusKey}
              />
            ) : (
              <EmptyBlock title={`${shortDate(date)} 没有记录`}>
                {date === today
                  ? "开始记录后，五条轨道会在这里逐段展开。"
                  : "这一天没有任何轨道上的记录。"}
              </EmptyBlock>
            )}
          </section>

          <section className="section" aria-labelledby="list-h">
            <header className="section-head">
              <h2 id="list-h" className="section-title">
                全部记录
                <span className="section-note tabular">
                  {rows.length.toLocaleString("zh-CN")} 段
                  {filtered ? "（已筛选）" : ""}
                </span>
              </h2>
            </header>
            <div className="filters" role="search" aria-label="筛选活动">
              <label className="search-field">
                <Search size={15} aria-hidden />
                <span className="visually-hidden">搜索应用、标题或域名</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索应用、标题或域名"
                />
              </label>
              <select
                aria-label="按工作状态筛选"
                value={tone}
                onChange={(e) => setTone(e.target.value as typeof tone)}
              >
                {stateFilters.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                aria-label="轨道"
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                <option value="primary">主注意力</option>
                <option value="supporting">辅助上下文</option>
              </select>
              <label className={`check ${zoomed ? "" : "is-disabled"}`}>
                <input
                  type="checkbox"
                  checked={inView && zoomed}
                  disabled={!zoomed}
                  onChange={(e) => setInView(e.target.checked)}
                />
                仅当前视图
                {view ? `（${time(view.start)}–${time(view.end)}）` : ""}
              </label>
              {filtered && (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={clear}
                >
                  <X size={14} aria-hidden /> 清空筛选
                </button>
              )}
            </div>
            <ActivityTable
              key={`${date}|${role}|${tone}|${deferredQuery}|${inView}`}
              activities={rows}
              sessions={data.sessions}
              projects={projects}
              onOpen={actions.openActivity}
              onLocate={
                role === "primary"
                  ? (a) => {
                      setFocusKey(activityKey(a));
                      spectrumRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }
                  : undefined
              }
              highlightKey={focusKey}
              caption={`${shortDate(date)} 的活动记录`}
              empty={
                filtered ? (
                  <EmptyBlock
                    title="没有符合筛选的记录"
                    mark={false}
                    action={
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={clear}
                      >
                        清空筛选
                      </button>
                    }
                  >
                    {deferredQuery
                      ? `没有包含「${query.trim()}」的${role === "primary" ? "主注意力" : "辅助"}记录。`
                      : "换一个状态或时间范围试试。"}
                  </EmptyBlock>
                ) : (
                  <p className="secondary-text">
                    这一天没有{role === "primary" ? "主注意力" : "辅助上下文"}
                    记录。
                  </p>
                )
              }
            />
          </section>
          <JobsSection
            jobs={data.jobs}
            projects={projects}
            nowMs={nowMs}
            isToday={date === today}
          />
        </div>
      )}
    </div>
  );
}
