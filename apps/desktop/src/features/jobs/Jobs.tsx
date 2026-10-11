import { Check, Plus, X } from "lucide-react";
import type { Job, Project } from "../../../../../packages/types";
import { api } from "../../api";
import { useMutate, usePendingSet } from "../../data/context";
import { useActions } from "../../app/actions";
import { duration, time, timeWithSeconds } from "../../lib/format";
import { jobStatusInfo, toolLabel } from "../../lib/semantics";
import { Button, Drawer, EmptyBlock } from "../../components/ui/exports";
import "./jobs.css";

function JobFinish({ job, compact = false }: { job: Job; compact?: boolean }) {
  const mutate = useMutate();
  const isPending = usePendingSet();
  const busy = isPending(`job:${job.id}`);
  const finish = (status: "completed" | "failed") =>
    void mutate(`job:${job.id}`, () => api.finishJob(job.id, status), {
      success:
        status === "completed"
          ? `「${job.name}」已标记完成`
          : `「${job.name}」已标记失败`,
    });
  return (
    <span className="job-actions">
      <Button
        size="sm"
        loading={busy}
        icon={<Check size={14} aria-hidden />}
        onClick={() => finish("completed")}
      >
        {compact ? "完成" : "标记完成"}
      </Button>
      <Button
        size="sm"
        variant="quiet"
        disabled={busy}
        icon={<X size={14} aria-hidden />}
        onClick={() => finish("failed")}
      >
        失败
      </Button>
    </span>
  );
}

/**
 * Explicitly started background work. Running jobs are listed first so they are
 * never buried under a day of activities. Job time is machine time: it is shown
 * apart from, and never added to, the human time.
 */
export function JobsSection({
  jobs,
  projects,
  nowMs,
  isToday,
}: {
  jobs: Job[];
  projects: Map<string, Project>;
  nowMs: number;
  isToday: boolean;
}) {
  const actions = useActions();
  const sorted = jobs
    .slice()
    .sort(
      (a, b) =>
        Number(jobStatusInfo(b.status).running) -
          Number(jobStatusInfo(a.status).running) || b.start - a.start,
    );
  const running = sorted.filter((j) => jobStatusInfo(j.status).running).length;
  return (
    <section className="section jobs" aria-labelledby="jobs-h">
      <header className="section-head">
        <h2 id="jobs-h" className="section-title">
          后台任务
          {running > 0 && (
            <span className="count-pill running">{running} 个运行中</span>
          )}
        </h2>
        <Button
          size="sm"
          icon={<Plus size={14} aria-hidden />}
          onClick={actions.newJob}
        >
          开始后台任务
        </Button>
      </header>
      {sorted.length ? (
        <ol className="job-list">
          {sorted.map((j) => {
            const st = jobStatusInfo(j.status);
            const end = j.end ?? nowMs;
            return (
              <li
                key={j.id}
                className={`job-row ${st.running ? "is-running" : ""}`}
              >
                <span className={`job-mark job-${st.tone}`} aria-hidden />
                <button
                  type="button"
                  className="job-main row-link"
                  onClick={() => actions.openJob(j)}
                >
                  <span className="row-title truncate" title={j.name}>
                    {j.name}
                  </span>
                  <span className="row-sub truncate">
                    {toolLabel(j.tool)}
                    {j.projectId
                      ? ` · ${projects.get(j.projectId)?.name ?? "已不存在的项目"}`
                      : ""}{" "}
                    · {time(j.start)} 开始
                  </span>
                </button>
                <span className={`job-status job-${st.tone}`}>{st.label}</span>
                <span className="job-time tabular">
                  {duration(Math.max(0, end - j.start))}
                  <small>与人的工作并行 {duration(j.parallelMs)}</small>
                </span>
                {st.running ? (
                  <JobFinish job={j} compact />
                ) : (
                  <span className="job-actions" />
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyBlock
          title={isToday ? "此刻没有后台任务" : "这一天没有后台任务"}
          mark={false}
        >
          让 Codex 生成代码、Python 处理数据时，在这里记下开始；完成后标记结束。
        </EmptyBlock>
      )}
      <p className="section-foot">
        任务以你点下的开始与结束为准，进程存在不等于任务在运行；任务时长不计入人的时间。
      </p>
    </section>
  );
}

export function JobDrawer({
  job,
  projects,
  nowMs,
  onClose,
}: {
  job: Job;
  projects: Map<string, Project>;
  nowMs: number;
  onClose: () => void;
}) {
  const st = jobStatusInfo(job.status);
  const end = job.end ?? nowMs;
  return (
    <Drawer
      kicker="后台任务 · 详情"
      title={<span className="wrap-anywhere">{job.name}</span>}
      onRequestClose={onClose}
    >
      <p className="drawer-meta">
        <span className={`job-status job-${st.tone}`}>{st.label}</span>
      </p>
      <section className="detail-section">
        <h3 className="detail-h">记录</h3>
        <dl className="facts">
          <dt>工具</dt>
          <dd>{toolLabel(job.tool)}</dd>
          <dt>关联项目</dt>
          <dd>
            {job.projectId
              ? (projects.get(job.projectId)?.name ?? "已不存在的项目")
              : "未关联"}
          </dd>
          <dt>开始</dt>
          <dd className="tabular">{timeWithSeconds(job.start)}</dd>
          <dt>结束</dt>
          <dd className="tabular">
            {job.end == null ? "仍在运行" : timeWithSeconds(job.end)}
          </dd>
          <dt>最近信号</dt>
          <dd className="tabular">{timeWithSeconds(job.lastSeen)}</dd>
        </dl>
      </section>
      <section className="detail-section">
        <h3 className="detail-h">
          时长 <span className="detail-h-note">所选日期范围内的部分</span>
        </h3>
        <dl className="facts">
          <dt>运行</dt>
          <dd className="tabular">
            {duration(Math.max(0, end - job.start), true)}
          </dd>
          <dt>前台交互</dt>
          <dd className="tabular">
            {duration(job.foregroundMs, true)}（你在该工具窗口中操作的时间）
          </dd>
          <dt>后台运行</dt>
          <dd className="tabular">{duration(job.backgroundMs, true)}</dd>
          <dt>与其他工作并行</dt>
          <dd className="tabular">
            {duration(job.parallelMs, true)}（与人的其他活动的交集）
          </dd>
        </dl>
        <p className="secondary-text small">
          没有进度百分比：任务只有显式的开始和结束信号。
        </p>
      </section>
      {st.running && (
        <section className="detail-section">
          <JobFinish job={job} />
        </section>
      )}
    </Drawer>
  );
}
