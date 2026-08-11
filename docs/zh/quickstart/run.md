---
title: Run Source 与 Build
description: 声明 Build 目标、复用结果以及配置运行时环境。
---

# Run Source 与 Build

Run Source（`.svrun`）声明**要构建什么**——需要哪些输出、接受什么保真度，以及可选地如何复用先前 Build 的结果。Runtime Profile（`svml.runtime.json`）声明**在哪里运行**——endpoint、凭证、并发数和权限。

这两者都不会改变视频**是什么**。那是 Author Source 的职责。

## Run Source 语法

每个 `.svrun` 文件都以其处理指令开头：

```svml
<?svml using="@narratage/run-markup@1"?>
```

### 最简 Run Source

```svml
<?svml using="@narratage/run-markup@1"?>

<svrun version="1" targets="delivery">
  <author source="./main.svml"/>
  <target-set id="delivery">
    <target output="final.video" accepts="exact"/>
  </target-set>
</svrun>
```

| 元素 | 说明 |
|---|---|
| `<svrun>` | 根元素。`version="1"`，`targets` 指定活跃的 target-set |
| `<author>` | 必需。`source` 指向 `.svml` Author Source |
| `<target-set>` | 一组命名的需求输出集合 |
| `<target>` | 单个需求输出：`output` 指定逻辑输出名，`accepts` 设置保真度 |

### Target

**Target** 指定 Build 所需的输出及其可接受的最低保真度：

- `accepts="exact"` ——输出必须与作者声明的完全一致
- `accepts="substitute"` ——允许使用可接受的替代品（例如先前生成的结果）

不存在特权化的"最终视频"根节点。任何组件的任何公开逻辑输出都可以作为 Target。编译器仅执行满足所需 Target 所必要的 Operation——其余一切均被裁剪。

### 多个 Target

可以在一次 Build 中请求多个输出：

```svml
<target-set id="delivery">
  <target output="final.video" accepts="exact"/>
  <target output="captions.track" accepts="exact"/>
</target-set>
```

也可以定义多个 target-set 并在它们之间切换：

```svml
<svrun version="1" targets="preview">
  <author source="./main.svml"/>

  <target-set id="preview">
    <target output="captions.track" accepts="substitute"/>
  </target-set>

  <target-set id="delivery">
    <target output="final.video" accepts="exact"/>
  </target-set>
</svrun>
```

`<svrun>` 上的 `targets` 属性选择当前活跃的集合。

## 复用结果

Narratage 没有隐式缓存。复用结果是显式的运行图编写——你将历史 Record 声明为零输入 Candidate，并通过 Satisfaction 边将它们连接起来。

```svml
<?svml using="@narratage/run-markup@1"?>

<svrun version="1" targets="delivery">
  <author source="./main.svml"/>
  <target-set id="delivery">
    <target output="final.video" accepts="substitute"/>
  </target-set>

  <build-record id="hook-video"
    build="my-film-001" output="hook-take.video"/>
  <build-record id="meeting-video"
    build="my-film-001" output="meeting-take.video"/>
  <build-record id="evidence-video"
    build="my-film-001" output="evidence-take.video"/>
  <build-record id="payoff-video"
    build="my-film-001" output="payoff-take.video"/>

  <satisfy output="hook-take.video"
    candidate="hook-video" fidelity="substitute"/>
  <satisfy output="meeting-take.video"
    candidate="meeting-video" fidelity="substitute"/>
  <satisfy output="evidence-take.video"
    candidate="evidence-video" fidelity="substitute"/>
  <satisfy output="payoff-take.video"
    candidate="payoff-video" fidelity="substitute"/>
</svrun>
```

### 查找可复用输出

按照输出在各个历史 Build 冻结 Catalog 中的旧名字查询：

```bash
node --run narratage -- history hook-take.video \
  --runtime ./svml.runtime.json
```

