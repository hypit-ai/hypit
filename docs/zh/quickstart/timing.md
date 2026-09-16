---
title: 时序与装配
description: 逐 Take 归一化与语义对齐，然后装配为 Timeline。
---

对于说话视频，`Timeline` 把作者的 Script 与实际表演联系起来，是字幕、随词语出现的图形和覆盖画面的自然时间来源。它按 Segment 粒度构建：

1. 把每个已接受的音视频 Take 归一化到同一个精确帧域；
2. 将归一化媒体与对应的 Script Segment 对齐，得到自包含的 `SemanticTake`；
3. 用 `time:Timeline` 按节目顺序装配这些 Semantic Take。

每个 Take 在进入 Timeline assembly 之前就已经具有语义。画面由 Media Track 或项目组件呈现，与这里的语义和音频装配分别表达。

纯视觉动画使用同一种 Timeline 声明：指定结束时间，不放入 Take，见 [纯组件绘制的影片](./composition.md)。其事件可以使用秒或帧；说话视频则可以用 Script Selection 和 Moment 驱动相同的视觉行为。

```svml
<import as="program" from="@hypit/program-space@1"/>
<import as="pipeline" from="@hypit/media-pipeline@1"/>
<import as="whisperx" from="@hypit/whisperx@1"/>
<import as="time" from="@hypit/timeline-author@1"/>
<import as="media-track" from="@hypit/media-track@1"/>
  <import as="performance" from="@hypit/performance@1"/>
<import as="space" from="@hypit/spatial@1"/>
<import as="recipes" source="./recipes.svs"/>
```

## 逐 Take 归一化

归一化把视频、音频、时长和帧率变成一个明确的 `SynchronizedMedia` 事实。同一条
Timeline 内的所有 Take 共享作者显式声明的 Clock。

```svml
<program:Clock id="clock" frame-rate="30"/>

<pipeline:Normalize id="opening-media" source={opening-video.video}
  video="primary-moving" audio="default" span-authority="video" clock={clock}/>
<pipeline:Normalize id="answer-media" source={answer-video.video}
  video="primary-moving" audio="default" span-authority="video" clock={clock}/>
```

归一化不包含 Script 语义，也不负责转录；它只建立后续语义对齐可以信任的客观媒体事实。

## 每个 Segment 产生一个 SemanticTake

`whisperx:SemanticTake` 测量一段归一化媒体，并把声学证据与唯一一个作者 Segment 对齐：

```svml
<whisperx:SemanticTake id="opening-semantic" narrative={story}
  segment={story.segment.opening} media={opening-media.media} language="en"/>
<whisperx:SemanticTake id="answer-semantic" narrative={story}
  segment={story.segment.answer} media={answer-media.media} language="en"/>
```

每次对齐都必须显式填写 `language`，接受本地和托管 Endpoint 上 WhisperX 都自带对齐模型的语言
代码：`ar`、`ca`、`cs`、`da`、`de`、`el`、`en`、`es`、`eu`、`fa`、`fi`、`fr`、`gl`、`he`、`hi`、
`hr`、`hu`、`it`、`ja`、`ka`、`ko`、`lv`、`ml`、`nl`、`nn`、`no`、`pl`、`pt`、`ro`、`ru`、`sk`、
`sl`、`sv`、`te`、`tl`、`tr`、`uk`、`ur`、`vi` 和 `zh`。该值会原样传给 WhisperX；Hypit 不会根据
Script 文本或音频自动检测、分流语言。

每个输出都自带归一化媒体、Segment 身份、每个作者词语的局部帧窗口以及该 Segment 的全部
结构锚点：Segment 有两个锚点，每个词也有两个锚点。声学证据只是这一步的实现输入；下游
组件看到的是完成后的 `SemanticTake`，而不是第二套 evidence 形状的时间结构。

## 装配 Timeline

`time:Timeline` 默认顺接已经准备好的 Take，也允许通过 `at` 自由放置，提供完整 Timeline。
Performance 和 Sound 分别呈现其中的画面和声音：

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="speech-frame" within={vertical}
  left="0%" top="0%" right="100%" bottom="100%"/>

<time:Timeline id="speech" clock={clock}>
  <time:Take source={opening-semantic.take}/>
  <time:Take source={answer-semantic.take}/>
</time:Timeline>
<import as="sound" from="@hypit/sound@1"/>
<sound:Style id="voice-style"/>
<sound:Track id="voice" timeline={speech.timeline}>
  <sound:Use style={voice-style}/>
</sound:Track>
<performance:Style id="performance-style" frame={speech-frame} appearance={recipes.media.performance}/>
  <performance:Track id="performance" timeline={speech.timeline} canvas={vertical}>
    <performance:Use style={performance-style} during="program"/>
  </performance:Track>
```

| 输出 | 类型 | 含义 |
|---|---|---|
| `{speech.timeline}` | Timeline | 全局语义与帧域真相 |
| `{voice.audio}` | AudioTrack | Sound 对已有 Take 声音的呈现 |

Performance 和 Sound 使用同一批素材及源位置。每个 Take 的全局位置由放置起点加局部位置得到。
第一段省略 `at` 表示从零开始，后续省略则顺接上一段。`at="previous.end+2s"` 留出间隔，
`at="previous.end-12f"` 表示交叠，也可以写绝对位置。Timeline 的 `end` 默认取所有 Take 的最晚终点；
`end="content.end+2s"` 留出片尾，`end="30s"` 指定完整时长。位置须落在精确帧上，完整范围须容纳所有 Take。
零 Take 的 Timeline 需要明确的正时长，空隔不生成占位素材。

## 消费语义时间

Selection、Moment 与完整 Segment 始终是 Script 中的作者身份。下游组件只接收一次
Timeline，并在构建确定性 Track 时把这些身份投影成帧：

```svml
<media-track:Track id="cards" timeline={speech.timeline} canvas={vertical}>
  <media-track:Item image={card.image} extent={card-extent}
    during={story.selection.demo} frame={card-frame}
    appearance={recipes.media.card} motion={recipes.motion.card}/>
</media-track:Track>

<caption-fine:Track id="captions"
  document={story.caption}
  timeline={speech.timeline}
>
  <caption-fine:Use style={primary-caption}/>
</caption-fine:Track>

<film:Film id="main" canvas={vertical}
  timeline={speech.timeline} appearance={recipes.film.vertical}>
  <film:Track source={performance.visual}/>
  <film:Track source={voice.audio}/>
  <film:Track source={cards.visual}/>
  <film:Track source={captions.track}/>
</film:Film>

<render:Video id="final"
  composition={main.composition} timeline={speech.timeline}/>
```

整段使用 `during={story.segment.answer}`，作者范围使用 Selection，点事件使用 Moment，完整节目使用 `during="program"`。组件统一消费 `timeline={speech.timeline}`。

```text
prepared Takes → Timeline → Performance / project scene → visual ─┐
                         ├→ Caption / semantic graphics → visual ┤
                         └→ Sound → audio ───────────────────────┤
                                                                Film
```
