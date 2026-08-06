# SVML v2 Kernel：Graph、Target、Pin、Demand 与开放世界

> **历史 `@0` 施工记录，已被替代。** 本文中的 `NodeInstance`、`RealizationInstance`、
> `PinBinding`、`BuildIntent`、`svml.graph@0` 与“遇到 Pin 特殊截断”不再是当前模型。
> 当前权威规范是
> [`logical-output-realization-fragment-draft.md`](./logical-output-realization-fragment-draft.md)：
> `LogicalOutput + Candidate + Satisfaction + Operation + BuildRequest`，Pin 只是宿主公开
> Existing-Value Candidate 并建立 Satisfaction 的产品动作；Core 在一次反向遍历中按
> Operation 实例身份收集，不做内容去重。以下正文保留用于
> 解释架构演进，不应直接作为实现接口。当前 wire format 为 `@2`。
>
> **2026-08-04 历史目标。** 以下正文曾补充
> [`intent-first-modular-compilation.md`](./intent-first-modular-compilation.md) 并指导 `@0`
> 实现；它现在只用于解释为什么继续演化到 `@1`。当前规范见
> [`../spec/core-kernel-v1.md`](../spec/core-kernel-v1.md)。
>
> 当前 v2 已实现不可变 Record、Need、Command、Event、Receipt、Derivation、单结果
> CompiledGraph、Primary/Alternative Realization、任意 Target、通用 Pin、反向 Demand
> Planner、声明式亲和性验证、Core-sealed BuildPlan 和纯 Reducer。动态外部包加载、
> 安全沙箱和生产 Runtime/Provider 仍未实现。

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
3. BuildIntent 可为端口显式选择 Primary、某个命名 Alternative 或 Pin；
4. Alternative 只能删除 Primary 输入，不能偷偷增加或更换作者依赖；Pin 是零输入绑定；
5. Core 从 Targets 反向求所选 Realization 的依赖闭包，遇到 Pin 就截断该端口上游；
6. 有限 BuildPlan 是 `CompiledGraph + BuildIntent` 的派生结果，不是完整作者拓扑；
7. Core 决定什么 ready，Runtime Scheduler 只决定何时和在哪里执行；
8. Film、Track、Image、Seedance、WhisperX 和 HyperFrames 都不是 Core 内置概念；
9. 类型化共同语言由 Contract Package 定义，不在 Core 中全局注册；
10. 新组件、Surface、Producer、Provider 或 Contract 可以由事后安装的包提供，
   不得要求修改或重发 Core；
11. 内存和普通文件足以实现 Target、Pin、Demand、恢复和本地队列；数据库不是前提。

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
start(program, graph, intent) -> BuildState

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
  output: {
    address: PortAddress;
    record: RecordId;
    type: TypeRef;
    affinity?: readonly AffinityConstraint[];
  };
  primary: RealizationInstance;
  alternatives: readonly RealizationInstance[];
};

type RealizationInstance = {
  producer: ProducerRef;
  inputs: Record<string, PortAddress | RecordId>;
  result:
    | { kind: "output"; name: string }
    | { kind: "need"; name: string; id: NeedId };
  fidelity: "exact" | "substitute";
};

