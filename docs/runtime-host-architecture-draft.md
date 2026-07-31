# External Runtime Host Architecture Draft

> **Draft; not frozen.**
>
> 本文定义 SVML 编译内核与外部运行时之间的候选边界。它不属于
> SVML 源语言语法，也不要求任何宿主采用 Hypit 当前的数据库、队列、
> 对象存储、供应商、前端或部署方式。
>
> 稿件主时钟、主音频构建、对齐与相关 Evidence acquisition 流程暂不在本文
> 设计或冻结；它们需要单独讨论后再接入通用 Runtime Protocol。

## 1. 目标

同一个 SVML 编译内核必须能在三种环境中工作：

1. Hypit 提供的官方托管服务；
2. 个人或工作室安装的本地/单机运行时；
3. 第三方公司接入自己数据库、队列、存储、供应商和前端的运行时。

Hypit 是官方、功能完整的参考宿主，不是语言内核的特权宿主。可移植性的
验收标准不是“第三方能够部署一份缩小版 Hypit”，而是：

```text
同一个 ExecutionBundle
  ├─ 可以由进程内 Local Host 执行
  ├─ 可以由持久化 Single-node Host 执行
  └─ 可以由 Distributed Host 执行
```

运行环境可以不同，但编译器、类型合同、请求摘要、Artifact 身份和最终
HyperFrames 编译目标不能因宿主而改变。

## 2. 前代运行时审计

前代引擎已经验证了若干必须保留的生产能力：

- 从输出 root 反向计算 demand，遇到已满足输出后裁掉纯上游；
- 在提交外部任务前持久化请求身份，进程恢复时复用 provider task id；
- Job claim token、heartbeat、reaper 和 stale-worker fencing；
- 按生成、STT、媒体处理和渲染资源分别限流；
- 不可变执行快照、节点检查点、事件流和失败恢复；
- Canvas Pin、直接输入和历史输出可以短路上游执行；
- 本地/云存储与本地/远端渲染已经存在初步 Adapter seam；
- 运行时 capability fingerprint 可以在提交前阻止明显不兼容的 Worker。

这些是运行时资产，不是当前表结构或类名的资产。当前实现不适合作为公共
Runtime ABI，原因包括：

- 一个中心 `runJob` 同时承担拓扑执行、Prisma 写入、检查点、缓存、计费、
  provider 恢复、重试和 Adapter 构造；
- Node execution context 暴露 `ownerId`、`jobId`、全量 Adapter 和资源池，
  而不是仅授予当前调用声明过的能力；
- 部分节点直接 import Vertex、STT、FFmpeg、GCS 和媒体流水线实现；
- Storage 返回公开 URL，并由调用者拼接 owner namespace，内容身份、存储位置
  和产品租户因此耦合；
- Render Adapter 同时理解私有 Timeline、产品 owner、存储上传和具体渲染框架；
- 缓存身份依赖 Canvas scope 与 node id，不能直接成为跨宿主的 action cache；
- 资源类型由中心 node-type switch 推断，增加 Worker 或 Kernel 仍需修改宿主；
- 整个运行时 capability hash 由中央节点、字幕和 renderer 注册表共同决定，
  一个无关能力变化也可能使旧任务不兼容；
- 生产包同时带入数据库、云 SDK、provider SDK、React 和渲染框架，物理部署包
  不是可移植代码边界。

重构目标不是放弃这些机制，而是让它们成为可替换 Host 对通用协议的一种实现。

## 3. 总体分层

```text
Product Host
  Hypit UI / third-party UI / CLI / IDE
                         │
                         ▼
Runtime Host
  run lifecycle · policy · journal · cache · dispatch · events
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
Capability Workers              Artifact Infrastructure
  provider / media / tools        CAS · metadata · receipts
             │                       │
             └───────────┬───────────┘
                         ▼
SVML Compiler Kernel
  parse · bind · typecheck · plan · locate · project · emit
                         │
                         ▼
HyperFrames HTML
                         │
                         ▼
HyperFrames Render Driver
  preview · browser capture · media packaging
```

依赖方向必须满足：

```text
Product Host  ──> Runtime Protocol
Runtime Host  ──> Compiler + Runtime Protocol
Workers       ──> Runtime Protocol
Compiler      ──> Protocol
```

下列依赖禁止进入编译器、Plan、Located IR 或 Kernel projector：

