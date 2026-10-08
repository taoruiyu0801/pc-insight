const token = document.querySelector("#token"),
  enabled = document.querySelector("#enabled"),
  status = document.querySelector("#status");
chrome.storage.local.get(["token", "enabled"]).then((data) => {
  token.value = data.token ?? "";
  enabled.checked = data.enabled !== false;
});
chrome.storage.session.get("status").then((data) => {
  status.textContent = data.status ?? "等待连接";
});
document.querySelector("#pair").addEventListener("submit", async (event) => {
  event.preventDefault();
  await chrome.storage.local.set({
    token: token.value.trim(),
    enabled: enabled.checked,
  });
  status.textContent = "已保存，正在连接…";
});
enabled.addEventListener("change", () =>
  chrome.storage.local.set({ enabled: enabled.checked }),
);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.status)
    status.textContent = changes.status.newValue;
});
