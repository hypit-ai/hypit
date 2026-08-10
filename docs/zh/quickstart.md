---
title: Quickstart
description: 搭建 Narratage 并编译你的第一张视频图。
---

# Quickstart

**Narratage** 这个名字来自 1933 年《*New York Times*》对电影《*The Power and the
Glory*》的一篇影评。那位影评人造出这个词，用来描述当时的一种新兴电影手法：
**Narration + Montage** —— 旁白的声音推动故事前进，同时画面组接出与之呼应的蒙太奇。

这套系统做的正是这件事。作者写下带有语义锚点的口播 Script，编译器则把生成的视频、字幕、B-roll、
文字与音频组装成一部完成的影片。Author Source 使用 SVML（Semantic Video Markup Language）编写，
扩展名为 `.svml`；工作区包则发布在 `@narratage` 作用域下。

## 安装

需要 Node.js 22+ 与 pnpm。

```bash
pnpm install
pnpm check
pnpm test
```

## 三份输入

每一次 Build 都接受三份彼此独立的输入：

| 输入 | 各自负责什么 | 典型文件 |
|---|---|---|
| **Author Source** | 口播稿、模型选择、轨道构成、输出图 | `.svml` |
| **Run Source** | 要产出哪些输出、备选 candidates、satisfaction edges | `.svrun` |
| **Runtime Profile** | endpoints、凭据、并发、权限 | `svml.runtime.json` |

Author Source 说明*做什么*。Run Source 说明*要哪些*。Runtime Profile 说明*在哪里做*。

## 第一次图检查

`talking-film-graph-check` 示例会编译一张完整的视频图 —— Script、Seedance、Speech、
WhisperX、Gemini Caption、Media Track、Text、Film、HyperFrames —— 全程不调用任何外部服务。

```bash
pnpm narratage check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .

pnpm narratage plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .
```

`check` 产出带类型的 Author Graph。`plan` 绑定 Author Graph 与 Run Graph，解析 Targets，
并输出冻结的 BuildPlan —— 其中包含 Scheduler 将会发出的每一个 Operation 与 Needs。花钱之前先检查它。

## 指南目录

| 指南 | 主题 |
|---|---|
| [Script](./quickstart/script.md) | Segment、Role Cue、Dual Text、Selection、Moment、文字投影 |
| [SVS 样式表](./quickstart/styles.md) | CSS 风格的 Recipe：film、caption、media、text、speech、字体 |
| [媒体与生成](./quickstart/generation.md) | media:Image、media:Audio、estimate:Speech、Seedance、speaker:Take |
| [时序与装配](./quickstart/timing.md) | speech:Spine、whisperx:Alignment、ProgramSpace、SemanticMap |
| [字幕、Media 与文字](./quickstart/tracks.md) | caption-fine:Style/Track、caption:Program、Planner、Media Track 与 Text |
| [Film 与渲染](./quickstart/composition.md) | film:Film、render:Video、完整流水线演练 |
| [Run Source 与 Build](./quickstart/run.md) | .svrun 语法、targets、复用、runtime profile、build 工作流 |

