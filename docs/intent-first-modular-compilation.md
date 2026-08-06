# SVML 意图优先的模块化编译架构

> **架构演进记录。** 本文较早章节使用的 `BuildIntent + PinBinding + Alternative` Kernel
> 模型已经被
> [`LogicalOutput + Candidate + Satisfaction + Build Compiler`](./logical-output-realization-fragment-draft.md)
> 的 `@2` 模型替代。本文关于作者意图、Bootstrap、Surface、Script 和模块边界的讨论仍
> 有效；涉及 Core wire format、Pin 或 Demand 算法时，以新文档与当前代码为准。

Date: 2026-08-03

Status: architecture direction; interfaces are not frozen.

本文记录 SVML 下一阶段的架构共识。它修正了当前 v1 原型中仍然存在的固定
Basis/Map/Track/HyperFrames 编译路径，也修正了讨论过程中一度把所有 Kernel 都
交给外部环境选择的过度解耦。

当前仓库仍然是可执行的 v1 研究原型。`compiler-prototype.md`、
`runtime-host-architecture-draft.md` 和现有 specification 在迁移完成前继续描述
当前实现；本文描述后续重写应当遵守的方向。

2026-08-03 修订进一步收紧了语言边界：SVML Core 的输入不是 `.svml` 源码字节，
而是 Frontend 已经产生的 `TypedModule`；官方作品 Frontend 通常产生其中的
`IntentModule`。当前漂亮的 Script Surface 是
官方具体语法的一部分，不是 Core 必须识别的语法；第三方可以用完全不同的文本、
文件结构或可视化编辑器产生相同作者意图。

同日后续修订进一步取消文件后缀的架构特权：v2 暂时只把 `.svml` 和 `.svs`
保留为官方提供的两种人类友好源码语法；`.svc` 和 `.svk` 不再是 v2 基础文件类型。
组件、Kernel、Frontend、Requirement 和 Recipe 都是包的导出能力，由固定的数据
Manifest 描述，包的实现可以使用 JS、Wasm 或其他受 Host 支持的形式。

### 历史 Kernel 修订及当前替代

2026-08-04 的讨论首先确认：Core 不能只被描述为“对预先给定 BuildPlan 推进事件的
状态机”。Film/HyperFrames 不是每次 Build 的固定根，BuildPlan 必须从完整 Graph 和本次
Target 选择反向派生。次日实现进一步把当时的 `BuildIntent + PinBinding + Alternative`
替换为当前 `BuildRequest + Candidate` 模型；Pin 只是宿主选择 Existing-Value Candidate
的产品动作。

同时确认：Track、SpeechBasis 等共同语言由独立 Contract Package 定义，Core 只
拥有 TypeRef/Schema 元语言，不全局注册领域类型；一个 Core 构建完成后才发布的未知
组件必须能通过 Manifest 与隔离 Worker 动态加入，而不重发 Core/CLI/Hosted 主服务。

当前模型中，一个 Logical Output 声明 Primary 和零个或多个 Candidate；BuildRequest
按 CandidateId 显式选择。Candidate 可以由 Operation 或 Existing Value 实现，Core 不再
拥有 Alternative/Pin 两套分支。Provider 只为已经被选中 Operation 提出的 exact
Capability 绑定 Endpoint。完整规范见 [`../spec/core-kernel-v1.md`](../spec/core-kernel-v1.md)
和 [`logical-output-realization-fragment-draft.md`](./logical-output-realization-fragment-draft.md)。
本文后续旧例若与它们冲突，以规范和当前代码为准。

### 2026-08-03 首个 Frontend 竖切

当前 v2 已实现 `@svml/text` 与 `@svml/script` 的第一条公开接缝：

- `@svml/protocol` 的静态 Module Manifest 可以声明 raw/structured Surface 及其
  被允许产出的 Record 类型；
- Core 只通用验证 Surface 名称、tag、mode、输出类型与实现 digest，不解析任何 Surface；
- `@svml/text` 固定 `<svml>`、leading Import Prologue、结构树和按 Manifest 分派；
- `@svml/script` 普通地声明 raw `<script>` Surface，并产生 `Narrative` Typed Record；
- 未 import Script 时，Text 不认识 `<script>`；紧凑排版和多行排版产生相同
  semantic digest，但保留不同 source digest/source map；
- Script 的 Segment 采用 `<opening>...</opening>` 具名块，Role Cue 由 Segment
  body 解析状态识别，不依赖行首或换行。

这一竖切仍只运行可信、显式注册的 Surface handler。第三方 Parser 沙箱、Driver
解析 source import、完整包定位/lock 和通用 Component Surface 尚未实现，不能把
当前 registry 当作最终安全边界。当前 `@svml/script` Surface 已输出
`@svml/contracts#Narrative`；Narrative 是独立 Contract Package 中的领域共同语言，
不是 Core 概念。

## 1. 一句话定义

> SVML 的规范语义代表且仅代表作者意图；任意 Author Frontend 可以把自己的
> 具体写法降低为这个意图。作者可以选择具体的编译组件与配方，外部环境负责
> 满足这些组件提出的外部需求，并可以在明确记录的前提下提供缓存或替代产物。

因此，SVML 不是：

- Provider 工作流 DSL；
- 固定的视频生成流水线；
- Hypit/Twinit 节点图的文本序列化；
- HyperFrames 的配置格式；
- 把 preview、test、run、production 写进语言的多模式构建系统。

