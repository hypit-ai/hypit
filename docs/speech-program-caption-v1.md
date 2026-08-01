# Speech Program and Caption v1

> **SVML v1 target contract; implementation pending.**
>
> 本文补全尚未公开发布的 SVML v1，不创建 v2，也不为仓库中的早期原型保留
> 兼容层。当前原型仍把 `AlignmentEvidence` 直接交给 `speech-locator`，并区分
> `EstimatedSemanticMap` / `ExactSemanticMap`；这些都是本合同要求在 v1 冻结前
> 收敛的实现差距。

本文只解决一条口播主导影片从 Script 到 HyperFrames HTML 的标准路径，以及
这条路径中的唯一性、可替换性和字幕所有权。翻译、多语言、多份独立字幕真相、
局部重复 STT、VLM、bbox 和后剪辑不属于 v1。

## 1. 不再混用“生产者”

规范只使用以下精确名称：

| 名称 | 输入 | 输出 | 责任 |
|---|---|---|---|
| `Basis Producer` | Segment media、JoinSpec | `TemporalBasisProduction` | 建立唯一物理 Program 时间轴、Program media 与 source maps |
| `Transcript Acquisition` | Program alignment subject | `MeasuredTranscript` | 测量节目音频中的词和时间；默认能力可以是 WhisperX |
| `Language Planner` | Script、MeasuredTranscript、CaptionIntent | `CanonicalTranscriptPlan` | 纠词、cue 切分和字幕所需 annotation |
| `Semantic Locator` | SemanticIndex、Basis、MeasuredTranscript、CanonicalTranscriptPlan | `CompleteSemanticMap` | 完整定位全部语义地址 |
| `Speech Program` | Script、Segment media、作者配置 | production、map、facets、可选 captions | 对作者隐藏前四者重复接线的 Composite 门面 |

此前“输入 N 个 Segment 并输出完整 `2M + 2N` 点表就是生产者”的鸭子合同，
在本文中准确命名为 **Speech Program 合同**。它可以由一个 Composite、一个
原子 Component 或第三方实现满足；`Basis Producer` 本身不拥有 SemanticMap。

从外部看，任何 Speech Program 至少提供：

```text
SpeechProgram {
  production: TemporalBasisProduction
  map: CompleteSemanticMap
  facets: named Program-bound media outputs
  captions?: Track
}
```

`map` 必须匹配 `production.basis`，并完整覆盖当前 Script SemanticIndex 的
`2M + 2N` 个稳定 identity。内部如何 hard cut、gap、overlap、crossfade、裁切、
拉伸或平移，不改变这个公共合同。

## 2. Role Cue 没有 close

Script 中的 `<A>` 是行首 Role Cue，不是 XML 容器元素。`</A>` 永远非法。

```svml
<segment id="dialogue">
  <A> Hello,
      this wrapped line is still A.
  <B> Nice to meet you.
  <A> Likewise.
</segment>
```

一个 spoken turn 从 Role Cue 开始，到下一个 Role Cue 或当前 Segment 结束。
物理换行只是 authoring layout：它不结束 turn；它只允许下一个 Role Cue 出现在
逻辑行首。Parser 遇到 `</A>` 必须以未知尖括号构造失败，formatter 永不输出它。

Narrative IR 必须显式保留 turn 的语义范围：

```text
SpokenTurn {
  id: stable identity
  segmentId: id
  role?: string
  tokenStart: integer
  tokenEndExclusive: integer
  sourceRange: SourceRange
}
```

Role label 仍不是 speaker entity，不绑定人物、音色、素材或生成端口，也不自动
选择字幕样式。外部 Program 只有在作者显式写出 `role="A"` selector 时，才可
查询这些 turn。

## 3. 一条标准 Speech Program 流程

