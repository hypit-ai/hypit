---
title: Run Source 与 Build
description: 声明 Build 目标、复用结果以及配置运行时环境。
---

# Run Source 与 Build

Author Source 定义视频本身。Run Source 从中挑选最终目标，以及是否用明确的 Candidate 来满足它们。
官方 Distribution 提供 Local Runtime；它的 Profile 声明执行这份计划可用的凭据、Provider Endpoint 与服务。

先为项目选择一次 Runtime：

```bash
hypit runtime use hypit.runtime.json
```

日常制作只需要这条短路径：

```bash
hypit plan build.svrun
hypit build build.svrun --follow
hypit get <build-id> --output final.video --to output/final.mp4
```

快速开始只需全局安装一次 Distribution。此后本页所有命令都直接写作 `hypit`，在任何独立视频项目中都一样。

只有 `build` 会真正提交工作。`plan` 是普通预览；`check` 用于编辑源码，`doctor` 用于配置和排查部署。它们都安全，但不是每次 Build 前必须重复的仪式。

当项目包含多份 Author、Recipe 和 Run Source 时，一种顺手的目录约定是：

```text
my-video/
  package.json              项目边界
  authors/
    main.svml               一份 Author 入口
    alternate.svml          确有需要时的另一份 Author 入口
  recipes/
    visual.svs              视觉 Recipe
    generation.svs          生成 Recipe
  runs/
    images.svrun            一种执行意图
    takes.svrun             另一种执行意图
    final.svrun             最终交付意图
  assets/                   项目自己的输入素材
  kits/                     可选的项目内 Recipe Kit
  packages/                 可选的项目本地 Author 包
  output/                   显式导出给人或其他工具的副本
  hypit.runtime.json        执行环境
  hypit.results.json        可选的 Result 仓库选择
  .hypit/                   自动产生的本地 Runtime 与 Result 数据
```

这只是方便人整理内容的推荐，绝不是强制的项目格式。小项目可以把多份 `.svml`、`.svs` 和
`.svrun` 直接平铺在根目录，其他项目也可以采用不同分组。Hypit 只服从 Source import、
`<author source="…">`、CLI 参数和 `get --to` 中明确写出的路径，不要求这些名字，也不会特殊识别
`authors/`、`recipes/`、`runs/`、`assets/` 或 `output/`。每份 Run 选择一份 Author 入口，而这份
Author Source 的闭包可以显式导入多份 Author 或 Recipe Source。受管理的 Result 仓库与它们分开，
零配置时仍位于 `.hypit/results`。

Run Source 与 Runtime Profile 不会悄悄改写视频。创作性的模型选择仍然留在 Author Source，或它显式导入的包里。

## Run Source 语法

每个 `.svrun` 文件都以其处理指令开头：

```svml
<?svml using="@hypit/run-markup@1"?>
```

### 最简 Run Source

```svml
<?svml using="@hypit/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
</svrun>
```

| 元素 | 说明 |
|---|---|
| `<svrun>` | 根元素，唯一属性是 `version="1"` |
| `<author>` | 必需。`source` 指向 `.svml` Author Source |
| `<target>` | 一个需要得到的公开 Logical Output |

### Target

Target 表达这次 Build 的最终意图，通常是成片或另一个真正的交付物；它不是“要保存哪些东西”的列表。编译器只执行通向 Target 的路线，而这条路上真正完成的每个公开 Author Output 都会自动进入同一个 Build Result。内部 Operation 值不进入 Result。

### 多个 Target

可以在一次 Build 中请求多个输出：

```svml
<target output="final.video"/>
<target output="captions.track"/>
```

只有一次执行确实存在多个最终目标时才写多个 Target。不同运行意图写成不同的 `.svrun` 文件即可，它们可以共同指向同一个 Author Source。

## 复用结果

Hypit 没有隐式缓存。复用结果是显式的运行图编写：把某个旧 Build Result 里的一个具名 Output 声明为零输入 Candidate，再通过 Satisfaction 边连接到当前输出。

生成图片或 Take 一完成，就能在下一份 `.svrun` 中用 `build-record` 与 `satisfy` 显式复用，并在启动付费下游工作前检查 plan。

```svml
<?svml using="@hypit/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>

  <build-record id="hook-video"
    build="bld_20260902T142031123Z_0123456789" output="hook-take.video"/>
  <build-record id="meeting-video"
    build="bld_20260902T142031123Z_0123456789" output="meeting-take.video"/>
  <build-record id="evidence-video"
    build="bld_20260902T142031123Z_0123456789" output="evidence-take.video"/>
  <build-record id="payoff-video"
    build="bld_20260902T142031123Z_0123456789" output="payoff-take.video"/>

  <satisfy output="hook-take.video" candidate="hook-video"/>
  <satisfy output="meeting-take.video" candidate="meeting-video"/>
  <satisfy output="evidence-take.video" candidate="evidence-video"/>
  <satisfy output="payoff-take.video" candidate="payoff-video"/>
</svrun>
```

