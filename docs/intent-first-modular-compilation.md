# SVML 意图优先的模块化编译架构

Date: 2026-08-03

Status: architecture direction; interfaces are not frozen.

本文记录 SVML 下一阶段的架构共识。它修正了当前 v1 原型中仍然存在的固定
Basis/Map/Track/HyperFrames 编译路径，也修正了讨论过程中一度把所有 SVK 都
交给外部环境选择的过度解耦。

当前仓库仍然是可执行的 v1 研究原型。`compiler-prototype.md`、
`runtime-host-architecture-draft.md` 和现有 specification 在迁移完成前继续描述
当前实现；本文描述后续重写应当遵守的方向。

2026-08-03 修订进一步收紧了语言边界：SVML Core 的输入不是 `.svml` 源码字节，
而是 Frontend 已经产生的类型化 `IntentModule`。当前漂亮的 Script Surface 是
官方具体语法的一部分，不是 Core 必须识别的语法；第三方可以用完全不同的文本、
文件结构或可视化编辑器产生相同作者意图。

## 1. 一句话定义

> SVML 的规范语义代表且仅代表作者意图；任意 Author Frontend 可以把自己的
> 具体写法降低为这个意图。作者可以选择具体的编译组件与配方，外部环境负责
> 满足这些组件提出的外部需求，并可以在明确记录的前提下提供缓存或替代产物。

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

1. Frontend 输出的 `IntentModule`、作者导入并锁定的模块以及作者材料共同构成
   作者程序；官方 `.svml/.svc/.svs/.svk` 只是它的一种具体源码表示。作者程序
   不能包含 credential、队列、Job 或产品数据库状态。
2. Frontend 产生一个作者程序快照后，其中的作者事实在编译和运行期间不可被
   修改。Kernel、LLM 和 Provider 只能追加派生事实或观察事实；编辑器或 Frontend
   只能通过作者明确接受的 source patch 产生新的作者程序快照。
3. SVML Core 不认识 Script、Seedance、Caption、Track、Film、SemanticMap、
   HyperFrames 或任何 Provider 名称。
4. Narrative、`2M + 2N` 锚点等重要领域协议可以是官方标准模块；漂亮 Script
   可以是官方 Frontend Surface，但二者都不能成为 Core 中的特判。
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
11. Core 的公开入口不接收源码字节，不认识 XML、Namespace、`<script>` 或任何
    Frontend 语法。官方 CLI 可以默认捆绑 Frontend，但默认捆绑不等于 Core 特权。
12. 整个工具链不可约的启动根只有 `SourceUnit + AuthorFrontend` 的外部绑定和
    Frontend ABI。官方 Text Frontend 可以再固定一个无领域语义的 Import Prologue，
    但 Script、Component 和 SVK 都必须在该 Prologue 之后通过公开模块协议出现。

## 3. SVML 是抽象意图语言，不是一种被 Core 固定的源码写法

当前 v1 最珍贵的资产之一是漂亮、连续、接近稿件本身的 Script Surface：

```svml
<script>
  @whole

  <segment id="scene-1">
    <ALICE> 很多人以为，视频编译就是素材拼接。
  </segment>

  <segment id="scene-2">
    <BOB> 但真正重要的是，
          @architecture 作者意图和具体实现彼此分离 @/architecture。
  </segment>

  @/whole~
</script>
```

这套写法应被完整保留，但它属于官方 Author Frontend 的具体语法，不是 Core
必须识别的抽象节点。另一位作者完全可以采用电影剧本风格：

```text
SCENE scene-1

ALICE:
很多人以为，视频编译就是素材拼接。

BOB:
但真正重要的是，[architecture:
作者意图和具体实现彼此分离
]
```

也可以采用 Markdown、JSX、另一种语言、数据库记录或可视化编辑器。不同
Frontend 可以把这些输入降低成兼容的作者产物，例如由领域模块定义的
`@svml/narrative#Narrative@1`。字幕、Seedance 和 B-roll 组件只消费这个合同，
不应察觉它最初来自 Role Cue、电影剧本、表单还是 GUI。

`Narrative@1` 本身同样不是 Core 内置类型。它属于 Narrative 领域模块。第三方
Frontend 可以产生相同类型来获得生态互操作；也可以产生自己的类型，再显式导入
适配 Kernel。

SVML 的价值不是现有语法无法表达这些数据，而是定义：

