import { useMemo, useState } from "react";
import type {
  Activity,
  ActivitySpan,
  CorrectionChange,
  Project,
  Session,
  Snapshot,
} from "../../../../../packages/types";
import { useActions } from "../../app/actions";
import { useDay } from "../../app/hooks";
import { Button, Drawer, Field, StateBadge } from "../../components/ui/exports";
import { duration, timeWithSeconds } from "../../lib/format";
import {
  groupActivities,
  learningTool,
  membersOf,
  spanOf,
} from "../../lib/activity-groups";
import { CorrectionReview } from "../activities/CorrectionReview";
import "./sessions.css";

const rangeKey = (r: ActivitySpan) => `${r.activityId}:${r.start}:${r.end}`;
export function SessionCard({
  data,
  isCurrent,
}: {
  data: Snapshot;
  isCurrent: boolean;
}) {
  const s = data.sessions.at(-1),
    actions = useActions();
  if (!s) return null;
  const project = data.projects.find((p) => p.id === s.intentId);
  return (
    <section className="section session-card" aria-labelledby="session-card-h">
      <header className="section-head">
        <h2 className="section-title" id="session-card-h">
          {isCurrent ? "当前会话" : "最近一次会话"}
          <span className="section-note">与上方全天累计分开查看</span>
        </h2>
        <Button size="sm" onClick={() => actions.openSession(s)}>
          查看会话详情
        </Button>
      </header>
      <h3>
        {project?.name ?? "未设置目标"}{" "}
        <span className="secondary-text tabular">
          {timeWithSeconds(s.start)}–{timeWithSeconds(s.end)}
        </span>
      </h3>
      <SessionFigures session={s} />
      <p className="secondary-text small">
        区间跨度 {duration(s.end - s.start, true)}
        ；有效记录不包含暂停、离开和采样空隙。
        {s.suggestions.length > 0
          ? `有 ${s.suggestions.length} 段辅助工具活动待确认。`
          : ""}
      </p>
      <Button
        size="sm"
        variant="quiet"
        onClick={() => actions.showSessionInTimeline(s)}
      >
        在时间线查看所选会话
      </Button>
    </section>
  );
}

