import type { Activity, Snapshot } from "../../../packages/types";
import { colors, duration, time, states } from "./format";
import {
  Layers,
  Focus,
  Target,
  Workflow,
  Activity as Pulse,
  MousePointer2,
} from "lucide-react";
export default function Timeline({
  data,
  onSelect,
  large = false,
}: {
  data: Snapshot;
  onSelect: (a: Activity) => void;
  large?: boolean;
}) {
  const records = data.activities;
  const primary = records.filter((a) => a.role === "primary");
  const allStarts = [
    ...records.map((a) => a.start),
    ...data.jobs.map((j) => j.start),
  ];
  const allEnds = [
    ...records.map((a) => a.end),
    ...data.jobs.map((j) => j.end ?? Date.now()),
  ];
  const min = allStarts.length
    ? Math.floor(Math.min(...allStarts) / 3_600_000) * 3_600_000
    : 0;
  const max = allEnds.length
    ? Math.max(
        min + 3_600_000,
        Math.ceil(Math.max(...allEnds) / 3_600_000) * 3_600_000,
      )
    : 1;
  const pos = (start: number, end: number) => ({
    left: `${((start - min) / (max - min)) * 100}%`,
    width: `${((end - start) / (max - min)) * 100}%`,
  });
  const project = (id: string | null) => data.projects.find((p) => p.id === id);
  const pick = (id: string) => {
    const a = records.find((a) => a.id === id);
    if (a) onSelect(a);
  };
  const pack = <T extends { start: number; end: number }>(items: T[]) => {
    const ends: number[] = [];
    return items
      .slice()
      .sort((a, b) => a.start - b.start)
      .map((item) => {
        let row = ends.findIndex((e) => e <= item.start);
        if (row < 0) row = ends.length;
        ends[row] = item.end;
        return { item, row };
      });
  };
  const supporting = pack(records.filter((a) => a.role === "supporting"));
  const jobs = pack(data.jobs.map((j) => ({ ...j, end: j.end ?? Date.now() })));
  const lane = (
    name: string,
    icon: React.ReactNode,
    children: React.ReactNode,
    rows = 1,
  ) => (
    <div
      className="timeline-lane"
      style={rows > 1 ? { height: rows * 22 + 20 } : undefined}
    >
      <div className="lane-label">
        {icon}
        {name}
      </div>
      <div className="lane-track">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span
            className="grid-line"
            key={i}
            style={{ left: `${(i / 6) * 100}%` }}
          />
        ))}
        {children}
      </div>
    </div>
  );
  return (
    <section
      className={`panel timeline-panel ${large ? "timeline-large" : ""}`}
    >
      <div className="panel-heading">
        <div>
          <div className="eyebrow">YOUR DAY, IN CONTEXT</div>
          <h2>把一天，放回上下文</h2>
        </div>
        <div className="legend">
          {[
            ["专注", "focused"],
            ["打断", "interruption"],
            ["分心", "distracted"],
            ["待确认", "unknown"],
          ].map(([label, state]) => (
            <span key={state}>
              <i style={{ background: colors[state] }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      {records.length || data.jobs.length ? (
        <>
          <div className="timeline-axis">
            <span>时间轨道</span>
            <div>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <span key={i} style={{ left: `${(i / 6) * 100}%` }}>
                  {time(min + ((max - min) * i) / 6)}
                </span>
              ))}
            </div>
          </div>
          {lane(
            "当前目标",
            <Target size={15} />,
            data.sessions.map((s) => (
              <button
                key={s.id}
                className="segment goal-segment"
                style={{
                  ...pos(s.start, s.end),
                  background: `${project(s.intentId)?.color ?? "#a6afbf"}28`,
                  color: project(s.intentId)?.color ?? "#6b7483",
                }}
                title={`${project(s.intentId)?.name ?? "未设置目标"} · ${duration(s.activeMs)}`}
                onClick={() => pick(s.activityIds[0])}
              >
                <span>{project(s.intentId)?.name ?? "未设置目标"}</span>
              </button>
            )),
          )}
          {lane(
            "主注意力",
            <MousePointer2 size={15} />,
            primary.map((a, i) => (
              <button
                key={`${a.id}:${i}`}
                className="segment"
                style={{ ...pos(a.start, a.end), background: colors[a.state] }}
                onClick={() => onSelect(a)}
                title={`${a.title || a.process} · ${time(a.start)}–${time(a.end)}`}
              >
                <span>{a.process.replace(".exe", "")}</span>
              </button>
            )),
          )}
          {lane(
            "辅助上下文",
            <Layers size={15} />,
            supporting.map(({ item: a, row }, i) => (
              <button
                key={`${a.id}:${i}`}
                className="segment supporting-segment"
                style={{
                  ...pos(a.start, a.end),
                  top: 13 + row * 22,
                  background: "#dce5ed",
                }}
                onClick={() => onSelect(a)}
                title={`${a.title || a.process} · 可见面积约 ${Math.round(a.area * 100)}%`}
              >
                <span>{a.title || a.process}</span>
              </button>
            )),
            Math.max(1, ...supporting.map((s) => s.row + 1)),
          )}
          {lane(
            "后台任务",
            <Workflow size={15} />,
            jobs.map(({ item: j, row }) => (
              <div
                key={j.id}
                className="segment job-segment"
                style={{
                  ...pos(j.start, j.end),
                  top: 11 + row * 22,
                  background: colors.background,
                }}
                title={`${j.name} · ${duration(j.end - j.start)}`}
              >
                <span>
                  {j.tool} · {j.name}
                </span>
              </div>
            )),
            Math.max(1, ...jobs.map((j) => j.row + 1)),
          )}
          {lane(
            "工作状态",
            <Pulse size={15} />,
            primary.map((a, i) => (
              <button
                key={`${a.id}:${i}`}
                className="segment state-segment"
                style={{ ...pos(a.start, a.end), background: colors[a.state] }}
                onClick={() => onSelect(a)}
                title={states[a.state]}
              />
            )),
          )}
          <div className="timeline-foot">
            <span>
              <Focus size={14} /> 点击活动片段，查看判断依据或纠正分类
            </span>
            <span>辅助与后台轨道不重复计入主动时间</span>
          </div>
        </>
      ) : (
        <div className="timeline-empty">
          <div className="empty-tracks">
            <i />
            <i />
            <i />
            <i />
          </div>
          <h3>你的第一段工作，从这里开始</h3>
          <p>
            创建一个目标，点击「开始记录」。
            <br />
            窗口切换和工作状态会自动出现在这条时间线上。
          </p>
        </div>
      )}
    </section>
  );
}