type CompiledGraph = {
  format: "svml.graph@0";
  id: Digest;
  program: Digest;
  nodes: readonly NodeInstance[];
};
```

`program` 绑定 LinkedProgram semantic digest；authored Records 只由 LinkedProgram
持有，Graph 通过 RecordId 引用，避免两个事实来源。一个 Node 只有一个逻辑公开输出，
但它的 Realization 可以由 Producer 直接返回，也可以产生一个明确外部 Need。

Producer 必须满足单公开结果范式：`outputs.length + needs.length === 1`。若一次底层操作
自然产生音频和视频，应先返回一个原子的 `SpeechBasis` 合同；字段投影再由便宜的独立
Producer 完成。这样 Pin 一个逻辑输出不会与同节点的另一个新输出发生冲突。

最终字段会随实现收敛，但必须保留以下不变量：

- Node 和 Port 地址稳定且唯一；
- 每个非 authored output 只有一个逻辑身份、一个 Primary，并可声明多个命名 Alternative；
- 每条依赖边显式、类型化并属于锁定模块闭包；
- 图中不存在未声明依赖或运行时扫描得到的隐藏工作流；
- Producer 的端口与静态 Manifest 完全一致；
- Primary fidelity 必须是 exact；Alternative 的输入绑定必须是 Primary 输入绑定的子集；
- 完整图可以包含多个互不相干的终端和中间检查点；
- 图本身不选择本次要执行哪一个终端。

### 4.2 依赖边具有强制语义

如果本次选中的 Realization 声明消费三个输入，那么 Target 该 Node 的输出时，三个
输入都必须被 Demand。Core 不做“这个输入看起来没被实现代码使用”的死参数优化；
只有显式选择输入更少的 Alternative 才会改变依赖闭包。

因此一个普通聚合节点可以有意表达：

> 在我完成之前，请把这一组输出全部物化。

这是作者图的一部分，不是假的执行技巧。

## 5. BuildIntent：Targets 与 Bindings

一次运行的作者选择由 Kernel 对象表达：

```ts
type BuildIntent = {
  format: "svml.build-intent@0";
  graph: Digest;
  targets: readonly BuildTarget[];
  bindings: readonly (RealizationBinding | PinBinding)[];
  digest: Digest;
};

type BuildTarget = {
  port: PortAddress;
  accepts: "exact" | "substitute";
};

type RealizationBinding = {
  kind: "realization";
  port: PortAddress;
  realization: ProducerRef;
};

type PinBinding = {
  kind: "pin";
  port: PortAddress;
  value: StoredValue;
  fidelity: "exact" | "substitute";
  provenance?: CanonicalValue;
};
```

Pin 不重复携带 RecordId、TypeRef 或 Origin；这些身份来自锁定 Graph，Core 在验证完整
BuildIntent 后生成 `PinnedOrigin`。这样避免 Pin 自己携带 `buildIntentDigest` 造成循环
摘要，也防止调用者为端口伪造另一个类型或 Record identity。

BuildIntent 可以来自 CLI、Canvas、编辑器、JSON 文件或 Hosted 产品，但其 canonical
identity、类型验证和语义属于 Core。存储位置不决定其含义。

应区分三个身份：

```text
sourceSemanticDigest
  完整作者图表达了什么

buildIntentDigest
  这次选择哪些 Targets、Alternatives 和 Pins

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
  bindingDigest: Digest;
  provenance?: CanonicalValue;
};
```

Pin 不能声称原 Producer 执行过。公开组件输出应尽可能采用中立 Contract，例如
SpeechBasis、Image、Track，而不是把 Provider 品牌写进输出类型。

### 7.2 Pin、Alternative 与 Provider 是三个不同维度

假设一个逻辑 SpeechBasis 输出有 Seedance Primary、黑场 Alternative 和历史 Pin：

```text
Pin SpeechBasis output
  -> Seedance Producer 被裁掉
  -> Seedance Need 从未产生

选择黑场 Alternative
  -> 只 Demand 黑场声明使用的 duration 输入
  -> 参考图等其余 Primary 上游被裁掉
  -> 结果 fidelity 固定为 substitute

选择 Seedance Primary
  -> Seedance Producer 被 Demand
  -> 产生 Seedance Mini Need
  -> Runtime 只能绑定能够 exact claim 该 Capability 的 KIE/火山 Endpoint
