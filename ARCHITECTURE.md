# 架构

`Windows Collector / Browser Extension / ActivityWatch → RawEvent → Context → Activity → Session → Analytics → Tauri IPC → React`

## 目录及职责

- `apps/desktop`：React / TypeScript / Vite 页面，Tauri 2 主程序、托盘、悬浮窗、采集调度、本机浏览器桥接。
- `apps/browser-extension`：Chrome / Edge Manifest V3 扩展；仅发当前活动标签的域名和标题至配对后的本机端口。
- `crates/domain`：共享领域模型；UTC 毫秒时间戳。
- `crates/collector`：Windows 前台、最后输入时间、可见窗口采样。
- `crates/context`：主注意力去重、并行上下文与时间区间运算。
- `crates/classifier`：规则、项目关键词、保守分类、纠正。
- `crates/session`：活动合并、打断分级、Session 构建。
- `crates/analytics`：只基于衍生 Activity / Session 与明确 BackgroundJob 计算指标。
- `crates/database`：SQLite WAL、迁移、参数化查询、保留策略。
- `crates/activitywatch`：外部事件转换；仅使用本机 HTTP API。
- `packages/types`：IPC TypeScript 契约。
- `migrations`：带版本的 SQLite 建表脚本。
- `tests`：统计不变量和端到端验收。

## 数据流与边界

每 2 秒采样一次。下一次采样到达时，以前一次快照归属刚结束的区间；超过 10 秒的采样缺口只记最多一个采样周期，不把睡眠算为专注。采集暂停、休息、目标变更或隐私配置变更使采样边界失效，防止跨边界归属错误。后台任务单独计时。

原始事件和聚合活动在同一事务保存；读操作使用活动层。活动在展示时应用最新规则和纠正，因此可以重新解释历史而不篡改采集事实。Raw 清理后聚合 Activity 继续可读。不同来源的前台事件以区间切分消除重复；Native 优先于 ActivityWatch。离开片段保留但不算电脑活动。

本地 HTTP 只监听 `127.0.0.1:47831`，仅接收浏览器快照；使用随机配对 token，限制请求大小，拒绝普通网页 Origin。它不提供读取历史数据的接口。Tauri IPC 负责 UI 操作；前端浏览器预览只能进入带标签的隔离演示。

## 当前决策

- ActivityWatch 为实时优先源，每 4 秒读取窗口和 AFK；不可用时最小 Windows Collector 自动兜底。设置也允许固定为任一来源。
- 不把 Codex 桌面进程存在误判为任务正在执行。第一版后台任务用手动开始/完成/失败作为可靠信号，保留适配器扩展点。
- 可见窗口通过 Z 顺序矩形遮挡估算暴露面积，不等同于眼动注意力；仅作为上下文，永不计入主动投入。
- 不引入远端 AI、云同步、埋点、广告、登录。

## 官方参考

- [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri commands](https://v2.tauri.app/develop/calling-rust/)
- [ActivityWatch REST API](https://docs.activitywatch.net/en/latest/api/rest.html)
- [Chrome extensions tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)