SVML 是一门作者意图语言。一次具体视频只是某个编译组件闭包、外部事实和运行
环境对这份意图的一次可追溯实现。

## 2. 架构宪法

后续设计和代码必须满足以下约束。

1. Frontend 输出的 `TypedModule`、作者导入并锁定的模块以及作者材料共同构成
   作者程序；官方 `.svml` 和 `.svs` 只是两种具体源码表示。作者程序不能包含
   credential、队列、Job 或产品数据库状态。
2. Frontend 产生一个作者程序快照后，其中的作者事实在编译和运行期间不可被
   修改。Kernel、LLM 和 Provider 只能追加派生事实或观察事实；编辑器或 Frontend
   只能通过作者明确接受的 source patch 产生新的作者程序快照。
3. SVML Core 不认识 Script、Seedance、Caption、Track、Film、SemanticMap、
   HyperFrames 或任何 Provider 名称。
4. Narrative、`2M + 2N` 锚点等重要领域协议可以是官方标准模块；漂亮 Script
   可以是官方 Frontend Surface，但二者都不能成为 Core 中的特判。
5. SVML 可以导入包以及包导出的组件、Kernel 和 Recipe。作者有权选择组件语义、
   编译配方、模型家族或精确模型。
6. 外部环境默认替换的是 Requirement 的满足方式，不是作者选择的模块或 Kernel。
   替换 Kernel 必须是显式 override，并进入推导记录。
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
    但 Script、Component 和 Kernel 都必须在该 Prologue 之后通过公开模块协议出现。
13. 完整作者程序降低为不预设唯一终点的 CompiledGraph；任意公开输出都可以成为
    Target，Pin 必须作为作者 BuildIntent 由 Core 验证并截断上游。
14. Core 根据 Targets/Pins 派生有限 BuildPlan；Runtime 和组件不得覆盖 Demand 法律。
15. Core 只认识通用 TypeRef/Schema。Track、Narrative、SpeechBasis、Composition 等
    共同语言由版本化 Contract Package 定义，并作为模块传递依赖进入当前闭包。
16. 新增组件、Contract 或 Provider 不需要修改中央 union、switch、数据库表或重发
    Core；动态外部包纵向测试是开放扩展能力的必要验收。

## 3. SVML 是抽象意图语言，不是一种被 Core 固定的源码写法

当前 v1 最珍贵的资产之一是漂亮、连续、接近稿件本身的 Script Surface：

```svml
<script>
  @whole

  <scene-1>
    <ALICE> 很多人以为，视频编译就是素材拼接。
  </scene-1>

  <scene-2>
    <BOB> 但真正重要的是，
          @architecture 作者意图和具体实现彼此分离 @/architecture。
  </scene-2>

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
  discover(source: SourceUnit, context: BootstrapContext): DependencyRequest[];
  decode(source: SourceUnit, context: ResolvedFrontendContext): TypedModule;
};

type SvmlCore = {
  link(closure: ResolvedModuleClosure, modules: TypedModule[]): LinkedWorld;
  request(world: LinkedWorld, query: Query): BuildState;
  next(build: BuildState): CoreCommand;
  accept(build: BuildState, result: TypedResult | EffectReceipt): BuildState;
};
```

Core API 不接收 `.svml` 文本。Frontend 负责 parse、静态语法诊断、source map
和 lowering；Core 从通用模块封装开始，负责链接、类型、引用、Kernel、Requirement
和证明。`discover()` 只声明依赖请求，Driver 负责解析和锁定闭包；`decode()` 只能
读取 Driver 交给它的同一份只读闭包。

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

### 3.2 Namespace 和 Kernel 都不是通用源码 Parser

Namespace 是某一种具体 Frontend 的名字解析功能。官方 XML-like Frontend 可以用
它解析 `seedance:*` 或第三方组件，但一个电影剧本 Frontend、Markdown Frontend
或 GUI 根本不必有 Namespace。因此 Namespace 不能承担通用 Frontend 注册。

Kernel 在源码已被降低为类型化意图之后运行，负责：

```text
输入 Fact/Artifact -> 输出 Fact/Artifact 或 Requirement
```

它不负责解析主源码字节。一个发布包可以同时包含 Frontend、类型、Formatter、
LSP 和若干 Kernel，但这些是同包内的不同公开接口，不能因为物理上放在一起而合并
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
}): TypedModule;
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
         source bytes -> TypedModule

Core     TypedModule[] -> Commands / Claims / Requirements
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

包发现阶段只读取固定、数据化的 `svml.module.json`，不能为了知道一个包导出了
什么而先执行该包的 JS。Frontend 只负责发现依赖请求；Driver 负责解析、授权并锁定
唯一的 `ResolvedModuleClosure`，再把这份闭包只读地交回 Frontend；Core 最后验证
所有类型和实现引用都属于同一闭包，避免 Frontend 和 Core 各自维护一份模块事实。

Body Parser 遇到元素时按完整模块身份分派，而不按字面名字特判：

```ts
const descriptor = scope.resolve(openingName);

if (descriptor.kind === "surface") {
  return descriptor.parser.parse(readRawBody());
}

return decodeComponent(parseStructuredBody(), descriptor.schema);
```

