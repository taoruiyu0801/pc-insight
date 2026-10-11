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

## 2026-10-08 · 前端重构（工作观察手札）验证

以下均为本轮在 Windows 11 本机实际执行的结果，基于 HEAD `98479d6` 加未提交的重构改动。

- `npm run check`：通过。
- `npm test`：4 个文件、48 个测试通过（原 5 个 + 新增 43 个：范围绑定与乱序响应、日期切换中的导出、慢于轮询间隔的请求、写入成功刷新失败、七日失效、跨午夜深度工作与分心、重叠后台任务、采集状态、未知值降级、America/New_York 时区下的 DST/跨年/闰日、设置草稿、时间谱布局）。
- `npm run build`：通过；生产包中不含开发夹具与故障注入代码。
- `cargo fmt --all -- --check`：通过；`cargo test --workspace`：15 个测试通过。
- `npm run desktop:build`：通过，生成 `target/release/pc-insight-desktop.exe`。
- `pc-insight-desktop.exe --verify-startup`（隔离数据库）：`embeddedWebviewIpcReady: true`，`recordingStarted: false`。
- `scripts/visual-check.mjs`（无头 Edge，合成数据，冻结时钟）：六个页面、详情抽屉、项目/规则/任务表单、确认对话框、悬浮窗四种状态、扩展弹窗、首次使用、读取失败、写入后刷新失败、日期切换中导出、1000×700 / 125% / 150% / 200% 均完成，无页面脚本错误；对话框焦点循环、Esc 与焦点归还、双击只创建一个任务、重复结束任务被阻止、离开设置页提示、导出文件不含窗口标题均通过；320×200 悬浮窗无滚动溢出；各尺寸无页面级横向滚动。
- 合成压力：5,000 条活动时时间谱绘制 500 个片段节点（合并前 12,452 个），切换到时间线约 0.2 秒（不含脚本固定等待），缩放约 0.1–0.2 秒；活动表分页 100 行。

本轮未验证：原生窗口的真实鼠标拖动与托盘交互、Windows 125%/150% 系统缩放下的原生窗口（仅以浏览器设备像素比模拟）、Tauri 隐藏窗口时是否触发 `visibilitychange`、浏览器扩展在真实 Chrome/Edge 中的安装联调（弹窗仅在存根 `chrome.storage` 下检查）、读屏软件实测。

### 悬浮窗空白问题（同日修复）

- 现象：原生悬浮窗只显示一个无法操作的白色窗框。UI Automation 显示其 `WRY_WEBVIEW` 下没有任何 WebView2 内容，而主窗口正常。
- 原因：`toggle_widget` 是同步 Tauri 命令（托盘菜单也在事件回调中直接调用它），在 Windows 主线程上创建 WebView2 窗口导致 WebView 未初始化（tauri-apps/wry#583）。该代码自首个提交起未变，并非前端重构引入。
- 修复：`toggle_widget` 改为 async 命令；托盘菜单改为 `tauri::async_runtime::spawn` 调用；悬浮窗背景色设为米白，避免加载前的白闪。命令名、参数与行为不变。
- 原生验证（release 构建，经 UI Automation 操作）：悬浮窗正常渲染；在悬浮窗点击“开始 / 暂停”后主窗口状态同步；侧栏按钮隐藏 / 再显示正常；主窗口关闭到托盘后，悬浮窗“主界面”可重新打开主窗口。`cargo fmt --check` 与 `cargo test --workspace`（15 个）通过。托盘菜单中的“显示 / 隐藏悬浮窗”走同一函数，但未单独点击验证。

### 应用图标（同日）

- 新图标源文件 `apps/desktop/app-icon.svg`（墨色圆角方块、五条轨道线、陶土色主注意力线）；用 `node scripts/desktop.mjs icon app-icon.svg` 重新生成 `src-tauri/icons` 全套（ico 含 16/24/32/48/64/256）。浏览器 favicon `apps/desktop/icon.svg` 使用同一图形。
- 托盘图标不再在代码里手绘色块，改为使用打包的应用图标（`default_window_icon`），与窗口 / 任务栏一致。
- 注意：图标在编译时嵌入，替换图标后需 `cargo clean --release -p pc-insight-desktop` 再构建，否则增量构建会保留旧图标。
- 实机核对：exe 关联图标、主窗口标题栏、任务栏均显示新图标；托盘图标位于系统托盘溢出区，未目视确认（代码与窗口图标同源）。

### 2026-10-08 · 三项前端状态恢复修复