function SessionFigures({ session: s }: { session: Session }) {
  return (
    <dl className="session-figures">
      {[
        ["有效记录", s.activeMs],
        ["目标相关", s.focusMs],
        ["短暂打断", s.interruptionMs],
        ["分心", s.distractedMs],
        ["待确认", s.unknownMs],
      ].map(([name, ms]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd className="tabular">{duration(ms as number, true)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SessionDrawer({
  session: initial,
  date,
  onClose,
}: {
  session: Session;
  date: string;
  onClose: () => void;
}) {
  const day = useDay(date),
    data = day.data,
    actions = useActions();
  const session = data?.sessions.find((s) => s.id === initial.id);
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [mode, setMode] = useState("related"),
    [goal, setGoal] = useState(initial.intentId ?? "");
  const [review, setReview] = useState(false),
    [expanded, setExpanded] = useState<Set<string>>(new Set()),
    [shown, setShown] = useState(50);
  const activities = useMemo(() => {
    if (!data || !session) return [];
    return data.activities.filter(
      (a) =>
        a.role === "primary" &&
        session.members.some(
          (m) =>
            m.activityId === a.id && m.start === a.start && m.end === a.end,
        ),
    );
  }, [data, session]);
  const groups = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of activities) {
      const k = JSON.stringify([a.process, a.title, a.domain]);
      map.set(k, [...(map.get(k) ?? []), a]);
    }
    return [...map.entries()];
  }, [activities]);
  const ranges = activities
    .map(spanOf)
    .filter((r) => selected.has(rangeKey(r)));
  const chosenProject = data?.projects.find((p) => p.id === goal);
  const change: CorrectionChange = {
    category:
      mode === "goal"
        ? null
        : mode === "related"
          ? (chosenProject?.category ?? "learning")
          : null,
    relation:
      mode === "goal" ? null : (mode as "related" | "unrelated" | "unknown"),
    overrideIntent: true,
    intentId: goal || null,
  };
  const selectMany = (list: Activity[], checked: boolean) =>
    setSelected((old) => {
      const next = new Set(old);
      for (const a of list) {
        const k = rangeKey(spanOf(a));
        if (checked) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  return (
    <>
      <Drawer
        title={
          data?.projects.find((p) => p.id === session?.intentId)?.name ??
          "目标会话"
        }
        kicker="先看活动汇总，再展开连续片段"
        onRequestClose={onClose}
        footer={
          <Button
            variant="primary"
            disabled={
              !ranges.length ||
              !!day.error ||
              day.stale ||
              day.transitional ||
              (mode === "related" && !goal)
            }
            onClick={() => setReview(true)}
          >
            预览纠正所选 {ranges.length} 段
          </Button>
        }
      >
        {day.error && (
          <p role="alert">
            读取失败：{day.error}
            <button onClick={day.retry}>重试</button>
          </p>
        )}
        {!session ? (
          <p>这次会话已变化，请关闭后重新选择。</p>
        ) : (
          <>
            <p className="tabular">
              {timeWithSeconds(session.start)}–{timeWithSeconds(session.end)}
            </p>
            <SessionFigures session={session} />
            <p className="secondary-text">
              下列时长只来自本会话的主注意力；选中后可一起补目标或确认用途。
            </p>
            <div className="session-controls">
              <Button size="sm" onClick={() => selectMany(activities, true)}>
                选择本会话全部记录
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const keys = new Set(
                    session.suggestions.map((s) => rangeKey(s.range)),
                  );
                  selectMany(
                    activities.filter((a) => keys.has(rangeKey(spanOf(a)))),
                    true,
                  );
                }}
              >
                选择辅助学习建议
              </Button>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => setSelected(new Set())}
              >
                清空选择
              </Button>
            </div>
            <div className="form-row">
              <Field label="这段的目标">
                <select
                  value={goal}
                  onChange={(e) => {
                    setGoal(e.target.value);
                    setReview(false);
                  }}
                >
                  <option value="">未设置目标</option>
                  {data?.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="所选片段的用途">
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="related">用于本次目标</option>
                  <option value="unrelated">与目标无关</option>
                  <option value="unknown">保持待确认</option>
                  <option value="goal">只补目标，保留人工关系判断</option>
                </select>
              </Field>
            </div>
            {groups.slice(0, shown).map(([key, list]) => {
              const a = list[0],
                tool = learningTool(a),
                sum = list.reduce((n, a) => n + a.end - a.start, 0);
              const relevant = list
                .filter((a) => a.relation === "related")
                .reduce((n, a) => n + a.end - a.start, 0);
              const courseProject = data?.projects.find(
                (p) => p.id === session.intentId && p.category === "learning",
              );
              const courseMatch = courseProject?.keywords.some(
                (k) =>
                  k.trim() &&
                  `${a.title} ${a.domain}`
                    .toLowerCase()
                    .includes(k.toLowerCase()),
              );
              const label =
                relevant === sum
                  ? tool
                    ? `${tool} · 已确认相关`
                    : courseMatch
                      ? "课程阅读 · 目标关键词匹配"
                      : "其他相关活动"
                  : relevant === 0 &&
                      list.every((a) => a.relation === "unknown")
                    ? tool
                      ? `${tool} · 可能用于学习`
                      : "其他待确认"
                    : list.every((a) => a.relation === "unrelated")
                      ? "与目标无关 · 按实际时长记录"
                      : "包含不同判断";
              return (
                <section className="session-activity" key={key}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={list.every((a) =>
                        selected.has(rangeKey(spanOf(a))),
                      )}
                      onChange={(e) => selectMany(list, e.target.checked)}
                    />
                    <strong className="wrap-anywhere">
                      {a.title || a.process}
                    </strong>
                  </label>
                  <p>
                    {a.process} · {duration(sum, true)} · {label}
                  </p>
                  {tool && list.some((a) => a.relation === "unknown") && (
                    <p className="secondary-text small">
                      依据：本学习会话中出现了{tool}；确认前不计入相关时间。
                    </p>
                  )}
                  <details
                    onToggle={(e) => {
                      const open = e.currentTarget.open;
                      setExpanded((old) => {
                        const next = new Set(old);
                        if (open) next.add(key);
                        else next.delete(key);
                        return next;
                      });
                    }}
                  >
                    <summary>展开连续片段（原始 {list.length} 段）</summary>
                    {expanded.has(key) &&
                      groupActivities(list, [session]).map((g) => (
                        <div
                          className="session-piece"
                          key={rangeKey(spanOf(g))}
                        >
                          <label className="check">
                            <input
                              type="checkbox"
                              aria-label={`选择 ${timeWithSeconds(g.start)} 的连续片段`}
                              checked={membersOf(g).every((m) =>
                                selected.has(rangeKey(spanOf(m))),
                              )}
                              onChange={(e) =>
                                selectMany(membersOf(g), e.target.checked)
                              }
                            />
                            <span className="tabular">
                              {timeWithSeconds(g.start)}–
                              {timeWithSeconds(g.end)} ·{" "}
                              {duration(g.end - g.start, true)}
                            </span>
                          </label>{" "}
                          <StateBadge state={g.state} idle={g.idle} />
                          <details>
                            <summary>原始记录 {membersOf(g).length} 段</summary>
                            {membersOf(g).map((m) => (
                              <button
                                className="link-button"
                                key={rangeKey(spanOf(m))}
                                onClick={() => actions.openActivity(m)}
                              >
                                {timeWithSeconds(m.start)}–
                                {timeWithSeconds(m.end)} · 查看依据与纠正
                              </button>
                            ))}
                          </details>
                        </div>
                      ))}
                  </details>
                </section>
              );
            })}
            {shown < groups.length && (
              <Button onClick={() => setShown((n) => n + 50)}>
                显示更多活动
              </Button>
            )}
          </>
        )}
      </Drawer>
      {review && ranges.length > 0 && (
        <CorrectionReview
          request={{ ranges, change }}
          label="会话内批量纠正"
          onClose={() => setReview(false)}
          onSaved={() => {
            setReview(false);
            setSelected(new Set());
          }}
        />
      )}
    </>
  );
}