因此 `@svml/script` 的 Manifest 把 `script` 导出声明为 raw Surface；
`@svml/seedance`、`@svml/film` 通常只导出使用通用结构 Parser 的 Component
Schema 与 Kernel。没有导入或 re-export Script Surface 时，裸 `@svml/text`
不认识 `<script>`。每个 Surface 还必须静态声明它可产生的 Record 类型；Text
在 seal authored Record 前检查该集合，Core 再检查这些类型确实属于 Surface
模块自身或其显式依赖，Parser 不能借先执行的位置冒充闭包中的其他模块。

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

Prologue 还可以导入“由指定 Parser 读取的另一个作者 SourceUnit”：

```svml
<import as="svs" from="@svml/svs@1" />
<import as="brand" from="./brand.svs" using="svs:stylesheet" />
```

第一行导入读取规则语言的方法；第二行要求 Driver 用该方法把 `brand.svs` 降低为
一个 `ParameterRuleModule`。Header Scanner 只需识别 `from/using/alias`，不需要懂
SVS。Driver 对新发现的 SourceUnit 重复依赖发现和安全解析，直到得到唯一锁定闭包；
Core 最终只看到类型化模块。`.svs` 后缀只提供默认关联，`using` 才是显式语义。

官方 Standard Prelude 只是由项目配置预先加入 Prologue 闭包的一组普通模块和
显式 re-export。它可以让作者直接写 `<script>`，但不能成为 `@svml/text` 的隐藏
知识；裸 Text Frontend、显式导入和 Prelude 必须走同一公开 Registry 路径。

### 3.5 Frontend 与 Surface Parser 的安全边界

Frontend 和 Surface Parser 在 Core 之前运行，因此第三方 Parser 不能被当作普通
可信库直接加载。参考 Driver 至少必须提供：

- 默认无文件系统、网络、环境变量、进程、时钟和随机数权限；
- 只读 SourceUnit 和已授权 `ResolvedModuleClosure` 的显式 capability；
- CPU、墙钟、内存、递归深度、输入和输出大小限制；
- 无 Host realm 对象或函数泄漏的隔离边界；
- 确定性输出、实现 digest、诊断和完整 provenance。

当前 v1 的 Node `vm`/worker 隔离不能未经安全审计直接作为第三方 Frontend 沙箱；
Frontend 沙箱是 v2 Driver 的独立施工项，而不是 Core 类型检查可以补救的问题。

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
TypedModule(s)
  IntentModule · ParameterRuleModule · third-party typed modules
                         │
                         ▼
Bootstrap Driver
  resolve · authorize · lock closure · run parsers in sandbox
                         │
                         ▼
SVML Core
  pure link · typecheck · derivation state machine · verify results
                         │
               ┌─────────┴──────────┐
               ▼                    ▼
       Kernel Commands          Requirements
               │                    │
               └─────────┬──────────┘
                         ▼
Runtime Driver / Host
  sandbox executor · registered handlers · credentials · journal · policy · artifact store
                         │
                         ▼
              Receipts + typed results + observed claims
                         │
                         └──────> Core 验证并推进状态
```

需要区分五类扩展。

### 4.1 Author Frontend

读取某一种作者源码格式，产生规范 `TypedModule`、诊断和 source provenance。官方
`.svml` 通常产生 `IntentModule`，官方 `.svs` 产生 `ParameterRuleModule`。
Frontend 位于 Core 之前，可以是官方文本语法、第三方文本语法或可视化编辑器导出器。
参考工具链可以提供默认 Frontend，Core API 本身不能依赖该默认值。

### 4.2 Vocabulary/author module

定义作者能够表达什么、参数和字段是什么、纯规范化或展开如何工作。它由作者导入
并锁定，改变版本可能改变作者程序含义。

### 4.3 Module export / Kernel

包可以导出组件的公开 ABI、参数、子组件、Kernel 和模块化编译逻辑。Kernel 可以
纯计算，也可以产生类型化 Requirement。Prompt、领域 JSON schema、领域校验和
编译配方可以属于发出请求的模块。Kernel 是导出能力，不是文件类型。

### 4.4 Handler/Fulfiller

注册在 Runtime Host 中，负责满足某类 Requirement，例如 OpenAI、Gemini、
Seedance、STT、本地 FFmpeg 或人工上传。它处理 credential、API 协议、网络、
异步 operation 和 usage，不拥有上层组件的领域语义。

### 4.5 Target、Pin 与 View

完整 CompiledGraph 中任何合法输出端口都可以成为一次 Build 的 Target，例如 Image、
ImageSet、SemanticMap、Track、Timeline View、HyperFrames Program 或 MP4。Target
不是 Film 专属终点，也不是 Runtime 自动挑选的全局模式。

Pin 是作者对某个输出端口的明确物化选择。Core 从所有 Targets 反向求 Demand，遇到
Pin 截断该 Producer 的上游；多个 Targets 的公共上游只执行一次。View 可以消费同一
图与 BuildState，但 Canvas 坐标、面板展开等纯 UI 状态仍不进入 BuildIntent。

## 5. 与模块无关的最小 Core

推到最小以后，绝对 Core 中没有“视频”。它只需要以下抽象。

```text
Identity
Type
Value
Typed Graph / Node / Port
Target / Pin / BuildIntent
Demand / finite BuildPlan
Authored Fact
Derived/Observed Claim
Kernel
Requirement
Artifact
Derivation/Provenance
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

