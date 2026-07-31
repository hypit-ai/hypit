# SVML Source Architecture Draft

> **Draft; not frozen.**
>
> 本文记录截至 2026-07-31 的完整 SVML 源码架构。可执行原型仍实现
> [Script Surface v1](./script-surface-v1.md)；独立 Segment 端点属于
> [Script Surface v2 Draft](./script-surface-v2-draft.md)。本文中的文档外壳、
> Component ABI、Locator ABI 和 flat Track IR 仍需原型验证后才能冻结。

SVML 是信息流视频的语义源语言，不是画布文件，也不是像素渲染格式。它的
北极星是：以口播语义建立稳定地址，把这些地址迟绑定到本次成片唯一的物理
ProgramBasis，再把所有位于同一 `x/y/z/t` 空间中的视听贡献确定性编译成
HyperFrames HTML。

```text
.svml + transitive .svk/.svs/.svc imports + lock + evidence
        │
        ▼
parse / bind / typecheck / reachability
        │
        ▼
Plan IR ─────────────────────────────────────────> Canvas view
        │
        ├─ Basis Component ──> TemporalBasisProduction
        └─ Locator Library ──> EstimatedMap / ExactSemanticMap
                               │
                               ▼
                    TemporalBinding / Located IR ─> Timeline view
                               │
                               ▼
                    Track Components → flat Track[]
                               │
                               ▼
                    Composition Component
                               │
                               ▼
                    HyperFrames Document → HTML
```

Canvas/DAG、Estimate Timeline 和 Located Timeline 都是同一份 IR 的人类视图，
不是第二份作者真相。HyperFrames DOM 内部当然是树，但公共 SVML 不包含
VisualTree、AudioTree、VisualSurface、Subcomposition 或嵌套 Track。MP4 等
成片是运行、录制或封装该 HTML 的结果，不是另一个语义编译目标。

## 1. 四种文件

四种后缀按职责和复用边界划分，不按 free/paid、旧画布五层或重跑范围划分：

| 文件 | 只负责 | Web 类比 |
|---|---|---|
| `.svk` | 定义可导入的 Component 词汇、端口、参数和 lowering | Web Component |
| `.svs` | 给已有 Component 提供类型化参数规则与预设 | typed CSS |
| `.svc` | 声明可复用的具名内容值和内容生成子图 | data module / `<defs>` |
| `.svml` | 当前影片的 Script、片内调用、Tracks 和 Composition | HTML document / main |

判断一项内容放在哪里：

```text
它在定义一个作者可直接调用的新词吗？
├─ 是：.svk
└─ 否
   ├─ 只属于本片：.svml
   └─ 可跨影片复用
      ├─ 参数规则：.svs
      └─ 具名内容/内容子图：.svc
```

短 Prompt 或一次性参数可以直接留在 `.svml`；后缀不是强迫作者把一条可读
声明拆成四个文件。

### 1.1 统一 Import

所有文件使用同一种 import 表面：

```svml
<import as="speaker" from="./kernels/seedance-speaker.svk"/>
<import as="house"   from="./house.svs"/>
<import as="brand"   from="./brand.svc"/>
```

Import 顺序不携带语义。编译器按引用建立完整、无环的传递依赖 DAG，再统一
bind。歧义必须要求显式 alias，不能让后导入覆盖先导入。路径、Git 或 registry
只改变解析方式，不改变语言语义；lock 必须保存 canonical URI、精确版本、内容
哈希和依赖边。系统不存在按裸名字合并 family、挑选“最权威 ranking”或自动
拼接多个包的步骤。

### 1.2 字面量与引用

```svml
prompt="A #1 product"              <!-- literal -->
prompt={brand.poster-prompt}       <!-- whole-value reference -->
image={poster.image}               <!-- output port -->
during={script.selection.hook}     <!-- SelectionSet -->
at={script.moment.pop}             <!-- MomentSet -->
```

引号内不插值，也不扫描 `#`、`@` 或花括号。引用占据整个属性值。长文本进入
Component 明确声明的文本槽，仍按字面内容处理。外部引用只使用稳定名字，不
提供 `node[3]`、`segment:4` 或基于源码位置的寻址。

