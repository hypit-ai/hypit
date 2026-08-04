# SVML v2 Kernel：Graph、Target、Pin、Demand 与开放世界

> **v2 Kernel 目标规范，2026-08-04。** 本文定义当前最高优先级的语言内核边界。
> 它补充并修正 [`intent-first-modular-compilation.md`](./intent-first-modular-compilation.md)
> 中把 Core 主要描述为类型化事件状态机、把 Target 主要描述为消费者 Query 的部分，
> 也将 [`runtime-package-topology-v2.md`](./runtime-package-topology-v2.md) 的 Runtime
> 施工置于本规范之后。
>
> 当前 v2 已实现不可变 Record、Need、Command、Event、Receipt、Derivation、有限
> BuildPlan 和纯 Reducer，但尚未实现本文规定的完整 CompiledGraph、任意 Target、
> 通用 Pin、Demand Planner 与动态外部包加载。

## 1. 决策摘要

SVML Kernel 的不可替换语义是：

```text
SVML Kernel
  = Typed Graph
  + Target
  + Pin
  + Demand
  + Immutable Facts
  + Verified State Transition
```

核心结论：

1. Source 编译得到完整类型化图，不预设 Film 或最终视频为唯一根；
2. 图中任何合法输出端口都可以成为一次 Build 的 Target；
3. Pin 是作者对某个输出端口的明确物化选择，是一等 Build Intent；
4. Core 从 Targets 反向求依赖闭包，遇到 Pin 或合法已物化 Record 就截断上游；
5. 有限 BuildPlan 是 `CompiledGraph + BuildIntent` 的派生结果，不是完整作者拓扑；
6. Core 决定什么 ready，Runtime Scheduler 只决定何时和在哪里执行；
7. Film、Track、Image、Seedance、WhisperX 和 HyperFrames 都不是 Core 内置概念；
8. 类型化共同语言由 Contract Package 定义，不在 Core 中全局注册；
9. 新组件、Surface、Producer、Provider 或 Contract 可以由事后安装的包提供，
   不得要求修改或重发 Core；
10. 内存和普通文件足以实现 Target、Pin、Demand、恢复和本地队列；数据库不是前提。

## 2. Kernel 不是普通组件

“一切皆包”只表示工程交付，不表示一切皆插件。必须区分：

| 层 | 能否被 `.svml` import | 能否改变 Kernel 法律 | 责任 |
|---|---:|---:|---|
| Bootstrap/Launcher | 否 | 只有语言版本升级 | Import Prologue、Manifest、锁定与加载 ABI |
| Protocol/Core Kernel | 否 | 只有语言版本升级 | Graph、Target、Pin、Demand、事实和状态推进 |
| Contract Package | 通常只传递依赖 | 否 | 组件间共享的数据合同 |
| Author Module | 是 | 否 | Surface、私有类型、Producer 和图 lowering |
| Runtime Module | 否 | 否 | Scheduler、Store、Provider Endpoint 与执行环境 |

Kernel 可以物理发布为：

```text
@svml/protocol
@svml/bootstrap
@svml/core
```

但它们是由发行版固定的 Kernel Packages，不参与组件发现，也不能由源码导入一个
“自定义 Pin 算法”或“自定义 Demand 算法”覆盖。

## 3. Kernel 输入与输出

Kernel 公共入口不接收 `.svml` 源码字节。Frontend 和 Author Modules 先把源码降低
为锁定的完整图：

```ts
type KernelInput = {
  closure: ResolvedModuleClosure;
  graph: CompiledGraph;
  intent: BuildIntent;
};
```

Kernel 输出可验证状态和 ready Commands：

```ts
start(input) -> BuildState

reduce(state, acceptedEvent?) -> {
  state: BuildState,
  commands: CoreCommand[]
}
```

Kernel 不解析 Script、不访问文件或网络、不读取凭据、不保存 Artifact 字节、不调用
Provider，也不选择数据库或队列产品。

## 4. 完整 CompiledGraph

### 4.1 基本元素

```ts
type PortAddress = {
  node: NodeId;
  port: string;
};

type NodeInstance = {
  id: NodeId;
  producer: ProducerRef;
  inputs: Record<string, PortAddress | RecordId>;
  outputs: Record<string, {
    address: PortAddress;
    record: RecordId;
    type: TypeRef;
  }>;
};

type CompiledGraph = {
  format: "svml.graph@0";
  id: Digest;
  nodes: readonly NodeInstance[];
  authoredRecords: readonly TypedRecord[];
};
```