```text
Script
  │
  ├─ parse ───────────────> NarrativeIR + SemanticIndex (2M + 2N)
  │                              │
  ├─ caption intent compile ─────┤
  │                              │
Segment media + JoinSpec         │
  │                              │
  ▼                              │
Basis Producer                   │
  ├─ ProgramBasis                │
  ├─ Program audio/visual facets │
  └─ source/alignment maps       │
  │                              │
  ▼                              │
Transcript Acquisition           │
  └─ MeasuredTranscript          │
          │                      │
          ▼                      │
Language Planner <──── CaptionIntent
  └─ CanonicalTranscriptPlan
          │
          ▼
Semantic Locator <──── SemanticIndex + TemporalBasisProduction
  └─ CompleteSemanticMap
          │
          ▼
Compiler Temporal Binding
  ├─ SelectionSet → WindowSet
  ├─ MomentSet → ProgramPoint[]
  └─ role selector → derived SelectionSet → WindowSet
          │
          ├─ Caption Renderer → zero or one Caption Track
          └─ other Track Components → zero or more Tracks
                                      │
                                      ▼
                         one Composition root
                                      │
                                      ▼
                           HyperFrames Document
```

### 3.1 MeasuredTranscript

标准 Speech Program 对整条 Program 只选择一份逻辑测量转录。它至少携带测得的
token text、Program 时间、confidence 和所依据的 alignment subject/source map。
“一份”约束的是最终绑定值，不约束 Runtime 内部是否切片、并行、重试或复用。

SVML 可以通过 import alias 明确默认能力：

```svml
<import from="@svml/whisperx.svk" as="whisperx"/>
```

这保留“默认希望 WhisperX”的作者意图；Runtime 仍可用 real、pin、estimate 或
manual fulfillment 提供同一个类型化输出，而不修改 SVML。

### 3.2 CanonicalTranscriptPlan

每个标准 Speech Program 只选择一份 CanonicalTranscriptPlan。它统一完成：

1. 依据 Script 修正 STT wording；
2. 若存在 Caption Program，为整条稿子划分 cue；
3. 产生所选 Caption style/mode 明确要求的 typed annotations。

没有 Caption Program 时，cue 与 annotation 为空，但 corrected transcript 仍然
存在。这个逻辑值是标准流程的一部分；它可以由 LLM、确定性 fallback、人工值或
Pin 满足，Compiler 不把某个 LLM 厂商写成语言法律。

### 3.3 CompleteSemanticMap

Semantic Locator 使用测量转录、语言计划和 Basis 映射，把 Script 的每个 anchor
identity 投影到 ProgramPoint。它必须一次性提交完整 `2M + 2N` 表，消费者不得
补点、猜尾或再次调用 STT。

v1 公共类型只保留结构上完整的 `CompleteSemanticMap`。real、estimate、manual、
pin、fallback、模型版本和 confidence 属于 Runtime binding/receipt 元数据，不用
互斥的 `EstimatedSemanticMap` / `ExactSemanticMap` 源语言类型控制能否编译。
Compiler 只验证完整性、basis affinity、单调/区间合同和类型；执行策略决定本次
运行接受哪种 fulfillment。

## 4. Caption 只有一个所有者

每个标准 Speech Program 有零或一个 Caption Program：

```text
zero Caption Program  → no canonical captions
one Caption Program   → one CaptionIntent + one CaptionPlan + one Caption Track
```

Caption Program 内可以有：

- 一个 default style；
- 零到多个局部 style rule；
- 零到多个 role style rule；
- 零到多个 mute rule；
- cue/annotation requirements。

这不叫多条字幕。双人不同样式、某句话强调、局部隐藏，都属于同一个 Caption
Program 和同一条 CanonicalTranscriptPlan。普通 Text/Deck Track 不构成第二个
Caption owner。

作者表面：

```svml
<captions class="caption.default">
  <style role="A" class="caption.speaker-a"/>
  <style role="B" class="caption.speaker-b"/>
  <style during={script.selection.important} class="caption.important"/>
  <mute during={script.selection.hidden}/>
</captions>
```