- Project、Canvas、Job、Workspace 或用户模型；
- Prisma 和任何具体数据库；
- S3、GCS、MinIO 或本地目录配置；
- SQS、Redis、Temporal、Postgres queue 或其他 broker；
- provider SDK、credential 或计费账户；
- Hypit 前端和发布基础设施。

## 4. 编译器是可恢复的纯状态机

一次性接口：

```text
compile(source, artifacts, evidence) -> HTML
```

仍适合离线、输入齐全的确定性编译，但不足以承载异步、昂贵和可能需要人工选择
take 的能力。公共运行时接口应允许宿主反复推进同一个不可变 Bundle：

```ts
type AdvanceResult =
  | {
      status: "needs-effects";
      requests: EffectRequest[];
    }
  | {
      status: "complete";
      document: HyperframesDocument;
      views: {
        canvas: CanvasView;
        timeline: TimelineView;
      };
    };

function advance(
  bundle: ExecutionBundle,
  bindings: ReceiptSet,
): AdvanceResult;
```

`advance` 是纯函数：

- 不调用 provider；
- 不提交队列；
- 不读取 credential；
- 不写数据库；
- 不使用墙钟或未注入随机源；
- 不把进程内 continuation 当作运行真相。

宿主可以在任意崩溃后用同一个 `ExecutionBundle + ReceiptSet` 重新调用
`advance`。每次调用重新确定当前所有 ready 且未满足的请求；互不依赖的请求
可以并行返回。

```text
prepare source
    ↓
ExecutionBundle
    ↓ advance(receipts₀)
ready EffectRequest[]
    ↓ Runtime satisfies requests
receipts₁
    ↓ advance(receipts₁)
next EffectRequest[] | complete HyperFrames document
```

这是一种 build/reconcile 模型，而不是让编译器内部等待远程任务的长事务。

## 5. 公共协议

### 5.1 ExecutionBundle

`ExecutionBundle` 是编译器交给 Runtime Host 的不可变、可哈希输入：

```ts
type ExecutionBundle = {
  contract: "svml.execution-bundle.v1";
  bundleHash: string;

  sourceLock: SvmlLock;
  plan: PlanIR;

  compiler: {
    package: string;
    version: string;
    languageVersion: string;
  };

  target: {
    name: "hyperframes";
    version: string;
  };

  requiredCapabilities: CapabilityRequirement[];
};
```

Bundle 可以保存源码 provenance，但不保存产品记录、队列和部署配置。宿主可在
自己的 Run 记录中引用 Bundle hash，并另外保存 Project/Canvas/用户等 provenance。

### 5.2 ArtifactRef

Artifact 身份必须是内容，而不是 URL：

```ts
type ArtifactRef = {
  digest: `sha256:${string}`;
  type: "Image" | "Video" | "Audio" | "Binary";
  mediaType: string;
  byteLength: number;
  metadata: {
    width?: number;
    height?: number;
    durationFrames?: number;
    fpsNumerator?: number;
    fpsDenominator?: number;
    sampleRate?: number;
    channels?: number;
  };
};
```

`ArtifactRef` 不包含 bucket、owner prefix、公开 URL 或短期 signed URL。
Store 在使用点把它解析为 stream、本地路径或临时 URL：

```text
ArtifactRef
    ↓ ArtifactStore.open / materialize
stream | local path | scoped URL
```

Provider 返回的远端 URL 不能直接成为成功输出。Worker 必须先把字节摄取到
宿主选择的 CAS、校验内容摘要，再提交 Receipt。

### 5.3 EffectRequest

`.svk` 声明抽象 capability；编译器把一个 ready capability instance 降低成
类型化请求：

```ts
type EffectRequest = {
  contract: "svml.effect-request.v1";
  requestDigest: string;

  instanceIdentity: string;
  executionDigest: string;

  capability: {
    id: string;
    version: number;
  };

  inputs: Record<string, TypedValue>;
  parameters: JsonValue;
  expectedOutputs: OutputContract[];
};
```

`requestDigest` 描述请求本身，不代表一次具体 provider 操作。源码或 Kernel
不能在 Request 中选择队列、Worker 地址、credential、云账户或产品租户。

### 5.4 Operation

必须区分三种身份：