- 哪些值是作者事实；
- 名称、身份、引用和模块版本如何工作；
- 文本、内联标记和 source range 如何规范化；
- 哪些参数是显式作者选择，哪些是模块默认或 Host 补全；
- 派生事实为什么不能覆盖作者事实；
- 外部产物如何满足、缓存或替代某个 Requirement；
- 相同意图的多个实现如何并存和追溯。

当前 XML-like 外壳与 Script 语言岛可以成为官方 reference frontend，因为它已经
证明适合连续口播文本和内联语义标记。但“官方默认”不能成为 Core 中的解析分支：

```text
official .svml frontend ───┐
Alice screenplay frontend ─┼──> IntentModule ──> SVML Core
visual editor frontend ─────┘
```

只有产生的规范意图和作者 provenance 相同，这些 Frontend 才语义等价。官方
Frontend 的价值来自它的可读性、稳定规范、Formatter、LSP 和生态采用，而不是
第三方无法绕开的编译特权。

### 3.1 Frontend 是 Core 之前的独立协议

概念接口是：

```ts
type AuthorFrontend = {
  id: FrontendRef;
  decode(source: SourceUnit, context: FrontendContext): IntentModule;
};

type SvmlCore = {
  evaluate(module: IntentModule, environment: EvaluationEnvironment): EvaluationResult;
};
```

`evaluate()` 不接收 `.svml` 文本。Frontend 负责 parse、静态语法诊断、source map
和 lowering；Core 从通用模块封装开始，负责链接、类型、引用、Kernel、Requirement
和证明。

Frontend 的选择属于“这些字节如何读取”，不是视频作者意图，原则上由项目清单、
CLI 参数、文件类型关联或调用方 API 指定，并由锁记录精确版本和 digest：

```text
svml build main.svml
  -> reference distribution 默认选择 @svml/text@2

svml build main.story --frontend @alice/screenplay
  -> 选择 @alice/screenplay
```

也可以由产品 Host 在调用 API 时注册和选择 Frontend。Frontend 不应依靠正文内部
的一段尚未被解析的语法来声明“应该怎样解析我”，否则会产生循环自举。

### 3.2 Namespace 和 SVK 都不是通用源码 Parser

Namespace 是某一种具体 Frontend 的名字解析功能。官方 XML-like Frontend 可以用
它解析 `seedance:*` 或第三方组件，但一个电影剧本 Frontend、Markdown Frontend
或 GUI 根本不必有 Namespace。因此 Namespace 不能承担通用 Frontend 注册。

SVK 在源码已被降低为类型化意图之后运行，负责：

```text
输入 Fact/Artifact -> 输出 Fact/Artifact 或 Requirement
```

它不负责解析主源码字节。一个发布包可以同时包含 Frontend、类型、Formatter、
LSP 和若干 SVK，但这些是同包内的不同公开接口，不能因为物理上放在一起而合并
生命周期。

官方 Frontend 内仍可支持受约束的 embedded surface 或外部 source codec，例如
把当前 `<script>` 正文交给 Script Parser，或让一个组件从 `speech.story` 产生
`Narrative@1`。那只是官方 Frontend 提供的组合能力，不是所有 SVML Frontend
必须实现的 Core 机制。

### 3.3 真正不可约的 Bootstrap 根

任何可扩展语法最终都必须停止递归。若源码必须先声明自己的 Frontend，系统就要
先有另一个 Parser 读取这条声明；继续让该 Parser 也自我声明只会无限回归。

不可约入口应当是调用方在源码之外已经提供的绑定：

```ts
decode({
  source: SourceUnit,
  frontend: AuthorFrontend,
}): IntentModule;
```

或等价的 `SourceUnit + FrontendRef`，再由 Host 根据 lock 解析出实现。CLI 参数、
项目清单和文件扩展名关联只是这个二元组的不同序列化或便利入口：

```text
svml build main.story --frontend @alice/screenplay@1

svml.project@1
  main.svml -> @svml/text@2
```

项目清单自身可以使用固定 JSON 等无聊格式；继续退到库 API 后，调用方甚至可以
直接传结构化对象，因此 Manifest 文本并不是语言本体。真正不能消除的公理只有：

```text
Host 把一个 SourceUnit 和一个满足 Frontend ABI 的实现交给 Driver。
```

这形成两个不同层次：

```text
Level 0  Bootstrap Driver
         SourceUnit + FrontendRef -> selected AuthorFrontend

Level 1  selected AuthorFrontend
         source bytes -> IntentModule

Core     IntentModule -> Claims / Requirements
```

