# Speech Program and Caption v1

本文定义尚未公开发布的 SVML v1 标准口播路径。它不创建 v2，也不保留仓库早期
原型的兼容层。翻译、多语言、后剪辑、VLM、bbox 与视觉反向定位不属于 v1。

## 1. 一条不可破坏的真相链

```text
                         ┌─ serializeSpeech ─> SpeechSchedule ─> SpeechBasis(audio + visual)
Script / Narrative ──────┤                                           │
                         └─ CaptionProjection (display owns tokens)  │
                                                                     ▼
                                                   AlignedTranscriptEvidence
                                                                     │
                         Narrative ──────────────────────────────────┤
                                                                     ▼
                                                     CompleteSemanticMap
                                                                     │
                         CaptionProjection ──────────────────────────┤
                                                                     ▼
                                                    TimedCaptionProjection
                                                                     │
                                                                     ▼
                                  optional CaptionPresentationPlan / CaptionTrack
```

`serializeSpeech`、`serializeDialogue` 与 `CaptionProjection` 不是三个异步任务；它们
是同一个不可变 Narrative 的同步纯视图。异步只发生在后续 Need 被 Runtime 满足时。
Estimate、生成、语音识别可以分别暂停、缓存、恢复，已经完成的上游 Producer 不重跑。

这里没有 `correctedSpeech`、`CorrectedTranscript` 或
`CanonicalTranscriptPlan`。所谓“按口播稿纠错”不是生成另一份文本，而是：

> 把不可靠的声音测量对齐到可靠的 Script token 序列。

STT 输出的文字只帮助识别测量单位与 Script token 的对应关系，永远不是候选稿件
真相。LLM 不参与定位必经链，也不重复输出一份本来就正确的 Script。

## 2. 四个公共合同

### 2.1 Script / Narrative

Script 产生唯一 `Narrative` 与 `SemanticIndex`。若有 `M` 个 speech token、
`N` 个 Segment，SemanticIndex 恰好有 `2M + 2N` 个稳定 anchor identity：每个
token 与 Segment 都有独立 start/end。

Dual Text 同时给出显示词与实际读音：

```svml
<demo>
  <A> I just <lmao | laughed my ass out>.
</demo>
```

`speech` 序列化为 `I just laughed my ass out.`。显示侧不是裸的 `I just lmao.`
字符串端口，而是结构化 `CaptionProjection`：每个显示 region 都拥有一段 speech
token 范围。Locator 永远只对齐 speech token；字幕再把 Projection 与时间图组合。

```text
CaptionProjection {
  contract: "svml.caption-projection@0"
  text
  regions: [{
    id, display, segmentId, startToken, endTokenExclusive,
    kind: identity | alias | hidden,
    refinements: [{ displayStart, displayEnd, startToken, endTokenExclusive, relation: exact }]
  }]
}
```

上游只记录可以证明的 exact correspondence。`<15% off | fifteen percent off>` 可以
证明 `off ↔ off`；`<that was insane | what the fuck>` 只能证明整个显示短语拥有完整
speech envelope，不能伪造三个显示词的测量时间。`< | um>` 则是有时间所有权但不可见
的 hidden region。

Role Cue 没有 close。`<A>` 从当前位置持续到下一个 Role Cue 或 Segment 结尾；
`</A>` 非法。Narrative 显式保存：

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

### 2.2 AlignedTranscriptEvidence

