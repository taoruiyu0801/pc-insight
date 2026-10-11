import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { native } from "./api";
import { AppShell } from "./app/AppShell";
import { FiveLaneMark } from "./components/ui/exports";
import { DataProvider } from "./data/context";
import { getFetcher } from "./data/fetcher";
import { SnapshotStore } from "./data/snapshot-store";
import { WidgetApp } from "./features/widget/WidgetApp";

/** Entry: welcome page (browser only), the 320×200 widget, or the main window. */
export default function App() {
  const params = new URLSearchParams(location.search);
  const widget = params.get("widget") === "1";
  const [ready, setReady] = useState(native || params.get("demo") === "1");
  const store = useMemo(() => new SnapshotStore(getFetcher()), []);

  if (!ready) return <Welcome onStart={() => setReady(true)} />;
  return (
    <DataProvider store={store}>
      {widget ? <WidgetApp /> : <AppShell />}
    </DataProvider>
  );
}

function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <main className="welcome">
      <div className="welcome-inner">
        <FiveLaneMark size={44} />
        <p className="kicker">PC Insight · 本机工作记录</p>
        <h1 className="welcome-title">把一天放回五条轨道上看。</h1>
        <p className="welcome-lede">
          当前目标、主注意力、辅助上下文、后台任务、工作状态——同一时间尺度，人的时间与机器时间分开计算。
        </p>
        <ul className="welcome-lanes" aria-label="五条轨道">
          <li>
            <b>当前目标</b>此刻想完成什么
          </li>
          <li>
            <b>主注意力</b>你主要操作的窗口，人的时间只来自这里
          </li>
          <li>
            <b>辅助上下文</b>可见的课件与笔记，不另计时
          </li>
          <li>
            <b>后台任务</b>显式开始与结束，并行但不相加
          </li>
          <li>
            <b>工作状态</b>专注、打断、分心、待确认、离开
          </li>
        </ul>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={() => {
            history.replaceState(null, "", "?demo=1");
            onStart();
          }}
        >
          打开浏览器演示空间 <ArrowRight size={16} aria-hidden />
        </button>
        <p className="welcome-note">
          浏览器演示从空白开始，不采集真实窗口，刷新即清空。真实记录请使用
          Windows 桌面版。
        </p>
      </div>
    </main>
  );
}