官方 Text Frontend 的 Header Scanner 可以固定，但整个 `@svml/text` 仍然可以被
`@alice/screenplay`、JSON Frontend 或编辑器 Frontend 整体替换。对某个 Frontend
内部根语法的改变应发布新 Frontend 版本，而不是让正文中途重新定义它。

### 3.4 官方 Text Frontend 的 Import Prologue

`@svml/text` 自己只需固定一个不含视频领域语义的最小外壳：

```text
Document := RootOpen Prologue Body RootClose
Prologue := Import*
Body     := Declaration*
```

Header Scanner 只认识 `<svml>`、`<import/>`、模块引用、alias、空白和注释。它先
读取完整 Prologue，再执行以下阶段：

```text
1. 解析并锁定直接与传递模块闭包
2. 读取 Module Manifest，不执行领域 Kernel
3. 建立 Surface Registry、Component Registry 和名字绑定
4. 检查冲突、digest、Frontend 权限与 parser capability
5. 冻结本 SourceUnit 的语言环境
6. 开始解析 Body
```

Body Parser 遇到元素时按完整模块身份分派，而不按字面名字特判：

```ts
const descriptor = scope.resolve(openingName);

if (descriptor.kind === "surface") {
  return descriptor.parser.parse(readRawBody());
}

return decodeComponent(parseStructuredBody(), descriptor.schema);
```

因此 `@svml/script` 的 Manifest 可以把某个导出声明为 raw Surface，而
`@svml/seedance`、`@svml/film` 通常只导出使用通用结构 Parser 的 Component
Schema 与 Kernel。没有导入或 re-export Script Surface 时，裸 `@svml/text`
不认识 `<script>`。

所有模块 import 都必须位于 Prologue，正文不得再 import。只限制会影响 Parser
的 Surface import、却允许 Component import 出现在正文，会让作者必须预知包的
内部 export kind，也会使包升级、IDE、权限审计和锁变得不稳定。Import 之间的
源码顺序不携带语义；进入 Body 前得到的完整闭包才携带语义。

这与 Go 的 `package -> imports -> declarations`、Java 的
`package -> imports -> top-level declarations`、Haskell 的
`module header -> imports -> declarations` 结构相近。SVML 的理由更强：import
不仅可能改变名称和类型环境，还可能决定某个局部源码区域由哪个 Surface Parser
读取。

Module import 与作品内容引用必须分开：

```text
<import from="@svml/seedance@1"/>
  -> 改变本 SourceUnit 可用的 Surface、词汇、类型、Component 和 Kernel
  -> 只能位于 Prologue

<media:image id="reference" src="./reference.png"/>
  -> 声明一个作者材料或内容 Source
  -> 可以位于 Body
```

官方 Standard Prelude 只是由项目配置预先加入 Prologue 闭包的一组普通模块和
显式 re-export。它可以让作者直接写 `<script>`，但不能成为 `@svml/text` 的隐藏
知识；裸 Text Frontend、显式导入和 Prelude 必须走同一公开 Registry 路径。

## 4. 总体分层

