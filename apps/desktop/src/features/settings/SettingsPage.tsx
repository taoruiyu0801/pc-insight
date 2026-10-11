import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ArrowDownToLine, Copy, Plus, RotateCw, Trash2 } from "lucide-react";
import type { Rule, Settings, Snapshot } from "../../../../../packages/types";
import { api, native } from "../../api";
import { PageHeader } from "../../app/PageHeader";
import {
  useMutate,
  useNotices,
  usePending,
  usePendingSet,
  type RangeResult,
} from "../../data/context";
import { bounds, shortDate } from "../../lib/dates";
import {
  categoryLabel,
  relationLabel,
  ruleFieldLabel,
} from "../../lib/semantics";
import {
  Button,
  Confirm,
  DateNav,
  EmptyBlock,
  ErrorBlock,
  Field,
  LoadingBlock,
  Tag,
} from "../../components/ui/exports";
import {
  draftErrors,
  editSettings,
  fromDraft,
  isDirty,
  settingsEditor,
  toDraft,
  type SettingsDraft,
} from "./draft";
import "./settings.css";

export function SettingsPage({
  live,
  today,
  initialDate,
  onDirtyChange,
  onNewRule,
}: {
  live: RangeResult;
  today: string;
  initialDate: string;
  onDirtyChange: (dirty: boolean) => void;
  onNewRule: () => void;
}) {
  const data = live.data;
  if (!data)
    return (
      <div className="page">
        <PageHeader kicker="偏好设置" title="偏好设置" />
        {live.error ? (
          <ErrorBlock
            title="无法读取设置"
            message={live.error}
            onRetry={live.retry}
          />
        ) : (
          <LoadingBlock label="正在读取设置…" />
        )}
      </div>
    );
  return (
    <SettingsBody
      data={data}
      fresh={!live.stale && !live.transitional && !live.error}
      today={today}
      initialDate={initialDate}
      onDirtyChange={onDirtyChange}
      onNewRule={onNewRule}
    />
  );
}

const sections = [
  ["recording", "记录偏好"],
  ["privacy", "数据与隐私"],
  ["connections", "连接"],
  ["rules", "分类规则"],
] as const;

