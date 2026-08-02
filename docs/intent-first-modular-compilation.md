# SVML 意图优先的模块化编译架构

Date: 2026-08-02

Status: architecture direction; interfaces are not frozen.

本文记录 SVML 下一阶段的架构共识。它修正了当前 v1 原型中仍然存在的固定
Basis/Map/Track/HyperFrames 编译路径，也修正了讨论过程中一度把所有 SVK 都
交给外部环境选择的过度解耦。

当前仓库仍然是可执行的 v1 研究原型。`compiler-prototype.md`、
`runtime-host-architecture-draft.md` 和现有 specification 在迁移完成前继续描述
当前实现；本文描述后续重写应当遵守的方向。

## 1. 一句话定义

> SVML 代表且仅代表作者意图；作者可以选择具体的编译组件与配方，外部环境
> 负责满足这些组件提出的外部需求，并可以在明确记录的前提下提供缓存或替代
> 产物。

因此，SVML 不是：

- Provider 工作流 DSL；
- 固定的视频生成流水线；
- Hypit/Twinit 节点图的文本序列化；
- HyperFrames 或 Remotion 的配置格式；
- 把 preview、test、run、production 写进语言的多模式构建系统。

SVML 是一门作者意图语言。一次具体视频只是某个编译组件闭包、外部事实和运行
环境对这份意图的一次可追溯实现。

## 2. 架构宪法

后续设计和代码必须满足以下约束。

1. `.svml`、作者导入的 `.svc`、`.svs` 和 `.svk` 共同构成作者程序；它们不能
   包含 credential、队列、Job 或产品数据库状态。
2. 作者事实在编译和运行期间不可被修改。Kernel、LLM、Provider 和前端只能
   追加派生事实、观察事实或作者明确接受的 source patch。
3. SVML Core 不认识 Script、Seedance、Caption、Track、Film、SemanticMap、
   HyperFrames 或任何 Provider 名称。
4. Script、`2M + 2N` 锚点等重要协议可以是官方标准模块，但不能成为 Core 中的
   特判。
5. SVML 可以导入 SVK。作者有权选择组件语义、编译配方、模型家族或精确模型。
6. 外部环境默认替换的是 Requirement 的满足方式，不是作者选择的 SVK。替换
   SVK 必须是显式 override，并进入推导记录。
7. 统一外部调用的生命周期和记录格式，不强迫不同 Provider 共享一个最低公分母
   的语义 API。
8. 不存在全局 preview/run/production mode。同一作者程序可以被不同消费者以
   不同外部事实和接受策略实现。
9. 每个实际产物必须能够回答：由什么作者事实、Kernel、参数、外部调用、缓存或
   替代关系产生。
10. 官方标准库和官方 Host 只能使用公开扩展协议，不能拥有第三方无法使用的隐藏
    Core 通道。

## 3. 我们创造的是语义，不是括号

任何通用语法都能表示 SVML Intent Graph。下面三段可以表达相同的作者事实。

XML：

```xml
<script:Segment id="alice-line" role="#alice">
  你好，<script:Selection id="subject">世界</script:Selection>。
</script:Segment>
```

JSON：

```json
{
  "type": "urn:svml:script:1#Segment",
  "id": "alice-line",
  "role": { "$ref": "alice" },
  "content": [
    { "text": "你好，" },
    {
      "type": "urn:svml:script:1#Selection",
      "id": "subject",
      "content": [{ "text": "世界" }]
    },
    { "text": "。" }
  ]
}
```

JSX：

```tsx
segment(
  { id: "alice-line", role: ref("alice") },
  ["你好，", selection({ id: "subject" }, "世界"), "。"],
)
```

SVML 的价值不是现有语法无法表达这些数据，而是定义：

- 哪些值是作者事实；
- 名称、身份、引用和模块版本如何工作；
- 文本、内联标记和 source range 如何规范化；
- 哪些参数是显式作者选择，哪些是模块默认或 Host 补全；
- 派生事实为什么不能覆盖作者事实；
- 外部产物如何满足、缓存或替代某个 Requirement；
- 相同意图的多个实现如何并存和追溯。

