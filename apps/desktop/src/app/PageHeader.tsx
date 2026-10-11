import type { ReactNode } from "react";
import type { RangeResult } from "../data/context";
import { localDate, shortDate } from "../lib/dates";
import { ErrorBlock } from "../components/ui/exports";
import { ago } from "../lib/format";
import { now } from "../lib/clock";

export function PageHeader({
  kicker,
  title,
  tools,
  children,
}: {
  kicker: string;
  title: ReactNode;
  tools?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        <div className="kicker">{kicker}</div>
        <h1 className="page-title">{title}</h1>
        {children}
      </div>
      {tools && <div className="page-head-tools">{tools}</div>}
    </header>
  );
}

export function dateOfKey(key: string | null): string | null {
  if (!key) return null;
  return localDate(new Date(Number(key.split(":")[0])));
}

/**
 * Explains the freshness of a day's data: switching (old range still on screen),
 * refresh failure (showing data from a given time), or first-load failure.
 */
export function RangeNotice({
  view,
  date,
  what = "记录",
}: {
  view: RangeResult;
  date: string;
  what?: string;
}) {
  if (view.error && view.data) {
    const shown = dateOfKey(view.shownKey);
    return (
      <p className="range-notice warn" role="status">
        {view.transitional
          ? `${shortDate(date)} 的${what}读取失败：${view.error}。下方仍是 ${shown ? shortDate(shown) : "上一个日期"} 的内容，已淡化显示。`
          : `刷新失败：${view.error}。显示的是 ${view.updatedAt != null ? ago(now() - view.updatedAt) : "之前"} 读取的数据。`}
        <button
          type="button"
          className="link-button"
          disabled={view.loading}
          onClick={view.retry}
        >
          {view.loading ? "正在重试…" : "重试"}
        </button>
      </p>
    );
  }
  if (view.transitional) {
    const shown = dateOfKey(view.shownKey);
    return (
      <p className="range-notice" role="status">
        正在读取 {shortDate(date)} 的{what}… 下方暂时仍是{" "}
        {shown ? shortDate(shown) : "上一个日期"} 的内容，已淡化显示。
      </p>
    );
  }
  if (view.error && !view.loading)
    return (
      <ErrorBlock
        title={`无法读取 ${shortDate(date)} 的${what}`}
        message={view.error}
        onRetry={view.retry}
      />
    );
  return null;
}
