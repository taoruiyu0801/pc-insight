import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minus,
  Plus,
  ZoomIn,
} from "lucide-react";
import type {
  Activity,
  Job,
  Project,
  Snapshot,
} from "../../../../../packages/types";
import { duration, time } from "../../lib/format";
import {
  appName,
  jobStatusInfo,
  sourceLabel,
  stateInfo,
  toolLabel,
} from "../../lib/semantics";
import { StateMark } from "../../components/ui";
import {
  candidatesAt,
  centerOn,
  clampView,
  dataRange,
  displaySegments,
  fitSpan,
  panView,
  place,
  ticks,
  zoomView,
  type View,
} from "./layout";
import {
  buildLanes,
  describe,
  preciseSpan,
  type Lane,
  type LaneItem,
} from "./model";
import "./timeline.css";

const ROW_H: Record<Lane["id"], number> = {
  goal: 22,
  attention: 26,
  context: 15,
  jobs: 18,
  state: 14,
};
const HIT_TOLERANCE_PX = 5;

interface Props {
  data: Snapshot;
  projects: Map<string, Project>;
  nowMs: number;
  /** Full day range of the query, used for the "whole day" preset. */
  day: View;
  mode: "compact" | "full";
  view?: View | null;
  onViewChange?: (v: View) => void;
  onOpenActivity: (a: Activity) => void;
  onOpenJob: (j: Job) => void;
  /** Activity to highlight and keep in view (from the list). */
  focusKey?: string | null;
  footer?: React.ReactNode;
}

type Chooser = { x: number; laneName: string; t: number; items: LaneItem[] };

