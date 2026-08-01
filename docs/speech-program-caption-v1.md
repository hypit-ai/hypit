# Speech Program and Caption v1

本文定义尚未公开发布的 SVML v1 标准口播路径。它不创建 v2，也不保留仓库早期
原型的兼容层。翻译、多语言、后剪辑、VLM、bbox 与视觉反向定位不属于 v1。

## 1. 一条不可破坏的真相链

```text
Script.speech                         唯一文字与实际读音真相
     +
SpeechTimingEvidence                  带噪声的声音位置测量
     │
     ▼  monotonic many-to-many alignment
CompleteSemanticMap                   完整 2M + 2N 定位表
     │
     ├───────────────> 其他语义时间消费者
     │
     ▼
CaptionPlan                           可选 cue 与 typed annotations
     │
     ▼
zero or one CaptionTrack              字幕呈现
     │
     ▼
Composition + other flat Tracks       HyperFrames HTML
```

这里没有 `correctedSpeech`、`CorrectedTranscript` 或
`CanonicalTranscriptPlan`。所谓“按口播稿纠错”不是生成另一份文本，而是：

> 把不可靠的声音测量对齐到可靠的 Script token 序列。

STT 输出的文字只帮助识别测量单位与 Script token 的对应关系，永远不是候选稿件
真相。LLM 不参与定位必经链，也不重复输出一份本来就正确的 Script。

## 2. 四个公共合同

### 2.1 Script / NarrativeIR

Script 产生唯一 `NarrativeIR` 与 `SemanticIndex`。若有 `M` 个 speech token、
`N` 个 Segment，SemanticIndex 恰好有 `2M + 2N` 个稳定 anchor identity：每个
token 与 Segment 都有独立 start/end。

Dual Text 同时给出显示词与实际读音：

```svml
<segment id="demo">
  <A> I just <lmao | laughed my ass out>.
</segment>
```

`speech` 投影为 `I just laughed my ass out.`，`caption` 投影为 `I just lmao.`。
Locator 永远对齐 speech token；CaptionPlan 与 CaptionTrack 永远从 Script 的
caption projection 取显示内容。

Role Cue 没有 close。`<A>` 从当前位置持续到下一个 Role Cue 或 Segment 结尾；
`</A>` 非法。NarrativeIR 显式保存：

```text
SpokenTurn {
  id
  segmentId
  role?
  tokenStart
  tokenEndExclusive
  sourceStart
  sourceEnd
}
```

Role 只是稿件标签，不是 speaker entity，不绑定人物、音色或素材。

### 2.2 SpeechTimingEvidence

```text
SpeechTimingEvidence {
  contract: "svml.speech-timing-evidence.v1"
  durationSec
  fps
  quality: measured | estimated
  units: [{ text, startSec, endSec, segmentId }]
  segments: [{ id, startSec, endSec }]
  provenance?
}
```

`units[].text` 是识别提示，不是正确文本。它可以错词、漏词、多词、把一个词拆成
多个、把多个词并成一个。Evidence 必须给出每个 Script Segment 的物理窗口；
Segment 内测量单位单调且不重叠。相邻 Segment 可 hard cut、gap 或 overlap，但
保持源码顺序的双单调约束：

```text
A.start <= B.start
A.end   <= B.end
```

WhisperX、其他 STT、人工表和音节 Estimate 都可提供同一鸭子合同。SVML import
决定默认请求的能力，例如作者可把 WhisperX Component `as="timing"`；外部 Runtime
仍可用 real、pin、manual、estimate 或 placeholder fulfillment 满足同一个端口。

### 2.3 CompleteSemanticMap

Locator 输入 NarrativeIR、选中的 `TemporalBasisProduction` 与
`SpeechTimingEvidence`，输出且只输出一份：

```text
CompleteSemanticMap {
  contract: "svml.complete-semantic-map.v1"
  semanticIndexDigest
  basisDigest
  anchors: [{ identity, ProgramPoint, quality }]
  evidenceDigests[]
  locatorDigest
  quantizationPolicy
  mapDigest
}
```