```text
requestDigest = 请求内容是什么
operationId   = 这一次实际执行或生成是什么
submissionKey = 网络重试是否属于同一次 operation
```

相同请求可以明确产生多个 take：

```text
same requestDigest
different operationId
```

页面重试、Worker 崩溃或 provider poll 恢复则必须保持同一个
`operationId + submissionKey`，避免重复花费。

Runtime Host 在第一次 dispatch 前持久化 Operation。若 provider 的提交结果
不确定，Host 保存 reconciliation 状态而不是擅自新建 Operation。

### 5.5 EffectReceipt

Worker 的唯一成功输出是版本化 Receipt：

```ts
type EffectReceipt = {
  contract: "svml.effect-receipt.v1";

  requestDigest: string;
  operationId: string;

  implementation: {
    id: string;
    version: string;
    digest: string;
    provider?: string;
    model?: string;
  };

  outputs: Record<string, TypedValue>;
  rawResponse?: ArtifactRef;

  usage?: Array<{
    metric: string;
    quantity: number;
    amount?: number;
    currency?: string;
    estimated: boolean;
  }>;
};
```

Receipt 保留实现与 provider provenance，但不能携带 credential。编译器验证：

- `requestDigest` 与当前请求一致；
- 输出端口、类型和 cardinality 一致；
- Artifact 内容可由 Store 验证；
- 下游 `executionDigest` 使用实际输出内容摘要重新计算。

### 5.6 OutputOverride

Pin 是宿主的作者选择，不是源语言或普通 action cache：

```ts
type OutputOverride = {
  instanceIdentity: string;
  outputPort: string;
  value: TypedValue;
  provenance?: JsonValue;
};
```

Runtime Host 可以从历史 Run、上传、资产库、直接导入或 mock 解析出 Override。
编译器只检查类型、schema 和内容身份，不读取 `jobId:nodeId`，也不知道 Override
如何被选择。

### 5.7 RuntimeEvent

前端和 CLI 消费统一事件语义，不直接读取某个数据库表：

```ts
type RuntimeEvent =
  | { kind: "run.started" }
  | { kind: "effect.queued"; operationId: string }
  | { kind: "effect.started"; operationId: string }
  | {
      kind: "effect.progress";
      operationId: string;
      progress?: number;
      message?: string;
    }
  | {
      kind: "effect.completed";
      operationId: string;
      receipt: EffectReceipt;
    }
  | { kind: "compile.completed"; html: ArtifactRef }
  | { kind: "render.completed"; video: ArtifactRef }
  | { kind: "run.failed"; diagnostic: Diagnostic };
```

SSE、WebSocket、poll、CLI stdout 和消息流都可以承载同一合同。

## 6. Runtime Host Ports

公共 Runtime Core 应依赖小接口，而不是一个全量 Adapter bag：

```ts
interface ModuleResolver {
  resolve(uri: string, integrity?: string): Promise<ModuleSource>;
}

interface ArtifactStore {
  put(
    bytes: ByteStream,
    metadata: ArtifactMetadata,
  ): Promise<ArtifactRef>;

  open(ref: ArtifactRef): Promise<ByteStream>;
  stat(ref: ArtifactRef): Promise<ArtifactMetadata>;
}

interface RunJournal {
  createRun(bundle: ExecutionBundle): Promise<string>;
  loadReceipts(runId: string): Promise<ReceiptSet>;
  appendEvent(runId: string, event: RuntimeEvent): Promise<void>;
}

interface ActionCache {
  get(actionDigest: string): Promise<EffectReceipt | undefined>;
  put(actionDigest: string, receipt: EffectReceipt): Promise<void>;
}

interface Dispatcher {
  dispatch(operation: Operation): Promise<void>;
  cancel(operationId: string): Promise<void>;
}

interface RenderDriver {
  render(
    html: ArtifactRef,
    target: RenderTarget,
  ): Promise<ArtifactRef>;
}
```

这些是逻辑 ownership seam，不要求第一天拆成多个服务。一个 Local Host 可以由
同一进程实现全部接口；分布式 Host 可以把它们映射到不同服务。

## 7. Capability Worker Protocol

Provider 和媒体代码属于 Host 安装的 Worker，不属于编译器进程。Worker 至少
需要：