最终字段会随实现收敛，但必须保留以下不变量：

- Node 和 Port 地址稳定且唯一；
- 每个非 authored output 至多有一个原始 Producer；
- 每条依赖边显式、类型化并属于锁定模块闭包；
- 图中不存在未声明依赖或运行时扫描得到的隐藏工作流；
- Producer 的端口与静态 Manifest 完全一致；
- 完整图可以包含多个互不相干的终端和中间检查点；
- 图本身不选择本次要执行哪一个终端。

### 4.2 依赖边具有强制语义

如果一个 Node 声明消费三个输入，那么 Target 该 Node 的输出时，三个输入都必须被
Demand。Core 不做“这个输入看起来没被实现代码使用”的死参数优化。

因此一个普通聚合节点可以有意表达：

> 在我完成之前，请把这一组输出全部物化。

这是作者图的一部分，不是假的执行技巧。

## 5. BuildIntent：Targets 与 Pins

一次运行的作者选择由 Kernel 对象表达：

```ts
type BuildIntent = {
  format: "svml.build-intent@0";
  graph: Digest;
  targets: readonly BuildTarget[];
  pins: readonly PinBinding[];
  digest: Digest;
};

type BuildTarget = {
  port: PortAddress;
  accepts: "exact" | "substitute";
};

type PinBinding = {
  port: PortAddress;
  record: TypedRecord;
};
```

BuildIntent 可以来自 CLI、Canvas、编辑器、JSON 文件或 Hosted 产品，但其 canonical
identity、类型验证和语义属于 Core。存储位置不决定其含义。

应区分三个身份：

```text
sourceSemanticDigest
  完整作者图表达了什么

buildIntentDigest
  这次选择哪些 Targets 和 Pins

runtimeExecutionDigest
  用哪些实现、Endpoint 和运行环境执行
```

Runtime Profile 不进入 source/build intent，但实际实现和结果必须进入 Receipt、
Derivation 与 Run provenance。

## 6. Target 语义

任何合法且可见的输出端口都可以成为 Target：

```text
Image
ImageSet
SpeechBasis
AlignedTranscriptEvidence
CompleteSemanticMap
CaptionTrack
BrollTrack
TrackSet
Composition
HyperFrames Program
Video Artifact
Debug Report
```

Film 和 HyperFrames 没有 Kernel 特权。一个 Source 可以同时拥有多个拓扑终端，一次
Build 也可以选择多个 Targets。Demand 是所有 Targets 反向依赖闭包的并集，公共上游
最多执行一次。

Author Module 可以提供命名 Target 或聚合组件改善体验，但 Core 不要求 Target 必须由
某个特定标签声明。编辑器和高级 CLI 可以直接选择公开 PortAddress。

## 7. Pin 语义

### 7.1 Pin 是作者明确提供的端口事实

Pin 的统一语义是：

> 对本次 BuildIntent 而言，该输出端口已经被作者明确物化；原 Producer 及其仅为该
> 端口服务的上游不再被 Demand。

Pin 不是缓存命中，也不是数据库记录，更不是“让另一个 Provider 冒充原 Provider”。
它是对图输出的作者覆盖。

Core 必须验证：

- PortAddress 存在且可 Pin；
- Record TypeRef 与端口合同相同；
- Record digest 与 canonical value 一致；
- ArtifactRef 可由 Runtime Store 验证；
- Basis、ProgramSpace、Evidence 等合同亲和性成立；
- Pin origin 和选择摘要进入 BuildState；
- 同一 BuildIntent 对一个 Port 不能出现冲突 Pin。

建议增加独立 origin：

```ts
type PinnedOrigin = {
  kind: "pinned";
  selectionDigest: Digest;
  provenance?: CanonicalValue;
};
```

Pin 不能声称原 Producer 执行过。公开组件输出应尽可能采用中立 Contract，例如
SpeechBasis、Image、Track，而不是把 Provider 品牌写进输出类型。

### 7.2 Pin 与 Substitute Need 不同

假设 Seedance 节点输出 SpeechBasis，内部运行时才提出 Seedance Mini Need：

```text
Pin SpeechBasis output
  -> Seedance Producer 被裁掉
  -> Seedance Need 从未产生

不 Pin output
  -> Seedance Producer 被 Demand
  -> 产生 Seedance Mini Need
  -> Runtime 可以 exact 或 substitute fulfillment
```