```

Kling 若真要替代 Seedance，必须是源码模块声明的命名 Alternative；它仍只可消费
Primary 输入的子集。Runtime 不得看到 `returns = SpeechBasis` 就自行挑 Kling、黑场或
缓存。Provider 只回答“已选中的精确能力在哪里执行”，不参与作品方法选择。

### 7.3 精确 Pin 不能伪造亲和性

端口可以声明领域无关的等式约束：

```ts
type AffinityConstraint = {
  resultPointer: string;
  source: PortAddress | RecordId;
  sourcePointer: string;
};
```

例如 SpeechBasis 的 `narrativeDigest` 必须等于 Narrative 的 semantic index digest；
WhisperX Evidence 的 `basisDigest`、`audioArtifactDigest` 和 `programSpaceDigest` 必须等于
当前 Basis 的对应字段。Core 只执行 JSON Pointer 等式，不认识这些视频概念。

精确 Pin 必须能从 authored Record 或同次 BuildIntent 的另一个 Pin 证明这些等式。
若它 Pin 了 Evidence 却没有物化或 Pin 相应 Basis，Core 不能预知一次非确定性生成将
得到哪个 Basis，因此拒绝 `exact`。作者仍可明确选择 `substitute` Pin 来表示故意使用
无亲和性保证的预览；这种结果及所有下游永远不能洗回 exact。

## 8. Demand 算法

Core 必须拥有唯一的、领域无关的反向需求算法：

```text
visit(port):
  if port already visited:
    return

  binding = buildIntent.bindingFor(port)
  if binding is Pin:
    verify value, fidelity and affinity
    return

  realization = binding.selectedAlternative ?? primaryOf(port)
  mark realization.producer demanded

  for every input bound by the selected realization:
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
- 其他 Build、普通缓存或外部文件不能环境式截断图；它们必须先成为显式 Pin 或带
  Receipt 的本次履约事实。

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

当前实现中 BuildPlan 已不再由调用者提前给出，而采用以下定位：

```text
Resolved Module Closure
  + Typed CompiledGraph
  + BuildIntent(Targets + Realization/Pin Bindings)
      ↓ Core Demand Planner
  finite BuildPlan
      ↓ Core Reducer
  BuildState + Commands
```

公共入口已经切换为 `start(program, graph, intent)`。`deriveBuildPlan()` 是领域无关的
纯函数；`validatePlan()` 会重新派生并进行 canonical 比较。拓扑检查、Reducer 和
Command/Event 完整性逻辑继续作用于派生出的有限计划。

Runtime 不能自行构造一份省略依赖的 BuildPlan 绕过 Demand 法律。

## 11. Need：精确能力与鸭子结果合同

旧 `Need.wants` 同时被用作 Provider dispatch key 和结果 TypeRef，无法表达
“Kling 可以近似提供兼容视频，但不能声称自己是 Seedance”。当前协议已经拆分为：

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
- KIE/火山 Endpoint 都可精确执行已经选中的 Seedance capability；多者存在时 Profile
  必须显式 bind；
- Kling、黑场或估计不是 Provider fallback，而是 Author Module 声明并由 BuildIntent
  选中的 Alternative；
- Alternative 仍必须返回完整 SpeechBasis，而不是裸 URL；
- Realization fidelity 与 Provider fulfillment conformance 分开计算，并与所有上游
  质量取最差值，不能在下游重新变为 exact；
- Pin SpeechBasis 输出直接裁掉 Producer，不产生 Need 或 Receipt。

官方作者模块可以提供命名的无付费 placeholder/estimate Alternatives，使标准图能够
构造 substitute preview closure；第三方 Contract 若没有合法 Alternative，doctor 应
明确报告，而不是由 Runtime 按 TypeRef 伪造一个。

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

其中静态注册 Manifest、精确传递 Module Closure 和受控本地 Source Resolver 已由
`@svml/compiler-node` 实现；它故意不把 import 字符串当作执行 npm 代码的权限。静态
Manifest Loader、lock-aware 包定位、隔离 Surface/Producer Loader 与动态 Worker
Registry 仍是开放第三方包之前的缺口。

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

- 通用 ModuleManifest types/capabilities/surfaces/producers；
- Producer 单公开结果范式；
- 锁定模块闭包与 TypeRef；
- 单逻辑输出 CompiledGraph、Primary/Alternative Realization、稳定 PortAddress 和 cycle validation；
- BuildIntent、任意 TargetSet、显式 RealizationBinding、通用 PinBinding/PinnedOrigin；
- Pin 截断、多 Target 并集和反向 Demand Closure；
- Alternative 输入子集约束和按所选 Realization 求 Demand；
- Core 派生并封存的有限 BuildPlan 与 Goal reachability；
- ready Producer/Need Command 生成；
- immutable Record、Receipt、Derivation 和 digest 验证；
- outstanding Commands 恢复时重建；
- conformance floor；
- Need capability/returns 分离；
- Provider 只按 exact capability + returns 路由；Alternative fidelity 与 Provider fulfillment
  conformance 独立、单调传播；
