# PC Insight

一个 Windows 优先、本地保存的个人工作记录工具。从 `time_tool.md` 的规划实现：目标、主注意力、辅助上下文、后台任务、工作状态，分别展示在同一条时间线上。

## 直接使用

双击根目录的 **`启动PCInsight.cmd`**，或打开 **`release/PCInsight.exe`**。

1. 在「我的项目」创建项目，填写标题 / 域名识别关键词。
2. 回到「今日概览」，选择当前目标，点击「开始记录」。首次启动和重新启动时均为暂停状态。
3. 可用「休息一下」或「暂停记录」控制记录；点击时间线或活动明细可修正分类和当时的目标。
4. Codex、Python 等任务可在「后台也在向前」显式开始，完成后标记完成或失败。
5. 「回顾报告」可导出日 / 最近七日的 Markdown 报告。

关闭主窗口会隐藏到系统托盘；从托盘菜单可以退出。重复打开程序会显示已有窗口。悬浮窗可以拖动，默认不抢焦点。开机启动需在设置中主动开启。

## ActivityWatch：已接入，而且验证过真实数据

默认采集模式是 **优先 ActivityWatch**：

- 自动读取本机 `127.0.0.1:5600` 的 `currentwindow` 和同一电脑的 `afkstatus` 数据。
- Windows 采集器负责辅助窗口；ActivityWatch 不可用时自动兜底前台采集。
- 也可以选择「仅 ActivityWatch」或「仅 Windows 原生」。当前来源和连接状态显示在偏好设置。
- 支持按所选日期导入已有记录。区间重叠会去重，重复导入不会重复计时。
- 历史导入不会把今天的目标套到过去；可在活动详情补上当时目标。

本次下载并校验了官方 ActivityWatch v0.14.0 便携版，放在 `.tools/activitywatch/activitywatch`。可双击根目录 **`启动ActivityWatch.cmd`**。此启动入口会启动 ActivityWatch 自己的采集器；它的数据和配置由 ActivityWatch 管理。

**两个软件的控制范围独立**：PC Insight 的暂停、标题关闭和排除设置仅作用于 PC Insight；不会停止或删除 ActivityWatch 自己的记录。ActivityWatch 的离开阈值由它的 AFK watcher 配置决定。

## Chrome / Edge 域名

1. 打开浏览器扩展管理页，启用开发者模式。
2. 选择「加载已解压的扩展程序」，选择 `apps/browser-extension`。
3. 在 PC Insight → 偏好设置 → 浏览器连接复制配对码。
4. 打开扩展弹窗，粘贴配对码并保存，然后在 PC Insight 开始记录。

扩展只发送当前、获焦窗口中的活动标签；不读取页面正文。发送前就移除 URL 路径、参数、片段、凭据，隐私窗口不采集。桌面端还会验证前台浏览器与标题，避免把后台标签算成注意力。安装扩展需要由用户在浏览器中完成。

## 数据位置

真实数据存放在 Windows 用户应用数据目录 `local.pc-insight.desktop/activity.db`，可在偏好设置看到完整路径。SQLite 原始事件不可更新；分类规则、人工纠正独立保存。原始事件默认保留 60 天，已聚合活动继续保存。没有云同步、埋点或模型请求。

网页预览只提供**明确标记的演示数据**，保存在当前页面内，关闭即丢弃；不能在浏览器中采集 Windows。桌面真实库不预填示例项目或活动。

## 开发与检查

需要 Node.js、Rust MSVC、Microsoft C++ Build Tools、Windows SDK、WebView2。本机缺失的编译组件已经放入项目 `.tools/msvc`，不修改系统安装或全局 PATH。

```powershell
npm ci
npm run dev                         # 浏览器预览，http://127.0.0.1:1420
npm run build                       # 类型检查 + 前端构建
npm test                            # 前端 / 扩展纯函数测试

# 以下脚本会优先使用项目中的便携编译工具
.\scripts\with-toolchain.ps1 -CommandArgs @('cargo','test','--workspace')
.\scripts\with-toolchain.ps1 -CommandArgs @('npm','run','desktop')
.\scripts\with-toolchain.ps1 -CommandArgs @('npm','run','desktop:build')
```

最后一个命令在 `target/release/pc-insight-desktop.exe` 生成可执行程序。正式使用时可复制到 `release/PCInsight.exe`。

## 本轮边界

这是按 V0.1 → V0.4 顺序形成的**可运行首版**，不是把远期规划标记为全部完成：

- 后台任务先使用可靠的显式起止标记；尚未接入 Codex / Claude 的自动任务事件。
- 可见面积是窗口矩形及遮挡估算；透明窗口、特殊桌面效果和多屏空隙可能造成误差，不代表眼动注意力。
- 原生采样有 1–5 秒精度；暂停、换目标等边界宁可少计一个采样，也不跨界误计。原生 AFK 从超过阈值后的采样起生效；ActivityWatch 遵循其原有 AFK 数据。
- 深度工作按查询日期范围内的连续相关时段计算；跨日的长专注会按各日分别判断 25 分钟门槛。
- 最近七日基础趋势和报告已实现；高级恢复时间、最佳工作时段、月报和自动报告归档留待有足够真实数据后迭代。
- 浏览器扩展已进行隐私处理与桥接代码检查，仍需在实际 Chrome / Edge 安装后完成浏览器端联调。
- V0.5 的 LLM 解释按原文「最后才做」保留，不调用云端模型，不伪造 AI 洞察。

详细实现与验证记录见 [实施进度](docs/IMPLEMENTATION.md) 和 [验证记录](docs/VALIDATION.md)。

## 设计依据与官方接口

- [原始方案](time_tool.md) · [产品规范](PRODUCT_SPEC.md) · [架构](ARCHITECTURE.md) · [数据模型](DATA_MODEL.md)
- [ActivityWatch REST API](https://docs.activitywatch.net/en/latest/api/rest.html)
- [ActivityWatch 官方 v0.14.0 发布](https://github.com/ActivityWatch/activitywatch/releases/tag/v0.14.0)
- [Tauri Windows 环境要求](https://v2.tauri.app/start/prerequisites/)
- [Tauri IPC](https://v2.tauri.app/develop/calling-rust/)
- [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)