```text
AlignedTranscriptEvidence {
  contract: "svml.aligned-transcript-evidence@1"
  basisDigest
  audioArtifactDigest
  programSpaceDigest
  rawEvidenceArtifactDigest
  evidenceDigest
  durationSec
  segments: [{ sourceSegmentId, startSec, endSec, words, chars, speechActivity? }]
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

WhisperX、其他 STT、人工表和已缓存证据最终都可降为同一鸭子合同，但调用什么外部
能力必须由 SVML 导入的组件包明确决定。例如 `@svml/whisperx` 产生专有的
`Need<WhisperXAlignmentEvidence>`，再由纯 Producer 降为本合同；Runtime 只能在
`whisperx.local` 与 `hypit.whisperx` 等同类执行端之间做显式绑定，不能看见一个通用
Evidence 需求后临时猜测 STT。确定性 Locator 位于 provider-neutral 的
`@svml/speech-align`，不读取 WhisperX 配置，也不接触其 API。

### 2.3 CompleteSemanticMap

Locator 输入 Narrative、选中的 speech basis 与 `AlignedTranscriptEvidence`，
输出且只输出一份：

```text
CompleteSemanticMap {
  contract: "svml.complete-semantic-map@1"
  semanticIndexDigest
  basisDigest
  audioArtifactDigest
  programSpaceDigest
  evidenceDigest
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

### 2.4 TimedCaptionProjection 与 CaptionPresentationPlan

`@svml/caption` 对 CaptionProjection 与 CompleteSemanticMap 做纯组合：

```text
TimedCaptionProjection {
  contract: "svml.timed-caption-projection@0"
  semanticIndexDigest
  speechTimeMapDigest
  regions: [{ display, sourceTokenIds, startSec, endSec, quality, refinements }]
}
```

整个 region 的 start/end 来自它所拥有 speech tokens 的 envelope，因此
`that was insane` 确实拥有完整的开始和结束时间；只是它内部三个显示词没有声音证据。

若具体 CaptionTrack 需要逐词高亮，它可以显式选择本地 Presentation policy：

- `whole`：整段显示；
- `proportional-word`：复用可证明的 exact refinement，其余词按区域局部估计；
- `character-flow`：按字符做局部呈现估计。

后两者输出的时间明确标记为 `estimated`，永远不反写全局 speech map。LLM 分 cue
若之后加入，也只是 Caption 组件自己的可选 Producer/Need，不进入 Script、Locator
或全局语义真相。

Caption 规划只能：

- 对正确 Script token 做 cue 分组；
- 标注 emphasis、tone、speaker treatment 等 typed annotation；
- 根据已定位的停顿和节奏优化以上两项。

CaptionPlan 不能：

- 输出或改写 speech/caption 文本真相；
- 输出 token 时间；
- 增删、重排 Script token；
- 触发第二次 STT 或产生第二份 SemanticMap。

最简 cue 分组是确定性 Component，不需要 LLM。需要语言判断时，LLM 也只是另一
个满足 `CaptionCuePlan` 输出合同的可选 Component；它只负责字幕组织/样式 annotation，
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
Dual Text 始终保留一个不可丢失的整体 speech envelope；只有 Script 可以证明的
exact refinement 才能在不造假的前提下细化。下游允许做局部估计，但不得把估计
冒充全局语义证据。

## 5. Provider 注册与使用者分离

组件包和最终 BuildPlan 必须明确选择外部能力；Runtime 不得从泛化的结果需求反推
Seedance、Kling、WhisperX 或其他实现。Producer 只声明已经选定的 typed Need 及其
constraints；它不读取 API key、不选择 endpoint，也不初始化 Python/CUDA。Node
Runtime 的 `ProviderRegistry` 只注册同一能力的实际执行端：

```text
Need<SeedanceMiniGeneration> -> kie.seedance / volc.seedance / hypit.seedance
Need<WhisperXAlignmentEvidence> -> whisperx.local / hypit.whisperx

registerProvider("whisperx.local", WhisperXAlignmentEvidence, handler)
bind(WhisperXAlignmentEvidence, "whisperx.local")
```

同一个 Wants 只有一个匹配 Provider 时可直接运行；没有 Provider 就暂停；存在多个
匹配 Provider 且 Runtime 没有显式绑定时必须报告 `ambiguous-provider`，绝不采用
“第一个注册者”。不同能力的 Provider 即使能产生相似的媒体，也不能匹配该 Need。
已有视频、黑场视频和人工时间稿只能作为显式 `substitute` fulfillment，不能改写 Need
身份或冒充 `exact`。Receipt 的 `fulfiller` 由 Registry 身份写入，不由 handler 自报。

## 6. 唯一性

| 对象 | 每个 Composition target | 含义 |
|---|---:|---|
| Script / Narrative / SemanticIndex | exactly one | 唯一语义文字与地址源 |
| selected TemporalBasisProduction | exactly one | 唯一 ProgramBasis binding |
| selected CompleteSemanticMap | exactly one | 唯一完整语义定位表 |
| CaptionPlan | zero or one when captions exist | 一套 cue/annotation 计划 |
| CaptionTrack | zero or one | 唯一标准口播字幕所有者 |
| other flat Tracks | zero or more | A-roll、B-roll、Ranking、Text、Audio、FX |
| Composition root | exactly one | 唯一 `Track[]` consumer 与 HTML entrypoint |

“唯一”约束最终 reachable binding，不垄断实现。生态中可以有多个 Basis Producer、
Timing provider、Locator 或 Caption Planner；作者或 Composite 最终只把一个合法值
接到 `one` 端口。

## 7. 当前显式写法（尚未实现的 author surface 草图）

```svml
<svml version="1">
  <import from="@svml/std/speech-assemble.svk"/>
  <import from="@svml/std/speech-locator.svk"/>
  <import from="@svml/std/caption-planner.svk"/>
  <import from="@svml/std/caption-track.svk"/>
  <import from="@svml/std/media-track.svk"/>
  <import from="@svml/std/film.svk"/>

  <script>
    <intro><HOST> Write the script, get the video.</intro>
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
