---
title: Run Source 与 Build
description: 声明 Build 目标、复用结果以及配置运行时环境。
---

# Run Source 与 Build

Author Source 定义视频本身。Run Source 从中挑选要产出哪些公开输出，以及是否用明确的 Candidate 来满足它们。Runtime Profile 则选择执行这份计划的机器、Store 与 Provider endpoint。

先为项目选择一次 Runtime：

```bash
hypit runtime use hypit.runtime.json
```

日常制作只需要这条短路径：

```bash
hypit plan build.svrun
hypit build build.svrun --follow
hypit get <build-id> --name final.video --to output/final.mp4
```

快速开始只需全局安装一次 Distribution。此后本页所有命令都直接写作 `hypit`，在任何独立视频项目中都一样。

只有 `build` 会真正提交工作。`plan` 是普通预览；`check` 用于编辑源码，`doctor` 用于配置和排查部署。它们都安全，但不是每次 Build 前必须重复的仪式。

```text
main.svml          作者意图
build.svrun        本次 Run 的 Target 与 Candidate 选择
hypit.runtime.json  执行环境
```

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

Target 就是你希望这次 Build 产出的东西。它可以是一张生成的图片、一个视频镜头、一份时序映射、一条 Track，或者最终成片。编译器只执行选定 Target 所需的 Operation；无关的分支不会被触碰。

### 多个 Target

可以在一次 Build 中请求多个输出：

```svml
<target output="final.video"/>
<target output="captions.track"/>
```

不同的运行意图写成不同的 `.svrun` 文件即可，它们可以共同指向同一个 Author Source。例如 `images.svrun` 只请求图片，`film.svrun` 请求最终视频，无需在文件内部再造一层集合。

## 复用结果

Hypit 没有隐式缓存。复用结果是显式的运行图编写——你将历史 Record 声明为零输入 Candidate，并通过 Satisfaction 边将它们连接起来。

生成图片或 Take 一经验收，就在下一份 `.svrun` 中用 `build-record` 与 `satisfy` 显式复用，并在启动付费下游工作前检查冻结 plan。Core 没有 Pin 状态或 fidelity 标签。

```svml
<?svml using="@hypit/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>

  <build-record id="hook-video"
    build="bld_01234567-89ab-cdef-0123-456789abcdef" output="hook-take.video"/>
  <build-record id="meeting-video"
    build="bld_01234567-89ab-cdef-0123-456789abcdef" output="meeting-take.video"/>
  <build-record id="evidence-video"
    build="bld_01234567-89ab-cdef-0123-456789abcdef" output="evidence-take.video"/>
  <build-record id="payoff-video"
    build="bld_01234567-89ab-cdef-0123-456789abcdef" output="payoff-take.video"/>

  <satisfy output="hook-take.video" candidate="hook-video"/>
  <satisfy output="meeting-take.video" candidate="meeting-video"/>
  <satisfy output="evidence-take.video" candidate="evidence-video"/>
  <satisfy output="payoff-take.video" candidate="payoff-video"/>
</svrun>
```

### 查找可复用输出

按照输出在各个历史 Build 冻结 Catalog 中的旧名字查询：

```bash
hypit history hook-take.video
```

`history` 只列出该 Build 确实产出过的公开 Logical Output。仅仅在源码中声明但没有运行出来的别名，以及不能作为 `build-record` Candidate 的 authored Record 别名，都不会混入结果。如果忘了旧名字，可以按 Catalog 当时记录的精确源码路径列出真正验收过的输出名：

```bash
hypit history --source ./main.svml
```

输出名只是某个不可变历史 Catalog 内供人查找的名字，不是产物身份。真正身份由历史 Core
Build、Logical Output 和 Record 摘要共同确定。假如当前源码把 `hook-take.video` 改名为
`opening-shot.video`，`<build-record>` 仍写历史旧名，`<satisfy>` 写当前新名：

```svml
<build-record id="approved-opening"
  build="bld_01234567-89ab-cdef-0123-456789abcdef" output="hook-take.video"/>
<satisfy output="opening-shot.video" candidate="approved-opening"/>
```

Hypit 永远不会猜测两个名字代表同一份作者意图。每次执行 `build` 都会得到一个新的
Build id，由 CLI 打印并由 Runtime 归档。源码身份绝不会重新认领旧 Build；后续 Run 只有在
这里明确写出历史 Build id 时，才会复用它已经接受的结果。

### build-record

声明一个由先前 Build 的历史 Record 支持的零输入 Candidate：

| 属性 | 说明 |
|---|---|
| `id` | 此 Run Source 内的本地 Candidate 标识符 |
| `build` | 先前 Build 自动分配的 id |
| `output` | 该 Build 中的逻辑输出名 |

### satisfy

将 Candidate 连接到逻辑输出：

| 属性 | 说明 |
|---|---|
| `output` | 要满足的逻辑输出 |
| `candidate` | Candidate 标识符（来自 `build-record`） |

编译后的计划会裁剪所选 Candidate 取代的上游 Operation。这是一次新的 Build，而非旧 Build 的延续。下游处理（归一化、WhisperX、字幕生成、渲染）仍然会对复用的媒体执行。

Core 不再给 Candidate 标注 `exact` 或 `substitute`。选择 Candidate 本身就是这次运行的明确实现决定。系统校验类型兼容性，但不猜测创作等价性，也不把这种判断作为冗余元信息沿整条图传播。

### 使用已有文件

本地文件就是最简单的零输入 Candidate：

```svml
<file id="approved-opening" type="@hypit/artifact@1#BlobArtifact" from="./approved-opening.mp4" media-type="video/mp4"/>
<satisfy output="opening-shot.video" candidate="approved-opening"/>
```

