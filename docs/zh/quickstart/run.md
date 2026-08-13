---
title: Run Source 与 Build
description: 声明 Build 目标、复用结果以及配置运行时环境。
---

# Run Source 与 Build

Author Source 定义视频本身。Run Source 从中挑选要产出哪些公开输出，以及是否用明确的 Candidate 来满足它们。Runtime Profile 则选择执行这份计划的机器、Store 与 Provider endpoint。

包选择变化后，只需同步一次包信任：

```bash
narratage packages sync build.svrun --runtime svml.runtime.json
```

日常制作只需要这条短路径：

```bash
narratage plan build.svrun --runtime svml.runtime.json
narratage build build.svrun --runtime svml.runtime.json --build-id my-video-001 --follow
narratage get my-video-001 --runtime svml.runtime.json --name final.video --to output/final.mp4
```

仓库内的源码启动器是 `/path/to/narratage/narratage`；本页写作 `narratage` 的命令，指的是这个启动器，或将来安装好的 CLI。

只有 `build` 会真正提交工作。`plan` 是普通预览；`check` 用于编辑源码，`doctor` 用于配置和排查部署。它们都安全，但不是每次 Build 前必须重复的仪式。

```text
main.svml          作者意图
build.svrun        本次 Run 的 Target 与 Candidate 选择
svml.runtime.json  执行环境
```

Run Source 与 Runtime Profile 不会悄悄改写视频。创作性的模型选择仍然留在 Author Source，或它显式导入的包里。

## Run Source 语法

每个 `.svrun` 文件都以其处理指令开头：

```svml
<?svml using="@narratage/run-markup@1"?>
```

### 最简 Run Source

```svml
<?svml using="@narratage/run-markup@1"?>

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

Narratage 没有隐式缓存。复用结果是显式的运行图编写——你将历史 Record 声明为零输入 Candidate，并通过 Satisfaction 边将它们连接起来。

生成图片或 Take 一经验收，就在下一份 `.svrun` 中用 `build-record` 与 `satisfy` 显式复用，并在启动付费下游工作前检查冻结 plan。Core 没有 Pin 状态或 fidelity 标签。

```svml
<?svml using="@narratage/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>

  <build-record id="hook-video"
    build="my-film-001" output="hook-take.video"/>
  <build-record id="meeting-video"
    build="my-film-001" output="meeting-take.video"/>
  <build-record id="evidence-video"
    build="my-film-001" output="evidence-take.video"/>
  <build-record id="payoff-video"
    build="my-film-001" output="payoff-take.video"/>

  <satisfy output="hook-take.video" candidate="hook-video"/>
  <satisfy output="meeting-take.video" candidate="meeting-video"/>
  <satisfy output="evidence-take.video" candidate="evidence-video"/>
  <satisfy output="payoff-take.video" candidate="payoff-video"/>
</svrun>
```

### 查找可复用输出

按照输出在各个历史 Build 冻结 Catalog 中的旧名字查询：

```bash
node --run narratage -- history hook-take.video \
  --runtime ./svml.runtime.json
```

`history` 只列出该 Build 确实产出过的公开 Logical Output。仅仅在源码中声明但没有运行出来的别名，以及不能作为 `build-record` Candidate 的 authored Record 别名，都不会混入结果。如果忘了旧名字，可以按 Catalog 当时记录的精确源码路径列出真正验收过的输出名：

```bash
node --run narratage -- history --source ./main.svml \
  --runtime ./svml.runtime.json
```

输出名只是某个不可变历史 Catalog 内供人查找的名字，不是产物身份。真正身份由历史 Core
Build、Logical Output 和 Record 摘要共同确定。假如当前源码把 `hook-take.video` 改名为
`opening-shot.video`，`<build-record>` 仍写历史旧名，`<satisfy>` 写当前新名：

```svml
<build-record id="approved-opening"
  build="my-film-001" output="hook-take.video"/>
<satisfy output="opening-shot.video" candidate="approved-opening"/>
```

Narratage 永远不会猜测两个名字代表同一份作者意图。`my-film-001` 这样的可读 build-id 由
`build --build-id` 提供；省略时使用不可变的编译后 Core Build 摘要。已经绑定的显式 build-id
不能再用于另一份作者意图或运行意图。

### build-record

声明一个由先前 Build 的历史 Record 支持的零输入 Candidate：

| 属性 | 说明 |
|---|---|
| `id` | 此 Run Source 内的本地 Candidate 标识符 |
| `build` | 先前 Build 的 build-id |
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
<file id="approved-opening" type="@narratage/artifact@1#BlobArtifact" from="./approved-opening.mp4" media-type="video/mp4"/>
<satisfy output="opening-shot.video" candidate="approved-opening"/>
```

