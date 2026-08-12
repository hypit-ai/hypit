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
扩展名为 `.svml`。

## 选择开始方式

### 使用 Narratage skill

将以下指令发送给你的 Agent：

```text
安装并使用这个仓库里的 narratage skill。配置我的环境，只向我索取当前 Runtime Profile
实际需要的 API key，然后带我完成第一支 SVML 视频的创作与 Build。
```

### 手动开始

从[安装](#安装)继续，然后按顺序阅读七篇指南。

## 安装

源码工作区需要 Node.js 22+，并通过 Corepack 使用 pnpm 10.33.x。以下命令在 macOS/Linux
Shell 与 Windows PowerShell 中相同：

部分较新的 Node.js 发行版不再自带 Corepack。如果 `corepack --version` 不可用，先在任一
Shell 中安装兼容版本：

```text
npm install --global corepack@0.34.5
```

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

本地媒体处理还要求 `ffmpeg` 与 `ffprobe` 位于 `PATH`。Python 是可选依赖：只有 Runtime
Profile 选择本地 WhisperX 或 OpenCV 时，才需要 Python 3.10–3.13 与
[`uv`](https://docs.astral.sh/uv/)。在任一 Shell 中按锁定环境准备：

```text
uv python install 3.13
uv sync --project services/whisperx --frozen
uv sync --project services/image-opencv --frozen
uv run --project services/whisperx --frozen svml-whisperx-prepare
```

在源码仓库内可使用 `node --run narratage -- ...`。仓库外的视频项目直接执行
`/path/to/svml/narratage ... --package-root /path/to/svml`；这个轻量入口不再启动 pnpm，源码、
SQLite、Artifact 和输出仍全部留在外部项目的 Runtime Profile root 下。

## 三份输入

每一次 Build 都接受三份彼此独立的输入：

| 输入 | 各自负责什么 | 典型文件 |
|---|---|---|
| **Author Source** | 口播稿、模型选择、轨道构成、输出图 | `.svml` |
| **Run Source** | 要产出哪些输出、备选 candidates、satisfaction edges | `.svrun` |
| **Runtime Profile** | endpoints、凭据、并发 | `svml.runtime.json` |

Author Source 说明*做什么*。Run Source 说明*要哪些*。Runtime Profile 说明*在哪里做*。

## 第一次图检查

`talking-film-graph-check` 示例会编译一张完整的视频图 —— Script、Seedance、Speech、
WhisperX、Gemini Caption、B-roll、Text、Film、HyperFrames —— 全程不调用任何外部服务。

```bash
node --run narratage -- check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .

node --run narratage -- plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .
```

`check` 产出带类型的 Author Graph。`plan` 绑定 Author Graph 与 Run Graph，解析 Targets，
并输出冻结的 BuildPlan —— 其中包含 Scheduler 将会发出的每一个 Operation 与 Needs。花钱之前先检查它。

## 指南目录

| 指南 | 主题 |
|---|---|
| [Script](./quickstart/script.md) | Segment、Role Cue、Dual Text、Selection、Moment、文字投影 |
| [SVS 样式表](./quickstart/styles.md) | CSS 风格的 Recipe：film、caption、B-roll、text、speech、字体 |
| [媒体与生成](./quickstart/generation.md) | media:Image、media:Audio、estimate:Speech、Text Template、Seedance |
| [时序与装配](./quickstart/timing.md) | speech:Spine、whisperx:Alignment、ProgramSpace、SemanticMap |
| [字幕、Media、文字与音频](./quickstart/tracks.md) | Caption、Media、Typography 与 Audio Track 作者语法 |
| [Film 与渲染](./quickstart/composition.md) | film:Film、render:Video、完整流水线演练 |
| [Run Source 与 Build](./quickstart/run.md) | .svrun 语法、targets、复用、runtime profile、build 工作流 |