文件相对于 `.svrun` 读取，按内容寻址，并随 Build 归档。系统没有额外的 Pin 状态、文件名缓存或隐式历史查找；黑场、预览图与人工交付的产物也使用同一个机制。

## Runtime Profile

Runtime Profile 选择 Build 在哪里执行。它通过逻辑 `use` 名称选择包、创建具名
Infrastructure 实例，再把实例暴露的 part 分配给 Runtime role，并配置 Provider endpoint 与
容量。Profile 不定义 Source Workspace 或 Author 包选择。

```bash
hypit runtime use hypit.runtime.json
hypit paths
```

`runtime use` 只写入 `.hypit/runtime`，不会启动 Worker、创建 Runtime 数据或修改已安装
包。Profile 结构和完整边界见 [Runtime](../guide/runtime.md)。
## 配置所选凭据

`check` 与 `plan` 不会请求在线 Provider。没有所选 Runtime 的 `plan` 只看图，不需要部署
凭据；有 Runtime 时，便宜预检会检查本次 Plan 所需凭据是否存在。在运行 `doctor` 或付费/
外部 `build` 之前，只配置当前 Runtime Profile 实际引用的环境变量：

| 变量 | Provider / 用途 |
|---|---|
| HypiHub OAuth | HypiHub 付费生成与 Gemini VLM；运行 `hypit auth login hypihub.default --runtime hypit.runtime.json` 并在 https://hypit.ai 登录 |
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

Workspace 依次取显式 `--workspace`、所选 `.hypit/runtime` 所在项目和入口 Source 目录。
Runtime Profile 无权改变这条源码边界。`--package-root` 只定位已经安装的
`node_modules`；`--asset-root` 只额外授权读取素材字节。

外部项目通常应提交如下 `.gitignore`：

```text
.hypit/
output/
```

`status`、`builds` 等只读归档命令不会在状态尚不存在时初始化 Runtime 数据库。

共享只读素材库不必复制进项目，也不必放宽 Source 边界：

```bash
hypit plan /work/my-film/build.svrun --asset-root /work/shared-media
```

`--asset-root` 可重复使用，只授权读取素材字节，不允许从那里导入 `.svml/.svs` 源码。该 Host
选项不进入作者或 Build 身份；真正进入图的仍是素材内容摘要。

Runtime Profile 只选择 Runtime 包与该 Runtime 的封闭配置。完整结构只在
[Runtime](../guide/runtime.md) 维护，不在 Quickstart 复制第二份。

### 1. 选择 Runtime

```bash
cd examples/talking-head-aroll
hypit runtime use hypit.runtime.json
```

Author/Run Source 通过 import 选择作者包，Runtime Profile 通过 `use` 选择环境包；安装、版本
与完整性由 npm 或 pnpm 负责，不再需要同步另一份包库存。

### 2. 诊断环境

```bash
hypit doctor
```

Doctor 校验全部显式 Runtime 角色、Endpoint 配置、凭据是否存在和有界环境探测；它不启动 Worker，也不发付费请求。

`doctor` 有意检查完整 Runtime Profile。若只想检查某次 Run 真正需要的环境，请使用带
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

提交前用 `runtime up` 安装所选上游依赖、准备 Managed Program 并启动 Worker。`build` 只重跑
便宜的只读预检；任何依赖未就绪都会在提交前失败，绝不在 Build 中安装或启动它。`runtime
status` 用于观察，`programs up|status|down` 只管理外部程序。

### 4. 提交 Build

```bash
hypit build build.svrun --follow
```

不带 `--follow` 时，Build 在耐久提交后退出，后台 Worker 继续。带 `--follow` 时终端也只是观察者，并会报告 phase / Operation 数量变化；Ctrl-C 不会取消任务。

任何时候都可以重新接入观察：

```bash
hypit status <build-id> --watch
```

普通的 `status <build-id>` 只打印一次快照。`status --watch` 会在 Build 进入终态时退出；脚本需要限制等待时间时可以加 `--max-wait-ms`。

| 标志 | 说明 |
|---|---|
| `--runtime` | 单次命令的 Runtime Profile 覆盖；通常用 `runtime use` 选择一次即可 |
| `--package-root` | 存放已安装包的 Host 目录 |
| `--workspace` | 显式 Source Workspace 覆盖项 |
| `--follow` | 将 Build 进度流式输出到终端 |

每次执行都会创建新的 Build id，即使 Author Source 和 Run Source 完全没变。这是非确定性生成
所要求的边界：跨 Build 复用只能由 Run Source 里的显式 Candidate 决定。一次 Build 提交后
具有耐久性；Worker 重启会继续它已经接受的 Record 和同一外部任务的 checkpoint，但不会让
另一次命令变成这个 Build。

### 5. 检查并获取结果

```bash
hypit inspect <build-id>
```

`inspect` 会显示耐久 Build 状态、所需输出与已接受的 Record。确认这些事实正确后，再获取所选归档 Artifact：

```bash
hypit get <build-id> \
  --name final.video \
  --to examples/talking-head-aroll/output/final.mp4
```

每个被接受的中间 Record 和 Artifact 在 Build 完成前都会被归档。`get` 会复制一份已持久化的
Record。Blob Artifact 会从所选 Store 流式读取，逐步校验长度与 SHA-256，完整通过后才原子替换目标路径；导出大 MP4 不会把整段视频塞进 CLI 内存。
Build 的最终输出会为每个目标别名打印精确的 `get --name …` 命令，不必为了导出
`final.video` 去查不透明的 Record id。

### 6. 在新 Build 中复用

创建一个引用已完成 Build 的 Record 的新 `.svrun` 文件（参见上文 [复用结果](#复用结果)），然后提交：

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
Profile 后，会继续其中尚未完成的 dispatch。