前者是作者覆盖，后者是对一个仍然活跃的外部要求进行近似满足。二者必须保留不同
provenance。

## 8. Demand 算法

Core 必须拥有唯一的、领域无关的反向需求算法：

```text
visit(port):
  if port already visited:
    return

  if port is pinned:
    verify pinned Record
    mark materialized
    return

  if a valid authored/provided Record already satisfies port:
    mark materialized
    return

  producer = producerOf(port)
  require producer exists
  mark producer demanded

  for every declared producer input:
    visit(input)
```

对每个 Target 调用 `visit`，得到 demanded nodes 的并集，再生成拓扑合法的有限
BuildPlan。

必须满足：

- Pin 精确截断其上游；
- 一个被其他 Target 共用的上游不能被误裁；
- 多 Target 的公共依赖只出现一次；
- 已完成 Record 可以作为恢复事实；
- 图中的非 demanded Node 不进入 BuildPlan；
- BuildPlan 中所有 Step 必须通往至少一个 Target；
- Queue/ready Commands 可以完全从 BuildState 重新生成。

## 9. 规范示例

### 9.1 图片依赖图

```text
H -> P1(H)         -> I1
H -> P2(H, I1)     -> I2
H -> P3(H, I1, I2) -> I3
```

| Target | Pins | 必须执行 |
|---|---|---|
| I3 | 无 | P1、P2、P3 |
| I3 | I1 | P2、P3 |
| I3 | I1、I2 | P3 |
| I3 | I1、I2、I3 | 无 |
| I2 | 无 | P1、P2 |
| I1 | 无 | P1 |

### 9.2 聚合终点

```text
I1 --\
I2 ---- CollectImages -> ImageSet
I3 --/
```

Target `ImageSet` 表示作者此刻想物化并查看全部图片：

| Target | Pins | 必须执行 |
|---|---|---|
| ImageSet | 无 | P1、P2、P3、CollectImages |
| ImageSet | I1、I2 | P3、CollectImages |
| ImageSet | I1、I2、I3 | CollectImages |

CollectImages 是普通组件；“Target 它会 Demand 所有输入”是 Core 法律。

### 9.3 Track 输出

```text
SpeechTrack  --\
BrollTrack   ---- CollectTracks -> TrackSet
CaptionTrack ----/
```

Pin CaptionTrack/BrollTrack 后 Target TrackSet，只运行未 Pin 的 Track 分支和便宜的
CollectTracks。Target CaptionTrack 时不要求 Film、Composition 或 HyperFrames 存在。

## 10. BuildPlan 的新定位

当前 v2 的 BuildPlan 由调用者提前给出 Goals，并验证所有 Step 都通往 Goal。新定位是：

```text
Resolved Module Closure
  + Typed CompiledGraph
  + BuildIntent(Targets + Pins)
      ↓ Core Demand Planner
  finite BuildPlan
      ↓ Core Reducer
  BuildState + Commands
```

现有 `validatePlan()`、拓扑检查、Reducer、Command/Event 完整性逻辑可以保留，但
`start(program, plan)` 的公共入口需要前移为接受 Graph 和 BuildIntent，或只接受由
同一 Core 版本 sealed 的 DemandPlan。

Runtime 不能自行构造一份省略依赖的 BuildPlan 绕过 Demand 法律。

## 11. Need：精确能力与鸭子结果合同

当前 `Need.wants` 同时被用作 Provider dispatch key 和结果 TypeRef，不足以表达
“Kling 可以近似提供兼容视频，但不能声称自己是 Seedance”。目标协议应拆分：

```ts
type Need = {
  capability: CapabilityRef;
  returns: TypeRef;
  constraints: CanonicalValue;
  requestedBy: DerivationId;
  result: RecordId;
  conformanceFloor: "exact" | "substitute";
  requestDigest: Digest;
};
```

例如：

```text
capability = @svml/seedance#mini-speech-video@1
returns    = @svml/contracts#SpeechBasis@1
```

- KIE/火山的真实 Seedance Mini Endpoint 可以声明 exact；
- Kling、黑场或估计实现可以被显式选择为 substitute；
- substitute 必须返回完整 SpeechBasis，而不是裸 URL；
- substitute 不能在下游重新变为 exact；
- Runtime 默认不得在 exact Endpoint 失败后偷偷调用另一个付费模型；
- Pin SpeechBasis 输出则直接裁掉 Producer，不属于 Need substitute。

