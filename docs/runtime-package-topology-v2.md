# SVML v2 Runtime、Package 与执行拓扑

> **Kernel 术语更新，2026-08-05。** 本文的 Runtime/Provider/Queue 分层仍有效，但早期
> `BuildIntent + Alternative/Pin` 表述应读作 `BuildRequest + Candidate binding`。Pin
> 不是 Kernel primitive：宿主把历史值附着为 Existing-Value Candidate，再由
> BuildRequest 明确选择。Kernel 的当前权威定义见
> [`logical-output-realization-fragment-draft.md`](./logical-output-realization-fragment-draft.md)。
>
> **v2 目标规范。** 本文取代
> [`runtime-host-architecture-draft.md`](./runtime-host-architecture-draft.md) 中关于
> `.svk`、`ExecutionBundle`、`EffectRequest`、队列归属和 Runtime 装配的旧设计。
> 当前实现已经完成 LogicalOutput/Candidate/Operation/Target Core、Node Driver、进程内
> Provider Registry、静态 Fragment Elaborator、Realization Overlay，以及
> capability/returns 分离和 exact Provider 路由；本文关于生产 Queue、Credential、真实
> Provider 和 Hosted Runtime 的内容仍是后续施工边界。
>
> Runtime 的所有实现必须建立在
> [`logical-output-realization-fragment-draft.md`](./logical-output-realization-fragment-draft.md)
> 定义的作者 Graph、Realization Closure、BuildRequest 与 Demand Closure 之上。以下
> 正文尚未改写的旧 Pin/Alternative 术语只作为架构演进记录理解。

## 1. 决策摘要

SVML 使用以下五条不可混淆的规则：

1. **完整作者图不预设唯一终点。** Film、TrackSet、ImageSet、SemanticMap、
   HyperFrames 和任意公开输出端口都可以成为一次 Build 的 Target；Pin 是一等作者
   Build Intent，Core 据此反向计算 Demand。
2. **作者源码决定创作方法。** Seedance Mini、WhisperX、Gemini Cue Planner 和
   HyperFrames 等选择，必须由 `.svml` 导入的作者模块或其锁定的传递依赖决定。
3. **Runtime Profile 决定整条 Build 在哪里运行。** Core、权威 Build Scheduler、
   BuildState 和 Artifact Store 可以位于开发者本机，也可以位于 Hypit。
4. **Provider Binding 决定一个已经明确的 Need 在哪里执行。** Endpoint 必须精确匹配
   Need capability 与返回合同；Kling、黑场、估时或历史结果属于 BuildIntent 显式
   选择的 Alternative/Pin，不属于 Provider 路由。
5. **每个 Build 只有一个权威 Build Scheduler。** 远端 Provider 可以拥有自己的
   任务队列；该队列只负责其内部任务，不是第二个 SVML Build Scheduler。

因此：

```text
.svml import        决定做什么
BuildIntent          决定这次 Target 什么、选择哪个 Alternative 或 Pin
Runtime Profile     决定整条 Build 在哪里运行
Provider Binding    决定某项明确能力在哪里执行
```

同一份源码在本地、开发者托管构建、Brands 和 Customers 中使用同一作者模块闭包。
环境差异不得进入 `semanticDigest`。

## 2. 不采用“一切皆自由插件”

所有实现都可以作为普通软件包交付，但不是所有包都能被 `.svml` 导入，也不是所有
包都能定义新的系统规则。

```text
一切皆包              是交付与复用原则
一切皆可被源码 import  不是语言原则
一切皆可替换          不是可信性原则
一切都能自定义协议      不是互操作原则
```

严格意义上的 Core 垄断：

- 类型化完整 Graph、Node/Port identity 与依赖边；
- 任意 TargetSet、Realization/Pin Binding 与 BuildIntent identity；
- 从 Target 反向求 Demand Closure，遇到 Pin 截断上游；
- 多 Target 依赖并集、公共上游去重与 ready Command 计算；
- 从 Graph + BuildIntent 派生有限 BuildPlan；
- Record、Need、Command、Event、Receipt、Derivation 和 BuildState 的身份；
- 有限 BuildPlan 的验证与状态推进；
- 类型、内容摘要、模块闭包和实现摘要验证；
- 输入、输出、Need、Event 与 Derivation 的因果绑定；
- `exact` / `substitute` 的单调传播；
- 可恢复 Command 的重新生成；
- Provider Event 被接受之前的完整验证。