推荐保留 XML 作为官方 reference frontend，因为它天然适合连续口播文本和内联
语义标记。SVML 不需要重新发明 XML lexer/parser；它需要定义自己的抽象模型、
静态语义和规范化规则。

其他前端也可以合法存在：

```text
official .svml/XML ─┐
visual editor       ├──> Canonical Intent Graph
CUE/Dhall/JSX       ┘
```

只有产生的 Canonical Intent Graph 和作者 provenance 相同，这些前端才等价。

## 4. 总体分层

```text
Author Frontends
  .svml/XML · visual editor · other frontends
                         │
                         ▼
Author Program Closure
  .svml + imported .svc/.svs/.svk + locked module contracts
                         │
                         ▼
SVML Modular Compiler
  parse · resolve · typecheck · elaborate · evaluate kernels
                         │
               ┌─────────┴──────────┐
               ▼                    ▼
          Produced Claims       Requirements
                                    │
                                    ▼
Runtime Host
  registered handlers · credentials · journal · policy · artifact store
                                    │
                                    ▼
                           Receipts + Observed Claims
                                    │
                                    └──────> resume compiler
```

需要区分四类扩展。

### 4.1 Vocabulary/author module

定义作者能够表达什么、参数和字段是什么、纯规范化或展开如何工作。它由作者导入
并锁定，改变版本可能改变作者程序含义。

### 4.2 SVK

定义一个可导入组件的公开 ABI、参数、子组件和模块化编译逻辑。SVK 可以纯计算，
也可以产生类型化 Requirement。Prompt、领域 JSON schema、领域校验和编译配方
可以属于 SVK。

### 4.3 Handler/Fulfiller

注册在 Runtime Host 中，负责满足某类 Requirement，例如 OpenAI、Gemini、
Seedance、STT、本地 FFmpeg 或人工上传。它处理 credential、API 协议、网络、
异步 operation 和 usage，不拥有上层组件的领域语义。

### 4.4 Consumer/target/view

向已编译事实提出自己需要的产物，例如编辑器 ViewModel、Timeline、HyperFrames
Document、Remotion Composition 或 MP4。消费者可以提供目标 Kernel 和接受策略，
但它们不是源语言中的全局模式。

## 5. 与模块无关的最小 Core

推到最小以后，绝对 Core 中没有“视频”。它只需要以下抽象。

```text
Identity
Type
Value
Authored Fact
Derived/Observed Claim
Kernel
Requirement
Artifact
Derivation/Provenance
Query
```

### 5.1 Canonical value model

```ts
type Value =
  | null
  | boolean
  | number
  | string
  | TextValue
  | RefValue
  | Value[]
  | { [key: string]: Value }
  | ArtifactRef;
```

Core 应当保留有序子项、Unicode 文本、source range、稳定 identity 和名字空间化
`TypeRef`。它不解释具体 TypeRef 的业务含义。

### 5.2 作者节点与 Claim

```ts
type AuthoredNode = {
  id: NodeId;
  type: TypeRef;
  fields: Record<string, Value>;
  provenance: SourceProvenance | ElaborationProvenance;
};

type Claim = {
  id: ClaimId;
  subject: NodeId;
  type: TypeRef;
  value: Value;
  provenance:
    | SourceProvenance
    | ElaborationProvenance
    | DerivationProvenance
    | ObservationProvenance;
};
```

作者导入的纯模块展开可以产生 elaborated author facts，但必须保留从展开节点回到
源文件、模块和参数的完整路径。外部 Kernel 和 Handler 无权产生伪装成 source
provenance 的 Claim。

### 5.3 Kernel、Requirement 与 Query

```ts
type KernelManifest = {
  id: KernelId;
  version: string;
  implementationDigest: Digest;
  consumes: Pattern[];
  produces: TypeRef[];
};

type Requirement = {
  id: RequirementId;
  type: TypeRef;
  subject: NodeId;
  payload: Value;
  requestedBy: DerivationId;
};

type Query = {
  subject: NodeId;
  wants: TypeRef;
  constraints?: Value;
};
```

第一版不需要实现通用 Prolog/Datalog。只实现有限、显式、类型化的输入输出和
demand scheduling：

- exact `TypeRef` 或明确的 contract compatibility；
- subject/id 绑定；
- 有限 consumes/produces；
- content digest 去重；
- 循环检测；
- 暂停、Receipt 注入和恢复；
- 多个候选并存。

