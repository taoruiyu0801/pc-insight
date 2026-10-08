import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity as Pulse,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coffee,
  Copy,
  FileText,
  Folder,
  GripHorizontal,
  LayoutDashboard,
  Layers,
  Leaf,
  Loader2,
  Monitor,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Workflow,
  X,
  PanelTop,
  ExternalLink,
  AlertCircle,
  Info,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  Activity,
  Category,
  Correction,
  Project,
  Relation,
  Rule,
  Settings,
  Snapshot,
} from "../../../packages/types";
import { api, native } from "./api";
import Timeline from "./Timeline";
import {
  bounds,
  categories,
  categoryColors,
  colors,
  download,
  duration,
  localDate,
  percent,
  report,
  shiftDate,
  states,
  time,
} from "./format";

const pages = [
  { id: "today", name: "今日概览", icon: LayoutDashboard },
  { id: "timeline", name: "时间线", icon: Layers },
  { id: "analytics", name: "工作分析", icon: BarChart3 },
  { id: "projects", name: "我的项目", icon: Folder },
  { id: "reports", name: "回顾报告", icon: FileText },
  { id: "settings", name: "偏好设置", icon: Settings2 },
];
type Page = (typeof pages)[number]["id"];
type Modal = "project" | "rule" | "job" | null;
type Action = (
  task: () => Promise<unknown>,
  message?: string,
) => Promise<boolean>;
const zero = (n: number) => (n ? duration(n) : "0 分钟");

