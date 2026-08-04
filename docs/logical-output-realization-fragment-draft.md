# SVML v2：Logical Output、Candidate、Build Compiler 与 Graph Fragment

> **Kernel 施工规范与实现记录，2026-08-05。** `LogicalOutput`、`Candidate`、
> `OperationNode`、`BuildRequest`、单遍 Build Compiler 和新 Build Machine 已按本文
> 落地为 `@1` wire format。SpeechTake Product/Projection、静态卫生 Graph Fragment 与
> 内容寻址 Realization Overlay 也已完成第一版可执行原型。真实纵向链路目前已通过
> `SpeechTake -> audio projection -> WhisperX -> Evidence -> SemanticMap -> Caption`，并以
> 官方静态 Fragment 验证 Target 裁剪、共享调用、Existing Value、Substitute 和恢复；
> Track、Composition、HyperFrames 与公开包加载 ABI 仍是下一阶段，不能提前视为稳定 API。
>
> 本文尤其修正两个过早收敛：旧
> [`kernel-graph-build-intent-v2.md`](./kernel-graph-build-intent-v2.md) 把一个
> `NodeInstance` 限制为一个公开输出，并把一个 Realization 直接等同于一个 Producer。
> 这个模型解决了第一版多输出 Pin 冲突，却无法自然表达多输出作者组件、共享的昂贵
> 上游、由多步组成的实现，以及可复用的漂亮 Surface；同时，旧 `@0` 实现把 Pin 设为
> Kernel 特殊 Binding，其实 Pin 只是外部工具“选择一个已有 Value Candidate”的动作。
> 相应的“K1/K2/K3 已完成”只能代表当前原型通过了旧模型测试，不能代表本问题已经
> 收敛。

本轮收敛结论：

1. Candidate 是 Logical Output 唯一的实现选择单位；
2. Candidate root 统一为 Existing Value 或 Operation Result；
3. Pin 只是外部工具创建/引用 Existing-Value Candidate 并选中它的动作，不进入 Core
   词汇；
4. Existing Value 没有入边，所以反向 Demand 自然停止，不存在 Pin 专用裁剪法则；
5. Candidate 选择和 Demand 是两个语义问题，但由同一个 Build Compiler 从 Targets
   出发，在一次遍历中共同求解。
6. Logical Output affinity 约束任意 Candidate 对作者承诺的结果；Producer result affinity
   约束 Fragment 内部每个 Operation Result 对其输入的事实关系。两者都只是声明式 JSON
   Pointer 等式，Core 不认识视频领域。

## 1. 为什么最近突然变复杂

复杂性不是来自视频轨道本身，而是我们同时要求系统保留下面这些自由：

1. 作者源码只表达意图，而且必须漂亮；
2. 任意公开结果都能单独 Target、重跑，并显式改用已有 Value；
3. 同一个作者组件可以自然地产生多个相关结果；
4. 一个结果可以有正式生成、黑场、冻结帧、历史值等不同实现；
5. 两个实现可以共享一个昂贵、非确定性的 AIGC 上游，而且只能运行一次；
6. 外部包可以事后增加能力，但 Runtime 不能擅自替作者选择 Kling 或 Seedance；
7. Build 必须可恢复、可追溯、可重现，不能靠对象引用或环境扫描碰运气；
8. Core 不能认识 Speech、Track、Seedance、WhisperX 或 HyperFrames 等领域名词。

每增加一种自由，就必须分开一组以前可以混用的概念：

```text
Target      迫使我们区分“完整作者图”和“本次真正需要的闭包”
已有值复用  迫使我们区分“逻辑结果身份”和“产生它的操作”
Alternative 迫使我们区分“要什么”和“这次怎样得到”
多输出      迫使我们区分“作者组件”“一次原子操作”和“公开结果”
AIGC        迫使我们按操作实例去重，不能按参数或内容猜相同
外部包      迫使我们区分源码语义、Build 选择和 Runtime Endpoint
漂亮语法    迫使我们允许封装，但封装必须可静态展开且不能捕获隐藏依赖
```

传统画布或普通工作流看起来更简单，通常是因为它放弃了其中几项：只允许整节点 Pin、
把素材当唯一真相、允许 Runtime 猜执行器，或默认任务便宜且确定。AIGC 任务昂贵、缓慢、
会失败且非确定，因此这些含糊之处会直接变成费用、错误作品或无法恢复的 Build。

我们的目标不是让 Core 吞下全部复杂性，而是找到一个更小的代数，把其余复杂性都在
进入 Core 前降低掉。

## 2. 最近几轮暴露出的具体需求

### R1：作者组件必须允许多个公开结果

一个口播生成动作可能自然得到：

```text
SpeechTake
  ├── visual
  ├── audio
  └── duration / program-space metadata
```

WhisperX 调用也可能自然得到原始 transcript、词级证据和诊断信息。不能为了 Kernel
方便，强迫作者把每个自然组件写成许多互不相关的丑标签。

### R2：Pin 是外部工具动作，不是 Kernel 对象

用户真正表达的是：

> 本次 Build 的 `opening.visual` 使用这个已经存在的视频。

而不是：

> 请修改某个内部 Worker 节点的执行状态。

外部工具应把这个动作解析成：

```text
创建或引用一个 root 为 Existing Value 的 Candidate
  +
本次把 opening.visual 绑定到该 Candidate
```

因此 Pin 操作的目标确实是稳定 Logical Output，而不是内部执行节点；但 Core 不需要
`PinBinding`、`PinnedOrigin` 或专用 Pin pruning。UI 中的“Pin 整个组件”可以创建多个
Candidate bindings，或为一个公开原子 Bundle 选择 Existing Value Candidate。

### R3：一个输出改用 Existing Value，不能让同一操作的其他输出语义不明

反例：生成操作同时产出 video 和 audio，用户让 video 改用已有值、同时 Target audio。
为了得到 audio，底层生成仍可能必须执行，并顺便得到另一份 video。系统必须回答：下游
看到哪一份 video、操作是否冲突，以及已有值 Candidate 为什么会让某条 Demand 路径
停止。

### R4：不同 Logical Output 可以选择不同 Candidate

设组件 B 公开 `x` 和 `y`，组件 C 同时消费二者。本次 Build 可以为 `x` 选择 Kling
预览、为 `y` 选择 Grok 预览。Core 不应假设“同一个作者组件只能整体换实现”。