function SettingsBody({
  data,
  fresh,
  today,
  initialDate,
  onDirtyChange,
  onNewRule,
}: {
  data: Snapshot;
  fresh: boolean;
  today: string;
  initialDate: string;
  onDirtyChange: (dirty: boolean) => void;
  onNewRule: () => void;
}) {
  const mutate = useMutate();
  const saving = usePending("settings");
  const [editor, dispatch] = useReducer(
    editSettings,
    data.settings,
    settingsEditor,
  );
  const { base, draft, external, submission, savedWithEdits } = editor;
  const submitting = useRef(false);
  const [saveError, setSaveError] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  // Reconcile again after a submission ends. Its echo must not overwrite edits
  // or appear as an external conflict, and an invalidated snapshot cannot rebase.
  useEffect(() => {
    dispatch({ type: "snapshot", settings: data.settings, fresh });
  }, [data.settings, fresh, submission]);

  const dirty = isDirty(draft, base);
  const errors = draftErrors(draft);
  const hasErrors = Object.keys(errors).length > 0;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof SettingsDraft>(k: K, v: SettingsDraft[K]) => {
    dispatch({ type: "edit", patch: { [k]: v } });
    setSaveError("");
  };

  const save = async () => {
    if (submitting.current || saving) return;
    setShowErrors(true);
    if (hasErrors) return;
    const next = fromDraft(draft, base);
    submitting.current = true;
    setSaveError("");
    dispatch({ type: "begin", settings: next });
    try {
      const r = await mutate("settings", () => api.settings(next), {
        success: "偏好已保存",
        inlineError: true,
      });
      if (r.status === "saved" || r.status === "saved-refresh-failed") {
        dispatch({ type: "saved" });
      } else {
        dispatch({ type: "failed" });
        if (r.status === "failed") setSaveError(r.error);
      }
    } finally {
      submitting.current = false;
    }
  };
  const discard = () => {
    dispatch({ type: "discard" });
    setSaveError("");
    setShowErrors(false);
  };
  const err = (k: keyof SettingsDraft) =>
    showErrors || draft[k] !== toDraft(base)[k] ? errors[k] : undefined;

  return (
    <div className="page settings-page">
      <PageHeader kicker="偏好设置" title="偏好设置">
        <p className="page-lede">
          标有 <Tag tone="accent">需保存</Tag>{" "}
          的项目先修改草稿，点击底部「保存偏好」后生效；标有 <Tag>立即生效</Tag>{" "}
          的操作点击后马上执行。
        </p>
        <nav className="settings-toc" aria-label="设置分区">
          {sections.map(([id, name], i) => (
            <a key={id} href={`#set-${id}`}>
              <span className="tabular">0{i + 1}</span> {name}
            </a>
          ))}
        </nav>
      </PageHeader>

      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <section
          id="set-recording"
          className="set-section"
          aria-labelledby="set-recording-h"
        >
          <h2 id="set-recording-h" className="set-title">
            <span className="tabular">01</span> 记录偏好{" "}
            <Tag tone="accent">需保存</Tag>
          </h2>
          <SettingRow
            label="采集来源"
            help={`当前：${data.collectorSource} · ${data.awStatus}`}
            error={err("collectorSource")}
          >
            <select
              value={draft.collectorSource}
              onChange={(e) =>
                set(
                  "collectorSource",
                  e.target.value as Settings["collectorSource"],
                )
              }
            >
              <option value="auto">
                优先 ActivityWatch，不可用时用 Windows 原生
              </option>
              <option value="activitywatch">仅 ActivityWatch</option>
              <option value="native">仅 Windows 原生</option>
            </select>
          </SettingRow>
          <SettingRow
            label="采样间隔"
            help="Windows 原生采集与辅助窗口的采样频率。"
            error={err("sampleSeconds")}
          >
            <select
              value={draft.sampleSeconds}
              onChange={(e) => set("sampleSeconds", +e.target.value)}
            >
              {[1, 2, 3, 5].map((n) => (
                <option key={n} value={n}>
                  {n} 秒
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow
            label="离开检测"
            help="仅影响原生采集；ActivityWatch 使用它自己的 AFK 设置。"
            error={err("idleSeconds")}
          >
            <select
              value={draft.idleSeconds}
              onChange={(e) => set("idleSeconds", +e.target.value)}
            >
              {[30, 60, 180, 300, 600, 900].map((n) => (
                <option key={n} value={n}>
                  {n >= 60 ? `${n / 60} 分钟` : `${n} 秒`}无操作
                </option>
              ))}
            </select>
          </SettingRow>
        </section>

        <section
          id="set-privacy"
          className="set-section"
          aria-labelledby="set-privacy-h"
        >
          <h2 id="set-privacy-h" className="set-title">
            <span className="tabular">02</span> 数据与隐私
          </h2>
          <p className="set-lede">
            不截图、不记录按键、不上传活动。浏览器只保留域名，路径和参数在发送前即被移除。
          </p>
          <SettingRow
            label="记录窗口标题"
            tag="需保存"
            help="关闭后不再保存新的标题，已有记录保留。"
          >
            <label className="switch">
              <input
                type="checkbox"
                checked={draft.recordTitles}
                onChange={(e) => set("recordTitles", e.target.checked)}
              />
              <span>{draft.recordTitles ? "记录" : "不记录"}</span>
            </label>
          </SettingRow>
          <SettingRow
            label="原始事件保留"
            tag="需保存"
            help="到期只清理原始采样，已聚合的活动继续保留。"
            error={err("retentionDays")}
          >
            <select
              value={draft.retentionDays}
              onChange={(e) => set("retentionDays", +e.target.value)}
            >
              {[7, 30, 60, 90, 365].map((n) => (
                <option key={n} value={n}>
                  {n} 天
                </option>
              ))}
            </select>
          </SettingRow>
          <div className="set-row stacked">
            <Field
              label={
                <>
                  排除应用 <Tag tone="accent">需保存</Tag>
                </>
              }
              help="进程名称，每行一个或用逗号分隔，例如 password.exe。最多 100 项。"
              error={err("excludedApps")}
            >
              <textarea
                rows={3}
                value={draft.excludedApps}
                onChange={(e) => set("excludedApps", e.target.value)}
              />
            </Field>
            <Field
              label={
                <>
                  排除标题关键词 <Tag tone="accent">需保存</Tag>
                </>
              }
              help="标题包含这些词的窗口不会写入数据库。最多 100 项。"
              error={err("excludedTitles")}
            >
              <textarea
                rows={3}
                value={draft.excludedTitles}
                onChange={(e) => set("excludedTitles", e.target.value)}
              />
            </Field>
          </div>
          <Autostart />
          <SettingRow label="本地数据库" help="真实数据只保存在这个文件中。">
            <code className="path wrap-anywhere">{data.databasePath}</code>
          </SettingRow>
        </section>

        <div
          className={`save-bar ${dirty ? "is-dirty" : ""}`}
          role="region"
          aria-label="保存偏好"
        >
          <span className="save-state" role="status">
            {saving
              ? "正在保存…"
              : saveError
                ? `保存失败：${saveError}`
                : dirty
                  ? hasErrors && showErrors
                    ? "有字段需要修正"
                    : external
                      ? "有未保存的修改；期间设置在别处被更新，保存将以你的草稿为准"
                      : savedWithEdits
                        ? "本次偏好已保存，仍有新的修改未保存"
                        : "有未保存的修改"
                  : "偏好与本机一致"}
          </span>
          <Button variant="quiet" onClick={discard} disabled={!dirty || saving}>
            放弃修改
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={saving}
            disabled={!dirty}
          >
            保存偏好
          </Button>
        </div>
      </form>

      <section
        id="set-connections"
        className="set-section"
        aria-labelledby="set-connections-h"
      >
        <h2 id="set-connections-h" className="set-title">
          <span className="tabular">03</span> 连接
        </h2>
        <BrowserPairing data={data} />
        <AwImport data={data} today={today} initialDate={initialDate} />
      </section>

      <section
        id="set-rules"
        className="set-section"
        aria-labelledby="set-rules-h"
      >
        <h2 id="set-rules-h" className="set-title">
          <span className="tabular">04</span> 分类规则 <Tag>立即生效</Tag>
          <Button
            size="sm"
            className="set-title-action"
            icon={<Plus size={14} aria-hidden />}
            onClick={onNewRule}
          >
            添加规则
          </Button>
        </h2>
        <p className="set-lede">
          新规则优先于项目关键词。相关性以当时的目标为参照；未设置目标时不判定专注。
        </p>
        <Rules rules={data.rules} data={data} />
      </section>
    </div>
  );
}

function SettingRow({
  label,
  help,
  error,
  tag,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`set-row ${error ? "field-invalid" : ""}`}>
      <div className="set-row-text">
        <strong>
          {label}{" "}
          {tag && (
            <Tag tone={tag === "需保存" ? "accent" : "neutral"}>{tag}</Tag>
          )}
        </strong>
        {help && <span className="field-help wrap-anywhere">{help}</span>}
        {error && (
          <span className="field-error" role="alert">
            {error}
          </span>
        )}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}

type AutostartState = "loading" | "on" | "off" | "error" | "unsupported";

function Autostart() {
  const mutate = useMutate();
  const busy = usePending("autostart");
  const [state, setState] = useState<AutostartState>(
    native ? "loading" : "unsupported",
  );
  const [error, setError] = useState("");
  const load = useCallback(() => {
    if (!native) return;
    setState("loading");
    api
      .autostart()
      .then((on) => setState(on ? "on" : "off"))
      .catch((e) => {
        setError(String(e));
        setState("error");
      });
  }, []);
  useEffect(load, [load]);
  const label =
    state === "loading"
      ? "正在读取…"
      : state === "error"
        ? "读取失败"
        : state === "unsupported"
          ? "仅 Windows 桌面版可设置"
          : state === "on"
            ? "已开启"
            : "已关闭";
  return (
    <div className="set-row">
      <div className="set-row-text">
        <strong>
          开机启动 <Tag>立即生效</Tag>
        </strong>
        <span className="field-help">启动后保持暂停，由你点击开始记录。</span>
        {state === "error" && (
          <span className="field-error" role="alert">
            无法读取开机启动状态：{error}
          </span>
        )}
      </div>
      <div className="set-row-control">
        {state === "error" ? (
          <Button
            size="sm"
            icon={<RotateCw size={14} aria-hidden />}
            onClick={load}
          >
            重试读取
          </Button>
        ) : (
          <label className="switch">
            <input
              type="checkbox"
              checked={state === "on"}
              disabled={state === "loading" || state === "unsupported" || busy}
              aria-busy={busy || undefined}
              onChange={async (e) => {
                const enabled = e.target.checked;
                const r = await mutate(
                  "autostart",
                  () => api.setAutostart(enabled),
                  {
                    success: enabled ? "已开启开机启动" : "已关闭开机启动",
                  },
                );
                if (r.status !== "failed" && r.status !== "busy")
                  setState(enabled ? "on" : "off");
                else load();
              }}
            />
            <span>{label}</span>
          </label>
        )}
      </div>
    </div>
  );
}

function BrowserPairing({ data }: { data: Snapshot }) {
  const { notices } = useNotices();
  const status = data.browserConnected
    ? "已收到浏览器信息"
    : data.bridgeReady
      ? "等待扩展连接"
      : "本机接口未就绪";
  return (
    <div className="connection">
      <div className="connection-head">
        <h3>浏览器扩展</h3>
        <span
          className={`conn-state ${data.browserConnected ? "ok" : data.bridgeReady ? "wait" : "off"}`}
        >
          <i aria-hidden /> {status}
        </span>
      </div>
      <p className="set-lede">
        在 Chrome / Edge 加载项目中的 <code>apps/browser-extension</code>
        ，再把配对码粘贴到扩展弹窗。连接状态只表示扩展是否在发送，与是否正在记录无关。
      </p>
      <div className="token-row">
        <label className="visually-hidden" htmlFor="pair-token">
          浏览器配对码（已隐藏）
        </label>
        <input
          id="pair-token"
          type="password"
          readOnly
          value={data.settings.browserToken}
          autoComplete="off"
        />
        <Button
          icon={<Copy size={14} aria-hidden />}
          onClick={() => {
            if (!navigator.clipboard) {
              notices.push("error", "无法访问剪贴板，请在桌面版中重试");
              return;
            }
            navigator.clipboard.writeText(data.settings.browserToken).then(
              () => notices.push("success", "配对码已复制"),
              (e) =>
                notices.push(
                  "error",
                  `复制失败：${e instanceof Error ? e.message : String(e)}`,
                ),
            );
          }}
        >
          复制配对码
        </Button>
      </div>
      {data.bridgeError && (
        <p className="field-error" role="alert">
          本机接口：{data.bridgeError}
        </p>
      )}
    </div>
  );
}

type ImportResult = {
  kind: "ok" | "none" | "offline" | "nodata" | "unsupported" | "error";
  text: string;
};

function classifyImportError(message: string): ImportResult {
  if (message.includes("需要 Windows 桌面版"))
    return { kind: "unsupported", text: message };
  if (message.includes("未连接"))
    return { kind: "offline", text: `未连接 ActivityWatch：${message}` };
  if (message.includes("未找到"))
    return { kind: "nodata", text: `ActivityWatch 中没有可用数据：${message}` };
  return { kind: "error", text: `导入失败：${message}` };
}

function AwImport({
  data,
  today,
  initialDate,
}: {
  data: Snapshot;
  today: string;
  initialDate: string;
}) {
  const mutate = useMutate();
  const busy = usePending("aw-import");
  const [date, setDate] = useState(initialDate);
  const [result, setResult] = useState<ImportResult | null>(null);
  const run = async () => {
    setResult(null);
    const r = await mutate("aw-import", () => api.importAw(...bounds(date)), {
      inlineError: true,
    });
    if (r.status === "busy") return;
    if (r.status === "failed") setResult(classifyImportError(r.error));
    else if (r.value > 0)
      setResult({
        kind: "ok",
        text: `已导入 ${shortDate(date)} 的 ${r.value} 条新记录${r.status === "saved-refresh-failed" ? "（界面刷新失败，请稍后重试读取）" : ""}`,
      });
    else
      setResult({
        kind: "none",
        text: `${shortDate(date)} 没有新的记录：ActivityWatch 中没有这一天的数据，或已全部导入过。`,
      });
  };
  return (
    <div className="connection">
      <div className="connection-head">
        <h3>ActivityWatch</h3>
        <span className="conn-state neutral">
          <i aria-hidden /> {data.awStatus}
        </span>
      </div>
      <p className="set-lede">
        PC Insight 的暂停、排除和标题设置只作用于 PC Insight，不会改变
        ActivityWatch
        自己的采集与保存。导入与原生采集重叠的时间会自动去重，可重复执行。
      </p>
      <div className="import-row">
        <span className="secondary-text small">导入日期</span>
        <DateNav
          date={date}
          today={today}
          onChange={setDate}
          label="ActivityWatch 导入日期"
          compact
        />
        <Button
          icon={<ArrowDownToLine size={14} aria-hidden />}
          loading={busy}
          onClick={() => void run()}
          disabled={!native}
        >
          导入 {shortDate(date)}
        </Button>
        <Tag>立即生效</Tag>
      </div>
      {!native && (
        <p className="secondary-text small">
          浏览器演示不能连接本机 ActivityWatch。
        </p>
      )}
      {result && (
        <p
          className={`import-result ${result.kind}`}
          role={
            result.kind === "ok" || result.kind === "none" ? "status" : "alert"
          }
        >
          {result.text}
        </p>
      )}
    </div>
  );
}

function Rules({ rules, data }: { rules: Rule[]; data: Snapshot }) {
  const mutate = useMutate();
  const isPending = usePendingSet();
  const [confirm, setConfirm] = useState<Rule | null>(null);
  if (!rules.length)
    return (
      <EmptyBlock title="还没有自定义规则" mark={false}>
        项目关键词已经能识别大部分相关活动。遇到经常判断错的应用或网站，再添加规则。
      </EmptyBlock>
    );
  return (
    <>
      <table className="rules-table">
        <caption className="visually-hidden">分类规则，新规则优先</caption>
        <thead>
          <tr>
            <th scope="col">字段</th>
            <th scope="col">包含</th>
            <th scope="col">类别 · 关系</th>
            <th scope="col">适用目标</th>
            <th scope="col">
              <span className="visually-hidden">操作</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td>
                <Tag>{ruleFieldLabel(r.field)}</Tag>
              </td>
              <td className="wrap-anywhere rule-pattern">{r.pattern}</td>
              <td>
                {categoryLabel(r.category)} · {relationLabel(r.relation)}
              </td>
              <td className="wrap-anywhere">
                {r.intentId
                  ? (data.projects.find((p) => p.id === r.intentId)?.name ??
                    "已不存在的项目")
                  : "所有目标"}
              </td>
              <td className="rule-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`删除规则 ${r.pattern}`}
                  title="删除规则"
                  disabled={isPending(`rule:${r.id}`)}
                  onClick={() => setConfirm(r)}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {confirm && (
        <Confirm
          title="删除这条规则？"
          body={
            <>
              <p className="wrap-anywhere">
                {ruleFieldLabel(confirm.field)}包含「{confirm.pattern}」→{" "}
                {categoryLabel(confirm.category)} ·{" "}
                {relationLabel(confirm.relation)}
              </p>
              <p className="secondary-text">
                删除后活动会按其余规则和关键词重新解释，原始记录不受影响。删除无法撤销，可再次手动添加。
              </p>
            </>
          }
          confirmLabel="删除规则"
          danger
          pending={isPending(`rule:${confirm.id}`)}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const r = await mutate(
              `rule:${confirm.id}`,
              () => api.deleteRule(confirm.id),
              { success: "规则已删除" },
            );
            if (r.status !== "busy") setConfirm(null);
          }}
        />
      )}
    </>
  );
}