`@svml/contracts` 则提供视频领域的公共窄腰，例如 Narrative、SpeechBasis、
ProgramSpace、Evidence、CompleteSemanticMap、Track 和 Composition。组件不能用
私有 TypeScript 类型代替这些跨包合同。

Core 不解析源码、不调用 Provider、不保存队列、不读取凭据、不处理媒体字节，也不
渲染 HyperFrames。它是一个纯的、内容寻址的图需求与编译状态机：

```ts
reduce(previousState, acceptedEvent) -> {
  state,
  commands
}
```

## 3. 三个正交维度

### 3.1 Author Module：作品选择了什么

作者模块可以增加 Surface、类型化意图和 Producer。它负责把明确的创作选择降低成
明确的 Need。

例如：

```xml
<import from="@svml/script@1"/>
<import from="@svml/film@1"/>
<import as="seedance" from="@svml/seedance-mini@1"/>
<import from="@svml/hyperframes@1"/>
```

其中 `@svml/film` 也可以锁定地传递依赖 `@svml/hyperframes`，使最后一行不必显式
出现。两种 Surface 选择都必须产生同一个事实：正式成片目标是 HyperFrames。

`@svml/seedance-mini` 可以产生一个公开的中立 SpeechBasis 输出，并在该输出被 Demand
且未被 Pin 时提出：

```text
Need {
  capability = seedance.mini.speech-video@1
  returns    = svml.speech-basis@1
}
```

它不能产生含义不足的 `Need<speaker-video>` 再让 Runtime 猜方法。该作者模块可同时
声明输入更少的黑场、冻结帧或 Kling Alternative；BuildIntent 必须按 ProducerRef 明确
选择其中之一。若作者直接 Pin SpeechBasis，原 Producer 被 Demand 裁掉，Seedance
Need 根本不会产生。

### 3.2 Runtime Profile：Build 在哪里运行

Runtime Profile 是部署配置，不是作者源码。它选择：

- Runtime 实现；
- 权威 Build Scheduler；
- BuildState/Operation Journal；
- Artifact Store 与 Cache；
- Credential Store；
- Provider Endpoint 包和精确 Binding；
- 并发、重试、配额、租户和部署策略。

Profile 可以是本地配置文件，也可以作为可复用的普通包发布，但不能通过作者源码的
`<import>` 激活。Profile 身份不进入作品的 `semanticDigest`。

必须区分“实现包、Profile 和运行实例”：

```text
@svml/runtime-node       Runtime 实现代码包
@svml/local             可复用的默认 Distribution/Profile 包
一次 svml build 进程     使用该 Profile 创建的 Runtime 实例
```

它们类似类、装配方案和对象，不应为每次部署复制一套代码包。Runtime Profile 不进入
`sourceSemanticDigest` 或 `buildIntentDigest`，但锁定的 Runtime Closure、Endpoint、
实现摘要和实际结果必须进入 Run provenance、Receipt 和 Derivation；换了执行环境
不是不可审计的隐形变化。

### 3.3 Provider Binding：明确能力在哪里执行

Provider Endpoint 注册它能够精确满足的 CapabilityRef、返回的 TypeRef，并可以
进一步检查 Need constraints。若存在多个匹配 Endpoint，Runtime 必须显式绑定，不能
靠优先级、包名或注册顺序猜测。

```text
capability seedance.mini.speech-video@1 -> SpeechBasis
          ├── kie.seedance-mini
          └── volcengine.seedance-mini

capability hyperframes.render@1 -> VideoArtifact
          ├── hyperframes.local
          └── hypit.hyperframes
```

两个 Endpoint 返回相同外层媒体类型，不代表它们可以互相 claim capability。Registry
不会按返回 TypeRef 寻找替代者；同一 capability 存在多个 Endpoint 时 Profile 必须 bind。

同样必须区分“Provider 包”和“Endpoint 实例”：

```text
@svml/provider-kie      KIE 协议、鉴权、submit/poll/download 的实现代码
kie.personal            使用开发者 KIE Key 创建的 Endpoint 实例
kie.hypit-production    使用 Hypit 生产账户创建的 Endpoint 实例
```

开发者、Brands 和 Customers 可以复用同一个 Provider 实现包。账户、凭据、配额、
租户和队列 namespace 属于实例配置，不需要复制成新的包。