```ts
interface CapabilityWorker {
  describe(): WorkerCapabilities;

  start(
    operation: Operation,
    context: ScopedWorkerContext,
  ): Promise<WorkerResult>;

  resume(
    operation: Operation,
    checkpoint: JsonValue,
    context: ScopedWorkerContext,
  ): Promise<WorkerResult>;

  cancel?(operation: Operation): Promise<void>;
}
```

`ScopedWorkerContext` 只提供当前 capability 声明过的权限：

- 输入 Artifact 的只读 handle；
- 输出 Artifact 的写入 handle；
- 当前 operation 的 checkpoint；
- 当前 capability 的 credential handle；
- 事件与 usage 上报；
- 明确的 deadline/cancellation。

Worker 不得到完整 Runtime Host、其他 provider credential、产品数据库或任意
Artifact namespace。

Worker 可以是：

- 同进程实现；
- 独立 Node/Python/Rust 进程；
- 容器；
- Lambda；
- 外部服务。

公共协议应先冻结 transport-neutral JSON schema。参考实现可以提供
JSON-RPC/Connect/gRPC transport，但不能让某一种 RPC 框架成为 SVML 语言语义。

## 8. Queue 与 Worker 路由

Queue 是 Host policy，不是 Runtime Protocol 的必选基础设施。

### 8.1 Embedded Local Host

```text
Journal    = memory
Dispatcher = direct function call
Store      = local CAS directory
Worker     = local process
```

### 8.2 Persistent Single-node Host

```text
Journal    = SQLite or Postgres
Dispatcher = local durable task table
Store      = local CAS or MinIO
Worker     = one or more local processes
```

### 8.3 Distributed Host

```text
Journal    = durable database/service
Dispatcher = Temporal / Postgres / Redis / SQS / custom broker
Store      = S3 / GCS / MinIO / enterprise CAS
Worker     = VM / container / Kubernetes / serverless
```

每个 Worker 广告自己的 capability、协议版本、实现摘要和容量。调度条件是：

```text
request capability ∈ worker capabilities
```

队列名、部署区域和 autoscaling 规则不进入 Source、Plan 或 EffectRequest。
资源并发属于 Worker/Host 配置，不由中心 node-type switch 推断。运行前 Host
必须能打印缺少的 capability，并在任何付费请求前失败。

## 9. Kernel 与 Provider 实现分离

`.svk` 定义语言侧合同：

- 输入/输出端口；
- 参数和 child schema；
- capability request lowering；
- 输出类型与不变量；
- 确定性 projector。

Provider Worker 定义宿主侧实现：

- credential；
- provider API；
- submit/poll/webhook；
- provider 限流；
- 结果下载与 CAS 摄取；
- usage observation。

源码可以导入：

```svml
<import from="./seedance-speaker.svk"/>
```

但不能选择：

```text
queue=video-prod
credential=secret://...
worker=https://...
```

Host configuration 把 capability 映射到一个允许的 Worker implementation。
同一 capability 可以有多个实现，但替换者必须满足同一公开合同。只因两个
实现都返回 `Video`，不代表它们语义可互换。

Kernel package 和 Provider package 可以由同一个发行包提供，但安装、信任、
权限和版本锁必须分别建模。Source 不能触发下载或执行未被 Host allowlist 的
任意代码。

## 10. Artifact、缓存、take 与 Pin

四个概念必须独立：

| 概念 | 身份 | 默认行为 |
|---|---|---|
| Artifact CAS | content digest | 相同字节只存一次 |
| Deterministic Action Cache | action/execution digest | 可自动复用 |
| Non-deterministic Take | operation id | 同请求允许多次执行 |
| Pin / OutputOverride | 作者选择 | 显式短路当前输出 |

生成模型不得因 `requestDigest` 相同而默认自动复用旧 take。Runtime 必须区分：

- 用户要求“继续这次提交”；
- 用户要求“复用旧结果”；
- 用户要求“再生成一个新 take”。

Pin 后的 demand pruning 是 Runtime Core 的纯算法。遇到满足当前输出类型的
Override 后停止向上遍历；若同一上游仍被其他活跃消费者需要，则该上游继续执行。

## 11. Render Driver

编译器的唯一正式目标保持为 HyperFrames HTML。Render Driver 是可选运行步骤：

```ts
render(
  htmlArtifact,
  {
    format: "mp4",
    codec: "h264",
    audioCodec: "aac",
    pixelFormat: "yuv420p",
  },
) -> videoArtifact
```