文件相对于 `.svrun` 读取，按内容寻址，并随 Build 归档。系统没有额外的 Pin 状态、文件名缓存或隐式历史查找；黑场、预览图与人工交付的产物也使用同一个机制。

## Runtime Profile

Runtime Profile（`svml.runtime.json`）告诉系统**在哪里**执行每种类型的工作：

官方 video Distribution 目前按 JSON 解析这份文档；CLI 根据命令把它交给 Distribution，
不会根据文件后缀赋予语义。嵌入 Narratage 的应用可以通过 `@narratage/local` 直接组装
相同的 Runtime 角色。完整说明见
[Runtime Profile 指南](../guide/runtime-profile.md)。

```json
{
  "format": "svml.runtime-config@1",
  "packageLock": "./svml.packages.lock",
  "runtimePackageLock": "./svml.runtime-packages.lock",
  "runtimeServices": [
    { "use": "@narratage/local", "instance": "execution" },
    { "use": "@narratage/store-sqlite", "instance": "state", "config": { "path": ".svml/runtime.sqlite" } },
    { "use": "@narratage/artifact-store-fs", "instance": "artifacts", "config": { "path": ".svml/artifacts" } },
    { "use": "@narratage/credential-store-env", "instance": "credentials.env", "config": {} }
  ],
  "services": {
    "scheduler": "execution.scheduler",
    "worker": "execution.worker",
    "stores": {
      "build": "state.builds",
      "operations": "state.operations",
      "dispatch": "state.dispatch",
      "artifacts": "artifacts",
      "credentials": ["credentials.env"]
    }
  },
  "endpoints": [
    {
      "use": "@narratage/provider-kie",
      "instance": "kie.main",
      "config": {
        "apiKey": { "store": "env", "key": "KIE_API_KEY" },
        "defaultConcurrency": 2
      }
    },
    {
      "use": "@narratage/provider-media-local",
      "instance": "media.main",
      "config": { "defaultConcurrency": 2 }
    },
    {
      "use": "@narratage/provider-whisperx-local",
      "instance": "whisperx.main",
      "config": { "defaultConcurrency": 1 }
    },
    {
      "use": "@narratage/provider-google-vertex",
      "instance": "vertex.main",
      "config": {
        "projectEnv": "GOOGLE_CLOUD_PROJECT",
        "credentials": { "store": "env", "key": "GOOGLE_APPLICATION_CREDENTIALS_JSON" },
        "location": "global",
        "defaultConcurrency": 1
      }
    },
    {
      "use": "@narratage/provider-hyperframes-local",
      "instance": "hyperframes.main",
      "config": {
        "workers": 2,
        "quality": "standard",
        "defaultConcurrency": 1
      }
    }
  ],
  "scheduling": { "maxConcurrency": 4 }
}
```

### Endpoint

每个 endpoint 将一个 Provider 包绑定到命名实例与显式的 Provider Authority：

| 字段 | 说明 |
|---|---|
| `use` | Provider 包名（例如 `@narratage/provider-kie`） |
| `instance` | 唯一的实例标识符 |
| `authority` | 可选的共享账号或计算池标识；实例独享容量时省略即可 |
| `config` | Provider 专属非秘密配置、CredentialRef 与并发数 |

### 信任边界

Runtime 包目前作为可信本地代码执行。开放任意第三方 Runtime 包之前，需要真正的进程或
Wasm 隔离；字符串 allowlist 不能限制同一 Node 进程里的代码。

### 调度

`maxConcurrency` 限制总的并行 Operation 数。Provider 会贡献一个 Authority 资源和一个精确
Capability Route 资源，二者由 Store 原子获取；可选的 `resources` 只按不透明资源 id 覆盖容量。

## 配置所选凭据

`check` 与 `plan` 不会请求在线 Provider，因此不需要 API key。在运行 `doctor` 或付费/外部
`build` 之前，只配置当前 Runtime Profile 实际引用的环境变量：

| 变量 | Provider / 用途 |
|---|---|
| `KIE_API_KEY` | KIE 模型，包括 Seedance 与 GPT Image |
| `GOOGLE_CLOUD_PROJECT` | 已启用 Vertex AI 的 Google Cloud project |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | 完整的 Vertex 凭据 JSON 内容，而不是文件路径 |
| `MIMO_API_KEY` | Xiaomi MiMo TTS；只有选择该 Endpoint 时才需要 |

