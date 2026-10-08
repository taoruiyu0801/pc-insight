import { contextFor } from "./context.js";
let sending = false;
async function publish() {
  if (sending) return;
  sending = true;
  try {
    const { token, enabled = true } = await chrome.storage.local.get([
      "token",
      "enabled",
    ]);
    if (!token || !enabled) return;
    const window = await chrome.windows.getLastFocused();
    const tabs = await chrome.tabs.query({ active: true, windowId: window.id });
    const browser = navigator.userAgent.includes("Edg/")
      ? "msedge.exe"
      : "chrome.exe";
    const payload = contextFor(tabs[0], window.focused, browser);
    const response = await fetch("http://127.0.0.1:47831/browser", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
    await chrome.storage.session.set({
      status: response.ok
        ? "已连接本机 PC Insight"
        : response.status === 401
          ? "配对码无效，请重新粘贴"
          : "连接被拒绝",
      lastSent: Date.now(),
    });
  } catch {
    await chrome.storage.session
      .set({ status: "等待 PC Insight 桌面版启动" })
      .catch(() => {});
  } finally {
    sending = false;
  }
}
chrome.tabs.onActivated.addListener(publish);
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (
    tab.active &&
    (change.url || change.title || change.status === "complete")
  )
    void publish();
});
chrome.windows.onFocusChanged.addListener(publish);
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") void publish();
});
chrome.runtime.onInstalled.addListener(() =>
  chrome.alarms.create("context", { periodInMinutes: 0.5 }),
);
chrome.runtime.onStartup.addListener(() =>
  chrome.alarms.create("context", { periodInMinutes: 0.5 }),
);
chrome.alarms.onAlarm.addListener(publish);
void publish();