`history` 只列出该 Build 确实选择并验收过的公开 Logical Output。仅仅在源码中声明但没有
运行出来的别名，以及不能作为 `build-record` Candidate 的 authored Record 别名，都不会混入
结果。如果忘了旧名字，可以按 Catalog 当时记录的精确源码路径列出真正验收过的输出名：

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
<satisfy output="opening-shot.video"
  candidate="approved-opening" fidelity="substitute"/>
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
| `fidelity` | `exact` 或 `substitute` |

编译后的计划会裁剪所有被替代 Candidate 取代的上游 Operation。这是一次新的 Build，而非旧 Build 的延续。下游处理（归一化、WhisperX、字幕生成、渲染）仍然会对复用的媒体执行。

### 保真度模型

- **`exact`** ——Candidate 与作者声明的内容精确匹配
- **`substitute`** ——Candidate 是一个可接受的替代品

替代保真度是**单调的**：一旦替代品进入图中，它会向下游传播。你无法将其恢复为 exact。如果最终 Target 接受 `substitute`，那么消费替代输入的下游 Operation 也会产生替代结果。

## Runtime Profile

Runtime Profile（`svml.runtime.json`）告诉系统**在哪里**执行每种类型的工作：

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
      "journal": "state.journal",
      "artifacts": "artifacts",
      "credentials": ["credentials.env"]
    }
  },
  "endpoints": [
    {
      "use": "@narratage/provider-kie",
      "instance": "kie.main",
      "lane": "generation",
      "config": {
        "apiKey": { "store": "env", "key": "KIE_API_KEY" },
        "defaultConcurrency": 2
      }
    },
    {
      "use": "@narratage/provider-media-local",
      "instance": "media.main",
      "lane": "media",
      "config": { "defaultConcurrency": 2 }
    },
    {
      "use": "@narratage/provider-whisperx-local",
      "instance": "whisperx.main",
      "lane": "alignment",
      "config": { "defaultConcurrency": 1 }
    },
    {
      "use": "@narratage/provider-google-vertex",
      "instance": "vertex.main",
      "lane": "planning",
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
      "lane": "render",
      "config": {
        "workers": 2,
        "quality": "standard",
        "defaultConcurrency": 1
      }
    }
  ],
  "permissions": [
    "environment:credentials",
    "filesystem:artifacts",
    "filesystem:state",
    "filesystem:whisperx-staging",
    "network:aiplatform.googleapis.com",
    "network:api.kie.ai",
    "network:kieai.redpandaai.co",
    "network:whisperx-loopback",
    "process:hyperframes",
    "process:media"
  ],
  "scheduling": {
    "maxConcurrency": 4,
    "lanes": {
      "generation": 2,
      "media": 2,
      "alignment": 1,
      "planning": 1,
      "render": 1
    }
  }
}
```

### Endpoint

每个 endpoint 将一个 Provider 包绑定到具有并发通道的命名实例：

| 字段 | 说明 |
|---|---|
| `use` | Provider 包名（例如 `@narratage/provider-kie`） |
| `instance` | 唯一的实例标识符 |
| `lane` | 用于并发控制的调度通道 |
| `config` | Provider 专属非秘密配置、CredentialRef 与并发数 |

### 权限

对文件系统、网络和进程访问的显式授权。调度器会拒绝需要未在此列出的权限的 Operation。

### 调度

`maxConcurrency` 限制总的并行 Operation 数。`lanes` 设置每个通道的并发上限，以防止某一类工作饿死其他工作。

## Build 工作流

### 0. 安装

```bash
pnpm install
```

这条命令在安装 Node 依赖的同时，也会准备好本地 Build 所需的 Python 服务（WhisperX、OpenCV）。
如果 `uv` 不在 PATH 中，Python 步骤会跳过并给出提示——需要本地对齐或图像处理时请先安装
[uv](https://docs.astral.sh/uv/)。

`narratage runtime up` 管理后台 Worker 和外部程序；`build` 会确保 Runtime 已运行，但不拥有
Worker。

#### 把正式视频项目放在 Narratage 仓库之外

作者文件不必位于本仓库之下。例如，项目放在 `/work/my-film`，同时复用
`/opt/narratage` 中已安装的包：

```bash
cd /opt/narratage