## 2. 值、端口、拓扑与身份

`Text`、`Image`、`Audio`、`Video` 是值类型，不因来源不同而改变身份：

```text
local.png      ─┐
GPT Image(...) ─┴─> Image

local.mp4      ─┐
Seedance(...)  ─┴─> Video
```

所谓 input 只是值位于消费者端口的位置，不是一种特殊节点或源语言层。一个
输出被多个消费者引用就是 fan-out，不复制值，也不需要发明 B-roll Object。

Import 只带入符号，声明只定义值或调用；两者都不产生副作用。编译器从当前
文档唯一 Composition root 反向求执行可达闭包。未被引用的 Component 或 SVC
声明仍可检查和浏览，但不触发 provider、定位或渲染。

### 2.1 稳定 instance identity

```text
instanceIdentity
= canonical module identity
+ declaration id
```

行号、源码 offset、同类标签序号、import alias/顺序、Canvas 坐标和 formatter
结果不得参与 identity。模块内容哈希也不进入 identity，否则改一个参数就会
把旧实例伪装成新实例。

### 2.2 execution digest、Artifact、Pin

```text
executionDigest
= locked Component implementation + public ABI version
+ effective parameters + deterministic lowering result
+ transitive input artifact hashes
```

identity 用于 Canvas 关联和诊断；digest 用于缓存与 take 兼容性。Pin 是源码外
的显式作者选择，可以让旧 Artifact 继续供给兼容端口。下游 digest 使用实际
Artifact hash，所以 Pin 不会伪装成按新参数重新执行。

离线编译使用独立 artifact/receipt binding，把 instance identity、request
digest、输出端口和内容哈希精确绑定。缺少绑定时编译器必须失败，不能静默调用
付费 provider。Pin、take、cache、queue 和任务状态都不进入 `.svml`。

## 3. `.svk` 是 Component，不是 Node

`.svk` 定义一个可 import、调用和验证的 **SVML Component**。源码中的
Component instance 可以被 Canvas 投影成节点，但 Node 只是一种人类视图；
节点坐标、折叠、接线手势和颜色不是源语言真相。

一个 Component manifest 至少声明：

- 导出调用名、参数、子元素内容模型和静态诊断；
- 输入/输出端口类型、cardinality 和动态 item schema；
- temporal port 接受 SelectionSet、MomentSet 还是 ProgramSpan，以及
  `one` / `each` / `set` cardinality；
- `capability-v1` request lowering 或 `pure-lowering-v1` 实现；
- 实现摘要、ABI 版本、权限和资源限制。

所有 Component 使用同一种标签和 manifest 机制。生成、素材变换、Basis、
Track 和 Composition 的差异由端口推导，不需要：

```svml
<call kind="producer" .../>
<node stage="render" .../>
```

例如：

```text
gpt-image         Text + Image[] → Image
crossfade-speech  SegmentMedia[] → TemporalBasisProduction
ranking-tier-list items + time   → Track
film              basis + Track[] → HyperFramesDocument
```

Producer、consumer、track 和 root 只是相对数据流角色，不是另一套业务 `kind`。
只有 `film` 这样的 Composition Component 可以消费 `Track[]`。

### 3.1 平级而非 Family / Mode

v1 不定义 `family`、继承、`implements` 或语言级 mode。合同不同的能力成为
平级 Component：

```svml
<ranking-tier-list .../>
<ranking-card-stack .../>
<ranking-bracket .../>

<seedance-speaker .../>
<seedance-podcast .../>
<seedance-motion-ref .../>
```

多份 SVK 可以共享同一 TypeScript/Python/provider adapter；代码复用不需要变成
SVML 继承。普通枚举参数只适合不改变端口、item schema 和不变量的选择。一个
kit 可以导出一组毫无公共父合同的 Component、SVS 与 SVC，不需要提取最大
公约数或争夺某个 family 的“老大”。

判断是否新建 Component：

```text
公开端口、内容模型、时间类型或能力不变量改变了吗？
├─ 是：新 Component
└─ 否
   ├─ 参数值/外观 recipe：SVS
   └─ 实现重构：原 Component
```