### 查找可复用输出

按照输出在项目本地 Build Result 中的名字查询：

```bash
hypit history hook-take.video
```

`history` 只查询明确给出的那个公开 Author Output。只声明但没有运行出来的输出和内部 Operation 值不会混入结果。如果忘了旧名字，先浏览 Build，再检查可能的 Result：

```bash
hypit builds
hypit inspect <build-id>
```

输出名是某个 Build Result 内供人查找的名字；`build + output` 这对地址已经足够精确。假如当前源码把 `hook-take.video` 改名为 `opening-shot.video`，`<build-record>` 仍写历史旧名，`<satisfy>` 写当前新名：

```svml
<build-record id="approved-opening"
  build="bld_20260902T110000001Z_0000000001" output="hook-take.video"/>
<satisfy output="opening-shot.video" candidate="approved-opening"/>
```

Hypit 永远不会猜测两个名字代表同一份作者意图。每次执行 `build` 都会得到新的 Build id 和独立 Result 目录，即使源码完全没变。后续 Run 只有明确写出旧 Build id 与 Output 时才复用；若旧 Output 本身继续转发到更老的 Result，就沿显式关系向前解析，不把文件复制进新 Result。
转发只适用于完整的公开 Output；结构化 JSON 不能在内部递归指向另一个 Output。历史值若只是新 Fragment 的一项输入，Fragment 产生的新 Output 仍属于当前 Result。

### build-record

声明一个由先前 Build Result 的具名 Output 支持的零输入 Candidate：

| 属性 | 说明 |
|---|---|
| `id` | 此 Run Source 内的本地 Candidate 标识符 |
| `build` | 先前 Build 自动分配的 id |
| `output` | 该 Build Result 中的公开 Output 名 |

### satisfy

将 Candidate 连接到逻辑输出：

| 属性 | 说明 |
|---|---|
| `output` | 要满足的逻辑输出 |
| `candidate` | Candidate 标识符（来自 `build-record`） |

Planner 会同时读取完整 Author Graph 与 Run Graph：裁剪所选 Candidate 替代掉的默认 Operation，同时保留该 Candidate 自身仍然消费的 Author Output。这是一次新的 Build，而非旧 Build 的延续。下游处理（归一化、WhisperX、字幕生成、渲染）仍然会对复用的媒体执行。

Core 不再给 Candidate 标注 `exact` 或 `substitute`。选择 Candidate 本身就是这次运行的明确实现决定。系统校验类型兼容性，但不猜测创作等价性，也不把这种判断作为冗余元信息沿整条图传播。

### 使用已有文件

本地文件就是最简单的零输入 Candidate：

```svml
<file id="approved-opening" type="@hypit/artifact@1#BlobArtifact" from="./approved-opening.mp4" media-type="video/mp4"/>
<satisfy output="opening-shot.video" candidate="approved-opening"/>
```

文件相对于 `.svrun` 读取。如果它在 Target 路线上成为已经完成的公开 Output，就像生成媒体一样写入 Build Result。系统没有隐式历史查找；黑场、预览图与人工交付的产物也使用同一个机制。

## Runtime Profile

官方视频 Distribution 已经选择 Local Runtime。它的 Profile 通过逻辑 `use` 名称选择 Credential
Store 与 Endpoint，并配置 Endpoint 容量等部署参数；它不选择 Runtime Host，也不定义 Source
Workspace、Author 包或项目 Result Repository。

```bash
hypit runtime init
hypit paths
```

`runtime init` 会写入视频 Distribution 提供的起始 `hypit.runtime.json` 并完成选择。它不覆盖
已有文件，不安装任何东西、不连接服务，也不启动 Worker。项目已有明确 Profile 时，使用
`hypit runtime use <profile>`；该命令只写入 `.hypit/runtime`。

`runtime use` 只写入 `.hypit/runtime`，不会启动 Worker、创建 Runtime 数据或修改已安装
包。Profile 结构和完整边界见 [Runtime](../guide/runtime.md)。
CLI 必须先确定项目：显式 `--workspace` 直接给出边界；否则使用当前目录向上的最近
`package.json`，普通创作目录没有该文件时就以当前目录为边界。随后只读取这个项目自己的
`.hypit/runtime`。它不会按约定文件名猜 Profile，也不会从父目录继承另一个项目的选择。
## 配置所选凭据