node --run narratage -- lock-packages /work/my-film/svml.packages.lock \
  --package @narratage/script \
  --package @narratage/estimate

node --run narratage -- plan /work/my-film/build.svrun \
  --package-lock /work/my-film/svml.packages.lock
```

Source Workspace 默认是 `build.svrun` 所在目录；相对引用的 Author Source 与素材都必须留在
这个边界内。`--package-root` 是另一项无关的 Host 覆盖项：它只负责指定已安装的
`node_modules`，然后按照 lock 校验包字节。官方 CLI 通常会自动提供自身的安装位置，所以
上面的命令无需填写包路径。只有需要主动扩大源码边界时才传 `--root`。不要把外部项目软
链接进仓库；canonical path 的边界检查会有意拒绝这种逃逸。

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
      "journal": "state.journal",
      "artifacts": "artifacts",
      "credentials": ["credentials.env"]
    }
  },
  "endpoints": [],
  "permissions": ["environment:credentials", "filesystem:artifacts", "filesystem:state"],
  "scheduling": { "maxConcurrency": 4 }
}
```

Runtime 状态、归档 Artifact 和 lock 仍全部留在 `/work/my-film`。只有包被有意安装在 CLI
之外时，才使用 `--package-root` 或 Profile 的 `packageRoot` 覆盖位置。

### 1. 诊断环境

```bash
node --run narratage -- doctor examples/talking-head-aroll/svml.runtime.json
```

Doctor 校验两份 lock、全部显式 Runtime 角色、Endpoint 配置、凭据是否存在和有界环境探测；
它不启动 Worker，也不发付费请求。

### 2. 检查计划

```bash
node --run narratage -- plan examples/talking-head-aroll/build.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json
```

在花费资金之前审查冻结的 BuildPlan。该计划展示调度器将发出的每个 Operation 和 Needs。

### 3. 提交 Build

```bash
node --run narratage -- build examples/talking-head-aroll/build.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --build-id my-film-001 \
  --follow
```

不带 `--follow` 时，Build 在耐久提交后退出，后台 Worker 继续。带 `--follow` 时终端也只是
观察者，并会报告 phase / Operation 数量变化；Ctrl-C 不会取消任务。

| 标志 | 说明 |
|---|---|
| `--runtime` | Runtime Profile 的路径 |
| `--package-lock` | 包锁定文件的路径 |
| `--package-root` | 存放 lock 所列已安装包的 Host 目录 |
| `--root` | 可选的 Source Workspace 边界；默认是入口 Source 所在目录 |
| `--build-id` | 用户为此 Build 选择的标识符（用于检索和复用） |
| `--follow` | 将 Build 进度流式输出到终端 |

不传 `--build-id` 时，身份由编译后的作者意图和运行意图派生；重复同一条命令只会寻址同一个
耐久 Build，不会偷偷再买一次生成。未完成的 Build 从已验收 Record 和可恢复 Endpoint checkpoint
继续；已完成、失败或取消的 Build 保持终态，只返回状态。相同 prompt 明确需要另一份随机结果时，
使用新的显式 id。把已有显式 id 用到另一份编译意图上会被拒绝，并同时提示“换 id”或“恢复原 Source”。

### 4. 获取结果

```bash
node --run narratage -- get my-film-001 \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --name final.video \
  --to examples/talking-head-aroll/output/final.mp4
```

每个被接受的中间 Record 和 Artifact 在 Build 完成前都会被归档。`get` 会复制一份已持久化的
Record。Blob Artifact 会从所选 Store 流式读取，逐步校验长度与 SHA-256，完整通过后才原子替换
目标路径；导出大 MP4 不会把整段视频塞进 CLI 内存。
Build 的最终输出会为每个目标别名打印精确的 `get --name …` 命令，不必为了导出
`final.video` 去查不透明的 Record id。

### 5. 在新 Build 中复用

创建一个引用已完成 Build 的 Record 的新 `.svrun` 文件（参见上文[复用结果](#复用结果)），然后提交：

```bash
node --run narratage -- build examples/talking-head-aroll/reuse-generated.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --build-id my-film-reuse-001 --follow
```