## 4. 包的种类与 import 权限

| Package role | `.svml` 可 import | 被谁加载 | 权限与职责 |
|---|---:|---|---|
| Author Module | 是 | Frontend/Module Resolver | Surface、Intent、Producer 声明；默认零网络和零凭据权限 |
| Contracts | 否 | 普通代码依赖 | 公共类型、Schema 和不变量 |
| Core/Protocol | 否 | Launcher/Runtime | 系统状态与验证法律 |
| Runtime Service | 否 | Runtime Profile | Scheduler、Journal、Store、Cache、Credentials |
| Provider Endpoint | 否 | Runtime Profile | 本地执行或外部 API；只能满足声明的 Need |
| Runtime Distribution/Client | 否 | CLI/Embedder | 组合本地 Host，或把完整 Build 提交给托管 Runtime |

源码 import 是“允许该模块参与解释作品”，不等于“允许该包读取密钥、访问网络、
启动进程或管理队列”。因此有权限的 Runtime/Provider 包不能由普通源码 import 自动
执行。

一个物理 npm 包即使包含多个 exports，源码 import 也只能激活其 Author facet。
官方包应按信任边界拆开：无权限作者模块与有权限 Provider Endpoint 不放在同一个
自动执行边界中。

## 5. 不引入 `.svk` 文件后缀

v2 不需要 `.svk`。

- `.svml` 是作者意图源码格式；
- `.svs` 可以作为人类直接编写和复用的样式/配方数据格式；
- Surface、Producer、Provider、Scheduler 和 Runtime 是代码能力，不是另一种作者
  数据序列化格式。

代码继续使用正常 package exports，角色由静态 Manifest 声明。现有
`ModuleManifest` 已声明 types、surfaces 和 producers；v2 后续为 Runtime 包定义独立
的静态 Runtime Manifest，而不是用文件后缀推断权限。

示意：

```json
{
  "format": "svml.runtime-module@0",
  "name": "@svml/provider-kie",
  "facets": {
    "providerEndpoints": [
      {
        "id": "kie.seedance-mini",
        "fulfills": "seedance.mini.speech-video@1"
      }
    ]
  },
  "permissions": ["network", "credentials:kie"]
}
```

Manifest 必须能在不执行包代码的情况下读取。真正的实现只有在 Host allowlist、摘要
和权限检查完成后才能加载。

## 6. 两种基本运行拓扑

所有看似复杂的部署情况都可以归入两种拓扑。

### 6.1 Local Runtime：Core 在开发者机器

```text
Developer machine
  Launcher
  Runtime Node
  Core
  authoritative Local Build Scheduler
  BuildState / local Artifact Store
  Provider Endpoints
    ├── HyperFrames local process
    ├── Hypit HyperFrames API
    ├── local WhisperX
    ├── KIE Seedance API
    └── Volcengine Seedance API
```

某个 Provider 可以远程执行，但 Build 的权威状态机和总调度仍在本地。

全本地 HyperFrames 的 Profile 示例：

```yaml
runtime: "@svml/runtime-node"
scheduler: "@svml/scheduler-local"
state: "@svml/state-file"
artifacts: "@svml/artifacts-local"
credentials: "@svml/credentials-keychain"

bindings:
  hyperframes.render@1: "hyperframes.local"
  seedance.mini.speech-video@1: "kie.seedance-mini"
  whisperx.alignment-evidence@1: "whisperx.local"
```

本地 Core、Hypit 渲染的 Profile 只改变一个 Binding：

```yaml
bindings:
  hyperframes.render@1: "hypit.hyperframes"
  seedance.mini.speech-video@1: "kie.seedance-mini"
  whisperx.alignment-evidence@1: "whisperx.local"
```

此时 Hypit 的远端渲染队列只是 `hypit.hyperframes` Endpoint 的实现细节，本地
Scheduler 仍负责整个 Build 图。

### 6.2 Hosted Runtime：整个 Build 在服务器

```text
CLI / Brands / Customers
          │ submit source lock and artifacts
          ▼
Hypit Hosted Runtime
  Core
  authoritative Server Build Scheduler
  durable BuildState / Artifact Store
  Provider Endpoints
    ├── HyperFrames Lambda
    ├── Seedance API
    ├── WhisperX workers
    └── Gemini API
```

客户端只需要 Remote Runtime Client；它不下载服务器的 Scheduler、数据库、Lambda
或 Provider 实现包。