但若二者在语义上必须来自同一次 take，则组件需要提供一个可整体选择的原子 Bundle，
而不是让 Core 猜哪些端口必须联动。

### R5：不同 Candidate 共享的昂贵上游只能运行一次

讨论中的反例：

```text
             ┌─ Kling ─> B.x ─┐
GPTImage A ──┤                ├─> C
             └─ Grok  ─> B.y ─┘
```

Target C 时，A 应只运行一次。不能因为 Kling 和 Grok 分属两个替代分支，就复制 A 或
各运行一次。

反过来，如果作者明确实例化 `A1` 和 `A2`，即使 prompt 完全相同，也必须运行两次。
AIGC 不允许按 ProducerRef、prompt、Provider、request digest 或“看起来一样”做语义
去重。

### R6：一个 Realization 可能是一条多步子图，不只是一个 Producer

黑场可能只是一项操作；正式口播链路则可能是：

```text
estimate -> Seedance -> SpeechTake -> WhisperX -> Evidence -> SemanticMap
```

字幕组件也可能包含 cue planner、projection 和 Track lowering。若 Realization 只能
等于单个 Producer，漂亮的官方组件只能把内部流程泄漏给作者，或者重新制造一个巨型
不可 Pin 的黑盒节点。

### R7：封装必须支持漂亮 Surface，但不能产生隐藏捕获

作者应该可以写一个简洁组件，让包内部展开 WhisperX、SemanticMap、Caption 等流程。
禁止的不是“组件内部有多步”，而是：

- BuildRequest 临时塞入一段无版本、无身份的匿名执行图；
- Fragment 读取未声明的外部节点或资产；
- 两个 Fragment 偷偷复制同一个外部昂贵操作；
- 运行时扫描已安装包并自动注入候选；
- 通过任意 JS 闭包捕获凭据、文件或环境状态。

### R8：外部 Realization 必须显式附着，不能由 Runtime 猜

源码明确选择 Seedance Mini 后，Runtime 只能为对应 Capability 绑定 KIE、火山或
Hypit 等精确 Endpoint。它不能因为 Kling 也返回视频，就自行换成 Kling。

但一次 Build 可以在不改作者正文的情况下，显式选择一个已安装的黑场 Candidate，或
把某个历史 Value 包装成安全、无代码的 Provided Candidate。这个动作应类似“给一个
Logical Output 附着并选择一个实现”，但不能和源码 `<import>`、Provider 路由混成
一件事。

### R9：替代实现需要输入边界，但“直接输入子集”太死

当前规则要求 Alternative 的直接输入是 Primary 直接输入的子集。它能防止黑场偷加
隐藏素材，却无法表达由多步子图组成的 Candidate，也把内部中间结果误当成作者依赖。

真正需要限制的是 Candidate 最终能追溯到哪些**作者语义输入**，而不是它内部有多少步。
黑场可以只消费 duration，冻结帧可以消费 duration + reference image，Kling 可以消费
Primary 已声明的某些语义输入；它们都不能偷偷捕获一个无关项目的素材。

### R10：有时必须保持多输出的共同来源

如果 audio 与 visual 必须来自同一次口播生成，仅仅让它们类型都合法还不够。系统需要
保留 `takeDigest`、`basisDigest` 或其他通用亲和性证明。否则“Seedance audio + Kling
visual”可能被错误宣称为 exact。

### R11：已安装不等于已附着，已附着不等于已选择

必须区分：

```text
installed   包存在于机器或 lock 可解析范围
attached    本次 Source/Overlay 允许引用它导出的 Candidate
selected    BuildRequest 为某个 Logical Output 选择了它
demanded    该选择位于当前 Targets 的反向闭包中
executed    Scheduler 最终发出了对应操作
```

只有最后两步会产生工作。环境中安装一个包不能改变作品，也不能改变 DemandPlan。

### R12：Fragment 内部结果也必须可验证

一个多步 Fragment 的中间 Operation Result 不一定同时成为本次被 Demand 的 Logical
Output。若 affinity 只挂在作者公开结果上，错误的 STT Evidence 可能先进入 BuildState，
直到后面的 locator 才发现不匹配。

因此 affinity 有两个互补层级：

```text
Producer result affinity
  每次执行都验证：结果字段 == 某个输入字段

Logical Output affinity
  每次选择 exact Candidate 都验证：实现结果 == 作者结果承诺的语义来源
```

Producer Manifest 声明字段关系，Core 对所有派生输出和 Need fulfillment 统一执行 JSON
Pointer 比较。`WhisperXEvidence.basisDigest` 必须在进入 BuildState 时就匹配输入的
`SpeechAudioBasis.basisDigest`；不能依赖下游包事后补救。

### R13：Composition 只接收平级、自包含的 Track 贡献

最终接入 Composition 的所有内容必须先降低为普通 Track。A-roll、B-roll、Caption、Text、
蒙版和音频在 Composition 中没有主从关系，也没有任何一个 Track 可以读取、裁切、遮罩、
求交、改写或重新解释另一个兄弟 Track。

```text
Speech visual ───────────────> VisualTrack ─┐
B-roll ──────────────────────> VisualTrack ─┤
TimedCaption + style/cues ───> VisualTrack ─┤
Text + style ────────────────> VisualTrack ─┼─> Composition
Vignette / overlay ──────────> VisualTrack ─┤
Speech audio / BGM / SFX ────> AudioTrack ──┘
```

Composition 只负责把具有同一 ProgramSpace 的自包含贡献按各自时间窗口、空间参数和 z
组合起来。它不认识 Caption、Speech、B-roll 或“全局特效”。

允许：

- 一个暗角包产生独立、带透明度的 VisualTrack，作为普通叠加层；
- 一个 Track 在自己的内部 Fragment 中完成裁切、变换、滤镜、片内转场或预合成；
- 一个上游组件消费多份素材，产出一条新的自包含 Track。

禁止：

- “把其他所有 Track 碎裂”的全局后处理 Track；
- 在 Composition 阶段用 Track A 与 Track B 做交集、差集、遮罩或内容采样；
- CaptionTrack、A-roll Track 等获得特殊合成权限；
- 转场对象在最终 Composition 中修改左右两个兄弟 Track。