### 3.2 生成指令三层

```text
provider prompt
= Component invariant contract
+ typed direction modules
+ instance content
```

- 身份保持、reference 含义等不变量属于 `.svk`；
- framing、camera、pace、performance 等正交轴由 `.svk` 定义，由 `.svs` 选择；
- 当前影片的故事、动作和 Script 投影属于 `.svml`，可复用长内容属于 `.svc`。

SVS 只写 `performance: calm-authority`，不保存该值对应的隐藏长 Prompt；
Component lowering 负责把枚举稳定编译成 provider 指令。

### 3.3 Compiler、Library、Runtime、Canvas

```text
Compiler owns laws
Library  owns vocabulary and replaceable algorithms
Runtime  owns effects
Canvas   owns views
```

Compiler 只拥有所有合法 SVML 都必须服从的机械规则：parse/import/bind/typecheck、
Script → NarrativeIR/SemanticIndex、ProgramBasis/SemanticMap 验证、Selection 与
Moment 解析、Program 时间/空间量化、reachability、identity/digest/lock、SVK
ABI 隔离，以及 HyperFrames Document 校验和序列化。

Library 提供可替换词汇与算法：SVK Component、Locator、Estimate、SVS、SVC。
WhisperX、Narrative Planner 和 semantic-locator 不因为需要审计就自动变成作者
必须接线的 SVK；它们分别是 Runtime capability 或 Locator workflow/Library。

Runtime Host 拥有副作用：provider adapter、凭证、队列、重试、存储/CAS、
receipt、媒体探测和浏览器录制。Canvas 只把 Plan/Located IR 投影成人类易读
界面。这一边界允许 Hosted、自托管和第三方 Runtime 共享同一 Compiler。

### 3.4 执行 ABI 与安全

```text
capability-v1     typed request → declared artifact/evidence
pure-lowering-v1  typed values → typed values / Track / HyperFramesDocument
```

Capability 代码只通过宿主注入的类型化 handle 访问 provider，不能接触其他
凭证。Pure lowering 默认没有网络、墙钟、未注入随机源、全局 DOM 或 provider
调用。可执行第三方实现必须锁定，并运行在宿主信任策略允许的隔离 realm/进程；
CSS 必须 scope。Shadow DOM 只是样式边界，不是 JavaScript 安全边界。

ABI profile 是安全与 effect 合同，不是 `generation/analysis/render/export` 业务
分类，也不把“重跑范围”写进源码。

## 4. `.svs`: typed parameter sheet

SVS 配置已经由 SVK 定义的参数，不定义端口、拓扑、内容身份或实例：

```svml
<sheet version="1" id="house">

  seedance-speaker.host {
    model: seedance-2-mini;
    resolution: 720p;
    framing: medium;
    performance: calm-authority;
  }

  media-track.face-top-left {
    x: 0.05;
    y: 0.05;
    width: 0.28;
    height: 0.28;
    mask: circle;
  }

  film.vertical {
    resolution: 1080x1920;
    frame-rate: 30;
  }

</sheet>
```

唯一参数链：

```text
Component defaults
→ instance classes（显式顺序）
→ instance attributes
```

不采用 CSS specificity、`!important`、父子选择器或 import 顺序覆盖。每个
effective parameter 都保留来源与覆盖链。SVS 不携带 cost、rebuild、cache 或
Pin 语义。

## 5. `.svc`: context-free content module

SVC 可以包含具名 Text/Image/Audio/Video、文件、人物、音色、长 Prompt，以及
不依赖当前 Script 的内容生成子图：

```svml
<content version="1" id="launch">
  <import from="./generation.svk"/>

  <image id="logo" src="./assets/logo.png"/>

  <text id="poster-prompt">
    A #1 launch poster for Hypit.
    Deep black background and electric violet typography.
  </text>

  <gpt-image id="poster" prompt={poster-prompt} reference={logo}/>

  <seedance-broll id="product" image={poster.image}>
    <story>Slow cinematic push-in. Preserve the logo and typography.</story>
  </seedance-broll>
</content>
```