### 5.3 Graph、BuildIntent、Kernel 与 Requirement

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
  capability: CapabilityRef;
  returns: TypeRef;
  subject: NodeId;
  payload: Value;
  requestedBy: DerivationId;
};

type BuildIntent = {
  graph: Digest;
  targets: Array<{
    port: PortAddress;
    accepts: "exact" | "substitute";
  }>;
  bindings: Array<
    | { kind: "realization"; port: PortAddress; realization: ProducerRef }
    | { kind: "pin"; port: PortAddress; value: StoredValue; fidelity: "exact" | "substitute" }
  >;
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

这里的 demand scheduling 表示：在 Author Modules 已经降低好的完整 CompiledGraph
中，从 BuildIntent Targets 反向遍历显式依赖，遇到 Pins 截断，派生有限 BuildPlan。
它不表示 Core 扫描所有已安装 Kernel 自动搜索未知工作流。Producer 的选择必须已经
存在于图中；Core 只计算当前作者到底 demand 哪些已声明节点。

### 5.4 Core 是纯状态机，不是副作用执行器

Core 不读文件、不执行 JS、不访问网络、环境变量或时钟。概念 API 是：

```ts
const graph = core.link(resolvedClosure, typedModules);
let build = core.start(graph, buildIntent);

const command = core.next(build);
// RunKernel | ResolveRequirement | Complete

build = core.accept(build, typedResultOrReceipt);
```

Driver/Host 执行 `RunKernel` 或满足 `ResolveRequirement`，Core 只验证返回值是否满足
声明的类型、身份、输入 digest 和闭包约束，并推进可重放的推导状态。这样安全沙箱、
网络、缓存和 Provider 生命周期都不会渗入纯 Core。

## 6. 官方源码语法与包格式

文件后缀只负责作者体验、编辑器关联和默认 Frontend 选择，不定义 Core 本体。
v2 初期只保留两种官方人类源码语法：

```text
.svml  官方作者意图语法，由 @svml/text 读取
.svs   官方参数规则与 Recipe 语法，由 @svml/svs 读取
```

第三方 Frontend 可以采用其他后缀、数据库或编辑器存储，只要最终产生规范类型化
模块，并锁定同等依赖与 provenance。显式 `using` 比扩展名优先；扩展名只是便利
关联。例如同一份规则源码可以写成 `brand.rules`，并显式指定
`using="svs:stylesheet"`。

### 6.1 `.svml`: 官方作者意图源码

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

同一种 `.svml` 既可以是作品入口，也可以是被导入的作者意图库。纯内容、人物、
品牌、素材引用和可复用意图片段通过模块导出和权限 profile 区分，不需要新的
`.svc` 基础后缀。若未来 `.svc` 具有独立且确实有价值的人类语法、Formatter 或
安全 profile，可以作为便利 Frontend 重新评估，而不是预先写入 Core。

### 6.2 `.svs`: 类型化参数规则与 Recipe

SVS 不应被限制为视觉 CSS。更准确的定义是：

> 作者侧、带选择器和 provenance 的类型化公开参数覆盖表。

只要模块将参数声明为公开可配置，SVML 或作者导入的 SVS 都可以设置它：

- 字体、颜色、位置；
- Seedance `mini`/`pro` 模型；
- 生成时长、宽高比和质量；
- 字幕最大行数；
- 如果模块选择公开它，也可以是字幕使用的 LLM。

由谁导入 SVS 比文件后缀更重要。作者导入的 SVS 是作者程序；Host 临时注入的
参数不是作者事实，必须记录为外部 binding 或 override。

SVS 本身也不是 Core 的特殊输入。`@svml/svs` 的 Frontend 把它降低为类型化的
`ParameterRuleModule`；同包的 Elaborator Kernel 消费该模块并产生带逐值来源的
参数结果。Core 看不到选择器、级联或 `.svs` 后缀。

### 6.3 包、Manifest 与实现

组件、Kernel 和 Parser 不靠专属后缀分发。一个包使用固定的数据 Manifest 描述
自己的导出：

```text
@svml/seedance/
├── package.json
├── svml.module.json
├── schemas/
├── recipes/
└── dist/                 # JS、Wasm 或其他 Host 支持的实现
```

`svml.module.json` 可以声明 `types`、`components`、`surfaces`、`kernels`、
`requirements` 和 `recipes`。包作者可以用 TypeScript SDK 编写并由 `svml pack`
产生规范 Manifest，但发布后的 Driver 不得通过执行 TypeScript 来发现导出。

包可以是纯 Schema/Recipe，也可以包含实现。实现不得凭包身份自动获得网络、文件、
环境变量或 credential；它只能在获授权沙箱中运行，或产生 Requirement 交给 Host。
因此 `.svk` 不再是 v2 基础文件类型：Kernel 是包的一种导出能力，而不是一种语法。

建议的固定工具文件是：

```text
svml.module.json   包的静态 Manifest
svml.project.json  项目入口和 Frontend 绑定
svml.lock          精确包版本与 digest
```

### 6.4 官方最小包分层

第一批官方包应按责任分层，而不是把旧固定流程换名后重新装进 Core：

```text
@svml/core          纯链接、类型验证、推导状态机和 provenance
@svml/driver-node   解析闭包、沙箱执行、缓存和 Handler 注册
@svml/text          官方 .svml Frontend 与通用结构/Surface 分派
@svml/svs           官方 .svs Frontend 与参数规则 Elaborator
@svml/contracts     media/narrative/semantic/program 的窄腰协议
@svml/script        当前漂亮 Script Surface -> Narrative
@svml/film          一种可选的成片意图和输出合同
```

具体生产能力继续位于普通官方包中，例如 `@svml/seedance-adapter`、
`@svml/whisperx-adapter`、`@svml/speech-align`、`@svml/caption` 和 `@svml/broll`。
官方可以另给一个有观点的
`@svml/talking-film` Recipe，把这些能力组合成推荐流程；它不能成为隐藏编译阶段。

`@svml/contracts` 初期可以是一个带子命名空间的包，减少过早拆包导致的版本矩阵：

```text
media      Audio / Video / Image / Track
narrative  Narrative / Segment / Utterance / authored selection
semantic   SemanticEvidence / SemanticMap / resolved selection
program    ProgramSpace / ProgramBoundAudio / ProgramSource
```

其中窄腰鸭子合同可以要求一个 A-roll 生产者直接提供同一 ProgramSpace 中的定位音频
和视觉 Track：

```ts
type ProgramSource = {
  locateAudio: ProgramBoundAudio;
  visualTrack: Track;
};
```

Seedance 可以作为 Primary；已上传视频、人工产物或黑场可以由模块声明为命名
Alternative，或在本次 BuildIntent 中成为 Pin。相同外层类型本身不会触发替代路由。
Core 不认识这些业务含义，只验证闭包、类型、输入子集、fidelity 与亲和性等式。

## 7. SVML 可以并且通常应该导入模块包

“Core 不认识某个领域模块”不等于“作者不能选择具体组件或 Kernel”。作者可以选择：

```text
@svml/contracts@1
@svml/seedance@1
@svml/caption@1
@svml/film@1
```

就表示作者选择了这些组件的语义和编译配方。它们与传递依赖一起形成 Author
Program Closure，并进入作者程序锁。

默认 Kernel 集合来自：

```text
K = source-selected modules' kernels
  + their transitive dependencies
  + consumer-selected target/view kernels
  + explicit recorded overrides
```

运行环境不能从一个全局 registry 中随便为 `<caption:Track>` 猜一个实现。

复用或替代发生在三个不同层次：

1. 正常 fulfillment：作者选择的模块和 Kernel 不变，外部满足它的 Requirement；
2. exact Pin：调用者提供已有产物，并证明类型、内容和声明式亲和性；
3. named Alternative / substitute Pin：BuildIntent 明确改变 Realization 或提供非精确
   产物，选择和 fidelity 都进入摘要。

## 8. 外部调用：统一生命周期，不抹平语义

Requirement 表示“被选中的 Producer 当前需要某个明确外部 Capability 的类型化产物”。
历史产物、人工值和预览必须在 Requirement 出现前成为 Pin/Alternative；Host 不根据
返回类型搜索它们。只有该 Requirement 被 Demand 时，才交给匹配 capability 的 Handler。

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

Prompt、语义参数和领域输出仍然属于发出请求的模块与 Kernel。

## 9. 参数与 Provider 选择不是固定归属

不能规定“模型总是作者选择”“模型总是 Kernel 选择”或“模型总是 Host 选择”。
正确规则是逐层约束：

```text
作者/SVS 声明自己关心的约束
            ↓
模块 Kernel 为未决定部分增加实现约束或默认
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

模块决定哪些参数公开给作者、哪些是私有实现决定、哪些留给 Host。

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

LLM 不属于 Core，但完全可以、并且经常必须出现在模块的 Kernel 实现中。

以官方字幕模块为例，它的分 Cue Kernel 拥有：

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

前者属于 Handler，后者属于 Caption 模块的领域 Kernel。

如果字幕 Kernel 的 Prompt 明确针对 Gemini，它可以直接产生
`google.gemini.structured-generation@1` Requirement。作者不必关心 Gemini；
这个选择由作者导入的模块版本和 Kernel digest 固定。若作者希望控制它，模块可以公开
相应参数供 `.svml` 或 `.svs` 设置。

LLM 输出只能产生 `CaptionGroupingCandidate`、annotation 或其他派生产物。
Frontend 产生的权威 Narrative 作者文本仍然是唯一口播文字真相；领域 validator
必须拒绝修改、补写或删除作者口播文本的返回结果。官方 Frontend 下它对应当前
Script 正文，其他 Frontend 下则对应其降低出的同一权威字段。

## 11. 漂亮 Script 是官方 Surface 资产，不是 Core 入口

当前 Script Surface 应被完整保留在普通官方包 `@svml/script` 中，包括：

- prose-first 的具名 Segment，例如 `<answer>...</answer>`；
- 由 Segment body 解析状态识别、与换行无关的 Role Cue；
- Dual Text；
- Selection、Moment 和 Slot；
- 文本规范化、Formatter 和 source map；
- `2M + 2N` 独立锚点；
- Segment 内顺序以及 Segment 之间的身份隔离；
- Script 静态诊断。

Text Frontend 只根据冻结 Manifest 把 raw region 交给 Script Surface；Script
Surface 再把这些语法降低为 Narrative 作者 Record。当前首个竖切由
`@svml/script` 同包导出 Narrative 合同和 Parser，但这两个导出不能被等同：未来
电影剧本 Frontend 可以只产生同一 Narrative 类型，未来也可以在出现真实复用边界
时把合同独立成 `@svml/narrative`，均不改变 Core。

第三方作者至少有三种平等路径：

1. 使用官方 `.svml` Frontend 和当前漂亮 Script；
2. 使用自己的整文档 Frontend，直接产生兼容 `Narrative@1` 和其他作者节点；
3. 在官方 Frontend 中引用外部稿件或组件，由 source codec/producer 产生
   `Narrative@1`。

如果第三方不采用 Narrative 合同，也可以定义自己的作者类型，并提供与字幕、
Seedance 或 Track 组件之间的显式适配 Kernel。Core 不强制每个作品存在 Script，
也不强制每个 Frontend 产生 Narrative。

当前 v2 已把这条接缝实现为公开协议：Text 从导入模块的 Manifest 建立 Surface
scope，Script handler 消费 raw region 并返回 Typed Record；Text 源码中没有
`if (name === "script")`，Core 只接收 lowering 后的 `TypedModule`。当前仍缺的是
不执行包代码的完整包定位和安全执行第三方 Surface Parser。

Frontend 的身份、版本、实现 digest 和输出 digest 必须进入 Author Program Lock。
更换 Frontend 通常意味着改变作者程序的解释；只有两个 Frontend 产生相同规范
意图并满足规定的 provenance 等价条件时，工具才能证明它们语义等价。

SemanticMap、TimingEvidence 和 CaptionPlan 仍然只是对权威作者稿件意图的派生或
观察。无论稿件由哪个 Frontend 产生，LLM 和外部 Provider 都不能借 Frontend
可替换之名修改口播文字真相。

## 12. 两段 Seedance、双人对话和字幕的完整例子

> 本节保留早期最小草图以解释模块分派。当前完整作者目标已经收敛到
> [`examples/talking-film-golden`](../examples/talking-film-golden/README.md)：它复用已实现的
> Script Surface，并补齐声明后使用的 Prompt/参考图、Speech Spine、显式 WhisperX、
> Gemini 字幕、Seedance B-roll、Text、平级 Track、Film 与显式 Hyperframes render。
> 两处不再各自发明不同的外层语法；后续实现以黄金示例为准。

使用官方 Text Frontend 并导入 Script 包时，稿件部分采用当前漂亮 Script
Surface。下面只是一种候选 Program Surface；外层组件语法尚未冻结：

```svml
<svml>
  <import from="@svml/script@1" />
  <import as="seedance" from="@svml/seedance@1" />
  <import as="caption" from="@svml/caption@1" />
  <import from="@svml/film@1" />

  <script>
    @alice-shot
    <alice-line>
      <ALICE> Alice 要说的话。
    </alice-line>
    @/alice-shot

    @bob-shot
    <bob-line>
      <BOB> Bob 要说的话。
    </bob-line>
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

这里的 `<script>` 先由 Text 按 `@svml/script` Manifest 分派，再由 Script
Surface 降低 Role Cue 和 Selection；Core 没有
`script` 全局变量。若 lowering 产生了名为 `script` 的引用，那只是该 Frontend
输出 `IntentModule` 中的普通 binding。

工具配置和 Author Program Lock 记录 Frontend：

```text
@svml/text@2
```

作者模块闭包选择：

```text
@svml/narrative
@svml/seedance@1
@svml/caption@1
@svml/film@1
```

模块化编译可能产生：

```text
SeedanceTrack(alice)
  -> Need<SeedanceVideo model=mini>

SeedanceTrack(bob)
  -> Need<SeedanceVideo model=mini>

SubtitleTrack
  -> @svml/whisperx request Producer
  -> Need<WhisperXAlignmentEvidence>
  -> provider-neutral AlignedTranscriptEvidence
  -> @svml/speech-align
  -> CompleteSemanticMap
  -> Need<GeminiStructuredGeneration>  # 由 Caption Kernel 的内部实现决定
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
WhisperX Requirement       -> 本地或托管 WhisperX 执行端
Gemini Requirement         -> 注册好的 Gemini Handler
```

另一次 BuildIntent 可以明确选择相应 Alternative/Pin：

```text
Alice SpeechBasis output -> exact Pin 缓存视频
Bob SpeechBasis output   -> black-by-duration Alternative
Evidence output          -> 人工证据 Pin
CaptionGrouping output   -> 缓存 Pin
```

两者没有使用不同的 SVML mode，也没有重新选择字幕模块。变化的是 BuildIntent 的
Realization/Pin Binding；不是 Runtime 的 Requirement 路由。不同候选可以同时存在于
完整 Graph 中，但一次 Build 的选择必须确定并进入摘要。

这里没有 `Need<SpeakerVideo>` 交给 Runtime 再猜 Seedance、Kling 或其他模型。作者
SVML 或其显式导入的组件包必须在完整 Graph 形成前决定 exact capability；Runtime
不能把 Kling 冒充 Seedance exact。Need 另行声明中立返回 Contract，例如 SpeechBasis。
调用者可以显式选择模块已声明的 Kling/黑场 Alternative，或 Pin 已有视频/人工证据，
但 Runtime 不能改写 Need capability。若 Pin 组件公开输出，原 Producer 和 Need 会被
Demand 裁掉；若选择 Alternative，只 Demand 它声明的 Primary 输入子集。

## 13. Target、Editor 和 View

Target 是 BuildIntent 的一等 Core 输入，不是 Film 专属根，也不是预览/生产模式。
同一完整图可以被作者请求：

```text
Target ImageSet              -> 只物化图片及其依赖
Target CompleteSemanticMap   -> 不 Demand Film
Target CaptionTrack          -> 只物化字幕分支
Target TrackSet              -> 物化被收集的所有 Track
Target HyperFramesProgram    -> 物化正式视觉程序
Target VideoArtifact         -> 继续执行 HyperFrames Render
```

多个 Targets 的 Demand Closure 取并集。Pin 任一公开输出会把该端口变成作者明确提供
的事实，截断原 Producer 的纯上游。Target/Pin 及其 Record digest 进入
buildIntentDigest；Runtime Profile 仍不改变作者图和 BuildIntent。

编辑器可以读取作者事实、完整 Graph、DemandPlan、派生 Claim、Requirement 和候选
产物，并创建新的 BuildIntent。Canvas 坐标、面板展开状态等纯 UI 状态不进入作者图；
但作者明确选择的 Target 和 Pin 不是普通 UI 状态，必须由 Core 哈希和验证。

## 14. 锁与可复现性

需要把“作者选了什么”和“这次实际怎么做的”分开记录。

四种身份不能混成一个 digest：

```text
sourceDigest          原始 SourceUnit/源码闭包是什么
frontendClosureDigest 由哪些整文档和 Surface Parser、配置来解释
semanticDigest        规范化后作者最终表达了什么
moduleClosureDigest   精确使用了哪些合同、模块和实现闭包
```

两个 Frontend 可以拥有不同的 source/frontend digest，却产生相同的 semantic digest。
它们应保留各自 source provenance，同时允许下游在 module/kernel/input digest 也兼容
时复用派生产物。Parse cache 使用 source + frontend closure；推导 cache 使用
semantic + module closure + Kernel + 外部输入 digest。

### 14.1 Author Program Lock

记录：

- SourceUnit digest、Author Frontend 身份、版本和 implementation digest；
- Frontend 输出的 `TypedModule` digest 与 source provenance；
- 官方或第三方源码闭包以及导入模块闭包；
- Vocabulary、模块和 Kernel 版本与 implementation digest；
- 纯 elaboration 结果；
- 最终公开参数及逐值 provenance；
- Canonical Intent Graph digest；
- 作者引用的材料 digest。

### 14.2 Derivation/Realization Lock

记录：

- BuildIntent digest、Targets 与 Pins；
- 每条 Derivation 的 Kernel 与输入输出；
- 每个 Requirement 和 request digest；
- Handler、Provider、实际模型和 operation id；
- exact/substitute 符合关系以及 executed/cache/manual/provided delivery；
- Receipt、usage 和 Artifact digest；
- 最终选中的候选及未选候选；
- 输出产物 digest。

Prompt 和领域 parser 属于相关 Kernel implementation digest。Credential secret 不进入锁，
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
HyperFrames / browser renderer
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
| 外层 document parser | `@svml/text` |
| Script parser、Formatter 和漂亮具体语法 | `@svml/script` Surface |
| Narrative 文本模型和锚点合同 | `@svml/contracts:narrative` |
| temporal alignment | `@svml/semantic-locator` Kernel |
| ProgramBasis | `@svml/contracts:program` + producer kernels |
| Caption planning/projector | `@svml/caption` |
| flat Track validation | `@svml/contracts:media` validator |
| Film/HyperFrames projector | `@svml/film` 和 target modules |
| `.svk` manifests | 一次性 legacy importer -> `svml.module.json` |
| `.svc` content | `.svml` library module / content-only profile |
| sandbox | Frontend/Kernel executor + Handler Host |
| lock/digest | Author Program Lock + Derivation Lock |
| examples/tests/goldens | v2 conformance suite |

应替换而不是继续扩展：

- Core/Compiler 直接接收源码字符串并选择 Parser；
- document parser 对 `<script>`、`scriptSource` 和唯一 Script 的特判；
- `compileSource()` 的固定领域阶段；
- Compiler 对 SpeechTimingEvidence JSON 的特判；
- CaptionTrack 的数量和类型特判；
- Film 对具体 Track 类型的认识；
- 把 Film/HyperFrames 当作每次 Build 的固定根，而不是完整图中的普通可选 Target；
- 中心硬编码 value type union；
- SVS 重复应用和隐式默认；
- 非传递 implementation hash；
- 产品 Runtime 状态进入编译上下文。

建议迁移顺序：

1. 冻结当前 fixtures/goldens；
2. 定义 `TypedModule`/`IntentModule`、Module ABI、Kernel/Requirement/Receipt；
3. 定义不可约的 `SourceUnit + FrontendRef` Driver 绑定、
   `AuthorFrontend.decode(SourceUnit) -> TypedModule` 公开协议和锁格式；
4. 完成 `@svml/text` 的固定 Import Prologue、Module Manifest、Surface Registry
   与 raw/structured Surface 分派；可信 registry、精确传递 Manifest 闭包、Node 文件系统
   Source Host 和 `check/plan` 门面已经实现，自动包安装、锁定代码加载和沙箱待补；
5. 把 Script parser 和 Formatter 提取为普通 `@svml/script` Surface 包，同时完整
   保留并更新漂亮 Script goldens；首个具名 Segment 竖切已实现；
6. 让 Core 入口只接收 `TypedModule[]`，删除 `scriptSource` 和源码类型特判；
7. 把 Narrative 文本模型与锚点归入 `@svml/narrative` 领域合同；
8. 定义完整 CompiledGraph、PortAddress、BuildIntent、TargetSet 和 PinSet；
9. 在 Core 实现 Pin 截断、多 Target 并集和反向 Demand Closure，让 BuildPlan 成为
   Graph + BuildIntent 的派生结果；
10. 用图片依赖、聚合终点和 Track Pin 证明旧系统最优雅的“到此/Pin”能力；
11. 拆分 Need capability/returns，验证 exact/substitute 与 Pin provenance；
12. 证明一个 Core 构建后才发布的未知包可以动态加入 Type、Surface、Producer 和
   Provider，而无需重发 Core/CLI；
13. 定义 Track/Composition/HyperFrames Program 公共 Contract；
14. 用本文双人 Seedance + Subtitle 例子做第一条视频竖切；
15. 实现 local ArtifactStore、JSON journal、动态 Handler Loader 和 Runtime Profile；
16. 逐个把当前算法移动到官方模块导出的 Producer；
17. 新竖切和必要 goldens 通过后删除旧固定编译器。

## 17. 架构验收标准

重写完成前至少应证明：

- Driver 可以通过显式 `SourceUnit + FrontendRef` 启动，不依赖源文件自我声明
  Frontend；
- Core 的公开入口接收 `TypedModule[]`，不接收 `.svml` 源码字节；
- Core 源码中不存在 XML、Namespace、`<script>`、Script parser 或具体文件后缀
  分支；
- 裸 `@svml/text` 不认识 `<script>`；只有显式 import、re-export 或 Standard
  Prelude 把 Script Surface 放入冻结 Registry 后才可解析；
- 官方 Text Frontend 拒绝 Body 中的 module import，且 import 排列顺序不改变
  冻结后的模块闭包和语义；
- Core 源码中不存在 Script/Caption/Film/Seedance/HyperFrames 类型分支；
- 当前漂亮 Script 由普通 `@svml/script` Surface 包提供，并通过官方 Text
  Frontend 的公开 Registry 路径解析；
- 一个完全不使用 XML、Namespace 或 `<script>` 的第三方 Frontend 可以产生兼容
  作者程序并参与同一后续编译；
- 同一完整 CompiledGraph 可以 Target 图片、SemanticMap、TrackSet、Film 或最终视频，
  不存在 Film/HyperFrames 固定根；
- Pin 任意合法公开输出会截断其 Producer 上游，多 Target 公共依赖只执行一次；
- Target/Pin 在内存和 JSON Runtime 中具有相同语义，不要求数据库；
- 新增 Vocabulary、组件或 Kernel 不需要修改 Core；
- SVML 可以导入并锁定提供这些导出的模块包；
- 一个在 Core 构建完成后才创建的外部包可以动态加入新 Contract、Surface、Producer
  和 Provider，不修改中央 union、switch 或数据库表；
- Track 等共同语言来自版本化 Contract Package，Core 不维护全局领域类型 registry；
- Host 不会为作者组件隐式挑选另一个 Kernel；
- Provider 只精确执行被选中的 Requirement；缓存、人工和预览通过 Pin/Alternative 表达；
- 同一个作者程序可以同时保留多个候选结果；
- Author Fact 无法被 Kernel 或 Handler 修改；
- LLM Prompt 和领域 parser 位于相关模块的 Kernel，不进入 Core；
- API key、队列和 Provider operation 位于 Host/Handler，不进入作者程序；
- exact 模型/能力选择来自作者、SVS 或模块 Producer；Host 只绑定同 capability 与
  return Contract 的 Endpoint；
- 没有 `previewMode` 或 `productionMode` 语言分支；
- 两段 Seedance + 双人 Script + Subtitle 示例能使用同一作者程序得到真实和替代
  实现；
- 每个最终 Artifact 都能追溯到 Author Program Lock 和 Derivation Lock。

## 18. 最终结论

SVML 后续不应被描述为“一个拥有插件系统的固定视频编译器”，也不应走到“作者
只写完全无语义的节点，所有 Kernel 都由运行环境猜测”的另一个极端。

正确边界是：

```text
Author Frontend 把任意作者写法降低为规范 TypedModule
作者选择意图、组件、公开参数和自己关心的实现约束
模块导出的 Kernel 定义模块化编译配方、Prompt、领域协议和外部 Requirement
Host 注册调用器并补全剩余运行绑定
Provider/人工/缓存产生带 Receipt 的观察事实或替代产物
Core 负责完整 Graph、Target、Pin、Demand、身份、类型、不可变事实、调度、完整性
和推导证明
```

因此：

> SVML 的本体是一门可扩展的抽象作者意图语言；官方漂亮文本只是一个可替换
> Author Frontend。模块包导出的 Kernel 是作者可选择的模块化编译能力；外部
> Runtime 是这些能力所声明需求的开放满足环境。`.svml` 和 `.svs` 是官方语法，
> 不是 Core 特权；`.svc` 和 `.svk` 暂不作为 v2 基础文件类型。