```text
Source Units
  .svml · .story · editor document · other authoring formats
                         │
                         ▼  outside Core
Selected Author Frontend
  parse · diagnose · source-map · lower
                         │
                         ▼
IntentModule(s)
  typed authored nodes · component instances · refs · module requirements
                         │
                         ▼
Author Program Closure
  IntentModule(s) + imported modules + locked contracts + author assets
                         │
                         ▼
SVML Core
  link · resolve · typecheck · elaborate · evaluate kernels
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

需要区分五类扩展。

### 4.1 Author Frontend

读取某一种作者源码格式，产生规范 `IntentModule`、诊断和 source provenance。
Frontend 位于 Core 之前，可以是官方文本语法、第三方文本语法或可视化编辑器导出器。
参考工具链可以提供默认 Frontend，Core API 本身不能依赖该默认值。

### 4.2 Vocabulary/author module

定义作者能够表达什么、参数和字段是什么、纯规范化或展开如何工作。它由作者导入
并锁定，改变版本可能改变作者程序含义。

### 4.3 SVK

定义一个可导入组件的公开 ABI、参数、子组件和模块化编译逻辑。SVK 可以纯计算，
也可以产生类型化 Requirement。Prompt、领域 JSON schema、领域校验和编译配方
可以属于 SVK。

### 4.4 Handler/Fulfiller

注册在 Runtime Host 中，负责满足某类 Requirement，例如 OpenAI、Gemini、
Seedance、STT、本地 FFmpeg 或人工上传。它处理 credential、API 协议、网络、
异步 operation 和 usage，不拥有上层组件的领域语义。

### 4.5 Consumer/target/view

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

## 6. 官方文本 Frontend 的 `.svml`、`.svc`、`.svs`、`.svk`

这些后缀和语法是官方 Author Frontend 的源码组织约定，不是 Core ABI。第三方
Frontend 可以采用其他文件、数据库或编辑器存储，只要最终产生规范
`IntentModule` 并锁定同等依赖与 provenance。

### 6.1 `.svml`: 官方作品级作者源码

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
@svml/narrative@1
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

LLM 输出只能产生 `CaptionGroupingCandidate`、annotation 或其他派生产物。
Frontend 产生的权威 Narrative 作者文本仍然是唯一口播文字真相；领域 validator
必须拒绝修改、补写或删除作者口播文本的返回结果。官方 Frontend 下它对应当前
Script 正文，其他 Frontend 下则对应其降低出的同一权威字段。

## 11. 漂亮 Script 是官方 Frontend 资产，不是 Core 入口

当前 Script Surface 应被完整保留在官方 Frontend 中，包括：

- prose-first 的 `<segment>`；
- 行首 Role Cue；
- Dual Text；
- Selection、Moment 和 Slot；
- 文本规范化、Formatter 和 source map；
- `2M + 2N` 独立锚点；
- Segment 内顺序以及 Segment 之间的身份隔离；
- Script 静态诊断。

官方 Frontend 可以把这些语法降低为 `@svml/narrative` 模块定义的作者节点和
产物。`@svml/narrative` 提供稳定领域合同，当前 Script Parser 提供一种产生该
合同的漂亮写法；二者不能被等同。

第三方作者至少有三种平等路径：

1. 使用官方 `.svml` Frontend 和当前漂亮 Script；
2. 使用自己的整文档 Frontend，直接产生兼容 `Narrative@1` 和其他作者节点；
3. 在官方 Frontend 中引用外部稿件或组件，由 source codec/producer 产生
   `Narrative@1`。

如果第三方不采用 Narrative 合同，也可以定义自己的作者类型，并提供与字幕、
Seedance 或 Track 组件之间的显式适配 Kernel。Core 不强制每个作品存在 Script，
也不强制每个 Frontend 产生 Narrative。

当前 v1 已经隐约存在正确的实现接缝：外层 document parser 先把 `<script>` 正文
作为 raw source 保存，再由独立 `parseScript()` 解析。但 `scriptSource`、单例
cardinality 和 `if (name === "script")` 仍在编译入口硬编码。迁移时应把这两层都
移入官方 Frontend，让 Core 只接收 lowering 后的 `IntentModule`。

Frontend 的身份、版本、实现 digest 和输出 digest 必须进入 Author Program Lock。
更换 Frontend 通常意味着改变作者程序的解释；只有两个 Frontend 产生相同规范
意图并满足规定的 provenance 等价条件时，工具才能证明它们语义等价。

SemanticMap、TimingEvidence 和 CaptionPlan 仍然只是对权威作者稿件意图的派生或
观察。无论稿件由哪个 Frontend 产生，LLM 和外部 Provider 都不能借 Frontend
可替换之名修改口播文字真相。

## 12. 两段 Seedance、双人对话和字幕的完整例子

使用官方 Frontend 时，稿件部分继续采用当前漂亮 Script Surface。下面只是一种
候选 Program Surface；外层组件语法尚未冻结：

```svml
<svml>
  <script>
    @alice-shot
    <segment id="alice-line">
      <ALICE> Alice 要说的话。
    </segment>
    @/alice-shot

    @bob-shot
    <segment id="bob-line">
      <BOB> Bob 要说的话。
    </segment>
    @/bob-shot
  </script>

  <Film id="main">
    <Sequence>
      <seedance:Shot
        id="alice-video"
        during={script.selection.alice-shot}
        model="mini"
        direction="Alice 在办公室里说话"
      />
      <seedance:Shot
        id="bob-video"
        during={script.selection.bob-shot}
        model="mini"
        direction="Bob 在街道上回应"
      />
    </Sequence>

    <caption:Track id="captions" source={script} />
  </Film>
</svml>
```

这里的 `<script>`、Role Cue 和 Selection 由官方 Frontend 降低；Core 没有
`script` 全局变量。若 lowering 产生了名为 `script` 的引用，那只是该 Frontend
输出 `IntentModule` 中的普通 binding。

工具配置和 Author Program Lock 记录 Frontend：

```text
@svml/official-frontend
```

作者模块闭包选择：

```text
@svml/narrative
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

## 13. Target、Editor 和 View