Renderer 不读取 SVML、Plan、Selection、provider request 或产品记录。它只消费：

- 已编译 HTML；
- 锁定的 HyperFrames runtime；
- 显式渲染目标；
- HTML 引用的已解析 Artifact。

Local Chromium、浏览器集群和第三方 render farm 都可以实现相同接口。若要求
MP4 字节级或像素级复现，Render Receipt 还必须记录浏览器、字体、FFmpeg、
codec 和执行镜像摘要；相同 HTML 本身不保证不同平台编码结果相同。

## 12. Product Host 与前端

Project、Canvas、用户、权限、credits、模板、产品历史和人类 review 属于 Product
Host。它们通过标准对象引用运行时：

```text
Product Run
  ├─ product provenance
  ├─ ExecutionBundle hash
  ├─ OutputOverrides
  ├─ Run id
  └─ final ArtifactRef
```

Canvas 与 Timeline 继续由编译器投影。前端通过统一 API 或本地库消费：

- source/check diagnostics；
- Plan/Canvas view；
- Located Timeline view；
- RuntimeEvent；
- Receipt/take 列表；
- Artifact preview；
- Pin/Override 操作。

公共 Runtime 不规定 UI，也不要求前端直接访问 Runtime 的数据库。

## 13. 三种发行形态

### 13.1 Hypit Hosted Runtime

Hypit 可以配置：

```text
Compiler        official @svml/compiler
Journal         Postgres-backed implementation
Dispatcher      official durable queue
Artifact Store  S3-backed CAS
Workers         official provider/media packages
Renderer        official HyperFrames browser farm
Secrets         managed credential/IAM boundary
Policy          workspace · credits · quota · audit
Frontend        Hypit Admin / Consumer
```

这些选择是官方发行版的竞争力，不进入公共协议。

### 13.2 Reference Local Runtime

开源仓库必须提供真正可运行的最小 Host：

```text
Compiler        same @svml/compiler
Journal         memory first, SQLite when persistence is requested
Dispatcher      in-process
Artifact Store  local filesystem CAS
Workers         local/fake/user-configured
Renderer        local HyperFrames + Chromium
Frontend        CLI, optional local web UI
```

没有配置的 capability 必须在 plan/doctor 阶段明确报缺失，不得静默联网或调用
付费 provider。

### 13.3 Third-party Runtime

第三方可以替换任意 Host port：

```text
Journal         own DB/service
Dispatcher      own queue/orchestrator
Artifact Store  GCS/MinIO/internal storage
Workers         own provider accounts and implementations
Renderer        own containers or render farm
Frontend        own product
```

只要其实现通过 Runtime Protocol conformance tests，就能使用同一个编译内核。

## 14. 建议的逻辑包边界

早期可以保留在一个 monorepo 中，但依赖方向应按以下逻辑包建立：

```text
packages/
  protocol/                    versioned JSON contracts and codecs
  compiler/                    source → Plan → Located → HyperFrames
  kernel-sdk/                  .svk manifest/projector SDK
  runtime-core/                advance/reconcile/demand algorithms
  runtime-sdk/                 Host and Worker interfaces
  host-local/                  memory/SQLite/in-process reference host
  artifact-fs/
  artifact-s3/
  render-hyperframes-local/
  render-hyperframes-remote/

providers/
  media-ffmpeg/
  provider-example/

apps/
  svml-cli/
  svml-runtime-server/
  hypit-runtime/
  hypit-web/
```

是否发布成独立 npm package 是后续分发决策。第一阶段应通过 TypeScript project
references、package exports 和 forbidden-import tests 建立真实边界，避免先拆
服务却继续共享内部类型。

## 15. 外部先例

本设计借鉴的是协议边界，不复制其他系统的领域语义：

- Bazel Remote Execution 把 action、action cache、CAS 和 remote worker
  分开，使不同客户端和服务器实现可以共享内容寻址执行协议：
  <https://github.com/bazelbuild/remote-apis>。
- Terraform 把 Core 与 Provider executable 通过版本化 RPC 协议分开，并把
  provider discovery/distribution 与 runtime protocol 分开：
  <https://developer.hashicorp.com/terraform/plugin/terraform-plugin-protocol>。
