import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { PanelTop } from "lucide-react";
import type {
  Activity,
  Job,
  Project,
  Session,
} from "../../../../packages/types";
import { localDate } from "../lib/dates";
import { SessionDrawer } from "../features/sessions/Sessions";
import { CorrectionHistory } from "../features/activities/CorrectionReview";
import type { View } from "../features/timeline/layout";
import { api, native } from "../api";
import { useMutate, useNotices, usePending } from "../data/context";
import { StartRecordingDialog } from "../features/recording/controls";
import { Confirm, FiveLaneMark } from "../components/ui/exports";
import { ActivityDrawer } from "../features/activities/ActivityDrawer";
import { AnalyticsPage } from "../features/analytics/AnalyticsPage";
import { JobDialog } from "../features/jobs/JobDialog";
import { JobDrawer } from "../features/jobs/Jobs";
import { StatusLine } from "../features/overview/LiveStrip";
import { OverviewPage } from "../features/overview/OverviewPage";
import { ProjectDialog } from "../features/projects/ProjectDialog";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { RuleDialog } from "../features/settings/RuleDialog";
import { SettingsPage } from "../features/settings/SettingsPage";
import { TimelinePage } from "../features/timeline/TimelinePage";
import { ActionsContext, type AppActions, type PageId } from "./actions";
import { useLive, useNow, useProjectIndex, useToday } from "./hooks";
import { Notices } from "./Notices";

const pages: { id: PageId; name: string }[] = [
  { id: "today", name: "今日概览" },
  { id: "timeline", name: "时间线" },
  { id: "analytics", name: "工作分析" },
  { id: "projects", name: "我的项目" },
  { id: "reports", name: "回顾报告" },
  { id: "settings", name: "偏好设置" },
];

type Overlay =
  | { kind: "activity"; activity: Activity }
  | { kind: "job"; job: Job }
  | { kind: "project"; project: Project | null }
  | { kind: "rule" }
  | { kind: "newJob" }
  | null;

