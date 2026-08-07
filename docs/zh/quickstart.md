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

## 检查一张视频图（免费）

`talking-film-graph-check` 示例会编译一张完整的视频图 —— Script、Seedance、Speech、
WhisperX、Gemini Caption、B-roll、Text、Film、HyperFrames —— 全程不调用任何外部服务。

```bash
# 编译 Author Source。
pnpm narratage check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .

# 编译 Run Source 并查看冻结后的 plan。
pnpm narratage plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .
```

`check` 产出带类型的 Author Graph。`plan` 绑定 Author Graph 与 Run Graph，解析 Targets，
并输出冻结的 BuildPlan —— 其中包含 Scheduler 将会发出的每一个 Operation 与 Needs。花钱之前先检查它。

## 跑一次真实的 Build（付费）

`echo-pro-aroll` 示例是一部由四条 take 构成的 Seedance Mini 口播人像影片。

前置条件：

- 环境变量中配置 `KIE_API_KEY`、`GOOGLE_CLOUD_PROJECT`、`GOOGLE_APPLICATION_CREDENTIALS_JSON`
- `ffmpeg`、`ffprobe`、Chrome
- 本地 WhisperX 服务正在运行（参见 `services/whisperx/README.md`）
- `examples/echo-pro-aroll/assets/` 下的本地素材（未纳入版本库）

```bash
# 诊断 Runtime 环境。
pnpm narratage doctor examples/echo-pro-aroll/svml.runtime.json

# 提交 Build。
pnpm narratage build examples/echo-pro-aroll/build.svrun \
  --runtime examples/echo-pro-aroll/svml.runtime.json \
  --package-lock examples/echo-pro-aroll/svml.packages.lock \
  --root . \
  --build-id echo-pro-film-001 \
  --follow

# 取回最终视频。
pnpm narratage get echo-pro-film-001 \
  --runtime examples/echo-pro-aroll/svml.runtime.json \
  --name final.video \
  --to examples/echo-pro-aroll/output/final.mp4
```

每一个被接受的中间 Record 与 Artifact 都会在 Build 完成之前归档。`get` 只是对一个已经持久化的
Record 做一次可选的复制。

## 复用既有结果

SVML 没有隐式缓存。复用结果是显式的 Run Graph 编写工作 —— 声明由历史 Records 支撑的零输入
Candidates，再用 Satisfaction edges 把它们接起来：

```xml
<?svml using="@narratage/run-text@1"?>
<svrun version="1" targets="delivery">
  <author source="./main.svml"/>
  <target-set id="delivery">
    <target output="final.video" accepts="substitute"/>
  </target-set>

  <build-record id="hook-video"
    build="echo-pro-film-001" output="hook-take.video"/>
  <satisfy output="hook-take.video"
    candidate="hook-video" fidelity="substitute"/>
</svrun>
```

编译出的 plan 会剪掉所有被 substitute Candidates 取代的上游 Operations。这是一次新的 Build，
而不是对上一次的续跑。

```bash
pnpm narratage build examples/echo-pro-aroll/reuse-generated.svrun \
  --runtime examples/echo-pro-aroll/svml.runtime.json \
  --package-lock examples/echo-pro-aroll/svml.packages.lock \
  --root . --build-id echo-pro-film-reuse-001 --follow
```

## CLI 参考

```text
narratage lock-packages <lock> --package name [--package name ...] [--root dir]
narratage doctor <runtime.json>
narratage gc <runtime.json> [--apply]
narratage check <source> [--package-lock file] [--root dir]
narratage plan <run-source> [--package-lock file] [--root dir]
narratage build <run-source> --runtime profile [--build-id id] [--follow]
narratage status <build-id> --runtime profile
narratage builds --runtime profile
narratage inspect <build-id> --runtime profile
narratage get <build-id> --runtime profile [--name x|--record x|--output x|--artifact x] [--to path]
narratage cancel <build-id> --runtime profile
```

## 下一步

- [开发指南](./guide/develop.md) —— 仓库结构、包架构、扩展模式。