若一个效果必须共同读取两份画面，它必须在进入最终 Composition 之前把这些素材预合成为
自己拥有的单一 VisualTrack；不能把跨 Track 可变关系泄漏进 Composition。Caption 的
`TimedCaptionProjection` 只是有时间的中间语义产物，样式与 cue lowering 完成后，其最终
输出必须是普通 VisualTrack。

## 3. 候选核心模型

### 3.1 四个不可再混用的对象

#### Author Component

面向作者的概念和漂亮 Surface。它可以有多个命名输出，可以由包或 `.svs` 配方定义，
但不直接等于一次 Kernel Operation。

#### Logical Output

作者可引用和 Target、外部工具可为其选择 Candidate 的稳定结果身份，例如：

```text
opening.take
opening.visual
opening.audio
opening.semanticMap
captions.track
```

Logical Output 表示“这个位置需要什么”，不绑定某个 Producer。

#### Operation

运行图中的原子计算实例：显式输入，产生**一个原子 Product**。它有稳定 OperationId。
“一个 Operation 一个 Product”不是要求底层 API 只能返回一个文件，而是要求它把一次
不可分割的事实封装成一个内容寻址值。

#### Candidate / Realization

某个 Logical Output 的一种可选来源。Candidate 的 root 可以是全局 Operation DAG 中的
一个结果、一个经卫生展开后接入全局 DAG 的 Graph Fragment export，或一个已经物化的
不可变 Value。它不是 Provider Endpoint，也不天然拥有或复制整条上游图。

```ts
type CandidateRoot =
  | { kind: "value"; value: ProvidedValue }
  | { kind: "operation"; result: OperationResultRef };
```

这两种 root 地位平等：Operation Result 表示尚需执行的实现；Provided Value 表示已经
存在的事实。产品所谓 Pin，只是创建/引用后一种 Candidate 并在本次 Build 中选择它。

### 3.2 一次多产物操作用 Product + Projection 表达

候选模型：

```text
GenerateSpeechTake Operation
  -> SpeechTake Product
       ├── visual
       ├── audio
       └── programSpace

ProjectVisual(SpeechTake)      -> Visual Product
ProjectAudio(SpeechTake)       -> Audio Product
ProjectProgramSpace(SpeechTake)-> ProgramSpace Product
```

投影是便宜、确定、可缓存的普通 Operation。Author Component 可以继续对外展示三个漂亮
Logical Output，不要求作者看到投影节点。

这解决 R3：

- `opening.visual` 改选 Existing Value Candidate 后，所有消费该 Logical Output 的下游
  只会得到这个已有值；
- 若仍 Target `opening.audio`，其 Primary Candidate 会 Demand `SpeechTake` 和 audio
  projection，底层生成可能顺便产生 visual 字段；
- 这份内部字段属于 `SpeechTake Product`，不是第二个 `opening.visual` Record，因此
  不发生重复逻辑结果冲突；
- 如果没有任何其他 demanded output 使用 `SpeechTake`，Existing Value root 没有入边，
  整条生成上游自然不会被 Demand；
- 如果作者要求整组结果都来自历史 take，应让 `opening.take` 选择一个 Existing
  SpeechTake Candidate，而不是分别拼接端口。

所以最底层的准确规律不是“Pin 会裁剪”：

> Build Compiler 从所选 Candidate root 反向遍历；Existing Value 没有入边，所以遍历
> 自然停止，但仍被其他 demanded output 引用的共享 Operation 继续保留。

外部 UI 的“Pin 一个端口”不是“无条件停掉整个作者组件”。

### 3.3 完整候选图是 AND/OR 图，选完后仍是普通 DAG

```text
Logical Output
  OR: Primary / Black / Freeze / External / Existing-Value Candidate

Selected Operation
  AND: 它声明的全部输入依赖
```

完整 Author Graph 带有选择关系，可以把它理解为 AND/OR graph；这不是视频的 z 轴，
也不是同时执行多套图。Build Compiler 从 Targets 出发，只在访问某个 Logical Output
时解析本次 Candidate，然后继续反向 Demand。最终得到的有限 Operation Graph 仍是
普通 DAG。

Existing-Value、黑场、冻结帧、Kling 和 Primary 都是平等 Candidate。区别只在 root：
已有值是没有入边的事实；其他 Candidate 的 root 通常是需要执行的 Operation Result。

### 3.4 选择与 Demand 由同一个 Build Compiler 共同求解

实现选择回答“如果需要这个 Logical Output，采用哪个来源”；Demand 回答“本次 Targets
究竟会访问哪些 Logical Outputs”。两者语义正交，但不应实现成“先全局选择所有输出，
再进行第二遍 Demand”的两个割裂阶段。

同一个 Build Compiler 从 Targets 开始，边访问、边选择、边展开、边去重：

```ts
type BuildRequest = {
  targets: readonly LogicalOutputId[];
  bindings: Readonly<Record<LogicalOutputId, CandidateId>>;
};
```

`bindings` 只保存统一 CandidateId；不存在 Pin variant。没有显式 binding 的输出使用
Author Graph 声明的 Primary Candidate。

当前实现算法（伪代码省略类型和错误处理）：

```text
resolveOutput(logicalOutputId):
  if resolvedOutputs contains logicalOutputId:
    return resolvedOutputs[logicalOutputId]
  if resolvingOutputs contains logicalOutputId:
    reject cycle
  mark logicalOutputId resolving

  candidate = explicit binding or Primary Candidate
  result = resolveRoot(candidate.root, candidate.fidelity)
  verify result TypeRef
  resolvedOutputs[logicalOutputId] = result
  record SelectionTrace(logicalOutputId, candidate, result)
  unmark logicalOutputId resolving
  return result

resolveRoot(root, fidelity):
  if root is ExistingValue:
    verify value, type, digest, affinity and conformance
    add it once to InitialValues
    return its RecordId
  return demandOperation(root.OperationId, fidelity)

demandOperation(OperationId, fidelity):
  if demandedOperations contains OperationId:
    worsen its fidelity monotonically if necessary
    return the memoized result RecordId
  if resolvingOperations contains OperationId:
    reject cycle
  mark OperationId resolving

  for every declared input of operation:
    if input is LogicalOutputRef:
      bind input to resolveOutput(input.logicalOutput)
    if input is OperationResultRef:
      bind input to demandOperation(input.OperationId)
    if input is authored RecordRef:
      bind input to that verified authored Record

  demandedOperations[OperationId] = one atomic step
  unmark OperationId resolving
  return its result RecordId
```

