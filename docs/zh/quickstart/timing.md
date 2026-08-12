---
title: 时序与装配
description: Speech Spine 装配与 WhisperX 对齐——将生成的片段连接到统一时间线。
---

# 时序与装配

生成完成后，各个片段必须拼接成一个连续的音视频坐标空间，并且需要将语音内容与实际音频进行比对，以创建时序映射。这两个步骤产生 **ProgramSpace** 和 **SemanticMap**，所有下游组件均依赖于它们。

```svml
<import as="speech" from="@narratage/speech-spine@1"/>
<import as="whisperx" from="@narratage/whisperx@1"/>
<import as="space" from="@narratage/spatial@1"/>
<import as="studio" source="./studio.svs"/>
```

## speech:Spine

将多个片段拼接成一个有序的音视频坐标空间。Spine 定义了节目顺序——即最终视频中 Segment 的排列序列。

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="speech-frame" within={vertical} left="0%" top="0%" right="100%" bottom="100%"/>
<speech:Spine id="speech" frame-rate="30"
  visual-frame={speech-frame} visual-appearance={studio.speech.visual} visual-z="0">
  <speech:Take video={hook-take.video} segment={story.segment.hook}/>
  <speech:Take video={meeting-take.video} segment={story.segment.meeting}/>
  <speech:Take video={evidence-take.video} segment={story.segment.evidence}/>
  <speech:Take video={payoff-take.video} segment={story.segment.payoff}/>
</speech:Spine>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `frame-rate` | 是 | 节目帧率，写整数或有理数，例如 `30`、`30000/1001` |
| `visual-frame` | 是 | 同源 Take 视觉的显式基础 SpatialFrame |
| `visual-appearance` | 是 | 只包含空间 fit 属性的 SVS Recipe |
| `visual-z` | 是 | 同源 Take 视觉的基础绝对层级 |

### speech:Take

每个 `<speech:Take>` 子元素将一个带口播的来源绑定到一个 Script Segment：

| 属性 | 必填 | 描述 |
|---|---|---|
| `video` | 三选一 | 生成/原始视频 Blob，例如 Seedance 产出的 `{take.video}` |
| `audio` | 三选一 | 纯语音 Blob；贡献节目时长与主音频，不贡献视觉 |
| `media` | 三选一 | 已准备好的 `SynchronizedMedia`；跳过自动规范化 |
| `segment` | 是 | 此片段对应的 Script Segment——例如 `{story.segment.hook}` |
| `frame` | 仅视觉 | 覆盖本 Take 的基础 `visual-frame` |
| `appearance` | 仅视觉 | 覆盖本 Take 的基础 `visual-appearance` |
| `z` | 仅视觉 | 覆盖本 Take 的基础 `visual-z` |

`video`、`audio` 与 `media` 必须且只能选一个。AIGC 的正常路径就是 `video={take.video}`。Speech
Surface 会把这句易读声明展开为普通 Media Pipeline Operation：检查容器、选择主动态视频流和默认音轨，再按 Spine 声明的帧率规范化。把 30 fps 素材接入 60 fps Spine 时，时长不变，帧序列会被确定性重采样为 60 fps，而不是把视频播放加速一倍。只有上游图已经明确产出所需
`SynchronizedMedia` 时才使用 `media=`。

视觉 Take 默认继承 Spine 上显式写出的三个视觉值，也可以逐段覆盖。纯音频 Take 禁止写视觉覆盖；它播放时 `speech.visual` 就没有 Present，Film 背景或平级 Track 会自然露出，系统不会伪造黑场。

旁白时序使用 audio Take，画面则由对等 Media Track 提供：

```svml
<speech:Spine id="speech" frame-rate="30"
  visual-frame={speech-frame} visual-appearance={studio.speech.visual} visual-z="0">
  <speech:Take audio={narration.audio} segment={story.segment.narration}/>
</speech:Spine>
```

fit Recipe 只是普通编译期 SVS 数据，例如：

```svs
speech.visual { fit: cover; }
```

`<speech:Take>` 子元素的排列顺序**决定了节目顺序**。第一个片段从时间零点开始；后续片段依次紧接。

### 输出

Spine 产生四个输出，供下游组件使用：