## 6. `.svml`、`.svc`、`.svs`、`.svk`

### 6.1 `.svml`: 作品级作者意图

包含：

- Script、角色、段落、选择和时刻；
- 组件实例和连接；
- 作者明确要求的视觉、声音、字幕和构图；
- 每实例参数；
- 作者确实关心的 Provider、模型家族或精确模型版本。

不包含：

- credential；
- Job/Canvas/Workspace id；
- 队列、heartbeat 和 worker；
- Provider operation id；
- 缓存位置和对象存储 URL；
- 前端面板状态和 Canvas 坐标。

### 6.2 `.svc`: 纯作者内容与可复用意图片段

用于无外部副作用的复用：

- 人物、品牌、素材引用和设计 token；
- 可复用文字与作品片段；
- 纯内容子图；
- 不需要运行时事实的作者侧组件展开。

SVC 不持有作为实现逻辑的 LLM/Provider Prompt 模板、credential、Provider 调用
或运行时选择。作者明确写下的镜头指示、生成方向或其他文本仍然是普通作者内容，
可以放在 SVC 中复用。

### 6.3 `.svs`: 类型化参数覆盖

SVS 不应被限制为视觉 CSS。更准确的定义是：

> 作者侧、带选择器和 provenance 的类型化公开参数覆盖表。

只要 SVK 将参数声明为公开可配置，SVML 或作者导入的 SVS 都可以设置它：

- 字体、颜色、位置；
- Seedance `mini`/`pro` 模型；
- 生成时长、宽高比和质量；
- 字幕最大行数；
- 如果 Kernel 选择公开它，也可以是字幕使用的 LLM。

由谁导入 SVS 比文件后缀更重要。作者导入的 SVS 是作者程序；Host 临时注入的
参数不是作者事实，必须记录为外部 binding 或 override。

### 6.4 `.svk`: 作者可导入的编译组件

SVK 包含：

- 公开端口、参数、字段、子项和产物 contract；
- 公开参数默认值和私有实现参数；
- 纯 lowering/validation；
- 需要哪些中间产物或外部调用；
- Prompt 和领域返回 schema；
- Provider 返回之后的领域解析与验证；
- 如何把结果投影为下一种产物。

SVK 不直接持有：

- API key；
- 产品数据库；
- 全局队列；
- 用户/Workspace；
- 未声明的环境读取；
- 隐式 Provider singleton。

## 7. SVML 可以并且通常应该导入 SVK

“Core 不认识某个 SVK”不等于“作者不能选择某个 SVK”。

作者使用：

```text
@svml/script@1
@svml/seedance-track@1
@svml/subtitle-track@1
@svml/film@1
```

就表示作者选择了这些组件的语义和编译配方。它们与传递依赖一起形成 Author
Program Closure，并进入作者程序锁。

默认 Kernel 集合来自：

```text
K = source-selected kernels
  + their transitive dependencies
  + consumer-selected target/view kernels
  + explicit recorded overrides
```

运行环境不能从一个全局 registry 中随便为 `<caption:Track>` 猜一个实现。

外部替换发生在三个不同层次：

1. 正常 fulfillment：作者选择的 SVK 不变，外部满足它的 Requirement；
2. exact cache：外部证明已有产物对应同一个输入和 SVK digest，直接复用；
3. explicit override/substitute：替换 SVK 或提供非精确产物，必须记录原要求、
   实际实现和兼容关系。

## 8. 外部调用：统一生命周期，不抹平语义

Requirement 首先表示“当前缺少一种类型化产物”。它可能被已有 Claim、另一个已
导入 Kernel、缓存、人工产物或外部 effect 满足。只有确定要交给 Host 执行外部
副作用时，才降低成 Handler 可接收的 EffectRequest。

Core 只需要通用外壳：

```ts
type EffectRequest = {
  id: RequirementId;
  type: TypeRef;
  requestDigest: Digest;
  payload: Value;
};

type EffectReceipt = {
  request: RequirementId;
  handler: HandlerRef;
  conformance: "exact" | "substitute";
  delivery: "executed" | "cache" | "manual" | "provided";
  outputs: ClaimId[];
  operation?: ExternalOperationRef;
  usage?: Value;
};
```