```bash
svml build main.svml --runtime hypit
```

开发者托管构建、Brands 和 Customers 使用同一套服务器 Runtime 代码。区别只属于
Profile/tenant policy：

- credential 与账户；
- queue namespace 与优先级；
- 并发、quota 与 billing；
- Artifact namespace 与 retention；
- 产品权限和审计策略。

它们不应成为三套 HyperFrames 或 Seedance 包。

## 7. 四种场景的实际装配

| 场景 | 作者模块闭包 | Core/权威 Scheduler | HyperFrames Endpoint | 客户端需要加载 |
|---|---|---|---|---|
| 开发者本地渲染 | 相同 | 本地 | `hyperframes.local` | Local Runtime Distribution |
| 开发者本地 Build、Hypit 渲染 | 相同 | 本地 | `hypit.hyperframes` | Local Runtime + Hypit Endpoint Client |
| 开发者整个 Build 托管 | 相同 | Hypit | 服务器内部 HyperFrames Lambda | Hypit Remote Runtime Client |
| Brands/Customers | 相同 | Hypit | 服务器内部 HyperFrames Lambda | 产品自己的薄客户端 |

Seedance 使用相同结构，只是没有本地模型或 Lambda：

```text
local Build + KIE Endpoint
local Build + Hypit Seedance Endpoint
hosted Build + server-side Seedance Endpoint
```

在三种情况下，作者都仍然选择 Seedance Mini。变化的是 Endpoint、账户和执行位置，
不是创作方法。

## 8. 两种 Queue，只有一个权威 Scheduler

“队列”必须使用两个不同术语。

### 8.1 Build Scheduler

Build Scheduler 管理完整 Core Command 图：

```text
estimate
  -> Seedance
  -> SpeechBasis
  -> WhisperX
  -> SemanticMap
  -> Caption/B-roll/Text Track
  -> Composition
  -> HyperFrames
```

它负责 ready commands、并发 lane、公平性、重试触发、取消和恢复协调。它不判断
下一步语义；下一步始终由 Core 从可信 BuildState 重新生成。

一个 Build 只有一个权威 Build Scheduler：

- Local Runtime 使用本地 Scheduler；
- Hosted Runtime 使用服务器 Scheduler。

### 8.2 Provider Job Queue

KIE、火山、HyperFrames Lambda 或 Hypit Provider 可以内部使用远端任务队列。它只
负责一个 Endpoint 的 submit/poll/webhook/cancel/resume。

```text
Local Build Scheduler
  -> fulfill HyperFrames Need command
  -> Hypit Provider Endpoint
  -> Hypit Provider Job Queue
  -> HyperFrames Lambda
  -> NeedFulfilled Event
```

Provider Job Queue 不推进 BuildPlan，也不能接受其他步骤的 Event。Provider 包可以
声明并发/限流建议，最终本地 lane 仍由权威 Build Scheduler 管理。

## 9. 建议包边界

名称可以在实现前调整，角色不能混合。

### 9.1 作者与编译语义

```text
@svml/text
@svml/script
@svml/film
@svml/seedance-mini
@svml/whisperx
@svml/speech-align
@svml/caption
@svml/caption-gemini
@svml/text-track
@svml/svs
@svml/hyperframes
```

可以再提供一个 Standard Prelude：

```text
@svml/talking-film
```

它只锁定传递模块闭包、Graph lowering 和官方组件词汇，不预先固定本次 Targets/Pins，
也不获得 Runtime 权限。

### 9.2 本地 Runtime Services

```text
@svml/runtime-node
@svml/scheduler-local
@svml/state-file
@svml/artifacts-local
@svml/cache-local
@svml/credentials-keychain
```

### 9.3 Endpoint 包

```text
@svml/hyperframes-local
@svml/provider-whisperx-local
@svml/provider-kie
@svml/provider-volcengine
@svml/provider-gemini

@hypit/provider-hyperframes
@hypit/provider-seedance
@hypit/provider-whisperx
```

`@hypit/provider-*` 是“本地 Core 调用某一项 Hypit 能力”的客户端适配器，不是
“把整个 Build 交给 Hypit”。

### 9.4 Hosted Runtime 包

```text
@hypit/runtime-server
@hypit/scheduler-server
@hypit/state-store
@hypit/artifact-store
@hypit/hyperframes-lambda
@hypit/provider-seedance
@hypit/runtime-client
```