编译结果直接是有限 BuildPlan；不需要先持久化一份“全局 SelectedGraph”。关键是按稳定
`OperationId` 去重，而不是按 Candidate、Producer 类型或内容参数去重。这里不是运行后
发现重复再合并，而是在反向展开时通过两张 memo 表保证：一个 LogicalOutputId 只解析
一次，一个 OperationId 只进入计划一次。

因此 R5 的例子中：

```text
selected roots = {Kling.result, Grok.result}
closure        = {GPTImage A, Kling, Grok, C}
```

`GPTImage A` 只出现一次。若源码显式创建 `A1`、`A2`，则两个 OperationId 都会进入闭包，
按作者意图运行两次。

讨论中的 `a.A/a.B -> b.C/b.D -> c` 反例也因此没有“复制上游”的隐式规则：`c` 先解析
`b.C` 与 `b.D`；`b1`、`b2` 再分别请求 `a.A` 和 `a.B`。第一次请求把结果放进
`resolvedOutputs`，第二次直接取得同一个 RecordId。如果 `a.A/a.B` 是 Existing Value，
计划只有 `b1、b2、c`；如果它们来自 `a1、a2` Operation，计划只有
`a1、a2、b1、b2、c`，每个 OperationId 恰好一次。

### 3.5 Core 只区分已有事实与待执行操作

Core 不区分 Pin、黑场、历史版本或人工结果，只区分 Candidate root 的结构：

| 外部含义 | Candidate root | 是否产生 Command |
|---|---|---:|
| 已存在的批准视频 | Existing Value | 否 |
| 已存在的固定黑场 | Existing Value | 否 |
| 根据 duration 合成黑场 | Operation Result | 是 |
| 零输入随机图片生成器 | Operation Result | 是 |

“零输入”不等于“已经存在”。一个没有语义输入但尚未执行、可能失败或产生非确定结果的
Producer 仍是 Operation；一个内容摘要已知且已经物化的 Artifact 才是 Existing Value。
不应把已有值伪装成 `ConstOperation()`，否则会制造多余 Command，并虚构一条 Producer
Derivation。

因此 Pin 和黑场没有类别差异：一个黑场可以是已有值 Candidate，也可以是需要 duration
的 Operation Candidate。Core 只验证 Value/Operation、类型、摘要、亲和性和 conformance，
从不按“Pin”或“Preview”分支。

### 3.6 Candidate 的输入约束改为 Semantic Input Envelope

不再只比较 Candidate 的直接 input map。每个 Logical Output 声明一个允许的语义输入
边界：

```text
opening.visual envelope
  = {script segment, duration, reference image, direction, visual settings}
```

Candidate 可以在边界内建立任意有限内部 Operation DAG，但它所有 authored leaf 和外部
Logical Output 引用的传递闭包必须属于该 envelope。

候选规则预演：

1. Candidate root 必须产生该 Logical Output 要求的精确 TypeRef；“内部 Product 更丰富”
   不等于公开输出可以类型不匹配；
2. Candidate 的作者语义 leaf 必须是 envelope 的子集；
3. Candidate 可以增加内部中间 Operation；
4. Candidate 可以产生自己明确声明的外部 Need，但 Need 的创作方法属于 Candidate 包，
   不能由 Runtime 临时发明；
5. Provider 凭据、Endpoint、重试和队列不是作者语义输入，不进入 envelope；
6. Substitute Candidate 可以忽略某些输入，且 fidelity 必须单调传播；
7. 能否成为 exact 不只看输入集合，还要看 Contract、亲和性和实现证明。

这里的方向不是“输入必须是子集、输出必须是超集”。更准确的是：

> 公开输出必须满足同一个 Logical Contract；内部可以产生更丰富的原子 Product；
> Candidate 对作者世界的可见依赖不能越过 Logical Output 的 Semantic Input Envelope。

## 4. Graph Fragment：允许封装，不允许捕获

### 4.1 为什么需要 Fragment

若每个 Candidate 都只能指向手写的全局单 Operation，官方包无法隐藏：

```text
Seedance -> SpeechTake -> WhisperX -> Evidence -> SemanticMap -> Caption
```

作者 Surface 会重新变成工作流配置。Graph Fragment 的任务，是让包定义可复用、多步、
多 export 的类型化图模板，并在 lowering 阶段卫生地展开。

### 4.2 Fragment 的当前原型边界

概念结构：

```ts
type GraphFragment = {
  format: "svml.fragment@1";
  id: Digest;
  inputs: readonly FragmentInput[];
  operations: readonly LocalOperation[];
  exports: readonly FragmentExport[];
};

type FragmentInstanceRequest = {
  id: string;                 // 稳定作者实例身份
  fragment: Digest;
  inputs: Record<string, GraphValueRef>;
};
```

Fragment 内部只允许引用：

- 自己声明的 Fragment inputs；
- 自己内部 Operation 的结果；
- 静态 Manifest 锁定的 Contract、Producer 和 Capability。

它不能捕获定义之外的全局节点、当前目录文件、环境变量、Credential 或“最近生成的一张
图”。需要外部值时必须把它声明成 input。

展开后的 OperationId 必须卫生且稳定。源码和诊断可保留如下本地路径：

```text
opening::speech/seedance
opening::speech/project-audio
opening::alignment/whisperx
opening::alignment/locate
```

wire identity 当前使用 `fragment digest + instance id + local operation id` 的摘要，避免第三方
包制造字符串碰撞；可读本地路径用于 provenance/诊断，不承担全局唯一性。

同一个 FragmentInstance 的多个 exports 共享内部 Operation；两个显式 FragmentInstance
拥有不同 ID，不会被错误合并。

### 4.3 “禁止内联”的准确含义

允许：

- `.svml` 的漂亮组件标签；
- Author Module 把标签降低为锁定的 Graph Fragment；
- `.svs` 保存 prompt、样式和配方数据；
- 版本化外部包导出静态 Fragment；
- 同一 FragmentInstance 导出 audio、visual、map 等多个 Logical Output。

禁止：

