import { useState } from "react";
import type {
  Category,
  Project,
  Relation,
  Rule,
} from "../../../../../packages/types";
import { api, native } from "../../api";
import { useMutate, usePending } from "../../data/context";
import { categories } from "../../lib/semantics";
import { validateRule, type FieldErrors } from "../../lib/validation";
import { Field } from "../../components/ui/exports";
import { FormDialog } from "../../components/ui/FormDialog";

export function RuleDialog({
  projects,
  onClose,
}: {
  projects: Project[];
  onClose: () => void;
}) {
  const mutate = useMutate();
  const saving = usePending("rule:new");
  const initial = {
    field: "title",
    pattern: "",
    category: "learning",
    relation: "related",
    intentId: "",
  };
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV({ ...v, [k]: e.target.value });

  const submit = async () => {
    const errs = validateRule(v);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setError("");
    const rule: Rule = {
      id: "",
      field: v.field as Rule["field"],
      pattern: v.pattern.trim(),
      category: v.category as Category,
      relation: v.relation as Relation,
      intentId: v.intentId || null,
    };
    const r = await mutate("rule:new", () => api.rule(rule), {
      success: "规则已添加",
      inlineError: true,
    });
    if (r.status === "failed") setError(r.error);
    else if (r.status !== "busy") onClose();
  };

  return (
    <FormDialog
      title="添加分类规则"
      kicker="分类规则"
      dirty={JSON.stringify(v) !== JSON.stringify(initial)}
      saving={saving}
      error={error}
      submitLabel="添加规则"
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <div className="form-row">
        <Field label="匹配字段" error={errors.field}>
          <select value={v.field} onChange={set("field")}>
            <option value="title">窗口标题</option>
            <option value="domain">浏览器域名</option>
            <option value="app">应用名称</option>
          </select>
        </Field>
        <Field label="包含关键词" error={errors.pattern} className="grow">
          <input
            value={v.pattern}
            onChange={set("pattern")}
            placeholder="例如：CCNA"
            maxLength={200}
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="form-row">
        <Field label="归入类别" error={errors.category}>
          <select value={v.category} onChange={set("category")}>
            {Object.entries(categories).map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="与目标的关系" error={errors.relation} className="grow">
          <select value={v.relation} onChange={set("relation")}>
            <option value="related">相关 · 计为专注</option>
            <option value="unrelated">无关 · 按时长计为打断或分心</option>
            <option value="unknown">待确认</option>
          </select>
        </Field>
      </div>
      <Field
        label="适用目标"
        help="新规则优先于项目关键词。相关性始终以当时的目标为参照；没有目标时仍为待确认。"
      >
        <select value={v.intentId} onChange={set("intentId")}>
          <option value="">所有目标</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      {!native && (
        <p className="detail-note">
          演示环境只保存规则列表，不运行真实的分类引擎，已有示例活动不会被重新分类。
        </p>
      )}
    </FormDialog>
  );
}