SVC 不保存可执行 DOM/CSS/JS，也不隐式读取 importer 的 `script.*`。当前 Script
专属生成调用留在 `.svml`；能脱离当前影片成立的内容才适合提取到 `.svc`。

## 6. `.svml`: 当前影片

一份可执行文档只需要：

```text
imports
+ Script
+ current-film content calls
+ exactly one selected TemporalBasisProduction
+ N flat Tracks
+ exactly one Composition root
```

`<values>` 和 `<output>` 不是必需层。输出路径、编码、是否转 MP4 属于 CLI 和
Runtime。类型系统要求一个且仅一个未被其他 Component 消费的 Composition root。

### 6.1 Basis Producer 与 Locator 解耦

Basis Component 只建立一条物理 Program 时间轴及媒体映射：

```text
TemporalBasisProduction {
  basis: ProgramBasis
  alignmentSubjects: AlignmentSubject[]
  sourceMaps: SourceToProgramMap[]
  audio: ProgramAudioContribution[]
  facets: named Program-bound media outputs
  productionDigest: Digest
}

ProgramBasis {
  fps: Rational
  originFrame: 0
  durationFrames: integer
  basisDigest: Digest
}
```

`basisDigest` 标识规范化后的 Program outcome：clock、Program-bound media
Artifact hashes、AlignmentSubject identities、规范 SourceToProgramMaps 和量化
合同。它不包含实现名字，所以两份实现若真的产出同一媒体与映射可以得到同一
digest；只拥有相同 fps/duration 的两条不同视频绝不能同 digest。
`productionDigest` 另外覆盖 Component 实现、原始输入、参数、Evidence 与
provenance。ProgramPoint 是整数 frame boundary，ProgramRange 统一使用
`[startFrame, endFrameExclusive)`。

Basis Component 不拥有 SemanticMap。定位拆成两半：

```text
AcquireEvidence  // effectful; Runtime Host
ResolveMap       // pure; versioned Locator Library

SemanticIndex + TemporalBasisProduction + Evidence
  → EstimatedSemanticMap | ExactSemanticMap
```

SemanticMap 至少绑定：

```text
semanticIndexDigest
basisDigest
all anchor identities and ProgramPoints
evidenceDigests[]
locatorDigest
quantizationPolicy
mapDigest
```

Estimate 与 Exact 是不同类型。Estimate Timeline 可以用前者；最终 HTML Compile
默认只接受后者。编译器验证 basis/map affinity、完整性、顺序、质量与一次性
量化后，生成唯一 `TemporalBinding`。Track 只消费 Located Selection/Moment，
不能调用 WhisperX、补锚点或另建时钟。

Locator binding 是显式编译输入并固定在 lock/frozen build record 中，不是一个
隐式全局单例，也不是作者必须在 Canvas 接线的 Component。源码表面是否以后
允许给 Composition 命名一个 Locator profile 尚未冻结；无论表面如何，最终都
必须解析为唯一 `locatorDigest`，且不能由 Basis Component 私自选择。

Script Surface v2 若有 `N` 个 Segment、`M` 个 speech token，Map 必须覆盖
`2M + 2N` 个 identity。相邻 Segment `A`、`B` 允许 hard cut、overlap 或 gap，
同时保持：

```text
A.start ≤ B.start
A.end   ≤ B.end
```

5 秒 A、8 秒 B、0.5 秒交叉可以得到：

```text
A.start = 0.0s   B.start = 4.5s
A.end   = 5.0s   B.end   = 12.5s
```

源码只更换 Basis Component：

```svml
<crossfade-speech id="voice" overlap="500ms">
  <segment id="a" script={script.segment.a} source={clip-a}/>
  <segment id="b" script={script.segment.b} source={clip-b}/>
</crossfade-speech>

<film id="main" basis={voice.production}>
  <!-- Compiler applies the locked Locator to this document's Script. -->
</film>
```

