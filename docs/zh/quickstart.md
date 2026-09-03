---
title: 快速开始
description: 安装 Hypit，编译第一张完整的 SVML 视频图，并准备真实 Build。
---

# 快速开始

作者写下带有语义锚点的口播 Script，编译器则把生成的视频、字幕、B-roll、文字与音频组装成一部完成的影片。
Author Source 使用 SVML（Semantic Video Markup Language）编写，
扩展名为 `.svml`。

Hypit 把这份源码编译成一张可见的执行图。在任何模型或外部服务开始工作之前，你可以先检查源码、
选择一次 Run，并看清这次 Build 究竟需要执行什么。本页先带你得到第一份安全的 Plan：不需要 API Key，
也不会产生任何付费请求。

## 安装

```bash
npm install --global hypit
npx skills add hypit-ai/hypit --global
```

第一条命令安装可复用的 Distribution；第二条把 skill 全局安装，使以后任何项目里的新 Agent
会话都能找到它。普通创作不需要克隆仓库。

## 使用 Hypit skill

在任何项目目录下都可以直接使用 `/hypit`。发送给你的 Agent：

```text
/hypit 配置我的环境，只向我索取当前 Runtime Profile 实际需要的 API key，然后带我完成第一支 SVML 视频的创作与 Build。
```

它会走下面同样的五个步骤，并且只向你索取 Runtime Profile 实际需要的东西。不想用 Agent 的话，也可以自己依次完成这五步。

## 1. 检查已安装的 Distribution

需要 Node.js 22+，桌面系统为 macOS 13+ 或 Windows 10/11 x64。

```bash
hypit paths --json
```

结果会分别给出当前项目、项目 `.hypit` 状态、机器 Program Home 与 npm Distribution。
pnpm、Corepack 和 `npm link` 只属于贡献者工作流。

## 2. 编译示例

链接中的示例包含 Script、两次视频生成需求、Speech Track、WhisperX 对齐、字幕、Media Track、
文字、Film 与最终渲染。

```bash
cd /path/to/copied-talking-film-graph-check
hypit check main.svml
```

`check` 会读取自描述的源码，只加载源码导入的包，并列出这份 Author Source 声明的公共类型化输出。

接着编译 Run Source：

```bash
hypit plan build.svrun
```

`plan` 会连接 Author Graph 和 Run Graph，从 `final.video` 反向找到真正需要的子图，冻结将要使用的
Operations 与外部 Needs。它绝不会启动 Provider。

现在可以直接打开三份源码阅读：

