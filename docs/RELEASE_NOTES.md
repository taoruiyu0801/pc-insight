# PC Insight 0.4.0 · 首个可运行预览版

Windows 本地工作记录：以当前目标为参照，分别展示主注意力、辅助窗口、后台任务和工作状态。

- 默认优先 ActivityWatch，原生采集自动兜底；支持 AFK、SQLite、历史导入去重。
- 六个页面、项目与规则、Session、分级打断、历史分类与目标纠正。
- 可见窗口上下文、明确起止的后台任务、去重后的并行时间。
- 日/七日报告、Markdown 导出、托盘、悬浮窗和可选自启动。
- Chrome / Edge 域名扩展，配对到本机，发送前去掉 URL 路径和参数。

验证：15 个 Rust 测试、5 个前端/扩展测试；真实 Windows 采集、真实 ActivityWatch 本机接口、打包 EXE 的 WebView2 加载及 Tauri IPC 均通过。验证详情见仓库 `docs/VALIDATION.md`。

下载 `PCInsight-0.4.0-windows-x64.zip`，解压后打开 `PCInsight.exe`。压缩包不包含任何个人活动数据库或配对信息。首次运行默认暂停，创建目标后点击开始记录。

这是预览版。浏览器扩展实际安装联调、多日稳定性、Codex/Claude 后台任务自动识别、高级行为分析和 LLM 解释仍是后续工作。后台任务目前需要显式开始和结束。