- 设置保存期间仍可编辑；提交内容与当前草稿分开维护。保存回显、刷新失败和改回提交前的值均不会覆盖后续输入；成功后剩余修改继续触发未保存提示及离开提醒。
- 今日概览、时间线和工作分析切换历史日期失败时，明确显示失败日期、缓存所属日期和重试入口；重试进行中禁用按钮，成功后移除提示。
- 日报及周报在缓存读取失败或写入失效后保留预览、标注缓存并暂停导出；全部日期恢复有效后才开放。普通轮询期间有效报告仍可导出。
- 新增回归测试先在修复前运行：历史错误提示、日/周报告缓存错误及部分日期失效共 4 项按预期失败；正常轮询测试通过。修复后 `npm test` 为 5 个文件、60 个测试全部通过，`npm run check` 和 `npm run build` 通过。
- 新增 `scripts/recovery-check.mjs`：无头 Edge、合成数据、冻结时钟，通过控制读写 Promise 的完成顺序验证 11 个场景，全部断言通过且无页面脚本错误；包含重复提交、写入失败、刷新失败仅重读、保存期间继续输入及改回原值、历史日期重试、日/周报告恢复及七日部分刷新。结果与截图见 `artifacts/frontend-recovery-fixed/`。
- 现有浏览器脚本的 `main,faults` 场景完成：表单、抽屉、焦点循环、后台任务、设置离开提醒、报告导出脱敏和日期切换中的导出检查结果符合预期，日志未记录页面脚本错误。结果见 `artifacts/frontend-recovery-regression/`。
- 本轮只修改前端及测试、说明文件；未修改 Rust、数据库或统计算法，未重新打包桌面 EXE，未重测原生托盘与真实采集。

### 2026-10-08 · 更新本地桌面可执行文件

- 重新运行 `npm run desktop:build`（使用项目便携工具链）成功，将包含三项状态恢复修复的程序覆盖到 `release/PCInsight.exe`；根目录 `启动PCInsight.cmd` 无需修改。
- 替换前以 `--verify-startup` 和独立工作目录验证新 EXE：退出码 0，`embeddedWebviewIpcReady: true`、`isolatedDatabase: true`、`recordingStarted: false`。未使用真实活动数据库。
- 替换后 SHA-256 与构建产物一致：`4DB824F9C77BAF3256235BC3ECD3AB957D070176B0540AC26E7A690E119151C6`。替换清单及启动结果保存在 `artifacts/desktop-release-20261008-191314/`。
- 旧 EXE 保存在 `backups/desktop-recovery-20261008-191314/PCInsight.exe`。

### 2026-10-08 · 目标、会话及范围纠正交付

- 已实现独立目标记忆、统一开始/暂停入口、无目标确认、明确目标切换边界、≤300 秒会话延续和按本地日界分段。重启恢复目标但保持暂停；旧版首次升级没有已保存目标时需要选择一次。
- 首页保持全天累计优先，下方加入会话构成；时间线支持选择会话。活动表按连续同语义片段合并展示、忽略主窗口面积抖动并显示秒级起止；原始成员可展开。
- 新增辅助学习建议、选区纠正预览、原子批次写入、即时撤销和持久纠正历史，以及最近七日关键词匹配测试。人工确认前不将通用工具计入相关时间。通知会进入当前顶层弹窗/抽屉，使“重新读取”和“撤销”仍可操作。
- `npm test`：6 个文件、69 个测试通过；包含原 60 个测试和新增 9 个工作流测试。TypeScript 与生产构建通过。
- `cargo test --workspace`：27 个测试通过。新增覆盖目标重启恢复、每次无目标开始确认、清空目标保护、五分钟边界、无采样的目标切换、午夜分段、范围纠正、重叠选区去重、旧纠正兼容、幂等提交、过期预览、跨重启撤销和匿名时长守恒。
- `scripts/workflow-check.mjs` 的 4 个浏览器工作流和 `scripts/recovery-check.mjs` 的 11 个既有状态恢复场景全部断言通过。新工作流覆盖确认开始、清空目标保护、建议批量确认、历史撤销、合并片段范围、关键词预览、写入成功刷新失败及只重读。结果见 `artifacts/recording-workflow-final/`、`artifacts/recording-workflow-existing-recovery-final/`。
- 原视觉脚本 `main,faults,sizes,stress,widget` 完成，模态焦点回归另行完成；合成 5,000 条活动仍为 500 个时间谱节点、100 行分页，所测尺寸无页面横向溢出。日志未记录页面脚本错误。结果见 `artifacts/recording-workflow-visual/`、`artifacts/recording-workflow-modal-regression/`。
- 在独立数据库副本上执行迁移 002，原始事件、活动、旧纠正、项目、设置、规则、后台任务、外部键八张表的内容哈希全部不变。Rust 新派生链复核指定学习片段：activeMs=2243314、focusMs=1882661、interruptionMs=68139、unknownMs=292514，与已确认结果一致。仅副本执行该验证，详见 `artifacts/recording-workflow-native/`。
- Windows release 构建及隔离 `--verify-startup` 成功（退出 0、IPC ready、默认未开始记录），已覆盖 `release/PCInsight.exe`，SHA-256 为 `83BAE7F20F5AB8E7427796D9539E0276D2373D59C276BD6C63CA7A66383F75AF`。旧 EXE 和在线一致性数据库备份位于 `backups/recording-workflow-20261008-205232/`；替换清单见 `artifacts/recording-workflow-release.json`。
- 原生托盘菜单和悬浮窗的真实鼠标点击未在本轮单独重测；共用 Runtime 控制逻辑已通过 Rust 测试。未修改 AFK 检测口径，未向浏览器安装扩展，未接入云端模型。