### 4.1 所有 Caption scope 统一为 SelectionSet

`role` 和显式 Selection 不是两套时间系统：

```text
role="A"
  → select all SpokenTurn(role == "A")
  → one derived, possibly disconnected SelectionSet

during={script.selection.important}
  → existing explicit SelectionSet
```

CaptionIntent lowering 后，每条 style/mute rule 的 scope 都是一个 SelectionSet。
SemanticMap 解析后再统一成为 WindowSet。SelectionSet 保留有序 occurrence
identity；WindowSet 才执行 union/intersection/difference。v1 不需要向作者开放
任意集合表达式。

Role selector 是显式 opt-in：仅有 `<A>` 不会自动改变字幕。它让高频的“所有 A
使用同一风格”无需在正文中重复包裹 `@speaker-a ... @/speaker-a`，但不会把 A
升级为人物实体。

Mute 只改变 Caption visibility：

```text
visible caption windows = full caption coverage - union(mute windows)
```

它不删除 Script token、不改变 MeasuredTranscript、CanonicalTranscriptPlan 或
CompleteSemanticMap，也不触发第二次规划。cue 跨越 mute boundary 时，renderer
在定位后确定性裁切可见窗口。

## 5. 唯一性是绑定唯一，不是实现垄断

| 对象 | 每个 v1 编译目标 | 唯一性的含义 |
|---|---:|---|
| Script / NarrativeIR / SemanticIndex | exactly one | 唯一语义地址源 |
| selected TemporalBasisProduction | exactly one | Composition 的 basis 端口只有一个最终绑定 |
| MeasuredTranscript | exactly one per standard Speech Program | 一份全片逻辑测量值；Runtime 内部调用数不限 |
| CanonicalTranscriptPlan | exactly one per standard Speech Program | 一份统一纠词/cue/annotation 计划 |
| selected CompleteSemanticMap | exactly one | 与 Script 和 selected Basis 匹配的完整定位表 |
| Caption Program / Caption Track | zero or one | 字幕存在时只有一个创作所有者和一个 terminal Track |
| other flat Tracks | zero or more | A-roll、B-roll、Ranking、Text、Audio、FX 等 |
| Composition root | exactly one | 唯一 `Track[]` consumer 和 HyperFrames entrypoint |
| HyperFrames Document | exactly one | 唯一正式编译产物 |

这张表约束 reachable Plan 的最终值，不规定生态中只能有一种 Component，也不
规定 provider 只能发出一次请求。多个候选 Basis 必须由作者/Composite 选择或由
显式 assembler 合成一个 `TemporalBasisProduction` 后才能进入 Composition；
多个 Caption owner 直接报错，不能靠 z 或源码顺序挑选。

`film` 是 stdlib 的 Composition Component 名，不是 Compiler 关键字。第三方可
提供其他 Composition Component，但每个编译 target 只能选择一个 root。未来若
一份 source closure 提供横版和竖版 target，应分别编译；每个 target 内仍恰好
一个 Composition root。v1 作者文档保持一个 target。

## 6. Compiler、Library 与 Runtime 边界

Compiler 只内建：

- module parse/bind/typecheck、Composite 有限展开和 reachable Plan；
- Script → NarrativeIR/SemanticIndex；
- 单一 selected basis/map/root 与零或一 Caption owner 的结构验证；
- CompleteSemanticMap 完整性、basis affinity 和 TemporalBinding；
- SelectionSet/MomentSet/derived role SelectionSet 的统一解析；
- isolated Component ABI、flat Track IR 和 HyperFrames Document 输出。

Library Components 提供：

- Basis algorithms；
- WhisperX 等 transcript capability declarations；
- Language Planner；
- Semantic Locator；
- Caption intent/renderer、其他 Track 和 Composition vocabulary；
- `speech-program` 等有限、可审计 Composite 门面。