`speech-assemble.svk` 可以顺序拼接，`crossfade-speech.svk` 可以重叠组装；二者
只需输出同一 `TemporalBasisProduction`。WhisperX 是 Runtime capability，
Narrative Planner 和 semantic locator 属于 Locator workflow/Library；它们的
版本、Evidence 和 digest 进入冻结记录，但不必成为源码节点。

Basis audio 也不垄断声音。B-roll 原声、Ranking 音效、BGM 和 SFX 可直接由
相应 Track 贡献。新架构不引入 `audioCueIntent`。

### 6.2 Flat Track 是终端视听贡献

所有 Track 共用一个 ProgramBasis 和一个 ProgramSpace。ProgramSpace 原点、
宽高与坐标单位由 Composition 确定；每个 Located contribution 最终都有绝对
`x/y/width/height/z/t`，没有父 Track、局部坐标系或后续空间变换链。

```text
LocatedTrack {
  id: StableIdentity
  visual: LocatedVisualContribution[]
  audio: LocatedAudioContribution[]
}

LocatedVisualContribution {
  range: ProgramRange
  box: AbsoluteProgramBox
  z: number
  sourceMapping: SourceTimeMapping
  presentation: fit | crop | mask | opacity | transform | animation
}

LocatedAudioContribution {
  range: ProgramRange
  sourceMapping: SourceTimeMapping
  gain: number
  bus?: string
  fades?: Fade[]
  duck?: DuckRule
}
```

`Track` 是 Plan 端未定位的贡献，`LocatedTrack` 是绑定后 IR，不是两份作者真相。
Visual-only、audio-only 和 audiovisual Track 都合法。

Track Component 可以内部读取全部 items，输出任意数量 flat visual/audio
contributions；它不能接收另一个 Track，也不能输出供继续嵌套的 VisualSurface。
只有 Composition Component 接收 `Track[]`：

```text
Material/Basis Component  typed inputs → Image/Video/Audio/TemporalBasisProduction
Track Component           material + time + params → Track
Composition Component     basis + TemporalBinding + Track[] → HyperFramesDocument
```

手机框若值得独立复用，应是 `phone-track.svk`：接收 Image/Video/Text、时间和
参数，直接输出 flat Track。内部 DOM 可以嵌套，但边界必须回到绝对 ProgramSpace；
不能把已经定位好的 Track 再套入一个局部坐标容器。

### 6.3 Item、Occurrence、Present

```text
Material           = 可 fan-out 的 Image / Video / Audio
Track Item         = Track Component 定义的一项作者输入
Located Occurrence = cardinality lowering 后的一次连续使用
Present            = 同一 occurrence 上的一种定时呈现
```

SelectionSet 永久保留全部有序、可非连通 occurrences。Temporal port 声明：

```text
one   exactly one occurrence; otherwise error
each  one stable Located Occurrence per occurrence
set   receive the complete ordered SelectionSet
```

多样式字幕典型使用 `set`；媒体 Item 常使用 `each`；只接受单窗口的 Component
使用 `one`。这是消费者合同，不改变 Script。

Item 与 Present 平等使用：

```text
TemporalPlacement {
  locator: SelectionSet | MomentSet | ProgramSpan | FullProgram
  projection: identity | WindowProjection
}
```

```svml
during={script.selection.promise}
at={script.moment.pop}
during="0s .. 3s"
during="end-2s .. end"
window="start-200ms .. end"
```

语义时间是北极星，但手工 ProgramSpan 是合法逃生口；标题前三秒和片尾箭头
无需伪造语义锚点。

对 `each` 媒体 Item 的每个 occurrence：

```text
Bₖ = ResolveOccurrence(item.locator, k)
Wₖ = Project(Bₖ, item.projection)
Mₖ = BuildSourceTimeMapping(item.source, Wₖ, item.playback)

Bₖᵢ = ResolveOccurrence(presentᵢ.locator, matchingPolicy)
Vₖᵢ = Project(Bₖᵢ, presentᵢ.projection)
Eₖᵢ = Wₖ ∩ Vₖᵢ
```

`Eₖᵢ` 是 Present 实际窗口。所有 Present 从同一个 `Mₖ(t)` 采样；求交、裁切、
换位和重叠不能让素材跳帧或重播。Present 超出父 Item 的部分裁掉，空交集产生
诊断。