只执行 Profile 中所选 Endpoint 对应的行。在 macOS/Linux Shell 中：

```bash
read -r -s KIE_API_KEY
export KIE_API_KEY
read -r -s MIMO_API_KEY
export MIMO_API_KEY
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_APPLICATION_CREDENTIALS_JSON="$(<"$HOME/.config/narratage/google-service-account.json")"
```

在 Windows PowerShell 中：

```powershell
$env:KIE_API_KEY = "your-key"
$env:MIMO_API_KEY = "your-key"
$env:GOOGLE_CLOUD_PROJECT = "your-project-id"
$env:GOOGLE_APPLICATION_CREDENTIALS_JSON = Get-Content -Raw "$HOME\.config\narratage\google-service-account.json"
```

不要把凭据写进 Author Source、Run Source、Runtime Profile 源文件或提交内容。`doctor` 会验证所需凭据是否存在，但不会打印秘密值。

## Build 工作流

不要提交凭据、生成媒体、Runtime 状态/数据库或日志。

### 0. 安装

```bash
pnpm install
```

这条命令只安装 JavaScript 工作区，不会下载 Python 模型，也不会准备仓库内的所有 Provider。
`runtime up` / `services up` 会读取所选 Runtime Profile，只准备其中 Endpoint 声明的外部程序。只有 Profile 选择 WhisperX、OpenCV 等本地 Python 服务时，才需要先安装
[`uv`](https://docs.astral.sh/uv/)；具体锁定环境命令见 Quickstart 首页的 [安装](../quickstart.md#安装)。

`narratage runtime up` 管理后台 Worker 和外部程序；`build` 会确保 Runtime 已运行，但不拥有
Worker。

#### 把正式视频项目放在 Narratage 仓库之外

作者文件不必位于本仓库之下。例如，项目放在 `/work/my-film`，同时复用
`/opt/narratage` 中已安装的包：

```bash
cd /opt/narratage

node --run narratage -- packages sync /work/my-film/build.svrun \
  --runtime /work/my-film/svml.runtime.json

node --run narratage -- plan /work/my-film/build.svrun \
  --runtime /work/my-film/svml.runtime.json
```

选择 Runtime Profile 时，Profile 的 `root`（未写则为 Profile 所在目录）是该项目所有
`.svml`、`.svs`、`.svrun` 的稳定 Source Workspace。没有 Profile 时，若选择了 package lock
就以 lock 所在目录为边界，否则才以入口 Source 所在目录为边界。`--package-root` 是另一项无关的 Host 覆盖项：它只负责指定已安装的
`node_modules`，然后按照 lock 校验包字节。官方 CLI 通常会自动提供自身的安装位置，所以上面的命令无需填写包路径。只有需要主动扩大源码边界时才传 `--root`。不要把外部项目软链接进仓库；canonical path 的边界检查会有意拒绝这种逃逸。

外部项目通常应提交如下 `.gitignore`：

```gitignore
.svml/
output/
```

两份 package lock 属于项目源码，应正常提交。`status`、`builds` 等只读归档命令不会在状态
尚不存在时初始化 Runtime 数据库。

共享只读素材库不必复制进项目，也不必放宽 Source 边界：

```bash
node --run narratage -- plan /work/my-film/build.svrun \
  --runtime /work/my-film/svml.runtime.json \
  --asset-root /work/shared-media
```

`--asset-root` 可重复使用，只授权读取素材字节，不允许从那里导入 `.svml/.svs` 源码。该 Host
选项不进入作者或 Build 身份；真正进入图的仍是素材内容摘要。

官方 CLI 读取外部项目的 Runtime Profile 时也会提供同一个安装位置，因此 Profile 仍可移植：

```json
{
  "format": "svml.runtime-config@1",
  "packageLock": "./svml.packages.lock",
  "runtimePackageLock": "./svml.runtime-packages.lock",
  "runtimeServices": [
    { "use": "@narratage/local", "instance": "execution" },
    { "use": "@narratage/store-sqlite", "instance": "state", "config": { "path": ".svml/runtime.sqlite" } },
    { "use": "@narratage/artifact-store-fs", "instance": "artifacts", "config": { "path": ".svml/artifacts" } },
    { "use": "@narratage/credential-store-env", "instance": "credentials.env", "config": {} }
  ],
  "services": {
    "scheduler": "execution.scheduler",
    "worker": "execution.worker",
    "stores": {
      "build": "state.builds",
      "operations": "state.operations",
      "dispatch": "state.dispatch",
      "artifacts": "artifacts",
      "credentials": ["credentials.env"]
    }
  },
  "endpoints": [],
  "scheduling": { "maxConcurrency": 4 }
}
```

Runtime 状态、归档 Artifact 和 lock 仍全部留在 `/work/my-film`。只有包被有意安装在 CLI
之外时，才使用 `--package-root` 或 Profile 的 `packageRoot` 覆盖位置。

### 1. 同步已安装包

安装或更新包后，用一条显式命令同步两份项目包库存：

```bash
node --run narratage -- packages sync examples/talking-head-aroll/build.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --root .
```

当前 Author/Run Source 选择作者包，Runtime Profile 选择环境包。`packages sync` 只把本次
需要的包加入或刷新到库存，不会删除其他 Run 所需的包；明确删除请使用
`lock-packages --remove`。编译只激活当前 Source 的精确子集。该命令不扫描目录、不启动
Provider，也不生成媒体。

### 2. 诊断环境

```bash
node --run narratage -- doctor examples/talking-head-aroll/svml.runtime.json
```

Doctor 校验两份 lock、全部显式 Runtime 角色、Endpoint 配置、凭据是否存在和有界环境探测；它不启动 Worker，也不发付费请求。

`doctor` 有意检查完整 Runtime Profile。若只想检查某次 Run 真正需要的环境，请使用带
`--runtime` 的 `plan`。只要计划本身有效，命令就成功；凭据或服务未就绪会写在
`preflight.ok` 中，由 `doctor` 或 `build` 在部署阶段严格处理。

### 3. 检查 Source 与计划

```bash
node --run narratage -- check examples/talking-head-aroll/main.svml \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --root .
```

```bash
node --run narratage -- plan examples/talking-head-aroll/build.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --root .
```

在花费资金之前审查冻结的 BuildPlan。该计划展示调度器将发出的每个 Operation 和 Needs；带
`--runtime` 时只预检这次计划真正需要的 Endpoint、凭据和外部程序，不启动任何外部工作。

`build` 会自动启动或复用后台 Runtime。只有希望提交前预热时才需要显式执行 `runtime up`；
`runtime status` 用于观察。范围更窄的 `services up|status|down` 只管理外部程序，不负责 Worker。

### 4. 提交 Build

```bash
node --run narratage -- build examples/talking-head-aroll/build.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --root . \
  --build-id my-film-001 \
  --follow
```

不带 `--follow` 时，Build 在耐久提交后退出，后台 Worker 继续。带 `--follow` 时终端也只是观察者，并会报告 phase / Operation 数量变化；Ctrl-C 不会取消任务。

| 标志 | 说明 |
|---|---|
| `--runtime` | Runtime Profile 的路径 |
| `--package-lock` | 包锁定文件的路径 |
| `--package-root` | 存放 lock 所列已安装包的 Host 目录 |
| `--root` | 可选的 Source Workspace 覆盖项；未传时依次使用 Runtime Profile 根、package lock 目录或入口 Source 目录 |
| `--build-id` | 用户为此 Build 选择的标识符（用于检索和复用） |
| `--follow` | 将 Build 进度流式输出到终端 |

不传 `--build-id` 时，身份由编译后的作者意图和运行意图派生；重复同一条命令只会寻址同一个耐久 Build，不会偷偷再买一次生成。未完成的 Build 从已验收 Record 和可恢复 Endpoint checkpoint
继续；已完成、失败或取消的 Build 保持终态，只返回状态。相同 prompt 明确需要另一份随机结果时，使用新的显式 id。把已有显式 id 用到另一份编译意图上会被拒绝，并同时提示“换 id”或“恢复原 Source”。

### 5. 检查并获取结果

```bash
node --run narratage -- inspect my-film-001 \
  --runtime examples/talking-head-aroll/svml.runtime.json
```

`inspect` 会显示耐久 Build 状态、所需输出与已接受的 Record。确认这些事实正确后，再获取所选归档 Artifact：

```bash
node --run narratage -- get my-film-001 \
  --runtime examples/talking-head-aroll/svml.runtime.json \
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
node --run narratage -- build examples/talking-head-aroll/reuse-generated.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --build-id my-film-reuse-001 --follow
```

### 7. 诊断或停止本地 Runtime

```bash
node --run narratage -- runtime logs examples/talking-head-aroll/svml.runtime.json
node --run narratage -- runtime down examples/talking-head-aroll/svml.runtime.json
```

`runtime down` 会让 Worker 停止领取新 lease，并停止 Runtime 管理的程序；它不会取消耐久
Build 或远程 Provider 工作。再次启动同一 Profile 即可恢复本地执行。