具体 contract 可以分别定义：

```text
llm.structured-generation@1
google.gemini.structured-generation@1
openai.responses@1
seedance.generate-video@1
speech.transcribe@1
media.probe@1
```

不要求所有 Provider 被压成 `GenericAIProvider.doSomething()`。统一的是：

- handler 注册和 capability matching；
- start/resume/cancel；
- 请求 digest；
- operation journal；
- Artifact 摄取；
- Receipt、usage、失败和 provenance。

语义符合程度与产物从哪里取得是两个正交维度。缓存可以是精确缓存，也可以缓存过
一个占位替代品，因此不能用同一个 `exact/cached/substitute` 枚举同时表达二者。

Prompt、语义参数和领域输出仍然属于发出请求的 SVK。

## 9. 参数与 Provider 选择不是固定归属

不能规定“模型总是作者选择”“模型总是 SVK 选择”或“模型总是 Host 选择”。
正确规则是逐层约束：

```text
作者/SVS 声明自己关心的约束
            ↓
SVK 为未决定部分增加实现约束或默认
            ↓
Host 绑定满足约束的 Handler、credential 和部署
            ↓
Receipt 记录实际 Provider、模型和结果
```

下一层只能补全未决定部分，不能静默违反上一层选择。

一个模型 selector 可以具有不同精度：

```text
任意支持 structured output 的 LLM
Google Gemini
Gemini 某个模型家族或版本范围
精确 Gemini model id
精确企业 deployment
```

SVK 决定哪些参数公开给作者、哪些是私有实现决定、哪些留给 Host。

```ts
const seedanceParameters = {
  model: publicParameter<SeedanceModel>({ default: "mini" }),
  duration: publicParameter<Duration>(),
  promptTemplateVersion: privateParameter("v3"),
};
```

```ts
const subtitleParameters = {
  maxLines: publicParameter<number>({ default: 2 }),
  groupingModel: privateParameter({
    provider: "google-gemini",
    model: "<kernel-selected-model>",
  }),
};
```

以后字幕 Kernel 可以把 `groupingModel` 改为 public parameter，而不改变 Core。

## 10. LLM 的正确边界

LLM 不属于 Core，但完全可以、并且经常必须出现在 SVK 实现中。

以官方字幕 SVK 为例，它拥有：

- 是否使用 LLM；
- Prompt；
- response JSON schema；
- cue 分组语义；
- Script/anchor 校验；
- invalid semantic output 的修复或重新请求策略；
- CaptionPlan 到 Track 的投影。

Gemini/OpenAI Handler 拥有：

- API wire format；
- credential、endpoint 和账号；
- streaming 聚合；
- 网络/限流重试；
- Provider operation id；
- usage 和原始响应归档。

这里存在两个不同 parser：

```text
Provider wire parser
  Gemini/OpenAI HTTP JSON -> generic provider completion

Domain parser
  provider completion -> CaptionGrouping/CaptionPlan
```

前者属于 Handler，后者属于 Subtitle SVK。

如果字幕 SVK 的 Prompt 明确针对 Gemini，它可以直接产生
`google.gemini.structured-generation@1` Requirement。作者不必关心 Gemini；
这个选择由作者导入的 SVK 版本和 digest 固定。若作者希望控制它，SVK 可以公开
相应参数供 `.svml` 或 `.svs` 设置。

LLM 输出只能产生 `CaptionGroupingCandidate`、annotation 或其他派生产物。Script
仍然是唯一口播文字真相；领域 validator 必须拒绝修改、补写或删除 Script 文本的
返回结果。

## 11. Script 是标准模块，不是 Core 特权

推荐将当前 Script Surface 归入官方模块 `@svml/script@1`。它定义：

- Script、Segment、Role；
- mixed text；
- Selection、Moment；
- 文本规范化和 source range；
- `2M + 2N` 独立锚点；
- Segment 内顺序以及 Segment 之间的身份隔离；
- Script 静态诊断。

Core 只保证这个模块产生的作者身份稳定、可引用、不可被派生过程修改。