export default function App() {
  const [ready, setReady] = useState(
    native || new URLSearchParams(location.search).get("demo") === "1",
  );
  const [page, setPage] = useState<Page>("today");
  const [date, setDate] = useState(localDate());
  const [data, setData] = useState<Snapshot | null>(null);
  const [week, setWeek] = useState<{ date: string; data: Snapshot }[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [search, setSearch] = useState("");
  const [weekly, setWeekly] = useState(false);
  const sequence = useRef(0);
  const widget = new URLSearchParams(location.search).get("widget") === "1";
  const refresh = useCallback(async () => {
    const seq = ++sequence.current;
    const [start, end] = bounds(date);
    const result = await api.snapshot(start, end);
    if (seq === sequence.current) setData(result);
  }, [date]);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const poll = () =>
      refresh().catch((e) => {
        if (alive) setError(String(e));
      });
    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      alive = false;
      sequence.current++;
      clearInterval(timer);
    };
  }, [ready, refresh]);
  useEffect(() => {
    if (!ready || !["analytics", "reports"].includes(page)) return;
    let alive = true;
    Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const d = shiftDate(date, i - 6);
        return api.snapshot(...bounds(d)).then((data) => ({ date: d, data }));
      }),
    )
      .then((w) => {
        if (alive) setWeek(w);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [date, page, ready, notice]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const action: Action = async (task, message) => {
    setBusy(true);
    setError("");
    try {
      await task();
      await refresh();
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!ready)
    return (
      <div className="welcome">
        <div className="brand-mark">
          i<span />
        </div>
        <div className="eyebrow">PC INSIGHT · LOCAL FIRST</div>
        <h1>
          看见时间，
          <br />
          也看见你的工作方式。
        </h1>
        <p>
          从当前目标，到每一次注意力转移。
          <br />
          一个只属于这台电脑的工作记录空间。
        </p>
        <button
          className="primary"
          onClick={() => {
            setReady(true);
            history.replaceState(null, "", "?demo=1");
          }}
        >
          浏览交互演示 <ArrowRight size={17} />
        </button>
        <div className="welcome-note">
          <ShieldCheck size={16} /> 浏览器演示使用示例数据。真实采集请运行
          Windows 桌面版。
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="loading">
        <Loader2 className="spin" />
        {error || "正在打开你的工作空间…"}
      </div>
    );
  if (widget)
    return (
      <div className="mini-app">
        <div
          className="mini-top"
          data-tauri-drag-region
          onMouseDown={() => {
            if (native) void getCurrentWindow().startDragging();
          }}
        >
          <span>
            <i className={`status-dot ${data.recording ? "on" : ""}`} />
            {native ? "PC INSIGHT" : "演示 · PC INSIGHT"}
          </span>
          <GripHorizontal size={16} />
        </div>
        <h3>
          {data.projects.find((p) => p.id === data.intentId)?.name ??
            "尚未设置目标"}
        </h3>
        <div className="mini-metrics">
          <strong>{zero(data.stats.focusMs)}</strong>
          <span>
            {data.breaking
              ? "休息中"
              : data.recording
                ? (data.currentApp ?? "正在记录")
                : "记录已暂停"}
          </span>
        </div>
        <div className="mini-actions">
          <button
            onClick={() => void action(() => api.recording(!data.recording))}
          >
            {data.recording ? <Pause size={15} /> : <Play size={15} />}{" "}
            {data.recording ? "暂停" : "开始"}
          </button>
          <button onClick={() => void api.dashboard()}>
            打开概览 <ArrowUpRight size={15} />
          </button>
        </div>
        {error && <small role="alert">{error}</small>}
      </div>
    );
  const intent = data.projects.find((p) => p.id === data.intentId);
  const s = data.stats;
  const primary = data.activities.filter((a) => a.role === "primary");
  const filtered = primary.filter((a) =>
    `${a.title} ${a.process} ${a.domain}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const createProject = () => {
    setEditProject(null);
    setModal("project");
  };
  const exportReport = async () => {
    const summary = weekly
      ? await api.snapshot(bounds(shiftDate(date, -6))[0], bounds(date)[1])
      : data;
    download(
      `PC-Insight-${date}-${weekly ? "week" : "day"}.md`,
      report(
        summary,
        weekly ? `${shiftDate(date, -6)} — ${date}` : date,
        weekly ? "七日" : "每日",
        !native,
      ),
    );
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            i<span />
          </div>
          <div>
            PC Insight<small>让工作有迹可循</small>
          </div>
        </div>
        <div className="nav-caption">你的工作空间</div>
        <nav>
          {pages.map((p) => (
            <button
              key={p.id}
              aria-label={p.name}
              title={p.name}
              className={`nav-item ${page === p.id ? "active" : ""}`}
              onClick={() => setPage(p.id)}
            >
              <p.icon size={18} />
              <span>{p.name}</span>
              {p.id === "today" && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={21} />
            <strong>只在你的电脑里</strong>
            <p>
              你的活动，你的数据。
              <br />
              本地存储，安心记录。
            </p>
            <span>
              LOCAL FIRST <i />
            </span>
          </div>
          <button
            className="mini-launch"
            onClick={() => void action(api.widget)}
          >
            <PanelTop size={17} /> 打开悬浮窗 <ArrowUpRight size={15} />
          </button>
          <div className="sidebar-footer">
            <span className="avatar">ME</span>
            <div>
              个人工作空间<small>PC Insight · 0.4.0</small>
            </div>
            <Leaf size={15} />
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            工作空间 <ChevronRight size={13} />
            <strong>{pages.find((p) => p.id === page)?.name}</strong>
          </div>
          <div className="top-actions">
            {!native && (
              <span className="demo-badge">演示数据 · 不写入数据库</span>
            )}
            <span className="record-status">
              <i className={`status-dot ${data.recording ? "on" : ""}`} />
              {data.breaking
                ? "休息中"
                : data.recording
                  ? "正在本地记录"
                  : "记录已暂停"}
            </span>
            <button
              className="icon-button"
              title="偏好设置"
              onClick={() => setPage("settings")}
            >
              <Settings2 size={18} />
            </button>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={17} />
            <span>{error}</span>
            <button aria-label="关闭错误" onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {data.error && (
          <div className="error-banner" role="alert">
            <Info size={17} /> 采集状态：{data.error}
          </div>
        )}
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "today"
                  ? "A LITTLE MORE INTENTIONAL, EVERY DAY"
                  : page === "timeline"
                    ? "EVERY MOMENT HAS A CONTEXT"
                    : page === "analytics"
                      ? "UNDERSTAND YOUR RHYTHM"
                      : page === "projects"
                        ? "MAKE ROOM FOR WHAT MATTERS"
                        : page === "reports"
                          ? "REFLECT, THEN MOVE FORWARD"
                          : "YOUR SPACE, YOUR RULES"}
              </div>
              <h1>
                {page === "today"
                  ? "今天，把注意力留给重要的事。"
                  : page === "timeline"
                    ? "每一段时间，都有来处。"
                    : page === "analytics"
                      ? "找到属于你的工作节奏。"
                      : page === "projects"
                        ? "让投入，有一个方向。"
                        : page === "reports"
                          ? "回看一天，也看见进步。"
                          : "按你的方式，记录工作。"}
              </h1>
              <p>
                {page === "today"
                  ? "不只是用了多久电脑，更是如何度过这一天。"
                  : page === "timeline"
                    ? "目标、注意力与并行工作，在同一条时间轴上相遇。"
                    : page === "analytics"
                      ? "基于真实活动的七日观察，让数字有据可循。"
                      : page === "projects"
                        ? "设置当前目标，让专注与分心的判断更贴近你的实际工作。"
                        : page === "reports"
                          ? "本地计算，清晰解释。把工作记录整理成可以带走的回顾。"
                          : "所有设置立即应用；你的原始活动始终保留在本地。"}
              </p>
            </div>
            {!["projects", "settings"].includes(page) && (
              <div className="date-picker">
                <button
                  aria-label="前一天"
                  onClick={() => setDate(shiftDate(date, -1))}
                >
                  <ArrowLeft size={14} />
                </button>
                <input
                  aria-label="查看日期"
                  type="date"
                  value={date}
                  max={localDate()}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                />
                <button
                  aria-label="后一天"
                  disabled={date >= localDate()}
                  onClick={() => setDate(shiftDate(date, 1))}
                >
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
          {(page === "today" || page === "timeline") && (
            <>
              <section className="intent-bar">
                <div className="intent-icon">
                  <Target size={22} />
                </div>
                <div className="intent-text">
                  <span>此刻，想专注于</span>
                  <select
                    aria-label="当前目标"
                    value={data.intentId ?? ""}
                    onChange={(e) =>
                      void action(
                        () => api.intent(e.target.value || null),
                        "已切换当前目标",
                      )
                    }
                  >
                    <option value="">选择一个工作目标</option>
                    {data.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="text-button" onClick={createProject}>
                  <Plus size={15} /> 新目标
                </button>
                <div className="intent-divider" />
                <span className="intent-tip">
                  {intent
                    ? `${categories[intent.category]} · ${intent.keywords.length} 个识别关键词`
                    : "先有方向，再谈专注"}
                </span>
                <div className="intent-actions">
                  <button
                    className="secondary"
                    disabled={busy || !data.recording}
                    onClick={() =>
                      void action(() => api.recording(true, !data.breaking))
                    }
                  >
                    <Coffee size={16} />
                    {data.breaking ? "结束休息" : "休息一下"}
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void action(
                        () => api.recording(!data.recording),
                        data.recording ? "已暂停记录" : "已开始记录",
                      )
                    }
                  >
                    {data.recording ? <Pause size={15} /> : <Play size={15} />}{" "}
                    {data.recording ? "暂停记录" : "开始记录"}
                  </button>
                </div>
              </section>
              {page === "today" && (
                <div className="metric-grid">
                  <Metric
                    featured
                    label="目标专注"
                    value={zero(s.focusMs)}
                    icon={<Target size={19} />}
                    foot={
                      s.activeMs
                        ? `占电脑活动的 ${percent(s.focusMs, s.activeMs)}%`
                        : "等待第一段专注记录"
                    }
                  >
                    <div className="focus-meter">
                      <i
                        style={{ width: `${percent(s.focusMs, s.activeMs)}%` }}
                      />
                    </div>
                  </Metric>
                  <Metric
                    label="电脑活动"
                    value={zero(s.activeMs)}
                    icon={<Monitor size={19} />}
                    foot={`${zero(s.idleMs)} 离开 / 休息`}
                  >
                    <div className="metric-note">每一分钟，只计算一次</div>
                  </Metric>
                  <Metric
                    label="分心时间"
                    value={zero(s.distractedMs)}
                    icon={<Coffee size={19} />}
                    foot={`${s.distractionCount} 次明显分心`}
                  >
                    <div className="metric-note">
                      短暂打断 {zero(s.interruptionMs)}
                    </div>
                  </Metric>
                  <Metric
                    label="自动任务"
                    value={zero(s.backgroundMs)}
                    icon={<Workflow size={19} />}
                    foot={`${zero(s.parallelMs)} 与其他工作并行`}
                  >
                    <div className="metric-note">后台任务单独计时</div>
                  </Metric>
                </div>
              )}
              <Timeline
                data={data}
                onSelect={setSelected}
                large={page === "timeline"}
              />
              {page === "today" && (
                <div className="below-grid">
                  <section className="panel rhythm-panel">
                    <div className="panel-heading compact">
                      <h2>
                        <Leaf size={18} /> 让专注，自然发生
                      </h2>
                      <span className="subtle">基于当日记录</span>
                    </div>
                    <div className="rhythm-stats">
                      <div>
                        <span>最长连续专注</span>
                        <strong>{zero(s.longestFocusMs)}</strong>
                      </div>
                      <div>
                        <span>深度工作</span>
                        <strong>{zero(s.deepMs)}</strong>
                      </div>
                      <div>
                        <span>上下文切换</span>
                        <strong>
                          {s.switches}
                          <small> 次</small>
                        </strong>
                      </div>
                    </div>
                    <div className="insight">
                      <Sparkles size={18} />
                      <p>
                        {s.activeMs === 0
                          ? "从一个明确的小目标开始。记录会帮你看见一天的节奏。"
                          : s.longestFocusMs >= 1_500_000
                            ? `你完成了 ${duration(s.longestFocusMs)} 的连续专注。这样的完整时间段，值得为自己保留。`
                            : "专注还在积累。连续相关活动达到 25 分钟，就会计入深度工作。"}
                      </p>
                    </div>
                  </section>
                  <section className="panel projects-summary">
                    <div className="panel-heading compact">
                      <h2>时间去了哪里</h2>
                      <button
                        className="text-button"
                        onClick={() => setPage("projects")}
                      >
                        查看项目 <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <ProjectBars data={data} />
                  </section>
                </div>
              )}
              <section className="panel activity-panel">
                <div className="panel-heading compact">
                  <h2>
                    活动明细 <span className="count">{primary.length}</span>
                  </h2>
                  <label className="search">
                    <Search size={15} />
                    <input
                      placeholder="搜索应用、标题或域名"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>应用与内容</th>
                        <th>当前目标</th>
                        <th>时长</th>
                        <th>工作状态</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered
                        .slice()
                        .reverse()
                        .map((a, i) => (
                          <tr
                            key={`${a.id}:${i}`}
                            onClick={() => setSelected(a)}
                            tabIndex={0}
                            onKeyDown={(e) =>
                              e.key === "Enter" && setSelected(a)
                            }
                          >
                            <td className="mono">
                              {time(a.start)} <span>—</span> {time(a.end)}
                            </td>
                            <td>
                              <div className="app-cell">
                                <span
                                  className="app-icon"
                                  style={{
                                    background: `${categoryColors[a.category]}18`,
                                    color: categoryColors[a.category],
                                  }}
                                >
                                  {a.process.slice(0, 1).toUpperCase()}
                                </span>
                                <div>
                                  <strong>{a.title || a.process}</strong>
                                  <small>
                                    {a.process}
                                    {a.domain ? ` · ${a.domain}` : ""}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="project-label">
                                <i
                                  style={{
                                    background:
                                      data.projects.find(
                                        (p) => p.id === a.intentId,
                                      )?.color ?? "#c6cbd4",
                                  }}
                                />
                                {data.projects.find((p) => p.id === a.intentId)
                                  ?.name ?? "未设置目标"}
                              </span>
                            </td>
                            <td>{duration(a.end - a.start, true)}</td>
                            <td>
                              <span className={`state-badge ${a.state}`}>
                                <i />
                                {states[a.state]}
                              </span>
                            </td>
                            <td>
                              <ChevronRight size={15} />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!filtered.length && (
                    <div className="empty-small">
                      {search
                        ? "没有找到匹配的活动"
                        : "开始记录后，活动明细会出现在这里。"}
                    </div>
                  )}
                </div>
              </section>
              <Jobs data={data} onNew={() => setModal("job")} action={action} />
            </>
          )}
          {page === "analytics" && (
            <>
              <div className="metric-grid">
                <Metric
                  label="最长连续专注"
                  value={zero(s.longestFocusMs)}
                  icon={<Target size={18} />}
                  foot="当天最长的连续相关活动"
                />
                <Metric
                  label="深度工作"
                  value={zero(s.deepMs)}
                  icon={<Leaf size={18} />}
                  foot="连续相关活动 ≥ 25 分钟"
                />
                <Metric
                  label="无关片段 / 小时"
                  value={s.fragmentation.toFixed(1)}
                  icon={<Pulse size={18} />}
                  foot="碎片化观察，不是生产力评分"
                />
                <Metric
                  label="待确认的时间"
                  value={zero(s.unknownMs)}
                  icon={<Info size={18} />}
                  foot="补充规则，让分类更准确"
                />
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div className="eyebrow">
                    LAST SEVEN DAYS<h2>留意趋势，而非苛求每一天</h2>
                  </div>
                  <span className="subtle">
                    {shiftDate(date, -6)} — {date}
                  </span>
                </div>
                <div className="weekly-chart">
                  {week.map((day) => {
                    const max = Math.max(
                      ...week.map((w) => w.data.stats.activeMs),
                      3_600_000,
                    );
                    const st = day.data.stats;
                    return (
                      <div className="chart-column" key={day.date}>
                        <span>{zero(st.activeMs)}</span>
                        <div className="bar-area">
                          <div
                            className="stacked-bar"
                            style={{ height: `${(st.activeMs / max) * 100}%` }}
                            title={`专注 ${zero(st.focusMs)} / 活动 ${zero(st.activeMs)}`}
                          >
                            <i
                              style={{
                                height: `${percent(st.focusMs, st.activeMs)}%`,
                                background: colors.focused,
                              }}
                            />
                            <i
                              style={{
                                height: `${percent(st.distractedMs + st.interruptionMs, st.activeMs)}%`,
                                background: colors.distracted,
                              }}
                            />
                            <i
                              style={{ flex: 1, background: colors.unknown }}
                            />
                          </div>
                        </div>
                        <strong>{day.date.slice(5).replace("-", " / ")}</strong>
                        <small>
                          {new Date(bounds(day.date)[0]).toLocaleDateString(
                            "zh-CN",
                            { weekday: "short" },
                          )}
                        </small>
                      </div>
                    );
                  })}
                </div>
                <div className="chart-caption">
                  绿色：专注 · 暖色：无关活动 ·
                  灰色：待确认；空白日期表示没有记录。
                </div>
              </section>
              <div className="below-grid">
                <section className="panel">
                  <div className="panel-heading compact">
                    <h2>项目投入 · 当前日期</h2>
                  </div>
                  <ProjectBars data={data} />
                </section>
                <section className="panel">
                  <div className="panel-heading compact">
                    <h2>活动构成 · 当前日期</h2>
                  </div>
                  <div className="category-list">
                    {Object.entries(s.categoryMs)
                      .sort((a, b) => b[1] - a[1])
                      .map(([c, ms]) => (
                        <div key={c}>
                          <span>
                            <i style={{ background: categoryColors[c] }} />
                            {categories[c]}
                          </span>
                          <strong>{zero(ms)}</strong>
                          <small>{percent(ms, s.activeMs)}%</small>
                        </div>
                      ))}
                    {!s.activeMs && (
                      <div className="empty-small">
                        有记录后，这里会展示活动构成。
                      </div>
                    )}
                  </div>
                </section>
              </div>
              <section className="method-note">
                <Info size={18} />
                <div>
                  <strong>每一个数字，都能解释</strong>
                  <p>
                    人的时间仅来自主注意力轨道。辅助窗口只提供上下文。后台任务按区间去重，并行时间是它与人的其他工作时间的交集。未确认的相关性不会被算成专注。
                  </p>
                </div>
              </section>
            </>
          )}
          {page === "projects" && (
            <>
              <div className="section-toolbar">
                <span>
                  {data.projects.length} 个项目 · 用关键词连接日常活动
                </span>
                <button className="primary" onClick={createProject}>
                  <Plus size={16} /> 创建项目
                </button>
              </div>
              <div className="project-grid">
                {data.projects.map((p) => (
                  <section className="panel project-card" key={p.id}>
                    <div className="project-card-top">
                      <span
                        className="project-symbol"
                        style={{ background: `${p.color}18`, color: p.color }}
                      >
                        <Folder size={23} />
                      </span>
                      <button
                        className="icon-button"
                        title={`编辑 ${p.name}`}
                        onClick={() => {
                          setEditProject(p);
                          setModal("project");
                        }}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </div>
                    <span className="eyebrow">{categories[p.category]}</span>
                    <h2>{p.name}</h2>
                    <div className="keyword-list">
                      {p.keywords.map((k) => (
                        <span key={k}>{k}</span>
                      ))}
                    </div>
                    <div className="project-card-bottom">
                      <span>
                        所选日期 <strong>{zero(s.projectMs[p.id] ?? 0)}</strong>
                      </span>
                      <button
                        className={
                          data.intentId === p.id
                            ? "current-project"
                            : "secondary"
                        }
                        disabled={data.intentId === p.id}
                        onClick={() =>
                          void action(() => api.intent(p.id), "已设为当前目标")
                        }
                      >
                        {data.intentId === p.id ? (
                          <>
                            <Check size={14} /> 当前目标
                          </>
                        ) : (
                          <>
                            设为目标 <ArrowUpRight size={14} />
                          </>
                        )}
                      </button>
                    </div>
                  </section>
                ))}
                <button className="new-project-card" onClick={createProject}>
                  <span>
                    <Plus size={24} />
                  </span>
                  <strong>为重要的事，留一个位置</strong>
                  <small>添加学习、科研或工作项目</small>
                </button>
              </div>
              <section className="method-note">
                <Target size={20} />
                <div>
                  <strong>相同应用，不一定是相同的工作</strong>
                  <p>
                    看 Cisco
                    教程和刷娱乐视频，都可能发生在浏览器。项目关键词与当前目标一起，让软件理解这一次活动的含义。
                  </p>
                </div>
              </section>
            </>
          )}
          {page === "reports" && (
            <>
              <div className="section-toolbar">
                <div className="segmented">
                  <button
                    className={!weekly ? "selected" : ""}
                    onClick={() => setWeekly(false)}
                  >
                    每日回顾
                  </button>
                  <button
                    className={weekly ? "selected" : ""}
                    onClick={() => setWeekly(true)}
                  >
                    最近七日
                  </button>
                </div>
                <button
                  className="primary"
                  onClick={() => void action(exportReport, "报告已导出")}
                >
                  <ArrowDownToLine size={16} /> 导出 Markdown
                </button>
              </div>
              <ReportView data={data} date={date} weekly={weekly} week={week} />
            </>
          )}
          {page === "settings" && (
            <SettingsPage
              data={data}
              date={date}
              action={action}
              onRule={() => setModal("rule")}
            />
          )}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={14} />{" "}
              {native ? "数据仅保存在本机" : "当前为交互演示，所有活动均为示例"}
            </span>
            <span>记录工作，也留出生活的空白。</span>
          </footer>
        </div>
      </main>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}
      {modal && (
        <ModalForm
          kind={modal}
          data={data}
          project={modal === "project" ? editProject : null}
          onClose={() => setModal(null)}
          action={action}
        />
      )}
      {selected && (
        <Detail
          activity={selected}
          data={data}
          onClose={() => setSelected(null)}
          action={action}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  foot,
  featured = false,
  children,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  foot: string;
  featured?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className={`metric ${featured ? "featured" : ""}`}>
      <div className="metric-heading">
        <span>{label}</span>
        {icon}
      </div>
      <strong className="metric-value">{value}</strong>
      {children}
      <div className="metric-foot">
        {featured && <i />}
        {foot}
      </div>
    </section>
  );
}
function ProjectBars({ data }: { data: Snapshot }) {
  const entries = Object.entries(data.stats.projectMs).sort(
    (a, b) => b[1] - a[1],
  );
  return (
    <div className="project-bars">
      {entries.map(([id, ms]) => {
        const p = data.projects.find((p) => p.id === id);
        return (
          <div key={id}>
            <div className="bar-label">
              <span>
                <i style={{ background: p?.color }} />
                {p?.name ?? "未命名"}
              </span>
              <strong>{duration(ms)}</strong>
            </div>
            <div className="progress-track">
              <i
                style={{
                  width: `${percent(ms, data.stats.activeMs)}%`,
                  background: p?.color,
                }}
              />
            </div>
          </div>
        );
      })}
      {!entries.length && (
        <div className="empty-small">设置当前目标后，这里会整理你的投入。</div>
      )}
    </div>
  );
}
function Jobs({
  data,
  onNew,
  action,
}: {
  data: Snapshot;
  onNew: () => void;
  action: Action;
}) {
  return (
    <section className="panel">
      <div className="panel-heading compact">
        <h2>
          <Workflow size={18} /> 后台也在向前
        </h2>
        <button className="text-button" onClick={onNew}>
          <Plus size={15} /> 开始后台任务
        </button>
      </div>
      <div className="job-list">
        {data.jobs.map((j) => (
          <div className="job-row" key={j.id}>
            <span className="job-icon">
              <Workflow size={18} />
            </span>
            <div className="job-name">
              <strong>{j.name}</strong>
              <small>
                {j.tool} · {time(j.start)} 开始 · 与其他工作并行{" "}
                {zero(j.parallelMs)}
              </small>
            </div>
            <span className={`job-status ${j.status}`}>
              {
                (
                  {
                    running: "运行中",
                    completed: "已完成",
                    failed: "失败",
                    stopped: "已停止",
                    interrupted: "意外中断",
                  } as Record<string, string>
                )[j.status]
              }
            </span>
            <strong>{duration((j.end ?? Date.now()) - j.start)}</strong>
            {j.status === "running" && (
              <div className="job-actions">
                <button
                  className="secondary"
                  onClick={() =>
                    void action(
                      () => api.finishJob(j.id, "completed"),
                      "任务已完成",
                    )
                  }
                >
                  <Check size={14} /> 完成
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    void action(
                      () => api.finishJob(j.id, "failed"),
                      "已标记失败",
                    )
                  }
                >
                  失败
                </button>
              </div>
            )}
          </div>
        ))}
        {!data.jobs.length && (
          <div className="empty-small">
            让 Codex 生成代码，或等待 Python
            处理数据时，在这里记下一个后台任务。
          </div>
        )}
      </div>
      <div className="panel-footnote">
        任务以明确的开始和结束信号计时；进程打开不等于任务正在运行。
      </div>
    </section>
  );
}

function ReportView({
  data,
  date,
  weekly,
  week,
}: {
  data: Snapshot;
  date: string;
  weekly: boolean;
  week: { date: string; data: Snapshot }[];
}) {
  const items = weekly ? week.map((w) => w.data) : [data];
  const total = (
    key:
      | "activeMs"
      | "focusMs"
      | "distractedMs"
      | "deepMs"
      | "parallelMs"
      | "unknownMs",
  ) => items.reduce((n, d) => n + d.stats[key], 0);
  return (
    <section className="report-paper">
      <div className="report-brand">
        <div className="brand-mark">
          i<span />
        </div>
        <span>PC INSIGHT / PERSONAL REFLECTION</span>
        <Leaf size={22} />
      </div>
      <div className="report-date">
        {weekly
          ? `${shiftDate(date, -6)} — ${date}`
          : new Date(bounds(date)[0]).toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
      </div>
      <h2>
        {weekly ? "这一周，你如何投入时间。" : "今天的投入，值得被看见。"}
      </h2>
      <p className="report-lead">
        {total("activeMs")
          ? `记录了 ${duration(total("activeMs"))} 的电脑活动，其中 ${duration(total("focusMs"))} 与工作目标相关。`
          : "这段时间还没有活动记录。从下一次专注开始，让回顾慢慢丰富。"}
      </p>
      <div className="report-metrics">
        <div>
          <span>目标相关专注</span>
          <strong>{zero(total("focusMs"))}</strong>
        </div>
        <div>
          <span>深度工作</span>
          <strong>{zero(total("deepMs"))}</strong>
        </div>
        <div>
          <span>后台并行</span>
          <strong>{zero(total("parallelMs"))}</strong>
        </div>
      </div>
      <h3>留给下一次工作的观察</h3>
      <div className="report-observation">
        <span>01</span>
        <p>
          专注占比为{" "}
          <strong>{percent(total("focusMs"), total("activeMs"))}%</strong>
          。它衡量的是与目标相关的时间，而不是对你一天的评分。
        </p>
      </div>
      <div className="report-observation">
        <span>02</span>
        <p>
          {total("unknownMs")
            ? `还有 ${duration(total("unknownMs"))} 的活动相关性待确认。补充关键词或修正分类，下一次回顾会更清晰。`
            : "为学习、科研和开发分别设置目标，可以更清楚地看见时间分配。"}
        </p>
      </div>
      <div className="report-observation">
        <span>03</span>
        <p>
          明显分心共 <strong>{zero(total("distractedMs"))}</strong>
          。只有持续至少 3
          分钟的无关片段才会计入，短暂回复消息会单独记录为打断。
        </p>
      </div>
      <div className="report-signoff">
        让每一天，比昨天更了解自己一点。
        <span>本地统计生成 · 无 AI 推测{!native ? " · 演示数据" : ""}</span>
      </div>
    </section>
  );
}

function SettingsPage({
  data,
  date,
  action,
  onRule,
}: {
  data: Snapshot;
  date: string;
  action: Action;
  onRule: () => void;
}) {
  const [settings, setSettings] = useState<Settings>(data.settings);
  const [autostart, setAutostart] = useState(false);
  useEffect(() => {
    void api
      .autostart()
      .then(setAutostart)
      .catch(() => {});
  }, []);
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-heading compact">
          <h2>
            <Settings2 size={18} /> 记录偏好
          </h2>
        </div>
        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            void action(() => api.settings(settings), "偏好已保存");
          }}
        >
          <div className="setting-row">
            <div>
              <strong>采集来源</strong>
              <small>
                {data.collectorSource} · {data.awStatus}
              </small>
            </div>
            <select
              aria-label="采集来源"
              value={settings.collectorSource}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  collectorSource: e.target
                    .value as Settings["collectorSource"],
                })
              }
            >
              <option value="auto">优先 ActivityWatch</option>
              <option value="activitywatch">仅 ActivityWatch</option>
              <option value="native">仅 Windows 原生</option>
            </select>
          </div>
          <div className="setting-row">
            <div>
              <strong>采样间隔</strong>
              <small>Windows 原生采集与辅助窗口的频率</small>
            </div>
            <select
              aria-label="采样间隔"
              value={settings.sampleSeconds}
              onChange={(e) =>
                setSettings({ ...settings, sampleSeconds: +e.target.value })
              }
            >
              {[1, 2, 3, 5].map((n) => (
                <option key={n} value={n}>
                  {n} 秒
                </option>
              ))}
            </select>
          </div>
          <div className="setting-row">
            <div>
              <strong>离开检测</strong>
              <small>仅影响原生采集；ActivityWatch 使用其 AFK 设置</small>
            </div>
            <select
              aria-label="离开检测"
              value={settings.idleSeconds}
              onChange={(e) =>
                setSettings({ ...settings, idleSeconds: +e.target.value })
              }
            >
              {[30, 60, 180, 300, 600].map((n) => (
                <option key={n} value={n}>
                  {n} 秒
                </option>
              ))}
            </select>
          </div>
          <div className="setting-row">
            <div>
              <strong>原始事件保留</strong>
              <small>到期仅清理原始采样，聚合活动继续保留</small>
            </div>
            <select
              aria-label="原始事件保留"
              value={settings.retentionDays}
              onChange={(e) =>
                setSettings({ ...settings, retentionDays: +e.target.value })
              }
            >
              {[7, 30, 60, 90, 365].map((n) => (
                <option key={n} value={n}>
                  {n} 天
                </option>
              ))}
            </select>
          </div>
          <div className="setting-row">
            <div>
              <strong>记录窗口标题</strong>
              <small>关闭后不保存新标题，既有记录保留</small>
            </div>
            <input
              aria-label="记录窗口标题"
              type="checkbox"
              className="toggle"
              checked={settings.recordTitles}
              onChange={(e) =>
                setSettings({ ...settings, recordTitles: e.target.checked })
              }
            />
          </div>
          <label className="form-label">
            排除应用 <small>进程名称，逗号分隔；如 password.exe</small>
            <input
              value={settings.excludedApps.join(", ")}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  excludedApps: e.target.value.split(",").map((x) => x.trim()),
                })
              }
            />
          </label>
          <label className="form-label">
            排除标题 <small>包含以下关键词的窗口不会写入数据库</small>
            <input
              value={settings.excludedTitles.join(", ")}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  excludedTitles: e.target.value
                    .split(",")
                    .map((x) => x.trim()),
                })
              }
            />
          </label>
          <button className="primary" type="submit">
            <Check size={15} /> 保存偏好
          </button>
        </form>
      </section>
      <div className="settings-stack">
        <section className="panel">
          <div className="panel-heading compact">
            <h2>
              <ShieldCheck size={18} /> 数据与隐私
            </h2>
          </div>
          <div className="settings-content">
            <p>
              不截图、不记录按键内容、不上传你的活动。浏览器仅保存域名，自动去掉网址中的路径和参数。
            </p>
            <label className="form-label">
              本地数据库<code>{data.databasePath}</code>
            </label>
            <div className="setting-row">
              <div>
                <strong>开机启动</strong>
                <small>启动后保持暂停，点击开始即可记录</small>
              </div>
              <input
                aria-label="开机启动"
                className="toggle"
                type="checkbox"
                disabled={!native}
                checked={autostart}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  void action(
                    () => api.setAutostart(enabled),
                    "已更新开机启动设置",
                  ).then((ok) => {
                    if (ok) setAutostart(enabled);
                  });
                }}
              />
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading compact">
            <h2>
              <Monitor size={18} /> 浏览器连接
            </h2>
            <span className="state-badge unknown">
              {data.browserConnected
                ? "已连接"
                : data.bridgeReady
                  ? "等待配对"
                  : "未连接"}
            </span>
          </div>
          <div className="settings-content">
            <p>
              在 Chrome / Edge
              安装项目中的浏览器扩展，再粘贴配对码。扩展只将活动标签的信息发送到本机。
            </p>
            <div className="token-row">
              <input
                aria-label="浏览器配对码"
                type="password"
                readOnly
                value={data.settings.browserToken}
              />
              <button
                className="secondary"
                onClick={() =>
                  void action(
                    () =>
                      navigator.clipboard.writeText(data.settings.browserToken),
                    "配对码已复制",
                  )
                }
              >
                <Copy size={14} /> 复制
              </button>
            </div>
            {data.bridgeError && (
              <p className="error-text">{data.bridgeError}</p>
            )}
            <small className="subtle">扩展目录：apps/browser-extension</small>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading compact">
            <h2>ActivityWatch 导入</h2>
          </div>
          <div className="settings-content">
            <p>
              实时状态：{data.awStatus}。优先模式会自动读取窗口和 AFK；PC
              Insight 的暂停和排除设置不会改变 ActivityWatch 自己的记录。
            </p>
            <p>
              从当前电脑的 ActivityWatch 导入所选日期（{date}
              ）。与原生采集重叠的时间会自动去重。
            </p>
            <button
              className="secondary"
              onClick={() =>
                void action(async () => {
                  const count = await api.importAw(...bounds(date));
                  if (!count) throw new Error("这一天没有可导入的新记录");
                }, "ActivityWatch 数据已导入")
              }
            >
              <ArrowDownToLine size={15} /> 导入所选日期
            </button>
          </div>
        </section>
      </div>
      <section className="panel rules-panel">
        <div className="panel-heading compact">
          <div>
            <h2>让分类，更懂你的习惯</h2>
            <p className="subtle">
              新规则优先。相关性以当前目标为参照，未设置目标时不强行判定专注。
            </p>
          </div>
          <button className="secondary" onClick={onRule}>
            <Plus size={15} /> 添加规则
          </button>
        </div>
        {data.rules.map((r) => (
          <div className="rule-row" key={r.id}>
            <span className="rule-field">
              {{ app: "应用", title: "标题", domain: "域名" }[r.field]}
            </span>
            <strong>{r.pattern}</strong>
            <span>
              {categories[r.category]} ·{" "}
              {
                {
                  related: "与目标相关",
                  unrelated: "与目标无关",
                  unknown: "待确认",
                }[r.relation]
              }
            </span>
            <small>
              {data.projects.find((p) => p.id === r.intentId)?.name ??
                "所有目标"}
            </small>
            <button
              aria-label={`删除规则 ${r.pattern}`}
              className="icon-button"
              onClick={() =>
                void action(() => api.deleteRule(r.id), "规则已删除")
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {!data.rules.length && (
          <div className="empty-small">
            还没有自定义规则。项目关键词已经可以帮助识别相关活动。
          </div>
        )}
      </section>
    </div>
  );
}

function ModalForm({
  kind,
  data,
  project,
  onClose,
  action,
}: {
  kind: Exclude<Modal, null>;
  data: Snapshot;
  project: Project | null;
  onClose: () => void;
  action: Action;
}) {
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const str = (name: string) => String(form.get(name) ?? "").trim();
    setPending(true);
    let task: () => Promise<unknown>;
    if (kind === "project")
      task = () =>
        api.project({
          id: project?.id ?? "",
          name: str("name"),
          category: str("category") as Category,
          color: str("color"),
          keywords: str("keywords")
            .split(/[,，\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
        });
    else if (kind === "rule")
      task = () =>
        api.rule({
          id: "",
          field: str("field") as Rule["field"],
          pattern: str("pattern"),
          category: str("category") as Category,
          relation: str("relation") as Relation,
          intentId: str("intentId") || null,
        });
    else
      task = () =>
        api.startJob(str("name"), str("tool"), str("intentId") || null);
    const ok = await action(task, kind === "job" ? "后台任务已开始" : "已保存");
    setPending(false);
    if (ok) onClose();
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-heading">
          <div>
            <div className="eyebrow">A LITTLE INTENTION</div>
            <h2 id="modal-title">
              {kind === "project"
                ? project
                  ? "编辑项目"
                  : "创建一个新目标"
                : kind === "rule"
                  ? "添加分类规则"
                  : "开始后台任务"}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="关闭弹窗"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={(e) => void submit(e)}>
          {kind !== "rule" && (
            <label className="form-label">
              {kind === "project" ? "项目名称" : "任务名称"}
              <input
                name="name"
                required
                maxLength={kind === "project" ? 80 : 120}
                defaultValue={project?.name ?? ""}
                placeholder={
                  kind === "project"
                    ? "例如：Cisco CCNA 学习"
                    : "例如：生成数据处理脚本"
                }
              />
            </label>
          )}
          {kind === "rule" && (
            <>
              <label className="form-label">
                匹配字段
                <select name="field">
                  <option value="title">窗口标题</option>
                  <option value="domain">浏览器域名</option>
                  <option value="app">应用名称</option>
                </select>
              </label>
              <label className="form-label">
                包含关键词
                <input
                  name="pattern"
                  required
                  maxLength={200}
                  placeholder="例如：CCNA"
                />
              </label>
            </>
          )}
          {kind !== "job" && (
            <label className="form-label">
              活动分类
              <select
                name="category"
                defaultValue={project?.category ?? "learning"}
              >
                {Object.entries(categories).map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === "project" && (
            <>
              <label className="form-label">
                识别关键词
                <small>匹配窗口标题、应用名称或域名，用逗号分隔</small>
                <textarea
                  name="keywords"
                  rows={3}
                  defaultValue={project?.keywords.join(", ") ?? ""}
                  placeholder="Cisco, CCNA, netacad"
                />
              </label>
              <label className="form-label color-label">
                项目颜色
                <input
                  name="color"
                  type="color"
                  defaultValue={project?.color ?? "#55846e"}
                />
              </label>
            </>
          )}
          {kind === "rule" && (
            <label className="form-label">
              与当前目标的关系
              <select name="relation">
                <option value="related">相关 · 专注</option>
                <option value="unrelated">无关 · 根据持续时间判断打断</option>
                <option value="unknown">待确认</option>
              </select>
            </label>
          )}
          {kind === "job" && (
            <label className="form-label">
              任务工具
              <select name="tool">
                {["codex", "claude", "python", "ffmpeg", "npm", "other"].map(
                  (t) => (
                    <option key={t} value={t}>
                      {t === "other" ? "其他" : t}
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
          {kind !== "project" && (
            <label className="form-label">
              {kind === "rule" ? "适用目标" : "关联项目"}
              <select
                name="intentId"
                defaultValue={kind === "job" ? (data.intentId ?? "") : ""}
              >
                <option value="">
                  {kind === "rule" ? "所有目标" : "不关联项目"}
                </option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              取消
            </button>
            <button className="primary" disabled={pending} type="submit">
              {pending ? (
                <Loader2 className="spin" size={15} />
              ) : (
                <Check size={15} />
              )}{" "}
              {kind === "job" ? "开始计时" : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Detail({
  activity: a,
  data,
  onClose,
  action,
}: {
  activity: Activity;
  data: Snapshot;
  onClose: () => void;
  action: Action;
}) {
  const [intentId, setIntentId] = useState(a.intentId ?? "");
  const [category, setCategory] = useState(a.category);
  const [relation, setRelation] = useState(a.relation);
  const [pending, setPending] = useState(false);
  return (
    <div
      className="detail-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        className="detail"
        role="dialog"
        aria-modal="true"
        aria-label="活动详情"
      >
        <div className="modal-heading">
          <div className="eyebrow">MOMENT IN DETAIL</div>
          <button
            className="icon-button"
            aria-label="关闭详情"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <span className={`state-badge ${a.state}`}>{states[a.state]}</span>
        <h2>{a.title || a.process}</h2>
        <p className="subtle">
          {time(a.start)} — {time(a.end)} · {duration(a.end - a.start, true)}
        </p>
        <dl className="detail-facts">
          <dt>当前目标</dt>
          <dd>
            {data.projects.find((p) => p.id === a.intentId)?.name ??
              "未设置目标"}
          </dd>
          <dt>应用</dt>
          <dd>{a.process}</dd>
          <dt>浏览器域名</dt>
          <dd>{a.domain || "未提供"}</dd>
          <dt>活动角色</dt>
          <dd>
            {a.role === "primary" ? "主注意力" : "辅助上下文（不增加工作时长）"}
          </dd>
          <dt>数据来源</dt>
          <dd>
            {a.source === "native"
              ? "Windows 本机采样"
              : a.source === "demo"
                ? "示例数据"
                : "ActivityWatch"}
          </dd>
          {a.role === "supporting" && (
            <>
              <dt>估算可见面积</dt>
              <dd>{Math.round(a.area * 100)}%</dd>
            </>
          )}
        </dl>
        <div className="classification-reason">
          <Info size={17} />
          <div>
            <strong>为什么这样分类</strong>
            <p>{a.reason}</p>
            <small>规则置信度 {Math.round(a.confidence * 100)}%</small>
          </div>
        </div>
        <h3>这一段，分类对吗？</h3>
        <p className="subtle">修改只影响解释层，原始记录保持不变。</p>
        <label className="form-label">
          活动分类
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {Object.entries(categories).map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label">
          纠正当时的目标
          <select
            value={intentId}
            onChange={(e) => setIntentId(e.target.value)}
          >
            <option value="">未设置目标</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label">
          与当时目标的关系
          <select
            value={relation}
            disabled={!intentId}
            onChange={(e) => setRelation(e.target.value as Relation)}
          >
            <option value="related">与目标相关</option>
            <option value="unrelated">与目标无关</option>
            <option value="unknown">待确认</option>
          </select>
        </label>
        {!intentId && (
          <p className="subtle">未设置目标时，相关性保留为待确认。</p>
        )}
        <button
          className="primary full-width"
          disabled={pending || a.idle}
          onClick={() => {
            setPending(true);
            const correction: Correction = {
              activityId: a.id,
              category,
              relation: intentId ? relation : "unknown",
              overrideIntent: true,
              intentId: intentId || null,
            };
            void action(() => api.correct(correction), "分类已纠正").then(
              (ok) => {
                setPending(false);
                if (ok) onClose();
              },
            );
          }}
        >
          <Check size={15} /> 保存纠正
        </button>
      </aside>
    </div>
  );
}