`check` 与 `plan` 不会请求在线 Provider。没有所选 Runtime 的 `plan` 只看图，不需要部署
凭据；有 Runtime 时，便宜预检会检查本次 Plan 所需凭据是否存在。在运行 `doctor` 或付费/
外部 `build` 之前，只配置当前 Runtime Profile 实际引用的环境变量：

| 变量 | Provider / 用途 |
|---|---|
| HypiHub OAuth | HypiHub 付费生成、Gemini VLM 与 WhisperX 对齐；运行 `hypit auth login hypihub.default --runtime hypit.runtime.json` 并在 https://hypit.ai 登录 |
| `KIE_API_KEY` | 仅在显式选择 KIE Provider 时使用 |
| `MIMO_API_KEY` | Xiaomi MiMo VoiceDesign；只有明确选择官方 Endpoint 时才需要 |

只执行 Profile 中所选 Endpoint 对应的行。在 macOS/Linux Shell 中：

```bash
read -r -s HYPIHUB_API_KEY
export HYPIHUB_API_KEY
read -r -s KIE_API_KEY
export KIE_API_KEY
read -r -s MIMO_API_KEY
export MIMO_API_KEY
```

在 Windows PowerShell 中：

```powershell
$env:HYPIHUB_API_KEY = "your-key"
$env:KIE_API_KEY = "your-key"
$env:MIMO_API_KEY = "your-key"
```

不要把凭据写进 Author Source、Run Source、Runtime Profile 源文件或提交内容。`doctor` 会验证所需凭据是否存在，但不会打印秘密值。

## Build 工作流

不要提交凭据、生成媒体、Runtime 状态/数据库或日志。

### 0. 准备按需依赖

