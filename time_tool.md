我觉得这个想法很适合做成一个真正“懂电脑工作流”的个人工具。它不应该只是统计“Chrome 2h、Typora 1h”，而应该回答：

**今天我到底做了什么？有多少时间真正投入？什么时候分心？哪些任务是在并行进行？我的工作模式有没有变好？**

## 1. 核心定义：不要统计“应用时间”，而要统计“工作状态”

比如你有这样一小时：

> 14:00–15:00 学 Cisco
> Cisco PDF/网页一直开着
> Typora 用来记笔记
> Codex 在后台生成代码
> 中间 14:26 看了 4 分钟 Bilibili
> 14:42 回了 1 分钟微信

传统软件最后可能给你：

| 应用   | 时间   |
| ------ | ------ |
| Edge   | 31 min |
| Typora | 24 min |
| 微信   | 1 min  |
| 其他   | 4 min  |

但你的软件应该理解成：

**14:00–15:00：Cisco 学习 Session**

主任务是「Cisco 学习」，其中前台注意力在 Cisco 资料和 Typora 之间切换；Codex 从 14:07–14:51 作为后台任务独立运行；14:26–14:30 出现一次明显分心；14:42 的微信属于短暂打断。

这样得到的才是人的工作记录，而不是 Windows 任务管理器记录。

------

# 2. 我最推荐的模型：四条并行时间轨

完整界面的核心应该是一条类似专业视频剪辑软件的 Timeline。

```
14:00           14:15           14:30           14:45          15:00

目标
━━━━━━━━━━━━━━━━━━ Cisco 学习 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

注意力
Cisco课件 ━━━━━ Typora ━━━ Cisco ━━ B站 ━ Typora ━━━ Cisco ━━━━━

辅助上下文
Typora     ──────────────── Cisco PDF ───────────────────────

后台任务
       └──────────── Codex: Implement xxx ─────────────────┘

状态
████████ 专注 ████████  分心  ██████████████████████████████
```

这是整个产品最重要的设计。

### 第一层：Intent / Goal

“我这一段时间本来想干什么？”

例如：

**学习 · Cisco CCNA · Chapter 3**

这一层决定什么算分心。

因为单纯根据 App 判断生产力很容易错：

YouTube 看 CCNA 教程，是学习。

YouTube 看搞笑视频，是分心。

Chrome 查 PyTorch 文档，是工作。

Chrome 刷 Reddit，可能是娱乐。

所以：

> **Distraction 必须相对于 Intent 定义。**

这是我认为你这个项目比 RescueTime 类软件更进一步的关键。

------

## 3. 第二层：Attention —— 你的注意力到底在哪

Windows 可以持续记录：

当前前台窗口、进程名、窗口标题、浏览器域名、文档名称、键鼠活动以及 idle 状态。