Script 模块化不意味着运行环境可以重新解释同一个 Script。作者选择并锁定
`@svml/script@1`；更换 Script 模块属于改变作者程序。SemanticMap、TimingEvidence
和 CaptionPlan 才是对 Script 的派生或观察。

## 12. 两段 Seedance、双人对话和字幕的完整例子

作者意图可以近似写成：

```xml
<Film id="main">
  <Script id="dialogue">
    <Segment id="alice-line" role="alice">Alice 要说的话。</Segment>
    <Segment id="bob-line" role="bob">Bob 要说的话。</Segment>
  </Script>

  <Sequence>
    <seedance:Shot
      id="alice-shot"
      during="#alice-line"
      model="mini"
      direction="Alice 在办公室里说话"
    />
    <seedance:Shot
      id="bob-shot"
      during="#bob-line"
      model="mini"
      direction="Bob 在街道上回应"
    />
  </Sequence>

  <caption:Track id="captions" source="#dialogue" />
</Film>
```

源闭包选择：

```text
script.svk
seedance-track.svk
subtitle-track.svk
film.svk
```

模块化编译可能产生：

```text
SeedanceTrack(alice)
  -> Need<SeedanceVideo model=mini>

SeedanceTrack(bob)
  -> Need<SeedanceVideo model=mini>

SubtitleTrack
  -> Need<SemanticMap>
  -> Need<GeminiStructuredGeneration>  # 由该 SVK 的内部实现决定
  -> CaptionPlan
  -> SubtitleTrack

Film
  -> Need<TimedTrack[]>
  -> Composition
```

一个 Host 可以提供：

```text
Alice Seedance Requirement -> 真实 Seedance Mini 视频
Bob Seedance Requirement   -> 真实 Seedance Mini 视频
SemanticMap Requirement    -> 实测语音证据和官方对齐
Gemini Requirement         -> 注册好的 Gemini Handler
```

另一个消费者可以明确允许：

```text
Alice Seedance Requirement -> 缓存视频
Bob Seedance Requirement   -> 黑场 TimedVisual substitute
SemanticMap Requirement    -> 猜测 Map substitute
Gemini Requirement         -> 缓存的 CaptionGrouping
```

两者没有使用不同的 SVML mode，也没有重新选择字幕 SVK。变化的是外部 Requirement
resolution、产物 delivery 来源和消费者接受的 `exact/substitute` 符合关系。两套
候选还可以同时存在。

## 13. Target、前端和 View

目标和前端也使用公开模块协议，但不应被混同为作者语言模式。

外部消费者可以请求：

```text
IntentGraph -> CanvasViewModel
SemanticMap -> TimelineViewModel
Film/Track facts -> HyperFramesDocument
Film/Track facts -> RemotionComposition
RenderableDocument -> MP4 Artifact
```

作者可以显式要求某个输出目标；若没有要求，输出工具可以选择目标 Kernel。这个
选择及其实现 digest 进入 Derivation Record。

前端可以读取作者事实、派生 Claim、Requirement 和候选产物。Canvas 坐标、面板
展开状态、选中节点等 UI 状态不进入作者程序。前端修改作品时应生成显式 source
patch，而不是将 ViewModel 变成第二份作者真相。

## 14. 锁与可复现性

需要把“作者选了什么”和“这次实际怎么做的”分开记录。

### 14.1 Author Program Lock

记录：

- `.svml/.svc/.svs/.svk` 源闭包；
- Vocabulary/SVK 版本与 implementation digest；
- 纯 elaboration 结果；
- 最终公开参数及逐值 provenance；
- Canonical Intent Graph digest；
- 作者引用的材料 digest。

### 14.2 Derivation/Realization Lock

记录：

- Query/target；
- 每条 Derivation 的 Kernel 与输入输出；
- 每个 Requirement 和 request digest；
- Handler、Provider、实际模型和 operation id；
- exact/substitute 符合关系以及 executed/cache/manual/provided delivery；
- Receipt、usage 和 Artifact digest；
- 最终选中的候选及未选候选；
- 输出产物 digest。

Prompt 和领域 parser 属于 SVK implementation digest。Credential secret 不进入锁，
但 credential binding 的非秘密身份可以进入 Host journal 或 Receipt。

## 15. 不是 Core 的内容