- Temporal 把持久 workflow history/task queue 与用户运行的 Worker 分开，
  同时支持自托管服务和托管服务：
  <https://github.com/temporalio/temporal/blob/main/docs/architecture/README.md>。
- WebAssembly Component Model/WIT 证明了 capability-oriented imports/exports
  可以成为跨语言、受限组件 ABI 的长期方向；SVML v1 不以 WASI 为前置条件：
  <https://component-model.bytecodealliance.org/reference/faq.html>。

## 16. 不应标准化的宿主细节

下列内容可以有官方默认，但不进入 SVML Source 或 Runtime Protocol：

- 数据库表名和 ORM；
- 队列产品、queue name 和 worker topology；
- bucket、region、public URL 和 CDN；
- credential schema 和 Secret Manager；
- workspace、credits、billing 和租户模型；
- autoscaling、优先级和部署平台；
- 前端页面、Canvas 布局和产品导航；
- Host 自己的 retention、GC 和审计周期。

公共协议只标准化跨宿主交换时必须一致的身份、类型、状态转换和安全边界。

## 17. 已知边界

1. Capability 可替换只在合同等价时成立；共同输出类型不等于行为等价。
2. 同一 HyperFrames HTML 在不同字体、浏览器、decoder 和 encoder 环境下不
   自动保证像素或字节一致。
3. Provider Worker 是 Host 主动安装的受信代码；任意 SVML Source 不能获得
   安装或执行新 Worker 的权限。
4. 自托管不是零配置。Reference Host 必须把最小依赖做成清晰的一条命令，
   但缺少某项 capability 时仍应失败并解释如何配置。
5. Runtime Protocol 不能成为新的业务类型注册表；Kernel 的端口、参数和输出
   合同仍由被锁定的 `.svk` manifest 提供。

## 18. 第一批实现

在不接入生产、付费 provider 或外部队列的前提下，第一批应完成：

1. 新增 `protocol` 模块，定义并验证：
   - `ExecutionBundle`;
   - `ArtifactRef`;
   - `EffectRequest`;
   - `Operation`;
   - `EffectReceipt`;
   - `OutputOverride`;
   - `RuntimeEvent`.
2. 把当前 `svml.artifacts.v1` binding 适配成只读 `ReceiptSet` 输入，保留现有
   离线编译兼容。
3. 把编译入口拆为 `prepare` 与纯 `advance`，能够一次返回全部 ready requests。
4. 实现内存 Journal、本地文件 CAS、进程内 Dispatcher 和 fake Worker。
5. 用现有 ranking + B-roll reference 证明：
   - 同一个 Bundle 在直接离线 binding 与 Local Host 下产生相同 HTML hash；
   - Runtime 崩溃后只凭 Bundle 与 Receipts 可以继续；
   - Pin/Override 能裁掉纯上游但保留共享上游；
   - 缺少 capability 在任何外部调用前失败。
6. 再把前代 Postgres worker 包装为第二个 Host，实现相同 conformance suite；
   不先改变生产表、队列或 provider 行为。

TemporalProduction 的获取明确不属于本批记录；在单独实现前，不以假实现冻结
它的请求或 Receipt 形状。后续协议必须把选中的 `ProgramBasis`、完整
`2M + 2N` 锚点表、各点质量、Evidence 摘要和 Producer 实现摘要作为一个可验证
结果交给编译器，不能退回到隐式全局 alignment 或由下游补锚点。

## 19. 完成标准

外部运行时边界只有在以下条件同时成立时才算完成：

1. 一个干净仓库只安装公开包即可运行 reference project；
2. 同一个 `ExecutionBundle` 至少通过 Local Host 和另一个持久 Host；
3. Compiler/Runtime Core 没有 Hypit、Prisma、云 SDK、provider SDK 或前端 imports；
4. ArtifactRef 在本地 CAS 与对象存储间保持同一 content identity；
5. Worker 根据 capability subset 匹配，而不是根据中心 node type switch；
6. retry/resume 不会重复 provider submit，同一请求仍可显式生成多个 take；
7. Pin、action cache、take 和 Artifact CAS 有独立身份及测试；
8. Renderer 只消费 HyperFrames HTML 与 Artifact，不读取 SVML 或产品记录；
9. Host 在执行前能完整报告缺失 capability、权限和版本；
10. 第三方实现可以运行 conformance suite，而无需依赖 Hypit 源码或数据库。