官方外部视频编译能力应尽量提供无付费 placeholder/estimate fulfillers，使整条标准图
能够构造 substitute preview closure；第三方自定义 Contract 若没有合法 placeholder，
必须由 doctor 明确报告，而不是伪造值。

## 12. Contract Package：共同语言不进入 Core

Core 只拥有类型声明的元语言：TypeRef、ValueSchema、canonical value 和端口类型匹配。
它不内置或全局注册 Track、Narrative、SpeechBasis、Image 或 Composition。

共享数据合同由静态 Contract Package 定义：

```text
@svml/contracts#Track
@svml/contracts#Composition
@svml/contracts#SpeechBasis
@alice/commerce-contracts#ProductSet
```

Contract Package：

- 可以独立发布和版本化；
- 通常由 Author Module 作为传递依赖带入模块闭包；
- 没有 Surface、Producer、Provider 或运行权限；
- 以静态 Manifest Schema 作为 canonical ABI；
- 可以附带 TypeScript 类型、Codec 和测试帮助代码，但代码不是类型真相。

Core 对每次锁定闭包临时建立 Type Environment，不维护全局 `registerTrack()`。共同类型
采用“命名合同 + 结构验证”：组件必须明确声明输出同一个 TypeRef，Core 再验证实际
Record。只有 JSON 形状相似但单位、时基或语义不同的类型不能自动兼容。

### 12.1 Track 必须是开放窄腰

错误设计：

```ts
type Track = CaptionTrack | BrollTrack | TextTrack | CommerceTrack;
```

这会让每个新组件都要求更新 Film、HyperFrames 和中央 CI。

正确设计：Caption、B-roll、Chart、Commerce 等组件自己把私有 Intent 降低为稳定
Track/Composition primitives。Film 只组合标准 Track，HyperFrames 只消费稳定
Composition/Program，不按组件名称 switch。

若新能力真的需要新的 HyperFrames 底层原语，应发布 HyperFrames Contract/Extension
版本，而不是修改 Core。

## 13. 开放世界与独立发布

开放架构的验收标准不是“Core 代码中没有 Film 字样”，而是：

> Core 构建完成后，一个后来发布、Core 从未见过的包可以仅通过安装、锁定和动态
> 加载获得新 Type、Surface、Producer 与 Provider 能力。

禁止：

- Core/CLI/Hosted Runtime 静态 import 所有官方组件；
- 中央 `switch(node.type)`；
- 每增加一个 Track 就修改 Film 或 HyperFrames registry；
- 每个新 Record Type 创建数据库表；
- UI 必须修改中央组件 union 才能显示新节点；
- 从源码 import 自动给第三方代码网络、进程或凭据权限。

必须提供：

```text
Package Resolver
  -> static Manifest Loader
  -> locked Module Closure
  -> sandboxed Surface/Producer Loader
  -> dynamic Producer Worker Registry
  -> dynamic Provider Endpoint Registry
```

现有 Node Driver 的手工 `registerProducer()` 只是测试 Bootstrap，不是最终开放世界加载
机制。官方 CLI 和服务器不得演变为静态注册所有包的大 Bundle。

### 13.1 内部接单流程

一个新内部能力的标准过程应是：

```text
创建 @hypit/order-specific-component
  -> 包自己的 conformance CI
  -> 发布内部 Registry
  -> 项目 import 并更新 lock
  -> Runtime 动态加载其隔离 Worker
  -> 立即可 Target、Pin 和执行
```

Core、CLI 和 Hosted 主服务不重新发布。若能力需要新的 Provider/GPU/外部 API，只部署
相应 Worker 或 Endpoint 包；安装执行新代码不可避免，但不等于重发中央系统。

### 13.2 UI 开放性

通用 UI 必须能从 Manifest/Schema 展示未知组件的名称、端口、参数、Target、Pin、
Record 和诊断。组件可以附带受限 UI Extension，但缺少专用 UI 不能阻止编译或基本
编辑。UI Extension 也不能改变 Core 的 Pin/Demand 语义。

## 14. 持久化不是 Kernel 前提

Target、Pin、Demand 和 ready queue 可以完全在内存实现。需要进程恢复时，本地参考
Runtime 只需：

```text
.svml/
  objects/      content-addressed Artifact bytes
  runs/         BuildState / Events / Receipts JSON
  refs/         saved BuildIntent / Pin selections
```

Queue 不是运行真相，不保存或不信任 outstanding Commands；Core 从可信状态重新生成。

