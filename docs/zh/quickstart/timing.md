---
title: 时序与装配
description: 逐 Take 归一化与语义对齐，然后装配为 SemanticTrack。
---

# 时序与装配

Hypit 的时间真相是 `SemanticTrack`。它按 Segment 粒度构建：

1. 把每个已接受的音视频 Take 归一化到同一个精确帧域；
2. 将归一化媒体与对应的 Script Segment 对齐，得到自包含的 `SemanticTake`；
3. 用 `speech:Track` 按节目顺序装配这些 Semantic Take。

系统不再先拼接整段节目、再做一次全局转录。每个 Take 在进入 Track 之前就已经具有语义。

```svml
<import as="program" from="@hypit/program-space@1"/>
<import as="pipeline" from="@hypit/media-pipeline@1"/>
<import as="whisperx" from="@hypit/whisperx@1"/>
<import as="speech" from="@hypit/speech-track@1"/>
<import as="space" from="@hypit/spatial@1"/>
<import as="studio" source="./studio.svs"/>
```

## 逐 Take 归一化

归一化把视频、音频、时长和帧率变成一个明确的 `SynchronizedMedia` 事实。同一条
SemanticTrack 内的所有 Take 共享作者显式声明的 Clock。

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
  segment={story.segment.opening} media={opening-media.media}/>
<whisperx:SemanticTake id="answer-semantic" narrative={story}
  segment={story.segment.answer} media={answer-media.media}/>
```

每个输出都自带归一化媒体、Segment 身份、每个作者词语的局部帧窗口以及该 Segment 的全部
结构锚点：Segment 有两个锚点，每个词也有两个锚点。声学证据只是这一步的实现输入；下游
组件看到的是完成后的 `SemanticTake`，而不是第二套 evidence 形状的时间结构。

## 装配 SemanticTrack

`speech:Track` 按文档顺序拼接已经语义化的 Take，并从同一批 item 投影出三个严格对齐的侧面：

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="speech-frame" within={vertical}
  left="0%" top="0%" right="100%" bottom="100%"/>

<speech:Track id="speech"
  visual-frame={speech-frame}
  visual-appearance={studio.speech.visual}
  visual-z="0">
  <speech:Take source={opening-semantic.take}/>
  <speech:Take source={answer-semantic.take}/>
</speech:Track>
```

| 输出 | 类型 | 含义 |
|---|---|---|
| `{speech.semantic}` | SemanticTrack | 全局语义与帧域真相 |
| `{speech.visual}` | VisualTrack | 与语义 item 对齐的同源画面 |
| `{speech.audio}` | AudioTrack | 与语义 item 对齐的同源声音 |

三个侧面都是同一批有序 Take 的投影，不能各自漂移。`SemanticTrack` 通过局部 Take 长度的前缀和
得到全局帧位置，同时提供 Film 和 Render 所需的节目时长与帧域。

## 消费语义时间

Selection、Moment 与完整 Segment 始终是 Script 中的作者身份。下游组件只接收一次
SemanticTrack，并在构建确定性 Track 时把这些身份投影成帧：

```svml
<media-track:Track id="cards" semantic={speech.semantic} canvas={vertical}>
  <media-track:Item image={card.image} extent={card-extent}
    during={story.selection.demo} frame={card-frame}
    appearance={studio.media.card} motion={studio.motion.card}/>
</media-track:Track>

<caption-fine:Track id="captions"
  display={story.caption}
  correspondence={story.caption.correspondence}
  semantic={speech.semantic}
  program={caption-program}
  plan={caption-plan.plan}/>

<film:Film id="main" canvas={vertical}
  semantic={speech.semantic} appearance={studio.film.vertical}>
  <film:Track source={speech.visual}/>
  <film:Track source={speech.audio}/>
  <film:Track source={cards.visual}/>
  <film:Track source={captions.track}/>
</film:Film>

<render:Video id="final"
  composition={main.composition} semantic={speech.semantic}/>
```

整段使用 `during={story.segment.answer}`，作者范围使用 Selection，点事件使用 Moment，完整节目
使用 `during="program"`。组件统一消费 `semantic={speech.semantic}`，不再同时接收分离的 `map`
和 `space`。

```text
原始 Take ─► Normalize ─► SynchronizedMedia ─► SemanticTake ─┐
原始 Take ─► Normalize ─► SynchronizedMedia ─► SemanticTake ─┤
                                                              ▼
                                                         speech:Track
                                                  ┌───────────┼───────────┐
                                                  ▼           ▼           ▼
                                             .semantic     .visual      .audio
                                                  │           │           │
                                                  └──────► Film / Tracks ◄─┘
```
