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
<?svml using="@narratage/run-text@1"?>
```

### 最简 Run Source

```svml
<?svml using="@narratage/run-text@1"?>

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
<?svml using="@narratage/run-text@1"?>

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
  "endpoints": [
    {
      "use": "@narratage/provider-kie",
      "instance": "kie.main",
      "lane": "generation",
      "config": {
        "apiKeyEnv": "KIE_API_KEY",
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
        "credentialsEnv": "GOOGLE_APPLICATION_CREDENTIALS_JSON",
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
| `config` | Provider 专属配置（API 密钥、并发数等） |

### 权限

对文件系统、网络和进程访问的显式授权。调度器会拒绝需要未在此列出的权限的 Operation。

### 调度

`maxConcurrency` 限制总的并行 Operation 数。`lanes` 设置每个通道的并发上限，以防止某一类工作饿死其他工作。

## Build 工作流

### 1. 诊断环境

```bash
pnpm narratage doctor examples/talking-head-aroll/svml.runtime.json
```

Doctor 检查每个 endpoint 是否可达、凭证是否有效，以及所需的可执行文件（`ffmpeg`、`ffprobe`、Chrome）是否可用。

### 2. 检查计划

```bash
pnpm narratage plan examples/talking-head-aroll/build.svrun \
  --package-lock examples/talking-head-aroll/svml.packages.lock --root .
```

在花费资金之前审查冻结的 BuildPlan。该计划展示调度器将发出的每个 Operation 和 Needs。

### 3. 提交 Build

```bash
pnpm narratage build examples/talking-head-aroll/build.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --package-lock examples/talking-head-aroll/svml.packages.lock \
  --root . \
  --build-id my-film-001 \
  --follow
```

| 标志 | 说明 |
|---|---|
| `--runtime` | Runtime Profile 的路径 |
| `--package-lock` | 包锁定文件的路径 |
| `--root` | 工作区根目录 |
| `--build-id` | 用户为此 Build 选择的标识符（用于检索和复用） |
| `--follow` | 将 Build 进度流式输出到终端 |

### 4. 获取结果

```bash
pnpm narratage get my-film-001 \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --name final.video \
  --to examples/talking-head-aroll/output/final.mp4
```

每个被接受的中间 Record 和 Artifact 在 Build 完成前都会被归档。`get` 会复制一份已持久化的 Record。

### 5. 在新 Build 中复用

创建一个引用已完成 Build 的 Record 的新 `.svrun` 文件（参见上文[复用结果](#复用结果)），然后提交：

```bash
pnpm narratage build examples/talking-head-aroll/reuse-generated.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --package-lock examples/talking-head-aroll/svml.packages.lock \
  --root . --build-id my-film-reuse-001 --follow
```