- BuildRequest 在某个端口处嵌入任意匿名 Producer/JavaScript；
- 未进入 module/realization lock 的临时代码；
- Fragment 越过声明 input 捕获祖先；
- 用两个局部副本假装引用同一个昂贵外部 Operation；
- 运行时根据“已安装什么”自动选择 Fragment。

因此，隐藏 WhisperX 等内部流程不仅可以，而且是漂亮语言所必需的；我们禁止的是不可
寻址、不可锁定、不可审计的匿名执行图。

## 5. 三种 Closure 与一个 BuildRequest，不能再混成 import

### 5.1 Author Closure：源码表达什么

`.svml` import 和锁定的传递依赖负责：

- Surface 语法；
- Author Component 的语义；
- Logical Outputs 和 Semantic Input Envelopes；
- 默认 Primary Candidate；
- 官方配方和它们使用的创作方法。

它们影响 `sourceSemanticDigest`。例如作者选择 Seedance Mini 必须在源码或源码导入包
里可见，不能留给 Runtime 猜。

### 5.2 Realization Overlay：本次 Build 可以选择哪些外部 Candidate

外部 Realization 需要一个独立、内容寻址、可锁定的 Overlay。它可以来自 CLI、UI、
JSON BuildRequest 或宿主 API，例如概念上：

```text
svml build main.svml \
  --realize opening.visual=@alice/preview#black \
  --pin opening.audio=./approved-audio.json
```

第二行只是 CLI 的人类化动词。CLI 实际上会把文件解析为一个无代码、root 为 Existing
Value 的 Provided Candidate，再像第一行一样为 Logical Output 选择 Candidate。Core
不会收到 `pin: true`。

Overlay 负责：

- 把一个已锁定 Candidate export 附着到指定 Logical Output；
- 验证输出 Contract 和 Semantic Input Envelope；
- 形成独立的 `realizationClosureDigest`，绑定包版本、Manifest、Fragment 和实现摘要；
- 把最终选择写入 BuildRequest digest；
- 不改变 Author Closure 的 Surface、默认 Primary 或原始 semantic digest；
- 不扫描所有已安装包，不按优先级自动选择。

当前实现中，作者 Graph 的 `CompiledGraph.source` 保持不变；Overlay 集合被排序并封存为
`svml.realization-closure@1`，其摘要进入 `CompiledGraph.realization`，最终合并图再获得
独立 Graph digest。Overlay 顺序不影响身份，Overlay 内容、Provided Value 或源作者图
任何一项变化都会改变相应下游摘要。

初期建议保守：外部附着 Candidate 默认为 `substitute`。真正语义等价的 Endpoint 差异
交给 Provider Binding；历史结果通过带类型、摘要和亲和性证明的 Provided Candidate
表达。以后若要允许第三方 exact Candidate，必须先定义更强的 Contract conformance
与签名规则。

### 5.3 Pin 状态由宿主维护，但选择必须进入 BuildRequest

Canvas、CLI 或 Hosted 产品可以在 JSON、SQLite、Postgres 或浏览器状态里维护：收藏、
版本名、用户备注、“已 Pin”图标和历史 take。这些不是 Core 真相，也不要求中央数据库。

构建开始时，宿主必须把人类状态解析为明确的 CandidateId、Value digest、TypeRef、
conformance 和 affinity 声明，并写入本次 BuildRequest/Realization Closure。普通缓存、
已安装包或外部数据库状态不能环境式改变 Build：

```text
Value 在 Store 中存在             不影响图
宿主把它注册成 Provided Candidate  使其成为可选实现
BuildRequest 明确选择 Candidate     改变本次 Build
Build Compiler/Core 验证             接受为没有入边的事实
```

因此 Pin 的用户体验可以完全由外部维护，但“本次选中了哪个 Value”绝不能游离于系统摘要
之外。否则同一 BuildRequest 会随着外部 Pin 表变化而产生不同作品。

### 5.4 Runtime Closure：选中的能力在哪里执行

Runtime Profile 只负责：

- 为已选 Candidate 产生的精确 Capability 绑定 Endpoint；
- Scheduler、Store、Credential、Queue、并发和重试；
- 记录真实 implementation digest、Receipt 和 Derivation。

它不能选择 Kling/黑场/冻结帧，也不能改 Logical Output 的 Candidate。KIE 与火山若都
精确提供 Seedance Mini，属于 Endpoint 选择；Kling 替代 Seedance 属于 BuildRequest。

因此至少要保留四个不同身份：

```text
sourceSemanticDigest
  作者源码及 Author Closure 最终表达了什么

realizationClosureDigest
  本次允许附着哪些锁定 Candidate/Fragment

buildRequestDigest
  本次 Target 了什么，并为各 Logical Output 选择了哪个 Candidate

runtimeExecutionDigest
  实际使用哪些实现、Endpoint 和运行环境执行
```

后一个身份不能反向改写前一个身份；四者都应在最终 provenance 中可追溯。

## 6. 多输出 Existing-Value Candidate 与替代的结论预演

### Case A：visual 选择已有值，Target visual

```text
opening.visual -> Candidate(existing approved-video)
```

所选 Candidate root 是已经物化的 Value，没有入边，因此不 Demand visual Primary；若
没有其他 Target 使用 SpeechTake，共享生成上游完全不进入 BuildPlan。

### Case B：visual 选择已有值，Target audio

```text
opening.visual -> Candidate(existing approved-video)
opening.audio  -> ProjectAudio(SpeechTake Primary)
```

SpeechTake 仍运行，因为 audio 需要它。生成中的 visual 字段不成为 `opening.visual`；所有
使用 `opening.visual` 的下游仍得到 approved-video Candidate 的 Value。没有重复 Logical
Record。

### Case C：整个 take 选择已有 SpeechTake

```text
opening.take   -> Candidate(existing SpeechTake)
opening.visual -> ProjectVisual(opening.take)
opening.audio  -> ProjectAudio(opening.take)
```

生成上游完全不被 Demand，audio/visual 仍保留共同 `takeDigest`。这是 UI 所谓“整节点
Pin”最准确的领域表达，但在编译模型中只是公开 Bundle Logical Output 选择了一个已有值
Candidate，不是 Core 对作者组件的特殊认识。

### Case D：x 用 Kling、y 用 Grok，共享 GPTImage A