export function Timeline({
  data,
  projects,
  nowMs,
  day,
  mode,
  view: controlledView,
  onViewChange,
  onOpenActivity,
  onOpenJob,
  focusKey,
  footer,
}: Props) {
  const lanes = useMemo(
    () => buildLanes(data, projects, nowMs),
    [data, projects, nowMs],
  );
  const full = useMemo<View | null>(
    () => dataRange(lanes.flatMap((l) => (l.id === "goal" ? [] : l.items))),
    [lanes],
  );
  const [ownView, setOwnView] = useState<View | null>(null);
  const view = clampOrFull(controlledView ?? ownView, full);
  // Navigation is limited to the recorded extent plus the queried day.
  const bounds = useMemo(() => (full ? union(full, day) : day), [full, day]);
  const setView = useCallback(
    (v: View) => {
      const next = clampView(v, bounds);
      if (onViewChange) onViewChange(next);
      else setOwnView(next);
    },
    [bounds, onViewChange],
  );

  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setWidth(Math.max(200, el.clientWidth)),
    );
    ro.observe(el);
    setWidth(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, [full != null]);

  const [hover, setHover] = useState<{
    item: LaneItem;
    x: number;
    lane: string;
  } | null>(null);
  const [chooser, setChooser] = useState<Chooser | null>(null);
  const [cursor, setCursor] = useState<Partial<Record<Lane["id"], number>>>({});
  const [announce, setAnnounce] = useState("");
  const [brush, setBrush] = useState<{ from: number; to: number } | null>(null);

  const open = useCallback(
    (item: LaneItem) => {
      setChooser(null);
      if (item.job) onOpenJob(item.job);
      else if (item.activity) onOpenActivity(item.activity);
      else if (item.session) {
        if (mode === "full") setView(fitSpan(item, bounds));
        else {
          const first = data.activities.find(
            (a) => a.id === item.session!.activityIds[0],
          );
          if (first) onOpenActivity(first);
        }
      }
    },
    [onOpenActivity, onOpenJob, mode, setView, bounds, data.activities],
  );

  // Keep a list-selected activity visible and marked.
  useEffect(() => {
    if (!focusKey || !view || mode !== "full") return;
    const item = lanes[1].items.find(
      (i) => i.activity && `${i.activity.id}:${i.activity.start}` === focusKey,
    );
    if (!item) return;
    const next = centerOn(view, item, bounds);
    if (next.start !== view.start) setView(next);
    setCursor((c) => ({ ...c, attention: lanes[1].items.indexOf(item) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  if (!full || !view) return null;

  const span = view.end - view.start;
  const msPerPx = span / width;
  const t = ticks(view, Math.max(4, Math.floor(width / 110)));
  const toT = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return view.start + ((clientX - r.left) / r.width) * span;
  };
  const xOf = (time: number) => ((time - view.start) / span) * width;

  const laneItemsAt = (lane: Lane, e: ReactMouseEvent<HTMLDivElement>) => {
    const tm = toT(e.clientX);
    let pool = lane.items;
    if (lane.rows > 1) {
      const r = e.currentTarget.getBoundingClientRect();
      const row = Math.floor((e.clientY - r.top - 3) / ROW_H[lane.id]);
      const inRow = lane.items.filter((i) => i.row === row);
      if (candidatesAt(inRow, tm, HIT_TOLERANCE_PX * msPerPx).length)
        pool = inRow;
    }
    return { tm, items: candidatesAt(pool, tm, HIT_TOLERANCE_PX * msPerPx) };
  };

  const onLaneClick = (lane: Lane, e: ReactMouseEvent<HTMLDivElement>) => {
    const { tm, items } = laneItemsAt(lane, e);
    if (!items.length) {
      setChooser(null);
      return;
    }
    const containing = items.filter((i) => i.start <= tm && i.end >= tm);
    // One unambiguous hit opens directly; several nearby short items ask the user.
    if (
      items.length === 1 ||
      (containing.length === 1 &&
        containing[0].end - containing[0].start >
          4 * HIT_TOLERANCE_PX * msPerPx)
    )
      open(containing[0] ?? items[0]);
    else
      setChooser({
        x: Math.min(width - 280, Math.max(0, xOf(tm) - 140)),
        laneName: lane.name,
        t: tm,
        items: items.slice(0, 12),
      });
  };

  const onLaneMove = (lane: Lane, e: ReactMouseEvent<HTMLDivElement>) => {
    const { items } = laneItemsAt(lane, e);
    const r = trackRef.current!.getBoundingClientRect();
    setHover(
      items.length
        ? { item: items[0], x: e.clientX - r.left, lane: lane.name }
        : null,
    );
  };

  const onLaneKey = (lane: Lane, e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = lane.items;
    if (!items.length) return;
    let i = cursor[lane.id];
    if (i == null || i >= items.length) {
      // Start from the first item inside the view.
      i = Math.max(
        0,
        items.findIndex((x) => x.end > view.start),
      );
    }
    let handled = true;
    switch (e.key) {
      case "ArrowRight":
        i = Math.min(items.length - 1, i + 1);
        break;
      case "ArrowLeft":
        i = Math.max(0, i - 1);
        break;
      case "Home":
        i = 0;
        break;
      case "End":
        i = items.length - 1;
        break;
      case "Enter":
      case " ":
        open(items[i]);
        break;
      case "+":
      case "=":
        if (mode === "full")
          setView(
            zoomView(view, 0.5, (items[i].start + items[i].end) / 2, bounds),
          );
        break;
      case "-":
        if (mode === "full")
          setView(
            zoomView(view, 2, (items[i].start + items[i].end) / 2, bounds),
          );
        break;
      case "0":
        if (mode === "full") setView(full);
        break;
      default:
        handled = false;
    }
    if (!handled) return;
    e.preventDefault();
    setCursor((c) => ({ ...c, [lane.id]: i }));
    const item = items[i!];
    if (
      mode === "full" &&
      (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End")
    )
      setView(centerOn(view, item, bounds));
    setAnnounce(
      `${lane.name} 第 ${i! + 1} / ${items.length} 段：${describe(item, projects)}`,
    );
  };

  const zoomBy = (factor: number) =>
    setView(zoomView(view, factor, (view.start + view.end) / 2, bounds));

  // Brush on the ruler: drag to zoom into a range.
  const onRulerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (mode !== "full" || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const from = toT(e.clientX);
    setBrush({ from, to: from });
  };
  const onRulerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (brush) setBrush({ ...brush, to: toT(e.clientX) });
  };
  const onRulerUp = () => {
    if (brush && Math.abs(brush.to - brush.from) > 4 * msPerPx)
      setView({
        start: Math.min(brush.from, brush.to),
        end: Math.max(brush.from, brush.to),
      });
    setBrush(null);
  };

  const isFull = view.start === full.start && view.end === full.end;
  const focusItem = focusKey
    ? lanes[1].items.find(
        (i) =>
          i.activity && `${i.activity.id}:${i.activity.start}` === focusKey,
      )
    : undefined;

  return (
    <div className={`spectrum spectrum-${mode}`}>
      {mode === "full" && (
        <div className="spectrum-tools" role="toolbar" aria-label="时间范围">
          <div className="spectrum-range tabular" aria-live="polite">
            <strong>
              {time(view.start)} – {time(view.end)}
            </strong>
            <span className="secondary-text">显示范围：{duration(span)}</span>
          </div>
          <div className="tool-group">
            <button
              type="button"
              className="icon-button"
              aria-label="向前平移"
              onClick={() => setView(panView(view, -0.5, bounds))}
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="向后平移"
              onClick={() => setView(panView(view, 0.5, bounds))}
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
          <div className="tool-group">
            <button
              type="button"
              className="icon-button"
              aria-label="缩小"
              onClick={() => zoomBy(2)}
              disabled={isFull}
            >
              <Minus size={16} aria-hidden />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="放大"
              onClick={() => zoomBy(0.5)}
              disabled={span <= 2 * 60_000}
            >
              <Plus size={16} aria-hidden />
            </button>
          </div>
          <div className="tool-group">
            {[
              ["1 小时", 3_600_000],
              ["15 分钟", 900_000],
            ].map(([label, ms]) => (
              <button
                key={label}
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() =>
                  setView(
                    zoomView(
                      view,
                      (ms as number) / span,
                      focusItem ? focusItem.start : (view.start + view.end) / 2,
                      bounds,
                    ),
                  )
                }
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => setView(full)}
              disabled={isFull}
            >
              <Maximize2 size={13} aria-hidden /> 完整记录
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => setView(day)}
            >
              整天
            </button>
          </div>
          <span className="spectrum-hint secondary-text">
            在刻度上拖动可框选放大 · 轨道获得焦点后用 ←/→ 浏览，Enter 打开
          </span>
        </div>
      )}

      <div className="spectrum-grid">
        <div className="lane-margin ruler-margin" aria-hidden>
          <span>时刻</span>
        </div>
        <div
          className={`ruler ${mode === "full" ? "brushable" : ""}`}
          ref={trackRef}
          onPointerDown={onRulerDown}
          onPointerMove={onRulerMove}
          onPointerUp={onRulerUp}
          onPointerCancel={() => setBrush(null)}
          aria-hidden
        >
          {t.minors.map((m) => (
            <i
              key={`m${m}`}
              className="tick minor"
              style={{ left: `${((m - view.start) / span) * 100}%` }}
            />
          ))}
          {t.majors.map((m) => (
            <span
              key={m}
              className="tick major"
              style={{ left: `${((m - view.start) / span) * 100}%` }}
            >
              <em className="tabular">{time(m)}</em>
            </span>
          ))}
          {brush && (
            <i
              className="brush"
              style={place(
                {
                  start: Math.min(brush.from, brush.to),
                  end: Math.max(brush.from, brush.to),
                },
                view,
              )}
            />
          )}
        </div>

        {lanes.map((lane) => {
          const segs = displaySegments(
            lane.items,
            view,
            width,
            (i) => i.tone,
            2,
            (i) => i.row,
          );
          const cur = cursor[lane.id];
          const curItem = cur != null ? lane.items[cur] : undefined;
          return (
            <LaneRow
              key={lane.id}
              lane={lane}
              height={lane.rows * ROW_H[lane.id] + 6}
              rowH={ROW_H[lane.id]}
              segs={segs}
              view={view}
              majors={t.majors}
              projects={projects}
              cursorItem={curItem}
              focusItem={lane.id === "attention" ? focusItem : undefined}
              onClick={(e) => onLaneClick(lane, e)}
              onMove={(e) => onLaneMove(lane, e)}
              onLeave={() => setHover(null)}
              onKey={(e) => onLaneKey(lane, e)}
              msPerPx={msPerPx}
            />
          );
        })}

        {hover && !chooser && (
          <div
            className="spectrum-tip"
            role="tooltip"
            style={{
              left: `calc(var(--margin-w) + ${Math.min(Math.max(hover.x, 120), width - 120)}px)`,
            }}
          >
            <ItemSummary item={hover.item} projects={projects} />
          </div>
        )}

        {chooser && (
          <ChooserPopover
            chooser={chooser}
            projects={projects}
            onPick={open}
            onZoom={
              mode === "full"
                ? () => {
                    setView(zoomView(view, 0.1, chooser.t, bounds));
                    setChooser(null);
                  }
                : undefined
            }
            onClose={() => setChooser(null)}
          />
        )}
      </div>

      <div className="visually-hidden" aria-live="polite">
        {announce}
      </div>

      <div className="spectrum-foot">
        <span>
          {mode === "full" && !isFull ? (
            <>
              <ZoomIn size={13} aria-hidden /> 已放大，片段按真实时长绘制
            </>
          ) : (
            "片段按真实时长绘制；极短片段可放大查看，或在重叠处选择"
          )}
        </span>
        <span>
          <i className="dense-swatch" aria-hidden /> 细竖纹：不足 1
          像素的多段记录，放大可逐段查看
        </span>
        <span>
          辅助窗口为可见面积估算，不代表阅读注意力；辅助与后台轨道均不计入人的时间。
        </span>
        {footer}
      </div>
    </div>
  );
}

function LaneRow({
  lane,
  height,
  rowH,
  segs,
  view,
  majors,
  projects,
  cursorItem,
  focusItem,
  onClick,
  onMove,
  onLeave,
  onKey,
  msPerPx,
}: {
  lane: Lane;
  height: number;
  rowH: number;
  segs: ReturnType<typeof displaySegments<LaneItem>>;
  view: View;
  majors: number[];
  projects: Map<string, Project>;
  cursorItem?: LaneItem;
  focusItem?: LaneItem;
  onClick: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onMove: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onLeave: () => void;
  onKey: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  msPerPx: number;
}) {
  const span = view.end - view.start;
  return (
    <>
      <div className={`lane-margin lane-${lane.id}`}>
        <span className="lane-name">{lane.name}</span>
        <span className="lane-note">{lane.note}</span>
      </div>
      <div
        className={`lane-track lane-${lane.id}`}
        style={{ height }}
        tabIndex={lane.items.length ? 0 : -1}
        role="group"
        aria-label={`${lane.name}轨道，${lane.items.length} 段。左右方向键逐段浏览，Enter 打开`}
        onClick={onClick}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onKeyDown={onKey}
      >
        {majors.map((m) => (
          <i
            key={m}
            className="gridline"
            style={{ left: `${((m - view.start) / span) * 100}%` }}
            aria-hidden
          />
        ))}
        {!lane.items.length && <span className="lane-empty">无</span>}
        {segs.map((s) => {
          const first = s.items[0];
          const wide = (s.end - s.start) / msPerPx;
          const projectColor =
            lane.id === "goal"
              ? projects.get(first.session?.intentId ?? "")?.color
              : undefined;
          return (
            <span
              key={first.key}
              className={`seg seg-${lane.id} ${segClass(lane.id, first, s.tone)} ${s.items.length > 1 ? "merged" : ""}`}
              style={{
                ...place(s, view),
                top: 3 + first.row * rowH,
                height: rowH - (lane.id === "context" ? 3 : 4),
                ...(projectColor
                  ? ({ "--project": projectColor } as React.CSSProperties)
                  : {}),
              }}
              aria-hidden
            >
              {wide > 46 && lane.id !== "state" && s.items.length === 1 && (
                <span className="seg-label">{first.label}</span>
              )}
            </span>
          );
        })}
        {[cursorItem, focusItem].map(
          (it, i) =>
            it &&
            it.end > view.start &&
            it.start < view.end && (
              <span
                key={i}
                className={i === 0 ? "seg-cursor" : "seg-focus"}
                style={{
                  ...place(it, view),
                  top: 1 + it.row * rowH,
                  height: rowH,
                }}
                aria-hidden
              />
            ),
        )}
      </div>
    </>
  );
}

function segClass(lane: Lane["id"], item: LaneItem, tone: string): string {
  if (tone === "mixed") return "dense";
  if (lane === "state") return `tone-fill-${tone}`;
  if (lane === "attention") return item.tone === "idle" ? "idle" : "";
  if (lane === "jobs") return item.tone === "job-running" ? "running" : "";
  if (lane === "goal") return item.session?.intentId ? "" : "no-goal";
  return "";
}

function ItemSummary({
  item,
  projects,
}: {
  item: LaneItem;
  projects: Map<string, Project>;
}) {
  if (item.job) {
    const j = item.job;
    const st = jobStatusInfo(j.status);
    return (
      <>
        <strong className="truncate">{j.name}</strong>
        <span>
          {toolLabel(j.tool)} · {st.label}
        </span>
        <span className="tabular">
          {time(item.start)} – {j.end == null ? "运行中" : time(item.end)} ·{" "}
          {duration(item.end - item.start, true)}
        </span>
      </>
    );
  }
  if (item.session) {
    return (
      <>
        <strong className="truncate">{item.label}</strong>
        <span className="tabular">
          {time(item.start)} – {time(item.end)} · 活动{" "}
          {duration(item.session.activeMs)}
        </span>
        <span>
          其中专注 {duration(item.session.focusMs)} ·{" "}
          {item.session.activityIds.length} 段
        </span>
      </>
    );
  }
  const a = item.activity!;
  const st = stateInfo(a.state, a.idle);
  const proj = projects.get(a.intentId ?? "");
  return (
    <>
      <strong className="truncate">{a.title || appName(a.process)}</strong>
      <span className="truncate">
        {appName(a.process)}
        {a.domain ? ` · ${a.domain}` : ""}
      </span>
      <span className="tabular">
        {preciseSpan(a)} · {duration(a.end - a.start, true)}
      </span>
      <span className="tip-state">
        <StateMark tone={st.tone} /> {st.label}
        {proj ? ` · ${proj.name}` : " · 无目标"}
        {a.role === "supporting"
          ? ` · 可见面积约 ${Math.round(a.area * 100)}%（估算）`
          : ""}
      </span>
      <span className="secondary-text">{sourceLabel(a.source)}</span>
    </>
  );
}

function ChooserPopover({
  chooser,
  projects,
  onPick,
  onZoom,
  onClose,
}: {
  chooser: Chooser;
  projects: Map<string, Project>;
  onPick: (i: LaneItem) => void;
  onZoom?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [chooser, onClose]);
  return (
    <div
      ref={ref}
      className="chooser"
      role="dialog"
      aria-label={`${chooser.laneName}：此处有 ${chooser.items.length} 段记录`}
      style={{ left: `calc(var(--margin-w) + ${chooser.x}px)` }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="chooser-head">
        <strong>
          此处 {time(chooser.t)} 附近有 {chooser.items.length} 段
        </strong>
        <span className="secondary-text">按距离排序，包含该时刻的在前</span>
      </div>
      <ul>
        {chooser.items.map((it) => (
          <li key={it.key}>
            <button type="button" onClick={() => onPick(it)}>
              {it.activity ? (
                <StateMark
                  tone={stateInfo(it.activity.state, it.activity.idle).tone}
                />
              ) : (
                <i className="state-mark tone-job" aria-hidden />
              )}
              <span className="truncate">
                {it.activity
                  ? it.activity.title || appName(it.activity.process)
                  : it.label}
              </span>
              <span className="tabular secondary-text">
                {time(it.start)} · {duration(it.end - it.start, true)}
              </span>
              <span className="visually-hidden">{describe(it, projects)}</span>
            </button>
          </li>
        ))}
      </ul>
      {onZoom && (
        <button
          type="button"
          className="btn btn-quiet btn-sm chooser-zoom"
          onClick={onZoom}
        >
          <ArrowUpRight size={13} aria-hidden /> 放大此处查看
        </button>
      )}
    </div>
  );
}

function union(a: View, b: View): View {
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

function clampOrFull(
  v: View | null | undefined,
  full: View | null,
): View | null {
  if (!full) return null;
  if (!v) return full;
  return v;
}