Item 提供默认 presentation；Present 覆盖。没有 Present 活跃时使用 Item
fallback；有 Present 时输出每个活跃 Present 的 flat contribution。`z` 始终
是绝对 Program z：Track/Item 可给默认值，Present 可显式覆盖。重叠 Present
若得到同一 z，以 `presentation_z_ambiguous` 失败，不能靠源码顺序猜。

相邻 Present 若要无跳帧硬切，让前一个 close 和后一个 open 都右吸同一 Anchor，
得到 `[start,F)` 与 `[F,end)`。若要淡化，后一个可用
`window="start-200ms .. end"`；两份 contribution 共享 `M(t)`，通过绝对 z 与
opacity 动画合成。

### 6.4 空间、效果、转场与音频

Located spatial input 必须降为 ProgramSpace 中的 box、crop/fill、mask、opacity
和 transform。v1 不实现 VLM、bbox、人脸跟踪或视觉反向定位；未来可作为显式
扩展或 HyperFrames 后处理，但不能反向改变 SemanticMap。

效果归属于拥有最终信息的边界：

- Item/Present 效果由其 Track Component 实现；
- item 组合、Track 转场和对应音效由该 Track Component 实现；
- 全片滤镜、调色、画幅和 master mix 由 Composition Component 实现；
- 代码和 SVS 可复用 recipe，但公共 SVML 不建立 Visual Operator/effect tree。

`broll-track` 可读取全部 Located items，输出交叠的 flat contribution 来实现
crossfade、push、wipe、cover 或 page-turn。它不消费 `composite_below`
VisualSurface；正常 alpha/mask/transform 由 Composition 按绝对 z 合成。确实
需要“已合成全片像素”的效果属于 Film 级效果。

视觉转场不隐式改变声音。任何 Track 都可显式携带视频原声、gain/fade、bus、
duck 和转场 SFX；不必为了声音再复制一条 Track。独立 Audio Track 只在声音
确实独立编排时使用。公共 IR 不需要 Audio Tree。

Composition 对 visual contribution 按 `(z, stableContributionIdentity)` 排序。
Film 中 `<track>` 的书写顺序不决定层叠；作者意图重叠时必须使用不同绝对 z。
同一 Track 在一个 Composition 中最多引用一次，否则
`duplicate_track_in_composition`。

### 6.5 完整示例

[Flat Track Launch](../examples/flat-track-launch/flat-track-launch.svml) 覆盖：

- 交叉组装 Basis Component 与独立 Locator；
- 50 秒 A-roll 在同一 source mapping 上切换全屏、分屏和圆形画中画；
- B-roll 多 item/crossfade、视频原声和转场 SFX；
- Ranking、字幕、前三秒标题、片尾箭头和 BGM；
- 所有 visual contribution 使用同一 ProgramSpace 的绝对 z；
- Film 是唯一 `Track[]` consumer，负责全片效果和 master mix。

它是架构草案的可读 fixture，尚不声称能由当前 v1 原型执行。可执行回归仍是
`examples/regen-ranking/regen-ranking.svml`。

## 7. Script 依赖规则

```text
transitive dependencies contain script.*
├─ yes: current-film declaration in .svml
└─ no: may be extracted into .svc when reuse is valuable
```

| 内容 | 通常归属 |
|---|---|
| 根据当前台词生成的 A-roll | `.svml` |
| 固定采访片段、人物介绍、可复用产品演示 | `.svc` |
| 专门为本句生成的 B-roll | `.svml` |
| 人物图片、音色、Logo | `.svc` |
| model、framing、performance recipe | `.svs` |

Artifact 是否被缓存或 Pin 不影响源码归属。

## 8. 编译相、诊断与可复现性

### 8.1 最小编译流程

```text
Plan Compile
  source closure → typed Plan IR → Canvas view

Estimate Compile
  Plan + TemporalBasisProduction + EstimatedSemanticMap
  → estimated TemporalBinding → Timeline view

Located HTML Compile
  Plan + materialized values + selected TemporalBasisProduction
  + ExactSemanticMap → Located IR → flat Track[]
  → HyperFramesDocument → HTML
```