export function AppShell() {
  const today = useToday();
  const live = useLive(today);
  const [page, setPage] = useState<PageId>("today");
  const [date, setDateRaw] = useState(today);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [timelineFocus, setTimelineFocus] = useState<Activity | null>(null);
  const [sessionDialog, setSessionDialog] = useState<Session | null>(null);
  const [historyDialog, setHistoryDialog] = useState(false);
  const [sessionFocus, setSessionFocus] = useState<View | null>(null);
  const [pendingNav, setPendingNav] = useState<PageId | null>(null);
  const [startRequested, setStartRequested] = useState(
    new URLSearchParams(location.search).get("start") === "1",
  );
  const { notices } = useNotices();
  useEffect(() => {
    const request = () => setStartRequested(true);
    window.addEventListener("request-recording", request);
    const unlisten = native ? listen("request-recording", request) : null;
    const unerror = native
      ? listen<string>("recording-error", (e) =>
          notices.push("error", e.payload),
        )
      : null;
    return () => {
      window.removeEventListener("request-recording", request);
      void unlisten?.then((fn) => fn());
      void unerror?.then((fn) => fn());
    };
  }, [notices]);
  const settingsDirty = useRef(false);
  const mutate = useMutate();
  const widgetBusy = usePending("widget");
  const mainRef = useRef<HTMLElement>(null);

  // Follow the calendar when the user was looking at "today" across midnight.
  const lastToday = useRef(today);
  if (lastToday.current !== today) {
    if (date === lastToday.current) setDateRaw(today);
    lastToday.current = today;
  }
  const setDate = useCallback(
    (d: string) => setDateRaw(d > today ? today : d),
    [today],
  );

  const navigate = useCallback(
    (p: PageId) => {
      if (p === page) return;
      if (page === "settings" && settingsDirty.current) {
        setPendingNav(p);
        return;
      }
      setPage(p);
      mainRef.current?.scrollTo({ top: 0 });
    },
    [page],
  );

  const actions = useMemo<AppActions>(
    () => ({
      go: navigate,
      openActivity: (activity) => setOverlay({ kind: "activity", activity }),
      openJob: (job) => setOverlay({ kind: "job", job }),
      editProject: (project) => setOverlay({ kind: "project", project }),
      newRule: () => setOverlay({ kind: "rule" }),
      newJob: () => setOverlay({ kind: "newJob" }),
      showInTimeline: (a) => {
        setSessionFocus(null);
        setTimelineFocus(a);
        navigate("timeline");
      },
      openSession: (s) => setSessionDialog(s),
      openHistory: () => setHistoryDialog(true),
      showSessionInTimeline: (s) => {
        setTimelineFocus(null);
        setSessionFocus({ start: s.start, end: s.end });
        setDateRaw(localDate(new Date(s.start)));
        navigate("timeline");
      },
    }),
    [navigate],
  );

  const nowMs = useNow(1000);
  const projectList = live.data?.projects ?? [];
  const projects = useProjectIndex(live.data?.projects);
  const onDirtyChange = useCallback((d: boolean) => {
    settingsDirty.current = d;
  }, []);

  return (
    <ActionsContext.Provider value={actions}>
      <div className="shell">
        <a className="skip-link" href="#main">
          跳到主要内容
        </a>
        <aside className="rail" aria-label="导航">
          <div className="rail-brand">
            <FiveLaneMark size={26} />
            <div>
              <div className="rail-name">PC Insight</div>
              <div className="rail-sub">本机工作记录</div>
            </div>
          </div>
          <nav className="rail-nav" aria-label="页面">
            <ol>
              {pages.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="rail-link"
                    aria-current={page === p.id ? "page" : undefined}
                    onClick={() => navigate(p.id)}
                  >
                    <span className="rail-no tabular" aria-hidden>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {p.name}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <div className="rail-foot">
            {live.data ? (
              <StatusLine live={live.data} compact />
            ) : (
              <p className="rail-muted">
                {live.error ? "无法读取记录状态" : "正在读取状态…"}
              </p>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm rail-widget"
              disabled={widgetBusy}
              onClick={() => void mutate("widget", () => api.widget())}
            >
              <PanelTop size={14} aria-hidden /> 显示 / 隐藏悬浮窗
            </button>
            <p className="rail-muted">
              {native
                ? "数据只保存在这台电脑"
                : "浏览器演示 · 数据不写入数据库，刷新即清空"}
            </p>
          </div>
        </aside>

        <main className="main" id="main" ref={mainRef} tabIndex={-1}>
          {!native && (
            <div className="demo-ribbon">
              浏览器演示空间：不采集真实窗口，所有内容只保存在当前页面
            </div>
          )}
          {page === "today" && (
            <OverviewPage
              date={date}
              today={today}
              setDate={setDate}
              live={live}
            />
          )}
          {page === "timeline" && (
            <TimelinePage
              key={
                timelineFocus
                  ? `${timelineFocus.id}:${timelineFocus.start}`
                  : "tl"
              }
              date={date}
              today={today}
              setDate={setDate}
              live={live}
              focus={timelineFocus}
              focusSession={sessionFocus}
            />
          )}
          {page === "analytics" && (
            <AnalyticsPage
              date={date}
              today={today}
              setDate={setDate}
              live={live}
            />
          )}
          {page === "projects" && (
            <ProjectsPage today={today} initialDate={date} live={live} />
          )}
          {page === "reports" && (
            <ReportsPage date={date} today={today} setDate={setDate} />
          )}
          {page === "settings" && (
            <SettingsPage
              live={live}
              today={today}
              initialDate={date}
              onDirtyChange={onDirtyChange}
              onNewRule={actions.newRule}
            />
          )}
        </main>

        {sessionDialog && (
          <SessionDrawer
            session={sessionDialog}
            date={localDate(new Date(sessionDialog.start))}
            onClose={() => setSessionDialog(null)}
          />
        )}
        {historyDialog && (
          <CorrectionHistory onClose={() => setHistoryDialog(false)} />
        )}
        {overlay?.kind === "activity" && (
          <ActivityDrawer
            activity={overlay.activity}
            projects={projectList}
            onClose={() => setOverlay(null)}
          />
        )}
        {overlay?.kind === "job" && (
          <JobDrawer
            job={
              overlay.job.end == null
                ? (live.data?.jobs.find((j) => j.id === overlay.job.id) ??
                  overlay.job)
                : overlay.job
            }
            projects={projects}
            nowMs={nowMs}
            onClose={() => setOverlay(null)}
          />
        )}
        {overlay?.kind === "project" && (
          <ProjectDialog
            project={overlay.project}
            onClose={() => setOverlay(null)}
          />
        )}
        {overlay?.kind === "rule" && (
          <RuleDialog projects={projectList} onClose={() => setOverlay(null)} />
        )}
        {overlay?.kind === "newJob" && (
          <JobDialog
            projects={projectList}
            intentId={live.data?.intentId ?? null}
            onClose={() => setOverlay(null)}
          />
        )}
        {pendingNav && (
          <Confirm
            title="离开偏好设置？"
            body="有尚未保存的偏好修改。离开后这些修改会被丢弃。"
            confirmLabel="放弃修改并离开"
            cancelLabel="继续编辑"
            danger
            onCancel={() => setPendingNav(null)}
            onConfirm={() => {
              settingsDirty.current = false;
              setPage(pendingNav);
              setPendingNav(null);
            }}
          />
        )}
        <Notices />
        {startRequested && live.data && (
          <StartRecordingDialog
            projects={projectList}
            onClose={() => setStartRequested(false)}
          />
        )}
      </div>
    </ActionsContext.Provider>
  );
}