普通用户不运行 `pnpm install`。`runtime up` 会读取所选 Runtime Profile，把其 Adapter
声明的上游 npm 包安装到机器共享目录，并准备外部程序。只有 Profile 选择 WhisperX、OpenCV
等本地 Python 程序时，才需要先安装 [`uv`](https://docs.astral.sh/uv/)。

作者侧缺少 Fontsource 等上游包时，`check`/`plan` 会给出精确命令，例如：

```bash
hypit packages install @fontsource-variable/inter@5.3.0
```

`hypit runtime up` 管理依赖、后台 Worker 和外部程序；`build` 不做部署准备。

#### 把正式视频项目放在 Hypit 仓库之外

作者文件不必位于本仓库之下。例如，项目放在 `/work/my-film`，同时复用
`/opt/hypit` 中已安装的包：

```bash
cd /work/my-film

hypit runtime use hypit.runtime.json
hypit plan build.svrun
```

Workspace 在 Runtime Profile 之前确定；显式 `--workspace` 可以覆盖它，入口 Source 路径和
Runtime 选择都无权改变这条源码边界。`--package-root` 只定位已经安装的
`node_modules`；`--asset-root` 只额外授权读取素材字节。

外部项目通常应提交如下 `.gitignore`：

```text
.hypit/
output/
```

每次 Build 的权威结果位于 `.hypit/results/<UTC-date>/<build-id>/`：`result.json` 记录名字、状态、Target
和公开 Output，媒体在 `files/`，结构化值在 `values/`。

这是无需配置的默认 Result 仓库。项目根的 `hypit.results.json` 也可以选择 `@hypit/build-result-s3`；历史命令
与 `.svrun` 中的 `build-record` 会使用同一个仓库。活跃 Build 的临时 Resource 仍由 Runtime 在本地
私有管理。

`status`、`builds` 等只读归档命令不会在状态尚不存在时初始化 Runtime 数据库。

共享只读素材库不必复制进项目，也不必放宽 Source 边界：

```bash
hypit plan /work/my-film/build.svrun --asset-root /work/shared-media
```

`--asset-root` 可重复使用，只授权读取素材字节，不允许从那里导入 `.svml/.svs` 源码。该 Host
选项不进入作者或 Build 身份；真正进入图的是由该文件形成的显式 Resource 值。

Runtime Profile 只选择 Credential Store、Endpoint 及其封闭配置。完整结构只在
[Runtime](../guide/runtime.md) 维护，不在 Quickstart 复制第二份。

### 1. 选择 Runtime

```bash
cd examples/talking-head-aroll
hypit runtime use hypit.runtime.json
```

Author/Run Source 通过 import 选择作者包；官方视频 Distribution 已经选择 Local Runtime，Profile
只通过 `use` 选择 Credential Store 与 Endpoint。安装、版本与完整性由 npm 或 pnpm 负责。

### 2. 诊断环境

```bash
hypit doctor
```

Doctor 总会校验项目选择的 Result Repository；存在已选或显式传入的 Runtime Profile 时，还会校验全部
Runtime 角色、Endpoint 配置、凭据是否存在和有界环境探测。它不启动 Worker，也不发付费请求。

存在 Profile 时，`doctor` 有意检查完整 Runtime Profile。若只想检查某次 Run 真正需要的环境，请使用带
所选 Runtime 的 `plan`。未就绪会写入 `preflight` 并令命令非零退出，但 JSON 中仍保留
冻结计划供检查。

### 3. 检查 Source 与计划

```bash
hypit check main.svml
```

```bash
hypit plan build.svrun
```

在花费资金之前审查冻结的 BuildPlan。该计划展示调度器将发出的每个 Operation 和 Needs；选择
Runtime 后只预检这次计划真正需要的 Endpoint、凭据和外部程序，不启动任何外部工作。

`plan` 可以完全不带 Runtime；执行过 `hypit runtime use` 后，`plan` 和 `build` 都不必再写
`--runtime`。`build` 必须能找到所选或显式 Profile。

选择或改变 Profile 后，用 `runtime up` 安装所选上游依赖、准备本地 Managed Program 并启动
本地 Worker。它不会启动或探测远程 Endpoint；需要主动只读检查远程能力时使用 `doctor`。
`build` 只重跑便宜的只读预检；任何依赖或 Program 未就绪都会在提交前失败，绝不在 Build
中准备它们。若部署已经准备完毕而只有 Worker 停止，`build` 会在耐久提交前启动该 Worker。
`runtime status` 用于观察，`programs up|status|down` 只管理外部程序。

### 4. 提交 Build

```bash
hypit build build.svrun --title first-cut --follow
```

不带 `--follow` 时，Build 在耐久提交后退出，后台 Worker 继续。带 `--follow` 时终端也只是观察者，并会报告 phase / Operation 数量变化；Ctrl-C 不会取消任务。

任何时候都可以重新接入观察：

```bash
hypit status <build-id> --watch
```

普通的 `status <build-id>` 只打印一次快照。`status --watch` 会在 Result 得到 outcome 时退出；脚本需要限制等待时间时可以加 `--max-wait-ms`。

| 标志 | 说明 |
|---|---|
| `--runtime` | 单次命令的 Runtime Profile 覆盖；通常用 `runtime use` 选择一次即可 |
| `--package-root` | 存放已安装包的 Host 目录 |
| `--workspace` | 显式 Source Workspace 覆盖项 |
| `--title` | 给这次 Result 一个供人阅读的标题 |
| `--follow` | 将 Build 进度流式输出到终端 |

每次执行都会创建新的 Build id，即使 Author Source 和 Run Source 完全没变。这是非确定性生成
所要求的边界：跨 Build 复用只能由 Run Source 里的显式 Candidate 决定。一次 Build 提交后
处于活跃状态时具有耐久性；Worker 重启会继续它已经接受的执行事实和同一外部任务，但不会让
另一次命令变成这个 Build。

### 5. 检查并获取结果

```bash
hypit inspect <build-id>
```

`inspect` 直接读取项目里的 Build Result，列出最终 Target 和一页实际完成的公开 Output；用
`--output <name>` 精确查看一个 Output，或用 `--limit <count>` 增加显示数量：

```bash
hypit get <build-id> \
  --output final.video \
  --to examples/talking-head-aroll/output/final.mp4
```

`get` 把一个精确的 `build + output` 地址导出到必填的 `--to` 目的地。Scalar 写成 JSON 文件；
Resource 原样写成一个文件；Composite 写成一个自足目录，其中 `value.json` 保存它的 Composite 值
文档，被引用的 Resource 则按 Result 内的相对路径一起写入。目的地必须尚不存在。

历史转发会透明地沿显式关系找到更早的 Result。这个过程不会创建 Build、修改 Result，或把
副本写回 Result 仓库，也不需要 Runtime Profile。查看 Output 用 `inspect`；`get` 只负责显式
本地导出。Build 的最终输出会为每个文件 Target 打印精确的 `get --output …` 命令。

### 6. 在新 Build 中复用

创建一个引用已完成 Build Output 的新 `.svrun` 文件（参见上文 [复用结果](#复用结果)），然后提交：

```bash
hypit build reuse-generated.svrun --follow
```

### 7. 诊断或停止本地 Runtime

```bash
hypit runtime logs
hypit runtime down
```

`runtime down` 只会让 Worker 停止领取新 Build，并保留外部程序；只有确实要停掉这些程序时
才执行 `programs down`。两条命令都不会取消耐久 Build 或远程 Provider 工作。再次启动同一
Profile 后，会从已经接受的执行事实继续推进其中的活跃 Build。