下列概念即使非常重要，也不属于绝对 Core：

```text
Script / Segment / Role / 2M+2N anchors
Film / Track / Caption
SemanticMap / ProgramBasis / frame rate
Seedance / Gemini / OpenAI / STT
Prompt / response schema
SVS selector vocabulary
HyperFrames / Remotion / browser renderer
Provider credential / queue / retry policy
Canvas / Timeline UI
```

它们应由官方或第三方模块实现。官方模块的重要性来自稳定协议和生态采用，而不是
来自 Core 中的 `if (type === "CaptionTrack")`。

## 16. 与当前 v1 的保留、迁移和删除

当前仓库不应立刻清空。它应成为可执行旧规格和迁移 oracle。

建议保留并重新归位：

| 当前资产 | 下一代位置 |
|---|---|
| Script parser、文本模型和锚点 | `@svml/script` |
| temporal alignment | `semantic-map.svk` |
| ProgramBasis | timeline contract + basis kernels |
| Caption planning/projector | caption intent + subtitle SVK |
| flat Track validation | `@svml/track` contract/validator |
| Film/HyperFrames projector | composition/target kernels |
| sandbox | Kernel/Handler Host |
| lock/digest | Author Program Lock + Derivation Lock |
| examples/tests/goldens | v2 conformance suite |

应替换而不是继续扩展：

- `compileSource()` 的固定领域阶段；
- Compiler 对 SpeechTimingEvidence JSON 的特判；
- CaptionTrack 的数量和类型特判；
- Film 对具体 Track 类型的认识；
- HyperFrames 唯一正式目标；
- 中心硬编码 value type union；
- SVS 重复应用和隐式默认；
- 非传递 implementation hash；
- 产品 Runtime 状态进入编译上下文。

建议迁移顺序：

1. 冻结当前 fixtures/goldens；
2. 定义 Canonical Intent Model、Module ABI、Kernel/Requirement/Receipt；
3. 实现通用 XML frontend；
4. 把 Script 移为第一个标准模块；
5. 实现有限、类型化、可暂停的模块编译微内核；
6. 用本文双人 Seedance + Subtitle 例子做第一条竖切；
7. 实现 local ArtifactStore、journal 和注册式 Handler；
8. 逐个把当前算法移动到官方 SVK；
9. 新竖切和必要 goldens 通过后删除旧固定编译器。

## 17. 架构验收标准

重写完成前至少应证明：

- Core 源码中不存在 Script/Caption/Film/Seedance/HyperFrames 类型分支；
- 新增 Vocabulary 或 SVK 不需要修改 Core；
- SVML 可以导入并锁定 SVK；
- Host 不会为作者组件隐式挑选另一个 SVK；
- 同一个 Requirement 可以由真实 Provider、缓存、人工或 substitute 解决；
- 同一个作者程序可以同时保留多个候选结果；
- Author Fact 无法被 Kernel 或 Handler 修改；
- LLM Prompt 和领域 parser 位于相关 SVK，不进入 Core；
- API key、队列和 Provider operation 位于 Host/Handler，不进入作者程序；
- 模型选择可以来自作者、SVS、SVK 或 Host，并保留逐层 provenance；
- 没有 `previewMode` 或 `productionMode` 语言分支；
- 两段 Seedance + 双人 Script + Subtitle 示例能使用同一作者程序得到真实和替代
  实现；
- 每个最终 Artifact 都能追溯到 Author Program Lock 和 Derivation Lock。

## 18. 最终结论

SVML 后续不应被描述为“一个拥有插件系统的固定视频编译器”，也不应走到“作者
只写完全无语义的节点，所有 Kernel 都由运行环境猜测”的另一个极端。

正确边界是：

```text
作者选择意图、组件、公开参数和自己关心的实现约束
SVK 定义模块化编译配方、Prompt、领域协议和外部 Requirement
Host 注册调用器并补全剩余运行绑定
Provider/人工/缓存产生带 Receipt 的观察事实或替代产物
Core 负责身份、类型、不可变事实、调度、完整性和推导证明
```

因此：

> SVML 是一门可扩展的作者意图语言；SVK 是作者可选择的模块化编译组件；外部
> Runtime 是这些组件所声明需求的开放满足环境。