这和 ActivityWatch / ManicTime 的基础思路类似；ActivityWatch 默认 watcher 就会记录前台窗口、标题以及 AFK 状态，而且数据可以完全保存在本机。[ActivityWatch 文档](https://docs.activitywatch.net/en/latest/privacy.html?utm_source=chatgpt.com)

但是你的软件应该进一步做：

```
Code.exe
→ VS Code
→ Equivariant-Splitting
→ get_Lphysics.py

Typora.exe
→ CS336 Notes.md

msedge.exe
→ Cisco Networking Academy
→ Switching Concepts
```

最终分类为：

```
学习 / Cisco
学习 / CS336
科研 / SPAD
编程 / 项目A
娱乐 / YouTube
社交 / 微信
系统 / 文件管理
```

而不是简单按照程序名统计。

------

# 4. 第三层：Context —— 同屏辅助信息

这是传统时间追踪器经常忽略的部分。

假设：

左边 Cisco PDF，右边 Typora。

虽然 Windows 某一刻只有 Typora 获得键盘焦点，但显然你不是“只用了 Typora 40 分钟”。

所以可以检测：

**当前有哪些可见窗口，以及它们在屏幕上占多大面积。**

例如：

```
Foreground:
Typora 52%

Visible context:
Edge / Cisco PDF 48%
```

如果 Cisco 窗口：

长期可见、最近有交互，并且与当前 Intent 高度相关，

那么记录：

> Typora = Primary Attention
> Cisco = Supporting Context

但统计总工作时间的时候：

**绝对不能 30min Typora + 30min Cisco = 60min × 2。**

时间仍然只有 60 分钟。

只是这一小时内部的“工作组成”不同。

------

# 5. 第四层：Background Tasks

你说的 Codex 是很重要的例子。

假设：

```
14:05
你让 Codex 开始修改项目

14:06
切到 Cisco 学习

14:41
Codex 完成
```

不要统计：

> Codex 使用 35min

因为你的注意力根本没在那里。

应该记录：

```
Attention
Cisco Learning        35 min

Background task
Codex · Project X      35 min

Concurrency
Cisco + Codex          35 min
```

这意味着你的日报甚至可以显示：

> 今天电脑活动时间：7h 12m
> 主动投入时间：6h 03m
> 后台自动任务运行：2h 17m
> 其中 1h 43m 与其他工作并行

这是非常有价值的信息。

以后还可以专门支持：

```
Codex
Claude Code
Python训练
模型推理
下载
ffmpeg
git clone
npm build
Docker build
```

甚至检测：

```
Process started
Process running
Process completed
Process failed
```

形成一条 **Background Work Lane**。

------

# 6. 悬浮小工具，我会这样设计

平时它应该尽量没有存在感。

Windows 开机自动启动以后默认缩成一个很小的半透明 Pill：

```
● Cisco Study   42m       ◉ 87%
```

鼠标放上去展开：

```
┌──────────────────────────┐
│ Cisco Study        00:42 │
│                          │
│ ● Focused                │
│ Cisco + Typora           │
│                          │
│ ⚙ Codex ×1 running       │
│                          │
│ Today                    │
│ Focus   3h 21m           │
│ Distract   24m           │
└──────────────────────────┘
```

按钮不要太多。

主要就应该允许：

**切换当前任务、暂停记录、标记休息、标记“刚刚这段分类错了”、进入完整 Dashboard。**

甚至正常情况下用户完全不用点它。

------

# 7. 完整软件：我建议做成 5 个主要页面

### Today

这是首页。

顶部：

```
Thursday · Oct 8

Computer Time        Focused          Distracted
7h 32m               5h 11m           46m

Deep Work            Context Switches
2h 37m               73
```

下面就是当天的大 Timeline。

你点击任意一段：

```
15:21–15:54

Intent
CS336 Learning

Primary
Chrome · FlashAttention lecture
18m

Supporting
Typora · CS336.md
14m

Background
Codex · sakura-town
33m

Distraction
None
```

我认为 **Timeline 会是这个软件真正的灵魂页面。**

------

# 8. Analytics 页面不要只堆饼图

应该回答真正有价值的问题。

例如：

> 过去四周，你最高效的时间集中在 14:00–17:00。

> 你的学习 Session 平均在 34 分钟之后第一次发生明显分心。

> 晚上 23:30 以后娱乐应用占比明显增加。

> CS336 本周投入 6h 42m，比上周增加 18%。

> Cisco 学习中，Typora 与课件并行出现的比例达到 63%，属于典型“阅读 + 笔记”模式。

> 本周启动 Codex 23 次，其中 71% 的运行时间你同时在进行其他任务，相当于约 3h 12m 的自动化并行工作。

这比“微信用了 47 分钟”有意义得多。

------

# 9. 每日 / 每周报告

我会设计成自动生成。

### 每日日报

```
2026-10-08

电脑活动
7h 46m

目标导向工作
5h 58m

深度专注
2h 43m

主要投入
Cisco           2h 07m
SPAD Research   1h 46m
CS336           1h 03m

主要分心
Bilibili        22m
Reddit          13m
微信             9m

最长连续专注
54 min

后台任务
Codex           2h 18m
Python          41m
```

下面再生成几句话的分析。

而每周报告重点看：

**趋势，而不是汇总。**

例如：

```
Focus
██████████████  +12%

Distraction
██████          -18%

Context switching
████████        +7%

Deep Work
████████████████ +21%
```

并回答：

> 什么时间最容易专注？

> 什么东西最容易把你带跑？

> 哪个项目实际投入最多？

> 哪一天最碎片化？

> 有没有“坐电脑前很久，但是实际上没做多少事情”的情况？

这才是周报的价值。

RescueTime 现在本身也会做周总结、生产力趋势和 Focus Zone 推断，所以这些属于已经被验证过有价值的方向。[RescueTime](https://www.rescuetime.com/features?utm_source=chatgpt.com)

------

# 10. “分心”的算法不要太武断

我不建议：

```
Bilibili = Distracting
VS Code = Productive
```

而建议：

```
当前目标：学习 Cisco

Cisco Docs        Relevant  1.00
Typora Notes      Relevant  0.95
Google Search     Relevant  0.75
ChatGPT           Unknown   0.50
WeChat            Unrelated 0.20
Bilibili 娱乐视频 Unrelated 0.05
```

然后再考虑持续时间。

切出去 5 秒：

> Micro switch

15–60 秒：

> Interruption

连续 3 分钟：

> Distraction

这样不会把你看一眼微信消息就判成“严重分心”。

而且所有判断都允许你修改。

你改几次以后：

```
Cisco相关YouTube
→ Learning

GitHub / vsechaud
→ SPAD Research

Steam
→ Entertainment
```

规则慢慢就能学会你自己的习惯。

------

# 11. 一个非常重要的指标：Fragmentation

我甚至觉得它比所谓的“生产力分数”重要。

例如两天都学习 4 小时。

A：

```
90 min
休息
70 min
休息
80 min
```

B：

```
7 min
微信
13 min
网页
4 min
Typora
Reddit
18 min
……
```

传统统计：

> 都是 4h。

但认知状态完全不一样。

因此可以设计：

**Fragmentation Index（碎片化指数）**

综合考虑：

任务切换次数、无关任务切换、平均连续工作时长、恢复时间和短 Session 数量。

最后：

```
Focus Quality       82
Fragmentation       Low
Distractions        3
Longest Flow        74m
```

不过我不会把它包装成一个神秘的“AI productivity score”，所有指标都应该能点开看到怎么算的。

------

# 12. 数据模型最好一开始就设计正确

最底层不要直接存：

```
Chrome 12:01–12:03
Typora 12:03–12:05
```

而是：

```
ActivityEvent

timestamp
duration

process
window
document
url

foreground
visible
screen_area

keyboard_activity
mouse_activity

intent_id
project_id
category

role:
PRIMARY
SUPPORTING
BACKGROUND
DISTRACTION
IDLE

confidence
```

然后上层再把事件合并成：

```
Session
```

例如：

```
Session #1027

14:00–15:14

Intent:
Cisco Learning

Primary:
Cisco
Typora

Background:
Codex

Interruptions:
WeChat ×2
Bilibili ×1

Focus:
86%

Fragmentation:
Low
```

这样以后扩展空间会非常大。

------

# 13. 隐私方面，我强烈建议 Local First

这类软件记录的信息实际上非常敏感：

窗口标题、网页、文件名、学习内容、项目名甚至聊天页面。

ActivityWatch 本身就把“数据完全保存在本机”作为主要设计原则，而且其 AI Summary 甚至默认只发送聚合后的应用/分类统计，不发送窗口标题、完整 URL 和逐条时间事件。这个思路非常值得直接借鉴。[ActivityWatch 文档](https://docs.activitywatch.net/en/latest/privacy.html?utm_source=chatgpt.com)

所以你的架构最好：

```
Collector
      ↓
Local database
      ↓
Classifier
      ↓
Analytics Engine
      ↓
UI
```

数据库直接：

**SQLite**

即可。

AI 分析可以以后作为可选功能：

```
Raw data
    ↓
Local aggregation
    ↓
去掉URL / 标题 / 敏感信息
    ↓
LLM
    ↓
日报 / 周报
```

而不是把全天电脑活动直接上传给模型。

------

# 14. 技术上，我建议 Windows 第一版这样做

考虑你主要在 Windows 上使用，我会倾向：

**Tauri 2 + React/TypeScript + Rust**

前端负责：

```
Dashboard
Timeline
Charts
Floating Widget
Settings
```

Rust 后台负责：

```
Foreground Window
Visible Windows
Processes
Idle Detection
Background Jobs
Database
Auto Start
```

数据：

```
SQLite
```

浏览器内容：

```
Chrome / Edge Extension
       ↓
localhost IPC
       ↓
Desktop App
```

如果追求纯 Windows 原生质感，也可以：

**C# + WinUI 3**

但如果这是你自己开发、以后还想扩展 macOS，我更推荐 Tauri。

------

# 15. 第一版千万别把功能做太大

真正值得先验证的是这一条链：

1. 自动检测前台 App / Window title / Idle；
2. 把活动合并成 Timeline；
3. 自动分类“学习 / 编程 / 娱乐 / 社交”；
4. 用户设置当前 Intent；
5. 判断是否发生 Distraction；
6. 检测 Codex 等后台任务；
7. 支持 Primary + Supporting + Background 三种活动同时存在；
8. 生成 Today Dashboard + 每日报告。

做到这里，我觉得就已经是一个**非常有特色而且你自己真的会长期使用的软件**。

ActivityWatch 已经证明本地自动采集这一底层路线是可行的，ManicTime 证明详细 Timeline 很有价值，而 RescueTime 证明“分类 → 专注 → 周分析”这条产品逻辑也成立。[ActivityWatch 文档](https://docs.activitywatch.net/en/latest/features/user-interface.html?utm_source=chatgpt.com)

你真正应该创新的地方，不是再造一个 ActivityWatch，而是：

> **ActivityWatch 式数据采集  
>
> - ManicTime 式 Timeline  
> - RescueTime 式行为分析  
> - 你自己的 Intent / Parallel Work / Distraction 模型。**

尤其是 **“主注意力 + 辅助上下文 + 后台任务”**，我觉得可以直接作为整个软件最核心的产品概念。最终它记录的不再是“你打开了哪些软件”，而是**你一天究竟是怎样工作的**。

可以。按你前面这个目标，我建议不要把它做成“屏幕时间统计器”，而是从一开始就按 **Local-first Personal Activity Intelligence** 来设计。

整体架构可以压缩成这一条：

```
Windows / Browser / Codex
          ↓
   Data Collectors
          ↓
     Event Store
          ↓
 Context & Session Engine
          ↓
 Classification / Analysis
          ↓
  Desktop UI + Reports
```

### 一、技术栈

我比较推荐：

```
Desktop
Tauri 2
├── React
├── TypeScript
├── Tailwind / shadcn
├── ECharts / Recharts
└── Zustand

Core Backend
Rust
├── Windows API
├── Process Monitoring
├── SQLite
├── Event Aggregation
└── Local HTTP / Tauri IPC

Optional Intelligence
Python / Rust
├── Classification
├── Session inference
└── Local / Cloud LLM

Browser
Chrome / Edge Extension
```

开发分工可以非常明确：

**Opus 5.5：前端主力**

负责：

- UI Design System
- Dashboard
- Timeline
- 悬浮窗
- 动画与交互
- 数据可视化
- Settings
- Report 页面

**GPT-6 Astra / 6.1 Sol：后端主力**

负责：

- Windows API
- ActivityWatch 集成
- SQLite Schema
- 后台进程监控
- Session Engine
- 并行活动模型
- 分心算法
- 数据聚合
- API / IPC
- 单元测试

如果后端逻辑会越来越复杂，我更倾向 **Astra 做整体设计和大模块，6.1 Sol 做具体实现、debug 和迭代**。

------

# 二、最底层不要重造 ActivityWatch

架构建议：

```
                  ┌─ ActivityWatch
                  │   foreground app
Windows ──────────┤   window title
                  │   AFK
                  │
                  ├─ Your Windows Watcher
                  │   visible windows
                  │   process tree
                  │   window position
                  │   background jobs
                  │
Browser ──────────┤
                  └─ Browser Extension
                      URL
                      tab title
                      domain
```

ActivityWatch 是你的一个 **Data Source**，而不是整个软件。

以后哪怕不用 ActivityWatch，也只需要替换 Collector。

这样架构不会绑死。

------

# 三、数据分成三层

这是非常重要的。

## Layer 1：Raw Event

最原始的数据。

```
RawEvent {
    timestamp
    source

    process
    window_title
    url

    foreground
    visible

    keyboard_activity
    mouse_activity

    metadata
}
```

例如：

```
14:32:04
Typora.exe
CCNA Notes.md
foreground=true
keyboard=active
```

这一层**永远不要直接修改**。

------

## Layer 2：Activity

对 Raw Event 进行清洗合并：

```
14:30–14:42

Typora
CCNA Notes.md

category:
Learning

project:
Cisco

role:
PRIMARY
```

这里开始增加语义。

------

## Layer 3：Session

这才是用户看到的东西。

```
Session

14:00–15:12

Intent:
Cisco Study

Primary:
Cisco PDF
Typora

Supporting:
ChatGPT

Background:
Codex

Distractions:
Bilibili 4m
WeChat 1m

Focus:
87%

Fragmentation:
Low
```

你的绝大多数统计应该基于 Session，而不是 Raw Event。

------

# 四、核心引擎建议拆成 5 个

后台最好不要做成一个巨大的 AnalysisService。

```
Core
│
├── Collector Engine
│
├── Context Engine
│
├── Session Engine
│
├── Classification Engine
│
└── Analytics Engine
```

### Collector Engine

只负责：

> 发生了什么？

例如：

```
Chrome opened
Typora foreground
Codex process running
User AFK
```

------

### Context Engine

负责：

> 当前电脑是什么状态？

输出可能是：

```
Foreground:
Typora

Visible:
Cisco PDF

Background:
Codex

User:
Active
```

这是处理“多线程工作”的关键层。

------

### Session Engine

负责：

> 这些零碎事件实际上是不是同一件事？

例如：

```
Chrome Cisco
→ Typora
→ Chrome Cisco
→ Typora
```

不要识别成 20 个 Session。

而应该合并成：

```
Cisco Learning
14:00–14:53
```

------

### Classification Engine

负责：

```
Cisco → Learning
GitHub / ES → Research
Steam → Entertainment
WeChat → Communication
```

最开始：

```
规则
+
domain
+
window title
```

后期再加：

```
LLM
```

不要第一版就让 AI 判断一切。

------

### Analytics Engine

负责：

```
Daily summary
Weekly summary

Focus time
Distraction
Fragmentation
Context switching
Project time
Deep work
Parallel work
```

它应该只读取已经处理好的 Session。

------

# 五、Codex 单独做一个 Background Job 模型

这部分我建议从架构上就特殊处理。

不要把 Codex 当普通 App。

定义：

```
BackgroundJob {
    id

    type:
    CODEX
    CLAUDE_CODE
    PYTHON
    TRAINING
    BUILD
    DOWNLOAD

    project

    start_time
    end_time

    status

    foreground_time
    background_time
}
```

例如：

```
Codex
ES-project

14:12–14:57

Running: 45m

Foreground interaction:
6m

Background:
39m
```

那么最后可以出现一个非常漂亮的指标：

> Automated Work：2h 41m
> Overlapped With Human Work：2h 03m

这个是你软件一个很有特色的东西。

------

# 六、数据库第一版 SQLite 足够

目录大概：

```
data/
└── activity.db
```

核心表：

```
raw_events

activities

sessions

background_jobs

projects

categories

rules

daily_stats

weekly_stats
```

不要直接每天生成 JSON。

SQLite 后期百万级甚至千万级 Activity Event 都能处理。

Raw Event 可以：

```
保留 30–90 天
```

聚合后的 Session：

```
永久保存
```

这样数据库不会无限膨胀。

------

# 七、前端信息架构

我建议就六个地方。

```
Today
Timeline
Analytics
Projects
Reports
Settings
```

### Today

核心数字：

```
Computer
7h 14m

Focused
5h 21m

Distracted
34m

Deep Work
2h 48m

Background
Codex 1h 53m
```

下面显示今天 Timeline。

------

### Timeline

这是整个软件最重要的界面。

设计成：

```
Intent
──────────────── Cisco ───────────────

Attention
Cisco ─ Typora ─ Cisco ─ Bilibili ─ Typora

Supporting
──── Cisco PDF ──────────────────────

Background
────── Codex ────────────────────────

State
██████ Focus ██ Distract ███████████
```

Opus 可以重点打磨这一页。

------

### Analytics

主要做：

```
Focus trend

Weekly hours

Project distribution

Hourly productivity

Distraction sources

Context switches

Fragmentation

Parallel work
```

------

### Reports

```
Today
Yesterday
This Week
Last Week
Monthly
```

AI 只在这里负责**解释数据**。

比如：

> 本周学习时间增加 17%，但周三和周四的碎片化明显上升。

不要让 AI 自己计算 17%。

数字必须由 Analytics Engine 算出来。

------

# 八、悬浮窗单独设计成 Mini App

正常状态：

```
┌──────────────────────┐
│ ● Cisco Study  38m   │
│ Focus 91%   ⚙ Codex │
└──────────────────────┘
```

可以完全隐藏到：

```
System Tray
```

展开：

```
Current
Cisco Study

38 min

Primary
Typora

Supporting
Cisco PDF

Codex
Running · 23m

──────────

Pause
Change task
Dashboard
```

开机自动启动。

默认不抢焦点。

------

# 九、Intent 不要完全自动化

这个地方建议采用：

**AI 自动猜 + 用户可以确认。**

例如检测到：

```
Cisco NetAcad
+
CCNA Notes.md
```

悬浮窗自动显示：

> Cisco Study?

如果用户没有操作：

```
confidence > 0.9
→ 自动采用
```

如果不确定：

```
Research?
Learning?
Browsing?
```

让用户点一下。

用久以后建立规则：

```
netacad.com
+
CCNA*.md

→ Cisco Learning
```

慢慢做到几乎不用操作。

------

# 十、整个 Repo 我会这样拆

```
pc-insight/
│
├── apps/
│   ├── desktop/
│   └── browser-extension/
│
├── crates/
│   ├── collector/
│   ├── context/
│   ├── session/
│   ├── classifier/
│   ├── analytics/
│   ├── database/
│   └── activitywatch/
│
├── packages/
│   ├── ui/
│   ├── types/
│   └── charts/
│
├── migrations/
│
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   └── product-spec.md
│
└── tests/
```

这样两个模型合作的时候不会互相把代码搞乱。

------

# 十一、开发顺序

我建议千万不要同时做所有功能。

### V0.1

先做到：

```
Windows foreground tracking
AFK
Browser URL
SQLite

↓

Timeline
```

这一步只验证：

> **能否忠实还原我的一天。**

------

### V0.2

增加：

```
Category
Project
Intent
Session
Distraction
```

开始得到：

> “我到底在干什么？”

------

### V0.3

增加：

```
Visible windows
Codex / background job
Parallel activity
```

这一步才真正形成你的特色。

------

### V0.4

增加：

```
Daily
Weekly
Analytics
Reports
```

------

### V0.5

最后才：

```
LLM
AI summary
Behavior insight
Automatic classification
```

这样不容易最后变成一个“AI 很强，但基础时间数据一塌糊涂”的产品。

------

最终整个软件的核心逻辑其实可以浓缩成：

```
Raw Events
      ↓
Computer Context
      ↓
Activities
      ↓
Sessions
      ↓
Intent / Attention / Supporting / Background
      ↓
Focus / Distraction / Fragmentation
      ↓
Daily & Weekly Analytics
      ↓
AI Interpretation
```

其中 **ActivityWatch 负责一部分 Raw Events；你的真正核心资产是从 Context → Session → Analytics 这一整层。**

如果后面让两个模型正式开始写，我建议第一步不是直接发一句“帮我做这个软件”，而是先固定一份 **`PRODUCT_SPEC.md + ARCHITECTURE.md + DATA_MODEL.md`**，让 Opus 5.5 和 Astra/Sol 都严格根据同一套文档工作。这样多模型协作时架构最不容易漂。