Hosted Runtime 可以使用数据库和 durable broker，但只保存通用 runs/events/operations/
artifacts/refs。新增组件、Contract 或 Record Type 不创建新表，也不要求 Core migration。

## 15. 当前实现差距

已经具备：

- 通用 ModuleManifest types/surfaces/producers；
- 锁定模块闭包与 TypeRef；
- 有限 BuildPlan、Goal reachability 和 cycle validation；
- ready Producer/Need Command 生成；
- immutable Record、Receipt、Derivation 和 digest 验证；
- outstanding Commands 恢复时重建；
- conformance floor；
- Text/Script/WhisperX/Speech Align/Caption 第一批模块。

尚未具备：

- 完整 CompiledGraph 与稳定 PortAddress；
- 任意 TargetSet；
- 通用 PinBinding/PinnedOrigin；
- 从 Target+Pin 派生 BuildPlan；
- Pin 后的 demand pruning；
- Need capability/returns 分离；
- 动态包实现加载和安全沙箱；
- 外部未知包纵向验收；
- v2 Track/Composition/HyperFrames 公共 Contract 与纵向链路。

## 16. 实施顺序

### Phase K1：Graph、Target、Pin、Demand

1. 在 Protocol 定义 CompiledGraph、PortAddress、BuildIntent、BuildTarget、PinBinding；
2. 实现 Core Demand Planner；
3. 让 BuildPlan 只能由 Core seal 或验证为对应 BuildIntent 的派生结果；
4. 增加 pinned Record origin、digest 和 affinity 验证；
5. 让 Reducer 只调度 demanded steps；
6. 保持 JSON round-trip 与 Command 重建。

### Phase K2：Kernel 规范测试

必须先通过：

- I3 无 Pin 执行 P1/P2/P3；
- Pin I1/I2 后 Target I3 只执行 P3；
- Target ImageSet 统一 Demand 所有图片；
- Pin Track 输出只裁掉对应 Track 分支；
- 多 Target 公共上游只执行一次；
- Pin 外部组件输出使其付费 Need 从未产生；
- 全 Pin 后无 Producer/Provider Command；
- 内存与 JSON 恢复得到同一 ready commands。

### Phase K3：Need 与鸭子结果

1. 将 Need 拆为 capability/returns；
2. exact Endpoint 匹配 capability；
3. substitute fulfiller 匹配 returns 并保留 provenance；
4. 验证 Kling 不能 claim Seedance exact，但能显式 substitute SpeechBasis；
5. 验证 Pin SpeechBasis 直接裁掉 Seedance Producer。

### Phase K4：开放世界证明

1. 先构建冻结 Core；
2. 测试运行时临时创建一个 Core 从未见过的外部包；
3. 动态读取它的 Contract、Surface 和 Producer Manifest；
4. 在隔离 Worker 中加载实现；
5. Target 和 Pin 它的输出；
6. 再动态注册一个未知 Provider Endpoint；
7. 全流程成功且 Core 源码/构建产物未改变。

### Phase V1：视频公共窄腰

在前述 Gate 通过后，定义 v2 Track、Composition 和 HyperFrames Program Contracts，
并用一个事后安装的第三方 Track 组件证明 Film/HyperFrames 无中央 switch。

### Phase R1：本地 Runtime

最后才实现 Runtime Profile、进程内 Scheduler、JSON Journal、本地 CAS、动态包 Loader
和真实 Provider。随后再建设 Hosted Runtime、服务器数据库和分布式队列。

## 17. 验收标准

Kernel 重构只有在以下条件同时成立时完成：

1. Film 和 HyperFrames 不是必须存在的 Target；
2. 任意公开输出可被单独 Target；
3. 任意合法公开输出可被 Pin 并截断其 Producer；
4. 多 Target 和共享上游的 Demand Closure 正确；
5. BuildPlan 可证明来自 Graph + BuildIntent；
6. Pin/Target 不依赖数据库；
7. Core 不内置 Track、Image、SpeechBasis 或任何官方组件类型；
8. Contract Package 可以独立发布，无 Core release；
9. 一个事后安装的未知组件无需修改 Core、CLI 或中央 registry 即可运行；
10. 一个事后部署的 Provider Worker 无需重发 Core 即可满足新 capability；
11. 新组件不要求数据库建表；
12. Runtime 恢复从可信事实重建 Commands；
13. exact/substitute provenance 无法伪造或洗白；
14. 所有官方视频组件都建立在这些通用法律之上。