Brands 与 Customers 复用这些包，只用不同 deployment profile。

### 9.5 逻辑包不等于用户要逐个安装

上面的细分包是代码边界、测试边界和权限边界，不是要求普通开发者手工拼十几个
依赖。正式发行时只暴露少数 Distribution：

```text
@svml/local       本地 Runtime 的默认组合
@hypit/client     提交完整 Hosted Build 的薄客户端
@hypit/server     我们自己部署的服务器组合；不交给普通客户端安装
```

例如 `@svml/local` 可以传递安装 runtime-node、scheduler-local、state-file、
artifacts-local 和 credentials-keychain，并提供一个简单的 Provider 配置入口。内部仍
保持独立接口和权限，用户体验则是一条安装命令、一个 Runtime Profile。

同理，源码中的 Standard Prelude 可以把常用作者模块组合成一个 import；它不会把
作者模块和 Runtime Distribution 混为同一包。

## 10. v2 实现模型

当前实现已经有：

- `@svml/protocol`：统一 canonical/digest、Graph、BuildState、Need、Command、Event、
  Receipt、Derivation；
- `@svml/core`：Logical Output/Candidate 选择、反向 Demand、两层声明式 affinity、纯状态
  推进和完整性验证；
- `@svml/driver-node`：Producer/Provider Registry 与进程内执行；
- `@svml/contracts`、Text、Script、SpeechTake、WhisperX、Speech Align、Caption 的第一批
  合同与原子 Producer；
- `@svml/elaborator`、`@svml/realization`：静态卫生 Fragment 与显式 Candidate Overlay；
- `@svml/video-fragments`：已跑通 SpeechTake/WhisperX/SemanticMap/Caption 的官方静态组合；
- Provider 只精确匹配 capability + returns，多实现时要求显式 `bind()`；
- 恢复时丢弃序列化 Command，由 Core 重新生成。

当前实现尚未完成 Track/Composition/HyperFrames、动态外部包加载、安全 Worker、Artifact
Store 验证和生产 Runtime。下一步先把已验证的语音纵向链路接入公共 Track 与
HyperFrames 视频输出，再完成开放第三方执行；
不能用 Runtime Router 或数据库补偿 Core 语义。

Kernel Gate 完成后，Runtime 再依次建立以下接口。

### 10.1 静态 Runtime Module Manifest

定义 Runtime Service 与 Provider Endpoint 的静态能力、版本、实现摘要和权限。读取
Manifest 不执行包代码。

### 10.2 Runtime Profile Resolver

把一个 Profile 解析成锁定的 Runtime Closure，并在任何付费调用前验证：

- 所有 demanded Needs 都有精确 capability + returns Binding；
- 不存在模糊的多个 Provider；
- 运行时服务只存在一个权威 Scheduler；
- 权限、凭据槽和实现摘要完整；
- hosted client 与 local endpoint 没有被混装。

### 10.3 Operation 与 Scheduler

Core Command 身份继续由 Core 决定。Runtime 在执行外部 Command 前创建可恢复的
Operation：

```text
commandId       Core 要执行的事实
operationId     Runtime 的一次实际尝试
submissionKey   Provider 网络重试是否属于同一次提交
```

Scheduler 只接收 Core 已经产生的 Command，不搜索工作流、不修改 Need，也不把旧
Command 当成可信恢复输入。

### 10.4 Async Provider Endpoint

在当前一次性 `ProviderHandler` 之上增加可持久化生命周期：

```ts
interface ProviderEndpoint {
  start(operation, context): Promise<Pending | Completed>;
  resume(operation, checkpoint, context): Promise<Pending | Completed>;
  cancel?(operation, context): Promise<void>;
}
```

Endpoint 只能得到当前 Need 所需的最小 Credential/Artifact 权限，完成后产生
`NeedFulfilledEvent`。Core 仍负责接受或拒绝该 Event。

### 10.5 两个参考发行版

先证明同一 Build 可以在两种 Profile 中得到语义等价结果：

1. Local：进程内 Scheduler、本地 BuildState、本地 Artifact Store、fake/local
   Providers；
2. Hosted fixture：持久 Scheduler、独立 Endpoint worker、同一 Core 和 Contracts。

完成这一步之后，才接 KIE/火山、HyperFrames Lambda 和生产队列。

## 11. 分阶段施工顺序