Runtime Host 提供：

- capability fulfillment、凭证、provider、队列、存储、重试和并发；
- real / placeholder / estimate / manual / pin 等绑定策略；
- Run、Job、Receipt、provenance、confidence、cache 和操作历史。

SVML 声明默认想调用的 Component 和参数；Runtime 可以替换 capability 输出，
但不能让两个值同时占据一个 `one` 端口，也不能绕过 Compiler 的类型、完整性和
basis affinity 验证。Pin 永远在源码外，不因参数变化被语言自动判 stale。

## 7. v1 作者表面

```svml
<svml version="1">
  <import from="@svml/std/speech-program.svk" as="speech-program"/>
  <import from="@svml/whisperx.svk" as="whisperx"/>
  <import from="@svml/gemini-transcript-planner.svk" as="language"/>
  <import from="@svml/std/media-track.svk" as="media-track"/>
  <import from="@svml/std/film.svk" as="film"/>

  <script>
    <segment id="dialogue">
      <A> Hello, @important this is important. @/important
      <B> I understand.
      <A> Let us continue.
    </segment>
  </script>

  <video id="source" src="./source.mp4"/>

  <speech-program id="speech" script={script} source={source}>
    <whisperx/>
    <language/>

    <captions class="caption.default">
      <style role="A" class="caption.speaker-a"/>
      <style role="B" class="caption.speaker-b"/>
      <style during={script.selection.important} class="caption.important"/>
    </captions>
  </speech-program>

  <media-track id="base" z="0">
    <item source={speech.facets.visual} during="full" playback="program-map"/>
  </media-track>

  <film id="main" basis={speech.production} semantic={speech.map}>
    <track ref={base.track}/>
    <track ref={speech.captions}/>
  </film>
</svml>
```

`speech-program` 是普通 `composite-v1` Component；Compiler 不认识这个标签名。
展开后的可审计 Plan 至少包含：

```text
speech::basis
speech::caption-intent
speech::transcript
speech::language
speech::locator
speech::caption-renderer
```

没有 `<captions>` 时，不展开 caption-intent/renderer，`language` 只提供 corrected
transcript，且 `speech.captions` 端口不存在。

## 8. v1 实现批次

本合同落地时按以下顺序修改，不建立兼容 reader：

1. **Script/IR**：为 spoken turn 增加稳定 identity 与 token range；冻结
   `</A>` 失败 fixture；实现 role → derived SelectionSet。
2. **公共值类型**：增加 `MeasuredTranscript`、`CaptionIntent`、
   `CanonicalTranscriptPlan`、`CompleteSemanticMap`；收敛 prototype 的
   Estimated/Exact 二分，把 fulfillment quality/provenance 移到 Runtime Receipt。
3. **标准组件**：把 `speech-locator` 拆成 transcript acquisition、language
   planning 和纯 semantic projection；保留一个 `speech-program` Composite 门面。
4. **Caption**：把 style/mute 全部降低成 SelectionSet scope；Caption Intent 在
   language planning 前生成，renderer 在 TemporalBinding 后输出唯一 flat Track。
5. **唯一性/诊断**：在 reachable Plan 上验证 one basis、one map、zero-or-one
   Caption owner、one Composition root，以及所有 basis/map/caption affinity。
6. **Runtime seam**：Capability Request 只声明期望输出；BindingSet/Receipt 记录
   real、pin、estimate、manual 或 placeholder，不把执行策略写回 SVML。
7. **端到端 fixture**：至少覆盖单人无字幕、双 Role 不同样式、显式 Selection
   覆盖 Role 样式、非连通 scope、mute 跨 cue、crossfade Basis 和 Runtime
   estimate/pin fulfillment。

完成这些项目后，SVML v1 的标准口播编译路径才可冻结；仓库现有可执行 fixture
继续作为迁移输入，不构成另一版语言。
