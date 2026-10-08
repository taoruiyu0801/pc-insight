# 验证记录

验证日期：2026-10-08；环境：Windows x64、Node 24、Rust 1.92 MSVC、WebView2。所有真实源验证均只在本机进行。

## 已通过

### 自动测试

- 15 个 Rust 测试：区间并集/交集、Native/ActivityWatch 重叠去重、250 个重叠区间的不变量、辅助轨与多后台任务不重复累加、未知活动打断深度工作、教育视频按目标判断、无目标保留未知、持续无关片段跨应用合并、跨午夜分心判定、SQLite 原始事件不可变、导入幂等、清理原始事件后的幂等、隐私 URL、AFK 切片、窗口排除、浏览器 Origin 和睡眠缺口等覆盖在各测试中。
- 5 个前端/扩展测试：日期跨月跨年、演示统计不重复累加、报告标记和脱敏、发送前移除 URL 敏感部分、拒绝非活动/无焦点/隐私/本地文件标签。
- TypeScript 检查、前端生产构建、Rust 工作区构建、Windows release 构建。
- npm 依赖审计：0 已知漏洞（本次锁文件）。

### 实际 Windows 采集与数据库

运行原生 `--smoke-test`：读取 Windows 窗口信息但不落真实标题，在内存数据库写入合成的 2 秒活动，再走 Session 和 Analytics；预期电脑活动 2000 ms、1 个 Session，测试通过。

### 真实 ActivityWatch

从官方 GitHub 发布下载 `activitywatch-v0.14.0-windows-x86_64.zip`，校验 SHA-256：

`df18da6ab97a12d02d1869bc28f4a44adcd9e85ae7209bfbc62e5293cd8faf07`

使用独立 profile 与项目内数据库启动真实 `aw-server-rust`、`aw-watcher-window --exclude-title`、`aw-watcher-afk`。经 localhost HTTP 读取 1 个窗口事件、2 个 AFK 事件，转换为 2 段活动后入内存 SQLite；第二次导入未新增计时。此次观测窗口活动 5753 ms、AFK 106871 ms。验证后关闭本轮启动的三个父进程；进程树和端口状态在交付前再次检查。

结果保存在 `artifacts/activitywatch-smoke.json`（最初生成在 `native-smoke.json`）。未把真实窗口标题或网页内容写入验证报告。

### 嵌入式桌面界面

release EXE 以 `--verify-startup` 启动，使用隔离数据库。React 从 EXE 嵌入资源加载并成功调用 Tauri `snapshot`，程序自动退出 0；结果 `embeddedWebviewIpcReady: true`，见 `artifacts/startup-smoke.json`。

### 浏览器交互验收

在明确标记的演示页面验证：

- 创建项目并保存、设为当前目标。
- 开始记录、切换休息、暂停记录。
- 打开活动详情、将 4 分钟示例分心纠正为相关，报告专注从 4h08m 更新为 4h12m。
- Markdown 下载成功，文件内容含「演示数据」，不含逐条窗口标题。
- 开始并结束后台任务，状态从「运行中」变为「已完成」。
- 打开七日分析、设置，添加仅适用于 Cisco 的标题规则。
- 检查窄窗口布局，无页面级横向溢出；最终重新载入干净示例状态。

## 未声称完成的验证

- 未替用户向 Chrome / Edge 安装扩展，浏览器扩展实际安装联调待完成。
- 未启用系统自启动；尚未验证注销/登录后的启动行为。
- 未进行持续数日的真实工作记录、真实锁屏/休眠周期和多显示器压力测试。
- 后台任务为显式记录，没有对 Codex 的自动执行状态作验证或推断。
- 原生界面已验证嵌入加载和 IPC；视觉/点击验收使用同一 React 界面的浏览器演示。