两 Candidate 都引用同一个全局 `A.result`，Demand closure 对 OperationId 取并集，A
运行一次。不存在“每个 Candidate 各复制一份上游”的语义。

### Case E：两个 Fragment 都内部新建 GPTImage

若它们是两个不同 FragmentInstance，本来就代表两个生成动作，因此运行两次。若作者
想共享，必须把 GPTImage 提升为一个显式上游 Logical Output/Fragment input，或让 x、y
来自同一个多-export FragmentInstance。

### Case F：audio 与 visual 分别选不同 Candidate

若下游只要求两个独立媒体，允许组合，但 fidelity/来源必须诚实。若下游要求同一 take，
它应消费 `SpeechTake` 或声明 `takeDigest` 亲和性；不匹配则 exact 构建被拒绝，不能让
Core 凭端口名字猜测。

### Case G：A、B 分别替代，C、D 也分别替代

```text
a.A -> Candidate(a1) ─┬─> Candidate(b1, full inputs A+B) -> b.C ─┐
a.B -> Candidate(a2) ─┴─> Candidate(b2, full inputs A+B) -> b.D ─┴─> c
```

`b1` 可以只实现 `b.C`，`b2` 可以只实现 `b.D`；Candidate 不必冒充原作者组件 B 的
全部输出。二者引用相同的 LogicalOutputRef `a.A/a.B`，因此得到相同 RecordId，不会各
复制一份 A/B。如果 `a1/a2` 是无入边 Existing Value，反向遍历在那里停止；如果是
零输入但尚未执行的 Operation，则各产生一个 Command，而不是被误判成已有值。

## 7. Core 最终应该剩下什么

### 7.1 最小代数

把 Fragment 展开、包解析和 Overlay 解析放在 Core 之前后，最小核心仍可保持很小：

```text
Value
  类型、内容摘要、origin、conformance、affinity

Operation
  稳定实例身份 + 显式 typed inputs -> 一个原子 Value

Choice
  Logical Output + Primary/Candidates + BuildRequest selection

Demand
  从 Targets 出发，边选择 Candidate 边反向遍历，按 OperationId 去重，得到有限 DAG

State
  对 Commands、Events、Receipts、Derivations 和恢复进行完整性验证
```

Core 不需要认识：

- 作者组件标签；
- Fragment 的漂亮写法；
- Seedance、Kling、WhisperX；
- audio/visual/Track/Film；
- npm、pnpm 或 `.svs`；
- 本地还是 Hosted Queue；
- UI 如何展示候选。

Fragment elaborator、Module Resolver、Overlay Resolver、Provider Registry、Scheduler 和
UI 都可以是 Core 外的软件包；它们输出的已解析关系必须由 Core 验证，不能覆盖 Core
的 identity、choice、demand 和 provenance 法律。

### 7.2 系统中的三台机器

整个 SVML 系统不应再被描述为一个巨型编译器，而是三台边界明确的机器：

```text
SVML / SVS / Author Modules
            │
            │ Author Compiler
            ▼
        Author Graph
            │
            │ + Realization Closure
            │ + BuildRequest(Targets + Candidate bindings)
            │
            │ Build Compiler
            ▼
      Finite BuildPlan
            │
            │ Build Machine
            ▼
 Commands ──> Runtime / Providers
 Events   <── Runtime / Providers
```

#### Author Compiler

负责 Bootstrap、Surface、Author Module lowering 和漂亮语法，把作者源码变成带 Logical
Outputs、Primary Candidates、Semantic Input Envelopes 和 Graph Fragments 的 Author
Graph。它回答“作者表达了什么”，不读取 Runtime Credential，也不选择 Provider Endpoint。

#### Build Compiler

接收 Author Graph、Realization Closure 与 BuildRequest，从 Targets 出发，在一次遍历中
完成 Candidate 选择、Existing Value 验证、反向 Demand 和 OperationId 去重。静态
Fragment 已由 Core 外的 Elaborator 卫生展开为普通 Candidate/Operation；Build Compiler
只会 Demand 被选择 export 的反向闭包。它直接输出普通的有限 Operation DAG，不先生成
全局 SelectedGraph。

概念输出：

```ts
type FiniteBuildPlan = {
  sourceSemanticDigest: Digest;
  realizationClosureDigest: Digest;
  buildRequestDigest: Digest;
  initialValues: readonly ProvidedValue[];
  operations: readonly OperationNode[];
  targets: readonly ResolvedTarget[];
  selections: readonly SelectionTrace[];
  digest: Digest;
};
```

`selections` 用于审计；Build Machine 不再决定 Candidate。

#### Build Machine

是可验证增量状态机：`Plan + State + Event -> State + Ready Commands`。它只面对 Initial
Values 和 Operations，负责 Command/Event、Receipt、Derivation、conformance、affinity、
恢复和状态推进；它不认识 Primary、Pin、黑场、Seedance 或作者 Surface。

因此不可替代核心可以概括为：

```text
Protocol
+ Build Compiler
+ Build Machine
```

Frontend、Fragment Elaborator、Runtime、Provider、Scheduler、Store 和 UI 的具体实现可
替换，但不能违反这三者定义的身份、选择、需求与因果法律。

## 8. `@1` 实现已经替换的旧模型

本轮实现已经删除或替换以下 `@0` 设计：

1. `NodeInstance` 同时承担 Logical Output 和 Operation 的设计；
2. `RealizationInstance = one ProducerRef + direct inputs`；
3. `RealizationBinding | PinBinding` 把平等 Candidate 拆成两套选择；
4. Alternative 只做直接 input map 子集比较；
5. Producer 单公开结果范式被用来限制作者组件，而不是只规范 Kernel Operation；
6. 完整 Graph 现在拥有共享的全局 Operation DAG，并已实现卫生 FragmentInstance identity；
7. 外部 Realization Overlay 已实现：附着改变 realization/Graph identity，不改变作者
   source identity；
8. Demand 现在分别 memoize Logical Output 与 Operation；
9. 已删除 Pin 专用 origin、验证和 pruning 分支，改为普通 Provided Candidate；
10. 实现选择与 Demand 已合并到同一 Build Compiler 的一次遍历。

以下已有成果不应丢弃：

