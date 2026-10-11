import { useRef, useState } from "react";
import type {
  Category,
  Project,
  KeywordPreview,
} from "../../../../../packages/types";
import { bounds, localDate, shiftDate } from "../../lib/dates";
import { api } from "../../api";
import { useMutate, usePending } from "../../data/context";
import { parseList } from "../../lib/lists";
import { categories } from "../../lib/semantics";
import { validateProject, type FieldErrors } from "../../lib/validation";
import { Button, Field } from "../../components/ui/exports";
import { FormDialog } from "../../components/ui/FormDialog";

/** A few quiet defaults for new projects. Existing project colours are user data and are kept as-is. */
const swatches = [
  "#5e7a52",
  "#53697e",
  "#9c4f38",
  "#8a6a2e",
  "#6d5a7e",
  "#4f7470",
  "#7a6f62",
];

export function ProjectDialog({
  project,
  onClose,
}: {
  project: Project | null;
  onClose: () => void;
}) {
  const mutate = useMutate();
  const key = `project:${project?.id || "new"}`;
  const saving = usePending(key);
  const initial = {
    name: project?.name ?? "",
    category: project?.category ?? "learning",
    color: project?.color ?? swatches[0],
    keywords: project?.keywords.join("\n") ?? "",
  };
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<{
    key: string;
    data: KeywordPreview;
  } | null>(null);
  const [testing, setTesting] = useState(false),
    [testError, setTestError] = useState("");
  const testSequence = useRef(0);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const keywords = parseList(v.keywords);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV({ ...v, [k]: e.target.value });

  const submit = async () => {
    const errs = validateProject(v);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setError("");
    const r = await mutate(
      key,
      () =>
        api.project({
          id: project?.id ?? "",
          name: v.name.trim(),
          category: v.category as Category,
          color: v.color.toLowerCase(),
          keywords,
        }),
      {
        success: project ? "项目已更新" : `已创建项目「${v.name.trim()}」`,
        inlineError: true,
      },
    );
    // Saved (even if the refresh failed): close so it cannot be submitted twice.
    if (r.status === "failed") setError(r.error);
    else if (r.status !== "busy") onClose();
  };

  return (
    <FormDialog
      title={project ? "编辑项目" : "新建项目"}
      kicker="我的项目"
      dirty={dirty}
      saving={saving}
      error={error}
      submitLabel={project ? "保存修改" : "创建项目"}
      onSubmit={() => void submit()}
      onClose={onClose}
      width={520}
    >
      <Field
        label="项目名称"
        error={errors.name}
        aside={
          <span className="field-count tabular">
            {[...v.name.trim()].length}/80
          </span>
        }
      >
        <input
          value={v.name}
          onChange={set("name")}
          placeholder="例如：Cisco CCNA 学习"
          autoComplete="off"
        />
      </Field>
      <Field
        label="活动类别"
        error={errors.category}
        help="类别描述“这类活动是什么”；是否把这个项目作为当前目标，在概览或项目列表里单独选择。"
      >
        <select value={v.category} onChange={set("category")}>
          {Object.entries(categories).map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="识别关键词"
        error={errors.keywords}
        aside={
          <span className="field-count tabular">{keywords.length}/30</span>
        }
        help="匹配窗口标题、应用名称或浏览器域名。用逗号（中英文均可）、顿号或换行分隔；重复与空白会被忽略。"
      >
        <textarea
          rows={4}
          value={v.keywords}
          onChange={set("keywords")}
          placeholder={"Cisco\nCCNA\nnetacad.com"}
        />
      </Field>
      {keywords.length > 0 && (
        <ul className="keyword-preview" aria-label="将保存的关键词">
          {keywords.map((k) => (
            <li key={k} className="wrap-anywhere">
              {k}
            </li>
          ))}
        </ul>
      )}
      <Button
        disabled={!keywords.length || !!validateProject(v).keywords}
        loading={testing}
        onClick={() => {
          const current = JSON.stringify(keywords),
            seq = ++testSequence.current;
          setTesting(true);
          setTestError("");
          const today = localDate();
          void api
            .testKeywords(
              keywords,
              bounds(shiftDate(today, -6))[0],
              bounds(today)[1],
            )
            .then(
              (data) => {
                if (seq === testSequence.current)
                  setMatches({ key: current, data });
              },
              (e) => {
                if (seq === testSequence.current) setTestError(String(e));
              },
            )
            .finally(() => {
              if (seq === testSequence.current) setTesting(false);
            });
        }}
      >
        测试关键词
      </Button>
      {testError && (
        <p className="form-error" role="alert">
          测试未完成：{testError}；不影响保存。
        </p>
      )}
      {matches && matches.key === JSON.stringify(keywords) && (
        <div className="detail-note" role="status">
          <p>
            最近七天匹配 {matches.data.count} 条记录。
            {matches.data.count === 0 ? "零命中仅供参考，仍可保存。" : ""}
          </p>
          <ul>
            {matches.data.examples.map((x) => (
              <li key={x} className="wrap-anywhere">
                {x}
              </li>
            ))}
          </ul>
          {!matches.data.hasDomains && (
            <p>
              这些记录没有浏览器域名，目前只能依据应用和标题识别；请在连接设置检查浏览器扩展。
            </p>
          )}
        </div>
      )}
      <Field
        label="项目颜色"
        error={errors.color}
        help="只用于色点和细边，不改变文字颜色。"
      >
        <span className="color-field">
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(v.color) ? v.color : "#000000"}
            onChange={set("color")}
            aria-label="选择颜色"
          />
          <input
            className="mono"
            value={v.color}
            onChange={set("color")}
            aria-label="颜色值"
            maxLength={7}
          />
          <span className="swatches" role="group" aria-label="常用颜色">
            {swatches.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${v.color.toLowerCase() === c ? "on" : ""}`}
                style={{ background: c }}
                aria-label={`使用颜色 ${c}`}
                aria-pressed={v.color.toLowerCase() === c}
                onClick={() => setV({ ...v, color: c })}
              />
            ))}
          </span>
        </span>
      </Field>
    </FormDialog>
  );
}