目标、编辑器和 View 也使用公开模块协议，但不应被混同为 Author Frontend 或
作者语言模式。

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

编辑器可以读取作者事实、派生 Claim、Requirement 和候选产物。Canvas 坐标、
面板展开状态、选中节点等 UI 状态不进入作者程序。编辑器修改作品时，可以更新
它拥有的 source document，或通过对应 Author Frontend 重新产生 IntentModule；
不能将 ViewModel 变成第二份作者真相。

## 14. 锁与可复现性

需要把“作者选了什么”和“这次实际怎么做的”分开记录。

### 14.1 Author Program Lock

记录：

- SourceUnit digest、Author Frontend 身份、版本和 implementation digest；
- Frontend 输出的 `IntentModule` digest 与 source provenance；
- 官方或第三方源码闭包以及导入模块闭包；
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
Author Frontend / XML / Namespace / Script concrete syntax
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
| 外层 document parser | `@svml/official-frontend` |
| Script parser、Formatter 和漂亮具体语法 | 官方 Frontend 的 Script Surface |
| Narrative 文本模型和锚点合同 | `@svml/narrative` |
| temporal alignment | `semantic-map.svk` |
| ProgramBasis | timeline contract + basis kernels |
| Caption planning/projector | caption intent + subtitle SVK |
| flat Track validation | `@svml/track` contract/validator |
| Film/HyperFrames projector | composition/target kernels |
| sandbox | Kernel/Handler Host |
| lock/digest | Author Program Lock + Derivation Lock |
| examples/tests/goldens | v2 conformance suite |

应替换而不是继续扩展：

- Core/Compiler 直接接收源码字符串并选择 Parser；
- document parser 对 `<script>`、`scriptSource` 和唯一 Script 的特判；
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
2. 定义 `IntentModule`、Module ABI、Kernel/Requirement/Receipt；
3. 定义不可约的 `SourceUnit + FrontendRef` Driver 绑定、
   `AuthorFrontend.decode(SourceUnit) -> IntentModule` 公开协议和锁格式；
4. 定义 `@svml/text` 的固定 Import Prologue、Module Manifest、Surface Registry
   和 Component Registry 协议；
5. 把当前外层 parser、Script parser 和 Formatter 提取为官方 Frontend，同时完整
   保留 v1 漂亮 Script goldens；
6. 让 Core 入口只接收 `IntentModule`，删除 `scriptSource` 和源码类型特判；
7. 把 Narrative 文本模型与锚点归入 `@svml/narrative` 领域合同；
8. 实现有限、类型化、可暂停的模块编译微内核；
9. 用本文双人 Seedance + Subtitle 例子做第一条竖切；
10. 实现 local ArtifactStore、journal 和注册式 Handler；
11. 逐个把当前算法移动到官方 SVK；
12. 新竖切和必要 goldens 通过后删除旧固定编译器。

## 17. 架构验收标准

重写完成前至少应证明：

- Driver 可以通过显式 `SourceUnit + FrontendRef` 启动，不依赖源文件自我声明
  Frontend；
- Core 的公开入口接收 `IntentModule`，不接收 `.svml` 源码字节；
- Core 源码中不存在 XML、Namespace、`<script>`、Script parser 或具体文件后缀
  分支；
- 裸 `@svml/text` 不认识 `<script>`；只有显式 import、re-export 或 Standard
  Prelude 把 Script Surface 放入冻结 Registry 后才可解析；
- 官方 Text Frontend 拒绝 Body 中的 module import，且 import 排列顺序不改变
  冻结后的模块闭包和语义；
- Core 源码中不存在 Script/Caption/Film/Seedance/HyperFrames 类型分支；
- 当前 v1 漂亮 Script 由官方 Frontend 完整保留；
- 一个完全不使用 XML、Namespace 或 `<script>` 的第三方 Frontend 可以产生兼容
  作者程序并参与同一后续编译；
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
Author Frontend 把任意作者写法降低为规范 IntentModule
作者选择意图、组件、公开参数和自己关心的实现约束
SVK 定义模块化编译配方、Prompt、领域协议和外部 Requirement
Host 注册调用器并补全剩余运行绑定
Provider/人工/缓存产生带 Receipt 的观察事实或替代产物
Core 负责身份、类型、不可变事实、调度、完整性和推导证明
```

因此：

> SVML 的本体是一门可扩展的抽象作者意图语言；官方漂亮文本只是一个可替换
> Author Frontend。SVK 是作者可选择的模块化编译组件；外部 Runtime 是这些组件
> 所声明需求的开放满足环境。