它必须一次性覆盖全部 `2M + 2N` identity。`quality` 可为 `measured`、`derived`、
`estimated`；这些是点的证据质量，不是三种互斥 Map 类型。只要结构完整并满足
basis affinity、Segment 内单调与源码顺序，preview 和 final 都消费同一个公共
类型。执行策略是否接受估计点属于 Runtime policy，不属于 SVML 源语法。

### 2.4 CaptionPlan

CaptionPlan 在 CompleteSemanticMap 之后产生：

```text
CaptionPlan {
  contract: "svml.caption-plan.v1"
  semanticIndexDigest
  basisDigest
  cues: [{ id, startToken, endTokenExclusive }]
  annotations: [{ id, kind, startToken, endTokenExclusive, value? }]
  plannerDigest
  planDigest
}
```

CaptionPlan 只能：

- 对正确 Script token 做 cue 分组；
- 标注 emphasis、tone、speaker treatment 等 typed annotation；
- 根据已定位的停顿和节奏优化以上两项。

CaptionPlan 不能：

- 输出或改写 speech/caption 文本；
- 输出 token 时间；
- 增删、重排 Script token；
- 触发第二次 STT 或产生第二份 SemanticMap。

最简 cue 分组是确定性 Component，不需要 LLM。需要语言判断时，LLM 也只是另一
个满足 `CaptionPlan` 输出合同的可选 Component；它只负责字幕组织/样式 annotation，
不会进入语义定位正确性路径。

## 3. 直接多对多对齐

v1 Locator 对每个 Segment 独立完成单调对齐，再把结果写入共同 ProgramBasis：

1. 用规范化文本寻找可靠的相同词锚点；
2. 两个可靠锚点之间，将 `N` 个 Script token 对齐到 `M` 个测量单位；
3. `N:M` 窗口按 Script token 权重确定性分配；
4. 有 Script token、无测量单位时，在相邻可靠点或 Segment 边界间插值；
5. 有测量单位、无 Script token 时，将其视为额外噪声，不写入稿子；
6. 一次量化到 frame boundary，并保留每个 anchor 的质量。

因此以下都是合法输入，而不是调用 LLM“改词”的理由：

```text
Script:    can not          Timing unit: cannot       2:1
Script:    cannot           Timing units: can / not   1:2
Script:    Hypit            Timing units: high / pit  1:2
Script:    this works       Timing units: this / uh / works  extra unit
Script:    very fast        Timing units: fast        missing unit
```

最终 Located words 的文字永远来自 Script。若声音与 Script 严重不一致，Locator
可以给出低质量诊断或由 Runtime policy 拒绝本次 fulfillment；它仍不能改写 Script。
真正修改成片中已经说出的内容属于后剪辑，不进入本合同。

## 4. Caption 所有权与 scope

每个 Composition 有零或一个 `CaptionTrack`：

```text
zero CaptionTrack  → 本片不显示标准口播字幕
one CaptionTrack   → 一套 cue，任意多局部样式和 mute 规则
two CaptionTrack   → 编译错误
```

这不妨碍普通 Text、Deck、Lower-third Track；它们不是第二份标准口播字幕。

Caption scope 可显式使用 Selection、Role 或 Annotation：

```svml
<caption-planner id="caption-plan" script={script} semantic={location.map} maxWords="3">
  <annotate id="punchline" kind="emphasis" during={script.selection.punchline}/>
</caption-planner>

<caption-track
  id="captions"
  script={script}
  semantic={location.map}
  plan={caption-plan.plan}
  z="500"
>
  <style id="a" role="A" activeColor="#73fbd3"/>
  <style id="important" during={script.selection.important} scale="1.1"/>
  <style id="emphasis" annotation="emphasis" weight="950"/>
  <mute id="hidden" during={script.selection.hidden}/>
</caption-track>
```

`role="A"` 是显式语法糖：Compiler/Component 从所有 `SpokenTurn(role == A)` 派生
一个可能非连通的 SelectionSet，再像普通 Selection 一样定位。Role 与 Selection
不是两套时间系统，也不会因为稿子里出现 `<A>` 就自动改变样式。