任何 Capability Request 前必须完成 parse、bind、typecheck、module resolution、
root reachability 和静态诊断。失败不能留下 provider 调用或部分运行状态。

每条诊断包含稳定 code、主源码范围、相关范围、具体事实和可执行修法。Import、
SVC 和 Component lowering 必须保留 source map，让错误回到作者编辑的文件。

### 8.2 CST、formatter 与迁移

Parser 除 AST 外保留注释、空白、属性顺序和源码范围。Formatter 必须满足：

```text
parse(format(source)).semanticIR == parse(source).semanticIR
```

迁移在 AST/CST 上执行。冻结 v1 不得被静默改写；共享 Segment cuts → 独立端点
必须显式升级到 Script Surface v2。

### 8.3 Digest 与冻结记录

```text
basisDigest       = canonical clock + program media + subjects + source maps
productionDigest  = Component implementation + inputs + params + mappings
semanticMapDigest = SemanticIndex + basis + anchors + Locator + Evidence + quantization
```

一次可复现冻结至少记录：

- 编译器、SVML、Script Surface、Plan/Located IR 和 HyperFrames target 版本；
- Composition identity 与所有传递 import 的 canonical URI/hash；
- Component ABI、实现、effective params 与 transitive Artifact hashes；
- basis/production/map digest、完整 anchor table、point quality、Evidence digests；
- ProgramSpace、Track contribution digests 和输出 HTML digest。

当前原型只验证 source closure 与 capability artifacts，不能因此宣称完整 temporal
reproducibility。迁移期间应分别报告：

```text
sourceClosureVerified
artifactsVerified
temporalEvidenceVerified
reproducible
```

`svml.lock` 固定依赖与实现；Pin/take/cache/operation 属于独立运行记录。

## 9. Source Architecture 法律

1. Script 是唯一语义地址源；视觉 evidence 不反向改写 Script。
2. 每个 Composition 选择且只选择一个内容寻址 ProgramBasis。
3. Basis Producer 与 Locator 分离；Estimate 不能冒充 Exact。
4. Script v2 Map 完整覆盖 `2M + 2N` identity，消费者不能补点。
5. SelectionSet 永久支持非连通；`one/each/set` 由消费者声明。
6. 所有视听贡献共享一个 ProgramBasis 和一个 ProgramSpace。
7. Track 是 flat terminal contribution；不嵌套、不聚合、不消费 Track。
8. 只有 Composition root 可以消费 `Track[]` 并输出 HyperFramesDocument。
9. 所有视觉位置是绝对 `x/y/z/t`；Track 顺序不决定 z。
10. Audio 可属于 Basis 或任意 Track；不强迫复制 Audio Track。
11. SVK 是 Component，不是 Node；Canvas/DAG/Timeline 都是 IR view。
12. Compiler 管法律，Library 管词汇与算法，Runtime 管副作用，Canvas 管视图。
13. 唯一正式成片编译目标是 HyperFrames HTML。

## 10. 原型验收顺序

1. 冻结 `ProgramBasis`、`TemporalBasisProduction`、Estimated/ExactSemanticMap
   和 `TemporalBinding` schema/digest；
2. 用 hard-cut speech 与 crossfade speech 两个平级 Basis Component 验证同一
   Locator ABI 和 Script v2 `2M + 2N`；
3. 实现 flat LocatedTrack/visual/audio contribution IR，删除公共
   VisualSurface/VisualTree/AudioTree/Track Aggregator；
4. 让 media、B-roll、ranking、caption、text、audio 都只输出 flat Track；
5. 让 Film 成为唯一 Track[] consumer，按绝对 z 和 ProgramRange 编译 HTML；
6. 用 Flat Track Launch 与真实 Regen Ranking 两份 fixture 验证 A-roll Present、
   B-roll 转场、Track 内音频、manual ProgramSpan 和全片效果；
7. 再接 fake Runtime Host；在同一协议通过前不启用生产 provider；
8. 最后实现 Canvas/Timeline 投影，保持它们不是作者真相。