### Kernel prerequisite：K1-K3 已完成

施工与验收以 Kernel 主规范为准：

1. 单结果 CompiledGraph、PortAddress、TargetSet、Realization/Pin Binding 和 BuildIntent；
2. Pin 截断、Alternative 输入子集、多 Target 并集和 Core Demand Planner；
3. Need capability/returns 分离；
4. 图片依赖、聚合终点、Track Pin、亲和性与真实 WhisperX 规范测试全部通过；
5. K4 的未知第三方动态加载与沙箱在真实官方视频链路之后完成。

### Phase R1：锁定本地 Runtime 协议，不接生产

1. 新增 Runtime Module Manifest 与 Profile Schema；
2. 把现有 `ProviderRegistry.bind()` 变成从锁定 Profile 构造；
3. 提供 `@svml/runtime-local` 参考发行包；
4. 实现单一进程内 Scheduler、JSON Operation Journal 和本地 CAS；
5. Scheduler 只调度 Core ready Commands，不自行搜索或裁剪图；
6. 用 fake Seedance、fake WhisperX、fake HyperFrames 证明 Pin 后零付费调用和完整恢复；
7. 增加“同一个 Build 不允许两个权威 Scheduler”的攻击性测试。

### Phase R2：真正本地纵向链路

1. HyperFrames 本地 Endpoint；
2. WhisperX 本地 Endpoint；
3. 本地 Artifact Store 与 Credential Store；
4. Seedance KIE 或火山中的一个真实 Endpoint；
5. 完成 Script → Seedance → Basis → WhisperX → Map → Caption/Tracks →
   HyperFrames 的单机 Build。

### Phase R3：Hypit 单能力远程 Endpoint

1. `@hypit/provider-hyperframes`；
2. `@hypit/provider-seedance`；
3. 本地 Scheduler 对远端 pending operation 的恢复；
4. 验证本地 BuildState 不依赖 Hypit 数据库或队列类型。

### Phase R4：Hosted Runtime

1. 服务器 Build Scheduler 与 Journal；
2. `@hypit/runtime-client`；
3. HyperFrames Lambda 与 Seedance workers；
4. tenant/namespace/quota policy；
5. Developer、Brands、Customers 使用同一 Runtime 包和不同 Profile。

## 12. 第一批明确不做

- 不为 Brands、Customers、Developer Remote 各写一套 Provider 包；
- 不在 `.svml` 中配置 queue name、API Key、数据库、Lambda ARN 或租户；
- 不允许 Runtime 把 generic speaker 自动路由为 Seedance/Kling；Alternative 必须由
  作者模块声明并由本次 BuildIntent 选择；
- 不把 Provider 内部远端队列注册成第二个 Build Scheduler；
- 不让源码 import 自动执行带网络或凭据权限的包；
- 不引入 `.svk` 文件格式；
- 不在安全边界完成前运行任意第三方 Handler；
- 不把 Remotion 重新带回正式链路；HyperFrames 是唯一正式视觉与成片目标。

## 13. 验收标准

此边界只有在以下条件同时满足时才算实现：

1. 同一 `.svml` 和作者模块闭包可在 Local 与 Hosted Runtime 运行；
2. 切换 Runtime Profile 不改变 sourceSemanticDigest 或 buildIntentDigest；
3. 任意 Target/Pin 组合在 Local 与 Hosted Runtime 得到相同 DemandPlan；
4. Seedance/Kling、WhisperX/generic STT 不能按相同返回 TypeRef 互相路由；兼容实现
   必须是图中命名 Alternative，历史或预览值必须是 Pin；
5. 每个 Build 恰好一个权威 Scheduler；
6. 本地 Build 使用 Hypit HyperFrames Endpoint 时，本地仍能独立恢复 BuildState；
7. Remote Runtime Client 不需要安装服务器 Scheduler、数据库或 Lambda 包；
8. Brands 与 Customers 只因 Profile/tenant policy 不同，不产生不同编译组件；
9. Runtime 恢复不会信任序列化 outstanding Command，也不会重复付费 submit；
10. 一个事后安装的组件或 Provider 不需要重发 Core/CLI/Hosted 主服务；
11. 当作者 Target 正式成片时，唯一正式视觉目标是锁定的 HyperFrames Program/Artifact；
12. Target 图片、Track、SemanticMap 等中间输出时，不强制 Demand Film 或 HyperFrames。