SelectionSet 本身永久允许非连通 occurrence。CaptionTrack 的 style/mute 规则消费
整个 set；其他 Track 是否接受 `one`、`each` 或 `set` 仍由各自端口声明。

Mute 只改变字幕可见性，不删除 Script token、不改变 Map、不重跑 STT 或 Planner。
Dual Text 是不可拆显示原子；CaptionPlan cue 不得切进它的 speech span 中间。

## 5. 唯一性

| 对象 | 每个 Composition target | 含义 |
|---|---:|---|
| Script / NarrativeIR / SemanticIndex | exactly one | 唯一语义文字与地址源 |
| selected TemporalBasisProduction | exactly one | 唯一 ProgramBasis binding |
| selected CompleteSemanticMap | exactly one | 唯一完整语义定位表 |
| CaptionPlan | zero or one when captions exist | 一套 cue/annotation 计划 |
| CaptionTrack | zero or one | 唯一标准口播字幕所有者 |
| other flat Tracks | zero or more | A-roll、B-roll、Ranking、Text、Audio、FX |
| Composition root | exactly one | 唯一 `Track[]` consumer 与 HTML entrypoint |

“唯一”约束最终 reachable binding，不垄断实现。生态中可以有多个 Basis Producer、
Timing provider、Locator 或 Caption Planner；作者或 Composite 最终只把一个合法值
接到 `one` 端口。

## 6. 当前显式写法

```svml
<svml version="1">
  <import from="@svml/std/speech-assemble.svk"/>
  <import from="@svml/std/speech-locator.svk"/>
  <import from="@svml/std/caption-planner.svk"/>
  <import from="@svml/std/caption-track.svk"/>
  <import from="@svml/std/media-track.svk"/>
  <import from="@svml/std/film.svk"/>

  <script>
    <segment id="intro"><HOST> Write the script, get the video.</segment>
  </script>

  <video id="host" src="./host.mp4"/>
  <audio id="voice" src="./voice.mp3"/>
  <timing id="timing" src="./timing.json"/>

  <speech-assemble id="program" fps="30">
    <segment id="intro" script={script.segment.intro} visual={host} audio={voice}/>
  </speech-assemble>
  <speech-locator id="location" script={script} basis={program.production} evidence={timing}/>
  <caption-planner id="caption-plan" script={script} semantic={location.map}/>
  <caption-track id="captions" script={script} semantic={location.map} plan={caption-plan.plan} z="500"/>

  <media-track id="base" z="0">
    <item id="host" source={program.facets.visual} during="full" playback="program-map"/>
  </media-track>

  <film id="main" basis={program.production} semantic={location.map}>
    <track ref={base.track}/>
    <track ref={captions.track}/>
  </film>
</svml>
```

`speech-program.svk` 可作为普通 `composite-v1` 门面隐藏 assemble/locator 的重复
接线；它不能把 Timing、Map 或 CaptionPlan 变成运行时黑盒。Compiler 不认识
`speech-program` 这个名字，只验证展开后的类型、唯一性和完整性。

## 7. Compiler、Library、Runtime 边界

Compiler 内建：Script parse、SemanticIndex、typed Plan、唯一 basis/map/root 与
零或一 CaptionTrack 验证、Map 完整性、TemporalBinding、隔离 Component ABI 和
HyperFrames Document lowering。

Library 提供：Basis 算法、SpeechTiming capability 声明、Locator、确定性或 LLM
Caption Planner、CaptionTrack、其他 Track 和 Composition Component。

Runtime Host 提供：provider、凭证、队列、存储、real/pin/manual/estimate/
placeholder fulfillment、Run/Job/Receipt 与策略。Pin、缓存、重算判断和 provider
哈希不进入 SVML。

当前实现以真实 Ranking + B-roll fixture 验证：交叉 Segment 时间窗、直接 N:M
对齐、完整 `2M + 2N` Map、Dual Text、非连通 Selection、Role 样式、annotation、
mute、CaptionTrack 唯一性以及完全无字幕的 Composition。
