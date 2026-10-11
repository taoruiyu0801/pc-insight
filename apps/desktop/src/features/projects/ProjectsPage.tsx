import { useState } from "react";
import { Check, Pencil, Plus, Target } from "lucide-react";
import { api } from "../../api";
import { useActions } from "../../app/actions";
import { useDay } from "../../app/hooks";
import { PageHeader } from "../../app/PageHeader";
import { useMutate, usePendingSet, type RangeResult } from "../../data/context";
import { shortDate, weekday } from "../../lib/dates";
import { duration } from "../../lib/format";
import { categoryLabel } from "../../lib/semantics";
import {
  Button,
  DateNav,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from "../../components/ui/exports";
import "./projects.css";

export function ProjectsPage({
  today,
  initialDate,
  live,
}: {
  today: string;
  initialDate: string;
  live: RangeResult;
}) {
  const actions = useActions();
  const mutate = useMutate();
  const isPending = usePendingSet();
  // Investment has its own, visible date so "所选日期" is never ambiguous.
  const [date, setDate] = useState(initialDate);
  const day = useDay(date);
  const data = live.data;

  if (!data)
    return (
      <div className="page">
        <PageHeader kicker="我的项目" title="项目索引" />
        {live.error ? (
          <ErrorBlock
            title="无法读取项目"
            message={live.error}
            onRetry={live.retry}
          />
        ) : (
          <LoadingBlock label="正在读取项目…" />
        )}
      </div>
    );

  const projects = data.projects;
  const current = projects.find((p) => p.id === data.intentId);
  const projectMs =
    day.data && !day.transitional ? day.data.stats.projectMs : null;

  return (
    <div className="page">
      <PageHeader
        kicker="我的项目"
        title="项目索引"
        tools={
          <Button
            variant="primary"
            icon={<Plus size={15} aria-hidden />}
            onClick={() => actions.editProject(null)}
          >
            新建项目
          </Button>
        }
      >
        <p className="page-lede">
          项目可以被选为<strong>当前目标</strong>
          ，用来判断“这段时间是否与我想做的事相关”；项目的<strong>类别</strong>
          只描述活动是什么（学习、编程、科研…）。两者分开设置。
        </p>
      </PageHeader>

      <div className="current-goal" role="status">
        <Target size={16} aria-hidden />
        {current ? (
          <>
            当前目标：<strong className="truncate">{current.name}</strong>
          </>
        ) : (
          <>当前没有目标，新的活动相关性将保持待确认。</>
        )}
      </div>

      {projects.length === 0 ? (
        <EmptyBlock
          title="还没有项目"
          action={
            <Button
              variant="primary"
              icon={<Plus size={15} aria-hidden />}
              onClick={() => actions.editProject(null)}
            >
              新建第一个项目
            </Button>
          }
        >
          为学习、科研或开发各建一个项目，填写能在窗口标题、应用或域名里出现的关键词。
        </EmptyBlock>
      ) : (
        <section className="section" aria-labelledby="index-h">
          <header className="section-head index-head">
            <h2 id="index-h" className="section-title">
              共 {projects.length} 个项目
            </h2>
            <div className="index-date">
              <span className="secondary-text small">记录统计日期</span>
              <DateNav
                date={date}
                today={today}
                onChange={setDate}
                label="记录统计日期"
                compact
              />
              <span className="secondary-text small">
                {shortDate(date)} {weekday(date)}
                {day.loading && !projectMs ? " · 读取中" : ""}
                {day.error && !day.data ? " · 读取失败" : ""}
              </span>
            </div>
          </header>
          <ol className="project-index">
            {projects.map((p, i) => {
              const isCurrent = p.id === data.intentId;
              const busy = isPending("intent");
              return (
                <li key={p.id} className={isCurrent ? "is-current" : ""}>
                  <span className="pi-no tabular" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="pi-color"
                    style={{ background: p.color }}
                    aria-hidden
                  />
                  <div className="pi-main">
                    <h3 className="pi-name wrap-anywhere">{p.name}</h3>
                    <div className="pi-meta">
                      <span className="tag tag-neutral">
                        {categoryLabel(p.category)}
                      </span>
                      {p.keywords.length ? (
                        <ul className="pi-keywords" aria-label="识别关键词">
                          {p.keywords.slice(0, 8).map((k) => (
                            <li key={k} className="truncate" title={k}>
                              {k}
                            </li>
                          ))}
                          {p.keywords.length > 8 && (
                            <li className="more">+{p.keywords.length - 8}</li>
                          )}
                        </ul>
                      ) : (
                        <span className="secondary-text small">
                          没有关键词，仅依靠规则与手动纠正
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="pi-leader" aria-hidden />
                  <span
                    className="pi-time tabular"
                    aria-label={`${shortDate(date)} 投入`}
                  >
                    {projectMs ? duration(projectMs[p.id] ?? 0) : "—"}
                  </span>
                  <span className="pi-actions">
                    {isCurrent ? (
                      <span className="current-mark">
                        <Check size={14} aria-hidden /> 当前目标
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void mutate("intent", () => api.intent(p.id), {
                            success: `当前目标：${p.name}`,
                          })
                        }
                      >
                        设为目标
                      </Button>
                    )}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`编辑 ${p.name}`}
                      title="编辑"
                      onClick={() => actions.editProject(p)}
                    >
                      <Pencil size={15} aria-hidden />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="section-foot">
            目标下记录时间 = {shortDate(date)}{" "}
            主注意力中当时目标为该项目的时间，包含相关、打断及待确认；辅助窗口与后台任务不计入。
          </p>
        </section>
      )}
    </div>
  );
}