- 任意 Target、显式 Candidate 选择和反向 Demand 的基本方向；
- Need 的 capability/returns 分离；
- Provider 只做 exact Endpoint Binding；
- conformance 单调传播；
- Derivation、Command、Receipt 的摘要完整性；
- 恢复时重建 Commands；
- 通用 JSON Pointer affinity；
- Producer result affinity 会保护 Fragment 内部中间结果，Logical Output affinity 会保护
  外部 Candidate；
- Contract 独立于 Core；
- 普通文件/CAS 即可支持本地已有值复用与恢复，不要求数据库。

当前代码位置：

```text
packages/protocol/src/build.ts   @1 wire types
packages/core/src/graph.ts       Graph / Request seal 与验证
packages/core/src/plan.ts        单遍 Build Compiler
packages/core/src/reducer.ts     Build Machine
packages/core/src/verify.ts      恢复与因果完整性验证
packages/core/test/demand.test.ts 反例与 Case G
packages/speech-take             SpeechBasis Product 的 audio/visual 普通 Projection
packages/elaborator              静态 Graph Fragment seal、验证、卫生实例化与 export binding
packages/realization             Provided/Fragment Candidate Overlay 与 Realization Closure
packages/video-fragments         SpeechTake、WhisperX/SemanticMap、Caption 官方静态 Fragment
```

## 9. 尚未定案的问题

以下内容不能在没有进一步反例和测试前写死：

1. `@1` wire format 在本分支已经固定用于原型；公开发布前仍可做一次命名审计；
2. 已决定并实现：Projection 是显式、普通、确定性的 Producer，不是 Core 内建步骤；
3. 已决定：只有不可分割的共同来源需要先形成 Bundle Product；普通多 export Fragment
   可以共享内部 Operation，不强制制造无意义 Bundle；
4. 当前 Fragment Elaborator 会证明每个 export 的传递输入闭包没有越过声明 envelope，
   展开后 Core 再按全局 Graph 做第二次验证；公开 lock 是否保存独立证明尚未定案；
5. 第三方 exact Candidate 的 conformance 与签名机制；
6. 多个 Logical Output 必须协同选同一 Candidate 时，优先用 Bundle 还是需要显式
   choice group；第一版倾向只用 Bundle，避免引入约束求解器；
7. `svml.fragment@1`、`svml.realization-overlay@1` 与 closure 已有原型 wire format；
   与包 Manifest、lockfile 的最终组合仍未定案；
8. 外部 Candidate 的安全加载、权限和沙箱；
9. UI 对 projection 执行 Pin 动作时，如何提示共享 Product 仍会因其他 output 而运行；
10. 已统一为 `svml.graph@1`、`svml.build-request@1`、`svml.plan@1`、`svml.build@1`，
    公共名称为 BuildRequest；
11. Source import 能否显式附着额外非默认 Candidate，还是只允许 Author Module 定义；
12. `.svs` 能描述到何种程度：只存数据配方，还是可引用版本化 Fragment；它不应获得
    匿名代码执行能力。

## 10. 强制反例测试与当前覆盖

下列行为必须在继续 Track/HyperFrames 前保持为可执行测试。`[x]` 已由当前实现覆盖，
`[ ]` 依赖 Product/Fragment/Overlay：

1. [x] `GPTImage A -> Kling/Grok -> C`，Target C 时 A 恰好进入计划一次；
2. [x] 显式 `A1`、`A2` 即使 Producer 与输入相同也进入计划两次；
3. [x] 一个 SpeechTake 的 audio/visual 两个 Primary export 只触发一次底层生成；
4. [x] visual 选择 Existing Value Candidate、Target audio 时底层生成一次，visual 下游仍只
   看到所选 Existing Value；
5. [x] SpeechTake 选择 Existing Value Candidate 后，audio/visual projection 都不触发生成；
6. [x] x/y 选择不同 Candidate 时，共享与非共享上游的 Demand closure 正确；
7. [x] 一个多-export WhisperX Fragment 只发出一次外部 request；
8. [x] Fragment 捕获未声明祖先或塞入原始 Graph 引用时被拒绝；
9. [x] 同一 OperationId 共享执行，不同 OperationId 不被内容去重；
10. [x] 已附着但未选择的 Candidate 不进入 InitialValues、Steps 或 Need；“安装但未
    attach”仍属于后续 Module Resolver 测试；
11. [x] Candidate 选择进入 BuildRequest digest，JSON 恢复得到同一有限计划；
12. [x] Runtime 不能用相同 returns TypeRef 的 Endpoint 冒充另一 CapabilityRef；
13. [x] Logical Output 与 Producer result 两层 JSON Pointer affinity 都会拒绝不匹配的
    exact 结果；真实 SpeechTake/WhisperX 组合已测；
14. [x] Provided Value 或 Substitute 的 conformance 不能被下游洗回 exact；
15. [x] JSON round-trip 会验证并重建 Command；真实纵向链路逐个 Provider 暂停/恢复时，
    已完成的付费 Operation 不会重发。

## 11. 建议的收敛顺序

本文不建议立即把全部开放插件系统一次实现，也不建议从空仓库重写。当前分支已经验证
过的内容寻址、完整性、恢复、conformance、affinity 和 Provider exact routing 应保留，
但暂停继续向旧 Graph 模型上增加 Track/HyperFrames。

### Phase D：冻结规范与 wire format（本轮完成）

1. 将本文提升为新的 Kernel 施工规范，并在旧规范顶部标记被替代章节；
2. 固定 `LogicalOutput`、`Candidate`、`CandidateRoot`、`OperationNode`、`BuildRequest`、
   `FiniteBuildPlan` 的最小字段；
3. Candidate root 只允许 Existing Value 或 Operation Result；
4. 内部 wire format 升为 `svml.graph@1`、`svml.build-request@1`、
   `svml.build-plan@1`，不在实验阶段维持错误的 `@0` 兼容层；
5. 明确 OperationId 是卫生实例身份，implementation/request digest 是另外两个身份。

### Phase T：先写失败的规范测试（Kernel 部分完成）

先实现第 10 节全部反例，尤其是：Existing Value 零 Command、Black Candidate 正常
Demand、共享 GPTImage 只运行一次、显式 A1/A2 运行两次、SpeechTake 多 export 共享一次
生成，以及未 Target 的 Candidate 不被解析或执行。

