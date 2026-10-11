import { useState } from "react";
import type { Project } from "../../../../../packages/types";
import { api } from "../../api";
import { useMutate, usePending } from "../../data/context";
import { jobTools, toolLabel } from "../../lib/semantics";
import { validateJob, type FieldErrors } from "../../lib/validation";
import { Field } from "../../components/ui/exports";
import { FormDialog } from "../../components/ui/FormDialog";

export function JobDialog({
  projects,
  intentId,
  onClose,
}: {
  projects: Project[];
  intentId: string | null;
  onClose: () => void;
}) {
  const mutate = useMutate();
  const saving = usePending("job:new");
  const initial = { name: "", tool: "codex", projectId: intentId ?? "" };
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV({ ...v, [k]: e.target.value });

  const submit = async () => {
    const errs = validateJob(v);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setError("");
    const r = await mutate(
      "job:new",
      () => api.startJob(v.name.trim(), v.tool, v.projectId || null),
      {
        success: `后台任务「${v.name.trim()}」已开始计时`,
        inlineError: true,
      },
    );
    // start_job is not idempotent: once written, close even if the refresh failed.
    if (r.status === "failed") setError(r.error);
    else if (r.status !== "busy") onClose();
  };

  return (
    <FormDialog
      title="开始后台任务"
      kicker="后台任务"
      dirty={
        v.name !== "" ||
        v.tool !== initial.tool ||
        v.projectId !== initial.projectId
      }
      saving={saving}
      error={error}
      submitLabel="开始计时"
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <Field label="任务名称" error={errors.name}>
        <input
          value={v.name}
          onChange={set("name")}
          placeholder="例如：生成数据处理脚本"
          maxLength={120}
          autoComplete="off"
        />
      </Field>
      <div className="form-row">
        <Field label="工具" error={errors.tool}>
          <select value={v.tool} onChange={set("tool")}>
            {jobTools.map((t) => (
              <option key={t} value={t}>
                {toolLabel(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="关联项目" className="grow">
          <select value={v.projectId} onChange={set("projectId")}>
            <option value="">不关联项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="detail-note">
        从现在开始计时，完成后在任务列表中标记完成或失败。任务与人的工作可以并行，但不会相加。
      </p>
    </FormDialog>
  );
}