| 输出 | 类型 | 使用方 |
|---|---|---|
| `{speech.visual}` | VisualTrack | `film:Film`——稀疏的同源 Take 视觉 |
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
| `{timing.map}` | CompleteSemanticMap | Caption 样式族 Track、`media-track:Track`、`text:Track`——定时放置 |

SemanticMap 将每个 Script 中标注的锚点映射到一个时间点。它覆盖所有 `2M + 2N` 个标识（其中 M = 语音词元总数，N = Segment 数量）。这就是 Script 中声明的 Selection 和 Moment 如何转化为下游视觉组件所需的实际时间范围和时间点。

## ProgramSpace

ProgramSpace 不来自任何全局默认值。`speech:Spine` 用显式 `frame-rate` 和规范化后各 Take
的精确时长生成它，再传给每个需要知道总节目时长和帧域的组件。

```svml
<film:Film id="main" canvas={vertical} space={speech.space} ...>
<caption-fine:Track id="captions" ... space={speech.space} .../>
<text:Track id="titles" space={speech.space}>
<render:Video id="final" composition={main.composition} space={speech.space}/>
```

ProgramSpace 包含：

- **时长**——节目总长度
- **帧率**——有理帧率（例如 30fps）
- **帧域**——整个节目的精确帧编号

每个在时间域中运行的组件都通过 `space` 属性指向 `{speech.space}`。

### 无语音节目

无语音影片仍然需要一份显式且已验证的 ProgramSpace。在 Run Source 中用 `build-record` 与
`satisfy` 选择一份此前已接受的 ProgramSpace Record，再把该具名逻辑输出连接给 Track 与
Film。Track 使用 `during="program"` 或显式 `start`/`end` 窗口。没有语音就没有实测
SemanticMap，因此省略 WhisperX 与 Caption 组件，也不要使用 Selection/Moment 时序。Run
Source 语法见[复用结果](./run.md#复用结果)。

## SemanticMap

SemanticMap 是连接 Script 文本与物理时间的类型化桥梁。当你在 Media Item 上写 `during={story.selection.demo}` 时，组件会使用 SemanticMap 查找该 Selection 覆盖的精确帧范围。没有 SemanticMap，Selection 和 Moment 就没有物理意义。

整段使用无需伪造 Selection：`during={story.segment.answer}` 直接消费 Segment 已有的首尾结构锚点。

使用该映射的组件通过 `map` 属性接收它：

```svml
<media-track:Track id="cards" map={timing.map} ...>
<caption-fine:Track id="captions" ... map={timing.map} .../>
```

Map 只包含最终词窗口和语义锚点，不传播“测量、推导、估算”标签。WhisperX Evidence
与确定性的 M:N 对齐器负责充分使用录音证据；下游 Track 只接收一份完整 Map，不再解释每个点是如何获得的。

## 组合示例

完整的时序阶段，从生成的片段到映射和空间：

```svml
<import as="speech" from="@narratage/speech-spine@1"/>
<import as="whisperx" from="@narratage/whisperx@1"/>
<import as="space" from="@narratage/spatial@1"/>
<import as="studio" source="./studio.svs"/>

<!-- Assemble takes in program order -->
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="speech-frame" within={vertical} left="0%" top="0%" right="100%" bottom="100%"/>
<speech:Spine id="speech" frame-rate="30"
  visual-frame={speech-frame} visual-appearance={studio.speech.visual} visual-z="0">
  <speech:Take video={opening-take.video} segment={story.segment.opening}/>
  <speech:Take video={answer-take.video} segment={story.segment.answer}/>
</speech:Spine>

<!-- Measure word timing -->
<whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>

<!-- Downstream components now reference: -->
<!-- {speech.space}  — ProgramSpace for duration/frame domain -->
<!-- {speech.visual} — 稀疏的同源口播 VisualTrack -->
<!-- {speech.audioTrack} — AudioTrack for synchronized audio -->
<!-- {timing.map}    — SemanticMap for Selection/Moment timing -->
```

数据流向：

```text
生成的视频 ─────────────► speech:Spine ──► whisperx:Alignment
                              │                    │
                         .visual              .map (SemanticMap)
                         .audio                    │
                         .audioTrack               ▼
                         .space ──────────► caption-fine:Track
                              │            media-track:Track
                              │            text:Track
                              ▼            film:Film
                         film:Film         render:Video
```