### Phase P：重写 Protocol 对象（完成）

1. 分开 `OperationNode`、`LogicalOutput`、`Candidate`；
2. 删除 `RealizationBinding | PinBinding`，BuildRequest 只保存 CandidateId；
3. 删除 `PinnedOrigin`，改用通用 Provided Value origin/provenance；
4. Producer 单原子 Product 只约束 Kernel Operation，不限制 Author Component 多 export；
5. Existing Value 作为初始事实，零输入但尚未执行的 Producer 仍是 Operation。

### Phase C：实现单个 Build Compiler（完成）

1. 从 Targets 开始，访问 Logical Output 时才解析显式 Candidate 或 Primary；
2. 消费 Elaborator 已卫生展开的 Candidate root，不处理未 demanded Candidate；
3. 分别维护 visited Logical Outputs 与 demanded OperationIds；
4. 验证输出 TypeRef、Semantic Input Envelope、静态 affinity 与 conformance；
5. 直接封存 FiniteBuildPlan 与 SelectionTrace，不保存全局 SelectedGraph；
6. Existing Value 因没有入边自然结束遍历，不存在 Pin 专用 pruning。

### Phase M：迁移 Build Machine（完成）

让现有 Reducer 消费 Initial Values + Operations 的新 BuildPlan，保留已有 Command/Event、
Receipt、Derivation、摘要完整性、conformance floor、affinity 和恢复时重建 Commands；删除
所有 Pin/Realization 专用状态分支。

### Phase F：Product、Projection 与 Graph Fragment（原型完成）

1. 先把 Projection 表达为普通、便宜、确定的 Operation，不做 Core 特殊语法；
2. 用 Product + Projection 跑通 SpeechTake 多输出已有值复用；
3. 实现只支持可信静态定义的卫生 Fragment elaborator；
4. 同一 FragmentInstance 多 export 共享内部 Operation，不同实例绝不按内容合并；
5. 真实 WhisperX 多步、多-export Fragment 已验证：同时 Target raw Evidence 与 Map 时
   只发出一次外部 request；未 Target 的 visual projection 不进入计划。

### Phase O：Realization Overlay（原型完成）

1. Provided Value 和静态 Fragment export 都能作为外部 Candidate 附着；
2. Overlay 锁定精确作者 Graph，跨 Graph 复用被拒绝；
3. 多 Overlay 的顺序不影响 Realization Closure 或最终 Graph identity；
4. 附着本身不执行任何工作，只有 BuildRequest 显式选择且 Target 可达才会 Demand；
5. 作者 source digest、realization closure digest、最终 Graph digest 与 BuildRequest digest
   已分离并互相绑定；
6. Overlay 内容或 Existing Value 改变时，后续所有相关身份都会改变。

### Phase V：迁移真实视频纵向链路（语音到字幕完成）

按以下顺序迁移现有包并尽快跑通真实链路：

```text
Text/Script
  -> Narrative/Schedule
  -> SpeechTake + projections
  -> WhisperX Evidence
  -> SemanticMap
  -> Caption/Track
  -> Composition
  -> HyperFrames VideoArtifact
```

每个公开结果都要证明可单独 Target、可选择 Existing Value/Substitute Candidate、共享
上游不重复执行、恢复不重复付费、质量不会被下游洗白。

当前已经完成并测试：

```text
Script Narrative
  -> explicit estimate Need
  -> explicit Seedance Mini Need
  -> atomic SpeechBasis Product
  -> independent audio / visual Projection
  -> one WhisperX Need
  -> provider-neutral Evidence
  -> CompleteSemanticMap
  -> TimedCaptionProjection
```

WhisperX 与 locator 只消费 `SpeechAudioBasis`，不会因字幕路径强制 Demand visual
projection。Caption Target 会裁掉 visual；Visual Target 会裁掉 WhisperX、Map 和 Caption；
audio + visual 双 Target 仍只生成一次 SpeechTake。Existing SpeechTake 会截断估时与
Seedance，但后续 audio/WhisperX/Caption 正常继续；black visual Substitute 则自然截断
整个上游。下一步从公共 Track/Composition 合同继续，而不是回到手写全局 Graph。

Track/Composition 下一阶段的硬约束已经确定：所有最终输入是平级、自包含 Track；
Composition 只做叠加，不做跨 Track 变换；Caption/Text 都必须降低为普通 VisualTrack。

### Phase R：本地 Runtime 后于真实链路

第一版只建设 Node 本地参考 Runtime：进程内 Scheduler、JSON Journal、本地 CAS、系统
Credential Store 和可信官方 Provider Endpoint。真实 Provider 按提供商拆包；Author
Module 决定 Seedance/WhisperX/HyperFrames，Runtime Profile 只绑定 KIE、火山、Hypit、
local 等精确 Endpoint。

Hosted Runtime、durable queue、数据库、任意第三方代码沙箱、自动安装体验和高级第三方
exact Candidate，均放在真实纵向链路之后。

### 明确暂缓

- 不继续在旧 Graph 模型上实现 Track/Film/HyperFrames；
- 不为 Pin 建数据库或 Core primitive；
- 不引入 choice-group 求解器，第一版用公开 Bundle 表达协同选择；
- 不做按返回 TypeRef 猜 Provider 或 Candidate；
- 不做按 prompt/参数/content 猜测 Operation 去重；
- 不允许 BuildRequest 内联匿名代码图；
- 不为实验 `@0` wire format 建长期兼容包袱。

建议按可审计的小提交组织：文档规范、失败测试、Protocol、Build Compiler、Build Machine、
Fragment、视频纵向链路、本地 Runtime，避免再次把语言、Core、Runtime 和领域组件混进一个
巨型提交。

## 12. 暂定一句话结论

最近几轮真正得到的不是“节点越来越复杂”，而是：

> SVML 应把作者可操作的 Logical Output、已经存在的 Value、运行时原子的 Operation
> Product、可选择的 Candidate，以及用于漂亮封装的 Graph Fragment 分开；Pin 只是
> 外部工具选择 Existing-Value Candidate 的动作；Build Compiler 从 Targets 出发，在
> 同一次遍历中解析 Candidate、展开图并按稳定 OperationId 求 Demand。

这样才能同时保留漂亮源码、已有值复用、共享昂贵上游、显式替代、外部扩展和极小 Core。
