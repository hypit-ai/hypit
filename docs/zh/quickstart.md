---
title: 快速开始
description: 安装 Narratage，编译第一张完整的 SVML 视频图，并准备真实 Build。
---

# 快速开始

**Narratage** 这个名字来自 1933 年《*New York Times*》对电影《*The Power and the
Glory*》的一篇影评。那位影评人造出这个词，用来描述当时的一种新兴电影手法：
**Narration + Montage** —— 旁白的声音推动故事前进，同时画面组接出与之呼应的蒙太奇。

这套系统做的正是这件事。作者写下带有语义锚点的口播 Script，编译器则把生成的视频、字幕、B-roll、
文字与音频组装成一部完成的影片。Author Source 使用 SVML（Semantic Video Markup Language）编写，
扩展名为 `.svml`。

Narratage 把这份源码编译成一张可见的执行图。在任何模型或外部服务开始工作之前，你可以先检查源码、
选择一次 Run，并看清这次 Build 究竟需要执行什么。本页先带你得到第一份安全的 Plan：不需要 API Key，
也不会产生任何付费请求。

## 使用 Narratage skill

如果使用编程 Agent，把下面这段发给它：

```text
安装并使用这个仓库里的 narratage skill。配置我的环境，只向我索取当前 Runtime Profile
实际需要的 API key，然后带我完成第一支 SVML 视频的创作与 Build。
```

否则，按下面五个步骤依次进行。

## 1. 安装源码工作区

Narratage 目前从源码仓库运行，需要 Node.js 22+，并通过 Corepack 使用 pnpm 10.33.x。

```bash
git clone https://github.com/hypit-ai/narratage.git
cd narratage
corepack enable
pnpm install --frozen-lockfile
```

如果系统没有 `corepack`：

```bash
npm install --global corepack@0.34.5
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
```

`pnpm check` 和 `pnpm test` 是修改 Narratage 本身时使用的整仓检查。第一次使用 CLI
不需要先跑完整测试。

## 2. 编译示例

仓库里的示例包含 Script、两次视频生成需求、Speech Spine、WhisperX 对齐、字幕、Media Track、
文字、Film 与最终渲染。

```bash
node --run narratage -- check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock
```

`check` 会读取自描述的源码，只加载锁中允许的包，并列出这份 Author Source 声明的公共类型化输出。

接着编译 Run Source：

```bash
node --run narratage -- plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock
```

`plan` 会连接 Author Graph 和 Run Graph，从 `final.video` 反向找到真正需要的子图，冻结将要使用的
Operations 与外部 Needs。它绝不会启动 Provider。

现在可以直接打开三份源码阅读：

