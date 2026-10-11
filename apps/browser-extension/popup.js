const token = document.querySelector("#token"),
  enabled = document.querySelector("#enabled"),
  status = document.querySelector("#status"),
  save = document.querySelector("#pair button");

// Status strings come from background.js; the tone only changes the colour bar.
function show(text, tone) {
  status.textContent = text;
  status.dataset.tone =
    tone ??
    (text.startsWith("已连接")
      ? "ok"
      : /无效|拒绝|失败|无法/.test(text)
        ? "error"
        : "wait");
}

chrome.storage.local
  .get(["token", "enabled"])
  .then((data) => {
    token.value = data.token ?? "";
    enabled.checked = data.enabled !== false;
  })
  .catch((e) => show(`无法读取扩展设置：${e?.message ?? e}`, "error"));
chrome.storage.session
  .get("status")
  .then((data) => show(data.status ?? "等待连接"))
  .catch(() => show("等待连接"));

document.querySelector("#pair").addEventListener("submit", async (event) => {
  event.preventDefault();
  save.disabled = true;
  try {
    await chrome.storage.local.set({
      token: token.value.trim(),
      enabled: enabled.checked,
    });
    show("已保存，正在连接…", "wait");
  } catch (e) {
    show(`保存失败：${e?.message ?? e}`, "error");
  } finally {
    save.disabled = false;
  }
});
enabled.addEventListener("change", () =>
  chrome.storage.local
    .set({ enabled: enabled.checked })
    .then(() =>
      show(
        enabled.checked
          ? "已开启发送"
          : "已暂停发送；桌面版不会收到新的标签信息",
        "wait",
      ),
    )
    .catch((e) => show(`无法更新开关：${e?.message ?? e}`, "error")),
);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.status) show(changes.status.newValue);
});
