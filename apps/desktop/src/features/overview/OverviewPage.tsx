import { ArrowRight, Check, Play, Plus } from "lucide-react";
import type {
  Activity,
  Project,
  Snapshot,
} from "../../../../../packages/types";
import { api } from "../../api";
import { useActions } from "../../app/actions";
import { useDay, useNow, useProjectIndex } from "../../app/hooks";
import { PageHeader, RangeNotice } from "../../app/PageHeader";
import { useMutate, usePending, type RangeResult } from "../../data/context";
import { bounds, shortDate } from "../../lib/dates";
import { duration, percent } from "../../lib/format";
import {
  Button,
  DateHeading,
  DateNav,
  Duration,
  EmptyBlock,
  LoadingBlock,
  Meter,
} from "../../components/ui/exports";
import { ActivityTable } from "../activities/ActivityTable";
import { JobsSection } from "../jobs/Jobs";
import { Investment } from "../projects/Investment";
import { Timeline } from "../timeline/Timeline";
import { LiveStrip } from "./LiveStrip";
import { requestRecording } from "../recording/controls";
import { SessionCard } from "../sessions/Sessions";
import "./overview.css";

export function OverviewPage({
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
  const nowMs = useNow(date === today ? 1000 : 60_000);
  const data = day.data;
  const projects = useProjectIndex(live.data?.projects ?? data?.projects);
  const actions = useActions();

  return (
    <div className="page">
      <PageHeader
        kicker="今日概览"
        title={<DateHeading date={date} today={today} />}
        tools={<DateNav date={date} today={today} onChange={setDate} />}
      />
      {live.data && <LiveStrip live={live.data} viewing={date} today={today} />}
      {live.data && (
        <GettingStarted
          live={live.data}
          hasRecords={!!data?.activities.length}
        />
      )}
      <RangeNotice view={day} date={date} />
      {!data ? (
        !day.error && (
          <LoadingBlock label={`正在读取 ${shortDate(date)} 的记录…`} />
        )
      ) : (
        <div
          className={`page-body ${day.transitional ? "is-transitional" : ""}`}
          aria-busy={day.transitional || undefined}
        >
          <Ledger data={data} />
          <SessionCard
            data={data}
            isCurrent={
              date === today &&
              !!live.data?.recording &&
              !live.data?.breaking &&
              !!data.sessions.at(-1) &&
              nowMs - data.sessions.at(-1)!.end < 15000
            }
          />
          <section className="section" aria-labelledby="spectrum-h">
            <header className="section-head">
              <h2 id="spectrum-h" className="section-title">
                时间谱
                <span className="section-note">五条轨道，同一时间尺度</span>
              </h2>
              <Button
                size="sm"
                variant="quiet"
                icon={<ArrowRight size={14} aria-hidden />}
                onClick={() => actions.go("timeline")}
              >
                在时间线中细查
              </Button>
            </header>
            {data.activities.length || data.jobs.length ? (
              <Timeline
                data={data}
                projects={projects}
                nowMs={nowMs}
                day={{ start: bounds(date)[0], end: bounds(date)[1] }}
                mode="compact"
                onOpenActivity={actions.openActivity}
                onOpenJob={actions.openJob}
              />
            ) : (
              <DayEmpty date={date} today={today} live={live.data} />
            )}
          </section>
          <JobsSection
            jobs={data.jobs}
            projects={projects}
            nowMs={nowMs}
            isToday={date === today}
          />
          <div className="two-col">
            <section className="section" aria-labelledby="inv-h">
              <header className="section-head">
                <h2 id="inv-h" className="section-title">
                  时间去了哪里{" "}
                  <span className="section-note">
                    {shortDate(date)} · 人的时间
                  </span>
                </h2>
              </header>
              <Investment stats={data.stats} projects={projects} />
            </section>
            <RecentActivities data={data} projects={projects} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Human time and machine time, set as an asymmetric ledger. They are never summed. */
function Ledger({ data }: { data: Snapshot }) {
  const s = data.stats;
  return (
    <section className="ledger" aria-label="当日统计">
      <div className="ledger-main">
        <div className="ledger-label">今日累计 · 目标相关时间</div>
        <Duration ms={s.focusMs} className="figure-xl" />
        <p className="ledger-sentence">
          {s.activeMs
            ? `占电脑活动的 ${percent(s.focusMs, s.activeMs)}%（共 ${duration(s.activeMs)}）`
            : "还没有电脑活动记录"}
        </p>
        <Meter
          value={s.focusMs}
          max={s.activeMs}
          tone="focus"
          label={`专注占电脑活动 ${percent(s.focusMs, s.activeMs)}%`}
        />
      </div>
      <dl className="ledger-group">
        <div className="ledger-group-label">人的时间</div>
        <div className="ledger-item">
          <dt>电脑活动</dt>
          <dd>
            <Duration ms={s.activeMs} />
          </dd>
          <dd className="ledger-note">离开 / 休息 {duration(s.idleMs)}</dd>
        </div>
        <div className="ledger-item">
          <dt>分心与打断</dt>
          <dd>
            <Duration ms={s.distractedMs + s.interruptionMs} />
          </dd>
          <dd className="ledger-note">
            分心 {s.distractionCount} 段 {duration(s.distractedMs)} · 打断{" "}
            {duration(s.interruptionMs)}
          </dd>
        </div>
        <div className="ledger-item">
          <dt>待确认</dt>
          <dd>
            <Duration ms={s.unknownMs} />
          </dd>
          <dd className="ledger-note">无目标或无法判断，不算专注也不算分心</dd>
        </div>
      </dl>
      <dl className="ledger-group machine">
        <div className="ledger-group-label">机器时间 · 不与人的时间相加</div>
        <div className="ledger-item">
          <dt>后台任务运行</dt>
          <dd>
            <Duration ms={s.backgroundMs} />
          </dd>
          <dd className="ledger-note">多个任务按区间去重</dd>
        </div>
        <div className="ledger-item">
          <dt>与人的工作并行</dt>
          <dd>
            <Duration ms={s.parallelMs} />
          </dd>
          <dd className="ledger-note">任务与人的活动的交集</dd>
        </div>
      </dl>
    </section>
  );
}

function DayEmpty({
  date,
  today,
  live,
}: {
  date: string;
  today: string;
  live: Snapshot | null;
}) {
  if (date !== today)
    return (
      <EmptyBlock title={`${shortDate(date)} 没有记录`}>
        这一天没有主注意力、辅助窗口或后台任务。若当时使用了
        ActivityWatch，可在偏好设置 → 连接中导入这一天。
      </EmptyBlock>
    );
  if (live?.recording)
    return (
      <EmptyBlock title="正在记录，等待第一段活动">
        采样写入后，几秒内就会出现在这条时间谱上。
      </EmptyBlock>
    );
  return (
    <EmptyBlock title="今天还没有记录">
      选择当前目标，再点击上方的「开始记录」。窗口切换、辅助上下文和工作状态会出现在同一条时间谱上。
    </EmptyBlock>
  );
}

/** First-run checklist; disappears once there are projects, a goal and records. */
function GettingStarted({
  live,
  hasRecords,
}: {
  live: Snapshot;
  hasRecords: boolean;
}) {
  const actions = useActions();
  const mutate = useMutate();
  const busy = usePending("recording");
  const steps = [
    {
      done: live.projects.length > 0,
      title: "创建一个项目",
      note: "名称、类别与识别关键词",
    },
    { done: !!live.intentId, title: "选择当前目标", note: "相关性以它为参照" },
    {
      done: live.recording,
      title: "开始记录",
      note: "默认暂停，由你决定何时开始",
    },
  ];
  if (steps.every((s) => s.done) || (live.projects.length && hasRecords))
    return null;
  const next = steps.findIndex((s) => !s.done);
  return (
    <section className="onboarding" aria-labelledby="onboarding-h">
      <h2 id="onboarding-h" className="section-title">
        从三步开始
      </h2>
      <ol>
        {steps.map((s, i) => (
          <li
            key={s.title}
            className={s.done ? "done" : i === next ? "next" : ""}
          >
            <span className="step-no tabular" aria-hidden>
              {s.done ? <Check size={14} /> : `0${i + 1}`}
            </span>
            <span>
              <strong>{s.title}</strong>
              <span className="secondary-text">
                {s.done ? "已完成" : s.note}
              </span>
            </span>
            {i === next && i === 0 && (
              <Button
                size="sm"
                variant="primary"
                icon={<Plus size={14} aria-hidden />}
                onClick={() => actions.editProject(null)}
              >
                新建项目
              </Button>
            )}
            {i === next && i === 1 && (
              <span className="secondary-text small">
                在上方「当前目标」中选择
              </span>
            )}
            {i === next && i === 2 && (
              <Button
                size="sm"
                variant="primary"
                loading={busy}
                icon={<Play size={14} aria-hidden />}
                onClick={() =>
                  void mutate("recording", () => requestRecording(true), {
                    success: live.intentId ? "已开始记录" : undefined,
                  })
                }
              >
                开始记录
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function RecentActivities({
  data,
  projects,
}: {
  data: Snapshot;
  projects: Map<string, Project>;
}) {
  const actions = useActions();
  const primary: Activity[] = data.activities.filter(
    (a) => a.role === "primary",
  );
  return (
    <section className="section" aria-labelledby="recent-h">
      <header className="section-head">
        <h2 id="recent-h" className="section-title">
          最近的活动{" "}
          <span className="section-note">
            主注意力 · 共 {primary.length.toLocaleString("zh-CN")} 段
          </span>
        </h2>
        {primary.length > 8 && (
          <Button
            size="sm"
            variant="quiet"
            icon={<ArrowRight size={14} aria-hidden />}
            onClick={() => actions.go("timeline")}
          >
            查看全部
          </Button>
        )}
      </header>
      <ActivityTable
        sessions={data.sessions}
        activities={primary
          .slice()
          .sort((a, b) => b.start - a.start)
          .slice(0, 8)}
        projects={projects}
        onOpen={actions.openActivity}
        pageSize={8}
        compact
        caption="最近 8 段主注意力活动"
        empty={
          <p className="secondary-text">开始记录后，最近的活动会出现在这里。</p>
        }
      />
    </section>
  );
}