- [`main.svml`](https://github.com/hypit-ai/narratage/blob/main/examples/talking-film-graph-check/main.svml)：视频本身；
- [`studio.svs`](https://github.com/hypit-ai/narratage/blob/main/examples/talking-film-graph-check/studio.svs)：可复用的视觉 Recipe；
- [`build.svrun`](https://github.com/hypit-ai/narratage/blob/main/examples/talking-film-graph-check/build.svrun)：这次要求得到的输出。

## 3. 认识项目里的文件

一个实际视频项目通常有四份由人编写或配置的输入，以及两份自动生成的锁：

| 文件 | 回答的问题 |
|---|---|
| `main.svml` | 要做的是什么视频？ |
| `studio.svs` | 使用哪些可复用的 Recipe 值？ |
| `build.svrun` | 这一次 Run 要哪些输出、选择哪些 Candidate？ |
| `svml.runtime.json` | 在哪台机器、哪些 Store 和 Provider Endpoint 上执行？ |
| `svml.packages.lock` | 允许使用哪些 Author/Compute 包字节？ |
| `svml.runtime-packages.lock` | 允许使用哪些特权 Runtime 包字节？ |

最短的记法是：

```text
SVML 说明做什么。
SVRUN 说明这次选什么。
Runtime Profile 说明在哪里做。
```

同一个 `main.svml` 可以对应很多份 `.svrun`：单独生成图片、渲染成片，或者复用已经认可的镜头，
都不需要修改作者对视频本身的表达。

## 4. 建立自己的项目

把视频项目和生成产物放在 Narratage 仓库之外。在项目目录里直接调用源码仓库提供的轻量启动器：

```bash
cd /path/to/my-video

/path/to/narratage/narratage packages sync build.svrun \
  --runtime svml.runtime.json

/path/to/narratage/narratage plan build.svrun \
  --runtime svml.runtime.json
```

启动器使用 Narratage 仓库已经安装好的依赖，但源码、SQLite 状态、Artifact 和输出都会留在你的项目里。
`packages sync` 把当前 Run 与 Runtime 选择加入或刷新到两份项目包库存中，不会删除其他 Run 的包。

需要完整 Runtime Profile 时，从
[`examples/talking-film-live`](https://github.com/hypit-ai/narratage/tree/main/examples/talking-film-live) 的结构开始：复制文件结构，
再换成自己的素材、Script、模型选择和凭据。

## 5. Build 并取出结果

检查并确认计划之后：

```bash
/path/to/narratage/narratage build build.svrun \
  --runtime svml.runtime.json \
  --build-id my-video-001 \
  --follow
```

`build` 会持久化这次 Build、确保对应 Worker 可用，并只启动所选 Endpoint 声明的外部程序。
`--follow` 只是观察器；关掉它不会停止 Build。

编辑源码时使用 `check`；配置或排查部署时使用 `doctor`。它们都不会提交工作，但也不是每次
Build 前必须重复的仪式。

```bash
/path/to/narratage/narratage status my-video-001 \
  --runtime svml.runtime.json

/path/to/narratage/narratage queue \
  --runtime svml.runtime.json --watch

/path/to/narratage/narratage get my-video-001 \
  --runtime svml.runtime.json \
  --name final.video \
  --to output/final.mp4
```

Runtime 会归档所有已经接受的中间 Record 和媒体。`get` 只负责把某个归档结果复制到便于人查看的位置，
不会决定哪些中间结果应该被保存。

## 真实 Build 可能使用的本地工具

只安装当前 Runtime Profile 真正选择的部分：

| 工具 | 什么时候需要 |
|---|---|
| `ffmpeg` / `ffprobe` | 使用本地媒体检查、归一化或 mux 时 |
| Python 3.10–3.13 与 `uv` | 使用本地 WhisperX 或 OpenCV 时 |
| Chromium | 本地 HyperFrames 渲染时由 Adapter 管理 |
| API 凭据 | 选择 KIE、Vertex、Xiaomi 或 AWS Endpoint 时 |

准备本地 Python 服务：

```bash
uv python install 3.13
uv sync --project services/whisperx --frozen
uv sync --project services/image-opencv --frozen
uv run --project services/whisperx --frozen svml-whisperx-prepare
```

修改 Runtime Profile 后运行 `narratage doctor svml.runtime.json`。它会报告缺少的工具、凭据和
Endpoint 配置，但不会执行作者图。

## 接下来读什么

可以按顺序理解完整创作路径，也可以直接进入正在修改的部分：

| 指南 | 你会学到什么 |
|---|---|
| [Script](./quickstart/script.md) | Segment、Role Cue、Dual Text、Selection、Moment 与文字投影 |
| [SVS 样式表](./quickstart/styles.md) | 字幕、Media、文字与 Film 的可复用 Recipe |
| [媒体与生成](./quickstart/generation.md) | 图片、音频、Prompt Text 与显式模型组件 |
| [时序与装配](./quickstart/timing.md) | Speech Spine、WhisperX、ProgramSpace 与 SemanticMap |
| [Tracks](./quickstart/tracks.md) | Caption、Media、Typography 与 Audio Track |
| [Film 与渲染](./quickstart/composition.md) | 平级 Track 合成与显式渲染 |
| [Run Source 与 Builds](./quickstart/run.md) | Targets、复用、Runtime Profile、Build 与取回结果 |