- Protocol 层的统一 canonical/digest 法则，Contract Package 不再依赖 Core；
- 通用 JSON Pointer 亲和性等式、精确 Pin 证明以及 SpeechBasis/Evidence/Map 的媒体绑定；
- Text/Script/WhisperX/Speech Align/Caption 第一批模块。

尚未具备：

- 动态包实现加载和安全沙箱；
- 外部未知包纵向验收；
- Pin Artifact bytes 的 Runtime Store 验证；
- v2 Track/Composition/HyperFrames 公共 Contract 与纵向链路。

## 16. 实施顺序

### Phase K1：Graph、Target、Pin、Demand（已完成）

1. 在 Protocol 定义 CompiledGraph、PortAddress、BuildIntent、BuildTarget、PinBinding；
2. 实现 Core Demand Planner；
3. 让 BuildPlan 只能由 Core seal 或验证为对应 BuildIntent 的派生结果；
4. 增加 pinned Record origin、digest 和锁定输出 Schema 验证；
5. 让 Reducer 只调度 demanded steps；
6. 保持 JSON round-trip 与 Command 重建。

Artifact bytes 可用性仍由 Runtime Store 验证；Basis/Evidence 等跨 Record 关系已经
降低为 Core 可执行的通用声明式等式，没有视频类型分支。

### Phase K2：Kernel 规范测试（已完成）

必须先通过：

- I3 无 Pin 执行 P1/P2/P3；
- Pin I1/I2 后 Target I3 只执行 P3；
- Target ImageSet 统一 Demand 所有图片；
- Pin Track 输出只裁掉对应 Track 分支；
- 多 Target 公共上游只执行一次；
- Pin 外部组件输出使其付费 Need 从未产生；
- 全 Pin 后无 Producer/Provider Command；
- 内存与 JSON 恢复得到同一 ready commands。

### Phase K3：Realization 与鸭子结果（已完成）

1. 将 Need 拆为 capability/returns；
2. exact Endpoint 匹配 capability；
3. 每个逻辑输出声明 Primary 与命名 Alternatives；
4. Alternative 只能删减 Primary 依赖，并由 BuildIntent 显式选择；
5. Provider Registry 不提供按返回 TypeRef 的 substitute 路由；
6. 验证 Kling 不能 claim Seedance exact，黑场/冻结帧只保留自己声明的输入；
7. 验证 Pin SpeechBasis 直接裁掉 Seedance Producer；
8. 用声明式 affinity 拒绝来自另一 Basis 的精确 Evidence/Pin。

### Phase V0：真实视频窄链（下一步）

在建设任意第三方代码执行前，先补齐一个可信官方纵向链路：Script → Seedance
SpeechBasis → WhisperX → SemanticMap → Caption/Track → HyperFrames。用真实 Artifact
Store 验证 Pin、Alternative、恢复和部分 Target，避免项目长期停留在基础设施层。

### Phase K4：开放世界证明

1. 先构建冻结 Core；
2. 测试运行时临时创建一个 Core 从未见过的外部包；
3. 动态读取它的 Contract、Surface 和 Producer Manifest；
4. 在隔离 Worker 中加载实现；
5. Target 和 Pin 它的输出；
6. 再动态注册一个未知 Provider Endpoint；
7. 全流程成功且 Core 源码/构建产物未改变。

### Phase V1：视频公共窄腰

与 V0 同步收敛 v2 Track、Composition 和 HyperFrames Program Contracts，
并用一个事后安装的第三方 Track 组件证明 Film/HyperFrames 无中央 switch。

### Phase R1：本地 Runtime

实现 Runtime Profile、进程内 Scheduler、JSON Journal、本地 CAS 和可信官方 Provider；
动态第三方包 Loader 与沙箱在真实纵向链路之后完成。随后再建设 Hosted Runtime、
服务器数据库和分布式队列。

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
