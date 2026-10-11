import { useState } from "react";
import type {
  Activity,
  Category,
  Project,
  Relation,
} from "../../../../../packages/types";
import { native } from "../../api";
import { duration } from "../../lib/format";
import {
  appName,
  categories,
  categoryLabel,
  relationLabel,
  sourceLabel,
  stateInfo,
} from "../../lib/semantics";
import {
  Button,
  Confirm,
  Drawer,
  Field,
  StateBadge,
} from "../../components/ui/exports";
import { preciseSpan } from "../timeline/model";
import { CorrectionReview } from "./CorrectionReview";
import { membersOf, spanOf } from "../../lib/activity-groups";

/**
 * Activity detail. The original record and the interpretation layer are shown
 * separately; a correction is written through a previewed range batch and never
 * modifies the raw event.
 */
export function ActivityDrawer({
  activity: a,
  projects,
  onClose,
}: {
  activity: Activity;
  projects: Project[];
  onClose: () => void;
}) {
  const [category, setCategory] = useState<string>(a.category);
  const [intentId, setIntentId] = useState(a.intentId ?? "");
  const [relation, setRelation] = useState<string>(a.relation);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [review, setReview] = useState(false);
  const saving = review;

  const effectiveRelation = intentId ? relation : "unknown";
  const dirty =
    category !== a.category ||
    intentId !== (a.intentId ?? "") ||
    effectiveRelation !== (a.intentId ? a.relation : "unknown");
  const project = projects.find((p) => p.id === a.intentId);
  const st = stateInfo(a.state, a.idle);

  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  const save = () => setReview(true);

  return (
    <>
      <Drawer
        kicker={
          a.role === "primary" ? "主注意力 · 活动详情" : "辅助上下文 · 活动详情"
        }
        title={
          <span className="wrap-anywhere">{a.title || appName(a.process)}</span>
        }
        onRequestClose={requestClose}
        footer={
          a.idle || a.role !== "primary" ? null : (
            <>
              <Button
                variant="quiet"
                disabled={!dirty || saving}
                onClick={() => {
                  setCategory(a.category);
                  setIntentId(a.intentId ?? "");
                  setRelation(a.relation);
                  setError("");
                }}
              >
                还原
              </Button>
              <Button
                variant="primary"
                disabled={!dirty}
                loading={saving}
                onClick={() => void save()}
              >
                预览纠正
              </Button>
            </>
          )
        }
      >
        <p className="drawer-meta tabular">
          {preciseSpan(a)} · {duration(a.end - a.start, true)}
        </p>
        {membersOf(a).length > 1 && (
          <details>
            <summary>合并展示的原始记录（{membersOf(a).length} 段）</summary>
            {membersOf(a).map((m) => (
              <p className="tabular small" key={`${m.id}:${m.start}`}>
                {preciseSpan(m)} · {duration(m.end - m.start, true)} · 面积{" "}
                {Math.round(m.area * 100)}%
              </p>
            ))}
          </details>
        )}

        <section className="detail-section" aria-labelledby="raw-h">
          <h3 id="raw-h" className="detail-h">
            原记录 <span className="detail-h-note">只读，采集时写入</span>
          </h3>
          <dl className="facts">
            <dt>应用</dt>
            <dd className="wrap-anywhere">{a.process}</dd>
            <dt>窗口标题</dt>
            <dd className="wrap-anywhere">
              {a.title || <span className="secondary-text">未记录</span>}
            </dd>
            <dt>浏览器域名</dt>
            <dd className="wrap-anywhere">
              {a.domain || <span className="secondary-text">无</span>}
            </dd>
            <dt>角色</dt>
            <dd>
              {a.role === "primary"
                ? "主注意力（计入人的时间）"
                : "辅助上下文（可见，不增加时长）"}
            </dd>
            {a.role === "supporting" && (
              <>
                <dt>可见面积</dt>
                <dd>
                  约 {Math.round(a.area * 100)}
                  %（窗口矩形与遮挡估算，不代表阅读注意力）
                </dd>
              </>
            )}
            <dt>数据来源</dt>
            <dd>{sourceLabel(a.source)}</dd>
          </dl>
        </section>

        <section className="detail-section" aria-labelledby="interp-h">
          <h3 id="interp-h" className="detail-h">
            当前解释{" "}
            <span className="detail-h-note">由规则与目标推断，可纠正</span>
          </h3>
          <dl className="facts">
            <dt>工作状态</dt>
            <dd>
              <StateBadge state={a.state} idle={a.idle} />
              {!st.known && (
                <span className="secondary-text"> 界面暂不认识这个状态值</span>
              )}
            </dd>
            <dt>类别</dt>
            <dd>{categoryLabel(a.category)}</dd>
            <dt>当时目标</dt>
            <dd>
              {project?.name ?? (a.intentId ? "已不存在的项目" : "未设置目标")}
            </dd>
            <dt>与目标关系</dt>
            <dd>{relationLabel(a.relation)}</dd>
          </dl>
          <div className="reason">
            <strong>分类依据</strong>
            <p className="wrap-anywhere">{a.reason || "未提供"}</p>
            <p className="secondary-text small">
              规则置信度 {Math.round(a.confidence * 100)}
              %：该规则匹配本身的预设可信程度，不是对你是否专注的概率判断。
            </p>
          </div>
        </section>

        {a.idle || a.role !== "primary" ? (
          <p className="detail-note">
            {a.idle
              ? "离开 / 休息片段不参与分类，无需纠正。"
              : "辅助窗口只提供可见上下文，不计入人的时间。请在主注意力记录中确认实际用途。"}
          </p>
        ) : (
          <section className="detail-section" aria-labelledby="fix-h">
            <h3 id="fix-h" className="detail-h">
              纠正这一段{" "}
              <span className="detail-h-note">写入解释层，原记录保持不变</span>
            </h3>
            <div className="form-stack">
              <Field label="类别">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {Object.entries(categories).map(([v, n]) => (
                    <option key={v} value={v}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="当时的目标">
                <select
                  value={intentId}
                  onChange={(e) => setIntentId(e.target.value)}
                >
                  <option value="">未设置目标</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="与当时目标的关系"
                help={
                  intentId
                    ? "相关计为专注；无关按持续时长计为短暂打断或分心。"
                    : "未设置目标时，相关性保持待确认，不会被算作专注或分心。"
                }
              >
                <select
                  value={effectiveRelation}
                  disabled={!intentId}
                  onChange={(e) => setRelation(e.target.value)}
                >
                  <option value="related">与目标相关</option>
                  <option value="unrelated">与目标无关</option>
                  <option value="unknown">待确认</option>
                </select>
              </Field>
              {!native && (
                <p className="detail-note">
                  演示环境：纠正只修改本页内存中的示例，不运行真实分类引擎。
                </p>
              )}
              {error && (
                <p className="form-error" role="alert">
                  未保存：{error}
                </p>
              )}
            </div>
          </section>
        )}
      </Drawer>
      {review && (
        <CorrectionReview
          request={{
            ranges: membersOf(a).map(spanOf),
            change: {
              category: category as Category,
              relation: effectiveRelation as Relation,
              overrideIntent: true,
              intentId: intentId || null,
            },
          }}
          label={membersOf(a).length > 1 ? "合并片段纠正" : "单条活动纠正"}
          onClose={() => setReview(false)}
          onSaved={onClose}
        />
      )}
      {confirmClose && (
        <Confirm
          title="放弃这次纠正？"
          body="修改尚未保存。关闭后，这一段仍保持原来的解释。"
          confirmLabel="放弃修改"
          cancelLabel="继续编辑"
          danger
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => {
            setConfirmClose(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