- [`main.svml`](https://github.com/hypit-ai/hypit/blob/main/examples/talking-film-graph-check/main.svml)：视频本身；
- [`recipes.svs`](https://github.com/hypit-ai/hypit/blob/main/examples/talking-film-graph-check/recipes.svs)：可复用的视觉 Recipe；
- [`build.svrun`](https://github.com/hypit-ai/hypit/blob/main/examples/talking-film-graph-check/build.svrun)：这次要求得到的输出。

## 3. 认识项目里的文件

一个实际视频项目通常有四份由人编写或配置的输入：

| 文件 | 回答的问题 |
|---|---|
| `main.svml` | 要做的是什么视频？ |
| `recipes.svs` | 使用哪些可复用的 Recipe 值？ |
| `build.svrun` | 这一次 Run 要哪些输出、选择哪些 Candidate？ |
| `hypit.runtime.json` | 在哪台机器、哪些 Store 和 Provider Endpoint 上执行？ |

最短的记法是：

```text
SVML 说明做什么。
SVRUN 说明这次选什么。
Runtime Profile 说明在哪里做。
```

同一个 `main.svml` 可以对应很多份 `.svrun`：单独生成图片、渲染成片，或者复用已经认可的镜头，
都不需要修改作者对视频本身的表达。

## 4. 建立自己的项目

把视频项目和生成产物放在已安装的 Hypit Distribution 之外。全局命令可以在独立项目目录里直接使用
`hypit`：

```bash
cd /path/to/my-video

hypit runtime use hypit.runtime.json

hypit plan build.svrun
```

含有 `package.json` 的项目负责自己的第三方包；普通创作文件夹不需要成为 Node 项目，直接使用
Distribution 里的官方包。默认情况下，完整 Build Result 位于项目的 `.hypit/results`；Profile
不管理 Result，项目根的 `hypit.results.json` 可以把同一套 Result 模型指向 S3。Runtime 活跃状态与临时
Resource 始终位于所选 Profile 的 `dataRoot`。`runtime use` 只在 `.hypit/runtime` 保存一个本地指针。Source import 选择作者包，
Profile 则通过 Credential Store 与 Endpoint 各自的 `use` 独立选择环境包。

需要完整 Runtime Profile 时，从
[`examples/talking-film-live`](https://github.com/hypit-ai/hypit/tree/main/examples/talking-film-live) 的结构开始：复制文件结构，
再换成自己的素材、Script、模型选择和凭据。

## 5. Build 并取出结果

检查并确认计划之后：

```bash
hypit build build.svrun --follow
```

`build` 会先重复同一套便宜的本地预检，再分配新的 Build id、持久化 Build 并确保 Worker
可用。它不会安装包，也不会启动 Managed Program；部署未就绪时应显式运行
`hypit runtime up`。`--follow` 只是观察器；关掉它不会停止 Build。

编辑源码时使用 `check`；配置或排查部署时使用 `doctor`。它们都不会提交工作，但也不是每次
Build 前必须重复的仪式。

```bash
hypit status <build-id> --watch

hypit activity

hypit get <build-id> \
  --output final.video \
  --to output/final.mp4
```

Build Result 会保存目标路径上已经完成的所有公开 Author Output，包括媒体和结构化值。`get`
只把唯一公开名称指定的 Output 导出到明确的 `--to` 目的地，不会决定哪些中间结果应该被保存。
Scalar 与 Resource 导出为文件；Composite 导出为包含 `value.json` 及其引用 Resource 的目录。

## 真实 Build 可能使用的本地工具

只安装当前 Runtime Profile 真正选择的部分：

| 工具 | 什么时候需要 |
|---|---|
| `ffmpeg` / `ffprobe` | 使用本地媒体检查、归一化或 mux 时 |
| Python 3.10–3.13 与 `uv` | 使用本地 WhisperX 或 OpenCV 时 |
| Chromium | 本地 HyperFrames 渲染时由 Adapter 管理 |
| API 凭据 | 选择 KIE、Xiaomi 或 AWS Endpoint 时 |

准备本地 Python 程序：

```bash
uv python install 3.13
hypit runtime use hypit.runtime.json
hypit runtime up
```

Runtime 只会在机器 Program Home 中缺少托管环境时创建它，随后被所有项目和会话复用。不要在
创作项目里手动执行服务的 `uv sync`。

修改 Runtime Profile 或项目 Result Repository 后运行 `hypit doctor hypit.runtime.json`。它会报告缺少的工具、凭据和
Endpoint 配置，但不会执行作者图。

## 接下来读什么

可以按顺序理解完整创作路径，也可以直接进入正在修改的部分：

| 指南 | 你会学到什么 |
|---|---|
| [Script](./quickstart/script.md) | Segment、Role Cue、Dual Text、Selection、Moment 与文字投影 |
| [SVS 样式表](./quickstart/styles.md) | 字幕、Media、文字与 Film 的可复用 Recipe |
| [媒体与生成](./quickstart/generation.md) | 图片、音频、Prompt Text 与显式模型组件 |
| [时序与装配](./quickstart/timing.md) | Speech Track、WhisperX、ProgramSpace 与 SemanticMap |
| [Tracks](./quickstart/tracks.md) | Caption、Media、Typography 与 Audio Track |
| [Film 与渲染](./quickstart/composition.md) | 平级 Track 合成与显式渲染 |
| [Run Source 与 Builds](./quickstart/run.md) | Targets、复用、Runtime Profile、Build 与取回结果 |
