import { useEffect, useRef, useState } from "react";
import type {
  CorrectionBatch,
  CorrectionPreview,
  CorrectionRequest,
  CorrectionTotals,
} from "../../../../../packages/types";
import { api } from "../../api";
import { useMutate, useNotices, usePending } from "../../data/context";
import {
  Button,
  Dialog,
  Drawer,
  ErrorBlock,
  LoadingBlock,
} from "../../components/ui/exports";
import { duration, timeWithSeconds } from "../../lib/format";
import { localDate } from "../../lib/dates";

function totalsText(t: CorrectionTotals) {
  return `相关 ${duration(t.focusMs, true)} · 打断 ${duration(t.interruptionMs, true)} · 分心 ${duration(t.distractedMs, true)} · 待确认 ${duration(t.unknownMs, true)}`;
}

export function CorrectionReview({
  request,
  label,
  onClose,
  onSaved,
}: {
  request: CorrectionRequest;
  label: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [preview, setPreview] = useState<CorrectionPreview | null>(null),
    [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0),
    [reading, setReading] = useState(true);
  const batchId = useRef(crypto.randomUUID());
  const key = JSON.stringify(request);
  const [previewKey, setPreviewKey] = useState("");
  const mutate = useMutate(),
    busy = usePending(`correction:${batchId.current}`),
    { notices } = useNotices();
  useEffect(() => {
    let active = true;
    setReading(true);
    setPreview(null);
    setError("");
    void api
      .previewCorrections(JSON.parse(key))
      .then(
        (value) => {
          if (active) {
            setPreview(value);
            setPreviewKey(key);
          }
        },
        (e) => {
          if (active) setError(String(e));
        },
      )
      .finally(() => {
        if (active) setReading(false);
      });
    return () => {
      active = false;
    };
  }, [key, attempt]);
  const commit = async () => {
    if (!preview || previewKey !== key) return;
    const result = await mutate(
      `correction:${batchId.current}`,
      () =>
        api.commitCorrections(
          batchId.current,
          { ...request, ranges: preview.ranges },
          preview.token,
          label,
        ),
      { inlineError: true },
    );
    if (result.status === "failed") {
      setError(result.error);
      return;
    }
    if (result.status === "busy") return;
    const id = result.value.id;
    notices.push("success", "纠正已保存", {
      label: "撤销",
      run: () =>
        mutate(`undo:${id}`, () => api.undoCorrection(id), {
          success: "已撤销本次纠正",
        }),
    });
    onSaved();
  };
  const ranges = preview?.ranges ?? [];
  const start = Math.min(...ranges.map((r) => r.start)),
    end = Math.max(...ranges.map((r) => r.end));
  return (
    <Dialog
      title="预览纠正"
      onRequestClose={() => !busy && onClose()}
      width={620}
      footer={
        <>
          <Button disabled={busy} onClick={onClose}>
            返回修改
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={reading || !preview || previewKey !== key || !!error}
            onClick={() => void commit()}
          >
            确认保存纠正
          </Button>
        </>
      }
    >
      {reading && <LoadingBlock label="正在核对所选记录…" />}
      {preview && (
        <>
          <p>
            {label} · 覆盖 {new Set(ranges.map((r) => r.activityId)).size}{" "}
            条记录 / {ranges.length} 个区间
          </p>
          <p className="tabular">
            {localDate(new Date(start))} {timeWithSeconds(start)} —{" "}
            {localDate(new Date(end))} {timeWithSeconds(end)}
          </p>
          <p>
            实际选中时长：{duration(preview.before.activeMs, true)}
            （只修改选中区间，不填补中间空白）
          </p>
          <dl className="facts">
            <dt>修改前</dt>
            <dd>{totalsText(preview.before)}</dd>
            <dt>修改后</dt>
            <dd>{totalsText(preview.after)}</dd>
          </dl>
          {preview.overwrittenManualCount > 0 && (
            <p className="range-notice warn">
              其中 {preview.overwrittenManualCount}{" "}
              段已有人工判断，本次修改将在选区内覆盖它们；可从纠正历史撤销。
            </p>
          )}
        </>
      )}
      {error && (
        <ErrorBlock
          title="请重新检查预览"
          message={error}
          onRetry={() => {
            batchId.current = crypto.randomUUID();
            setAttempt((n) => n + 1);
          }}
        />
      )}
    </Dialog>
  );
}

export function CorrectionHistory({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<CorrectionBatch[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [more, setMore] = useState(false);
  const mutate = useMutate(),
    [undoing, setUndoing] = useState<string | null>(null);
  const generation = useRef(0);
  const load = async (offset = 0) => {
    const mine = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const page = await api.correctionHistory(offset);
      if (mine === generation.current) {
        setItems((old) => (offset ? [...old, ...page] : page));
        setMore(page.length === 25);
      }
    } catch (e) {
      if (mine === generation.current) setError(String(e));
    } finally {
      if (mine === generation.current) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, []);
  return (
    <Drawer title="纠正历史" onRequestClose={onClose}>
      <p className="secondary-text">
        撤销只停用这一批判断，之后做过的修改仍然有效。旧版逐条纠正保留为历史基础，不会被迁移覆盖。
      </p>
      {error && (
        <ErrorBlock
          title="读取失败"
          message={error}
          onRetry={() => void load()}
        />
      )}
      {!items.length && !loading && !error && <p>还没有新版纠正批次。</p>}
      {items.map((b) => (
        <section className="detail-section" key={b.id}>
          <h3>{b.label || "人工纠正"}</h3>
          <p>
            {localDate(new Date(b.createdAt))} {timeWithSeconds(b.createdAt)} ·{" "}
            {b.request.ranges.length} 个区间 ·{" "}
            {duration(b.preview.before.activeMs, true)}
          </p>
          <p className="secondary-text">
            {totalsText(b.preview.before)} → {totalsText(b.preview.after)}
          </p>
          <Button
            disabled={b.undoneAt != null || !!undoing}
            loading={undoing === b.id}
            onClick={() => {
              setUndoing(b.id);
              void mutate(`undo:${b.id}`, () => api.undoCorrection(b.id), {
                success: "已撤销该批次",
              })
                .then((r) => {
                  if (
                    r.status === "saved" ||
                    r.status === "saved-refresh-failed"
                  )
                    void load();
                })
                .finally(() => setUndoing(null));
            }}
          >
            {b.undoneAt != null ? "已撤销" : "撤销这次纠正"}
          </Button>
        </section>
      ))}
      {loading && <LoadingBlock label="正在读取纠正历史…" />}
      {more && (
        <Button disabled={loading} onClick={() => void load(items.length)}>
          加载更早记录
        </Button>
      )}
    </Drawer>
  );
}
