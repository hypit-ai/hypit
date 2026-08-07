---
title: 时序与装配
description: Speech Spine 装配与 WhisperX 对齐——将生成的片段连接到统一时间线。
---

# 时序与装配

生成完成后，各个片段必须拼接成一个连续的音视频坐标空间，并且需要将语音内容与实际音频进行比对，以创建时序映射。这两个步骤产生 **ProgramSpace** 和 **SemanticMap**，所有下游组件均依赖于它们。

```svml
<import as="speech" from="@narratage/speech-spine@1"/>
<import as="whisperx" from="@narratage/whisperx@1"/>
```

## speech:Spine

将多个片段拼接成一个有序的音视频坐标空间。Spine 定义了节目顺序——即最终视频中 Segment 的排列序列。

```svml
<speech:Spine id="speech">
  <speech:Take source={hook-take.video} segment={story.segment.hook}/>
  <speech:Take source={meeting-take.video} segment={story.segment.meeting}/>
  <speech:Take source={evidence-take.video} segment={story.segment.evidence}/>
  <speech:Take source={payoff-take.video} segment={story.segment.payoff}/>
</speech:Spine>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 唯一标识符 |

### speech:Take

每个 `<speech:Take>` 子元素将一个生成的视频绑定到一个 Script Segment：

| 属性 | 必填 | 描述 |
|---|---|---|
| `source` | 是 | 生成的视频——来自 `seedance:Speech`、`speaker:Take` 等 |
| `segment` | 是 | 此片段对应的 Script Segment——例如 `{story.segment.hook}` |

`<speech:Take>` 子元素的排列顺序**决定了节目顺序**。第一个片段从时间零点开始；后续片段依次紧接。

### 输出

Spine 产生四个输出，供下游组件使用：

| 输出 | 类型 | 使用方 |
|---|---|---|
| `{speech.visual}` | VisualTrack | `film:Film`——全屏真人出镜视频 |
| `{speech.audio}` | Audio | `whisperx:Alignment`——用于词级时序的原始音频 |
| `{speech.audioTrack}` | AudioTrack | `film:Film`——同步音频 |
| `{speech.space}` | ProgramSpace | 所有组件——统一的时长和帧域 |

## whisperx:Alignment

通过对 Spine 的音频输出运行 WhisperX 语音转文本对齐，测量词级时序。这将产生 **SemanticMap**——连接 Script 文本与物理时间的桥梁。

```svml
<whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `narrative` | 是 | Script 组件——例如 `{story}` |
| `audio` | 是 | 来自 Speech Spine 的音频——`{speech.audio}` |

### 输出

| 输出 | 类型 | 使用方 |
|---|---|---|
| `{timing.map}` | CompleteSemanticMap | `caption:Track`、`broll:Track`、`text:Track`——定时放置 |

SemanticMap 将每个 Script 中标注的锚点映射到一个时间点。它覆盖所有 `2M + 2N` 个标识（其中 M = 语音词元总数，N = Segment 数量）。这就是 Script 中声明的 Selection 和 Moment 如何转化为下游视觉组件所需的实际时间范围和时间点。

## ProgramSpace

ProgramSpace 不是一个需要声明的组件——它由 `speech:Spine` 产生，并传递给每个需要知道总节目时长和帧域的组件。

```svml
<film:Film id="main" space={speech.space} ...>
<caption:Track id="captions" ... space={speech.space} .../>
<text:Track id="titles" space={speech.space}>
<render:Video id="final" composition={main.composition} space={speech.space}/>
```

ProgramSpace 包含：

- **时长**——节目总长度
- **帧率**——有理帧率（例如 30fps）
- **帧域**——整个节目的精确帧编号

每个在时间域中运行的组件都通过 `space` 属性指向 `{speech.space}`。

## SemanticMap

SemanticMap 是连接 Script 文本与物理时间的类型化桥梁。当你在 B-roll 项上写 `during={story.selection.demo}` 时，组件会使用 SemanticMap 查找该 Selection 覆盖的精确帧范围。没有 SemanticMap，Selection 和 Moment 就没有物理意义。

使用该映射的组件通过 `map` 属性接收它：

```svml
<broll:Track id="cards" map={timing.map} ...>
<caption:Track id="captions" ... map={timing.map} .../>
```

映射中的每个点可以是：

- **测量值**——由 WhisperX 对齐直接观测得到
- **推导值**——通过插值从测量值计算得出
- **估算值**——来自初始时长估计（在对齐运行之前使用）

## 组合示例

完整的时序阶段，从生成的片段到映射和空间：

```svml
<import as="speech" from="@narratage/speech-spine@1"/>
<import as="whisperx" from="@narratage/whisperx@1"/>

<!-- Assemble takes in program order -->
<speech:Spine id="speech">
  <speech:Take source={opening-take} segment={story.segment.opening}/>
  <speech:Take source={answer-take} segment={story.segment.answer}/>
</speech:Spine>

<!-- Measure word timing -->
<whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>

<!-- Downstream components now reference: -->
<!-- {speech.space}  — ProgramSpace for duration/frame domain -->
<!-- {speech.visual} — VisualTrack for the talking-head video -->
<!-- {speech.audioTrack} — AudioTrack for synchronized audio -->
<!-- {timing.map}    — SemanticMap for Selection/Moment timing -->
```

数据流向：

```text
speaker:Take outputs ──► speech:Spine ──► whisperx:Alignment
                              │                    │
                         .visual              .map (SemanticMap)
                         .audio                    │
                         .audioTrack               ▼
                         .space ──────────► caption:Track
                              │            broll:Track
                              │            text:Track
                              ▼            film:Film
                         film:Film         render:Video
```
