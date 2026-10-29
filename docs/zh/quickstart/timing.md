---
title: 时间与装配
description: 先构造绝对节目时间，再显式放置媒体并按需投影语义时间。
---

Hypit 只有一条节目时间轴：`Timeline`。它只是 `{ id, frameRate, frameCount }`，不包含素材、
单词、Track 或中央事件注册表。

对于语音作品，几类独立事实围绕这条绝对时间轴组合：

1. 把已接受素材准备为保留源关系的 `PreparedMedia` 与有限、精确的局部时间域；
2. 用具名 Instant、Window 与 Extent 构造一个包含必需 `end` 的 Timeline DAG；
3. 当消费者需要表演内部的语义位置时，在局部时间域上对齐对应 Script Segment；
4. 把所需语义值通过显式放置的 Window 投影，并让普通媒体独立进入 Visual 与 Audio Source。

这种分离很重要：移动一段内容不改变媒体和局部词时序；改变画面构图不改变声音；纯动效
只需要 Timeline，不需要媒体或 Script。

```svml
<import as="mediaop" from="@hypit/media-operations@1"/>
<import as="whisperx" from="@hypit/whisperx@1"/>
<import as="speechalign" from="@hypit/narrative-speech-alignment@1"/>
<import as="semantic" from="@hypit/narrative-temporal@1"/>
<import as="time" from="@hypit/timeline-author@1"/>
<import as="media" from="@hypit/media@1"/>
<import as="visual" from="@hypit/visual-track@1"/>
<import as="audio" from="@hypit/audio-track@1"/>
```

## 准备局部媒体

准备操作选择所需成员，发布精确的局部时间域与 Extent，而不选择最终 Timeline 的帧格：

```svml
<time:Clock id="clock" frame-rate="30"/>
<mediaop:Prepare id="opening-media" source={opening-video.video}
  video="primary-moving" audio="default" span-authority="video"/>
<mediaop:Prepare id="answer-media" source={answer-video.video}
  video="primary-moving" audio="default" span-authority="video"/>
```

准备会发布选中的媒体成员、它们精确的局部时间域与 Extent，以及后续消费者需要的源关系。
Script 对齐与节目放置仍由作者分别声明。

## 在作品消费语义位置时进行对齐

Timeline 构造只需要媒体 Extent，不要求语义对齐。只有 Caption、语义画面变化、声音事件或其他消费者
需要已接受表演内部的 Script 位置时，才增加 Alignment：

```svml
<whisperx:Transcription id="opening-transcription"
  media={opening-media.media} language="en"/>
<speechalign:Alignment id="opening-alignment" narrative={story}
  segment={story.segment.opening} domain={opening-media.domain}
  evidence={opening-transcription.transcript}/>
<whisperx:Transcription id="answer-transcription"
  media={answer-media.media} language="en"/>
<speechalign:Alignment id="answer-alignment" narrative={story}
  segment={story.segment.answer} domain={answer-media.domain}
  evidence={answer-transcription.transcript}/>
```

每次 Transcription 只发布 `SpeechTranscriptEvidence`；每次 Alignment 只发布
`NarrativeAlignment`，也就是在局部时间域上测得的 Segment 与单词边界。两种结果都不包含
媒体，也不选择 Timeline 位置。没有 Token 的 Segment 直接使用不带 `evidence` 的
`<speechalign:Alignment>`，边界采用局部时间域边界，并且不发起声学请求。

如果需要保留并修订观测，可以在 Build 前把它物化成文件，再导入该 Source：

```bash
hypit transcribe opening.mp4 --language en --to opening.transcript.svml
```

```svml
<import as="accepted-speech" source="./opening.transcript.svml"/>
<speechalign:Alignment id="opening-alignment" narrative={story}
  segment={story.segment.opening} domain={opening-media.domain}
  evidence={accepted-speech.transcript}/>
```

文件保存精确的 16 kHz 采样边界。修正这些边界后，下一次 Build 会重新得到对应的语义与
Caption 时间；Script 含义、媒体放置和 Alignment 操作本身都无需改变。

## 构造绝对 Timeline

Timeline 声明可以彼此依赖，但必须保持无环。`end` 必填；每个具名 Instant 或 Window 都可以被其他声明引用：

```svml
<time:Timeline id="speech" clock={clock} end="answer.end">
  <time:Window id="opening" from="start" for={opening-media.extent}/>
  <time:Window id="answer" from="opening.end" for={answer-media.extent}/>
</time:Timeline>
```

每个 `for={...extent}` 都会把精确但尚未定位的时长解析到当前 Timeline 的 Clock 上；默认
`cover` 规则会保留最后一个不完整帧。因此，未知长度的生成语音可以在解析完成后撑开
Timeline。`from="opening.end+2s"` 表示空隙，
`from="opening.end-12f"` 表示重叠，`latest(a.end,b.end)` 可以合并并行分支。纯动效可直接
声明 `<time:Timeline id="animation" clock={clock} end="8s"/>`。Timeline 不保留媒体或局部
时间域身份。

## 独立投影语义

把每个 Alignment、完整局部时间域和显式放置的绝对 Window 配对，投影语义证据：

```svml
<semantic:Projection id="story-time" narrative={story} timeline={speech.timeline}>
  <semantic:Map alignment={opening-alignment.alignment}
    domain={opening-media.domain} window={speech.opening}/>
  <semantic:Map alignment={answer-alignment.alignment}
    domain={answer-media.domain} window={speech.answer}/>
</semantic:Projection>
<semantic:Window id="proof" projection={story-time} during={story.selection.proof}/>
<semantic:Instant id="claim" projection={story-time} at={story.moment.claim}/>
```

显式请求的 `proof` 与 `claim` 是普通的绝对 Window 与 Instant。
语义时间只是一种可选投影来源；
直接秒数、帧数以及 Timeline 的具名绝对值同样是一等公民。
投影只读取准确的语义边界。需要作者偏移时，另行声明绝对关系，例如
`<time:Instant id="after-claim" timeline={speech.timeline} at={claim} offset="+5f"/>`。

## 呈现画面与声音

```svml
<visual:Track id="picture" timeline={speech.timeline}>
  <visual:Clip id="opening" media={opening-media.media} during={speech.opening}
    frame={speech-frame} fit="cover"/>
  <visual:Clip id="answer" media={answer-media.media} during={speech.answer}
    frame={speech-frame} fit="cover"/>
</visual:Track>

<audio:Track id="mix" timeline={speech.timeline}>
  <audio:Clip id="opening" source={opening-media.media} during={speech.opening}/>
  <audio:Clip id="answer" source={answer-media.media} during={speech.answer}/>
</audio:Track>
```

Visual 与 Audio Clip 是平等的媒体出现关系。同一份准备媒体可以同时供两边使用，但选择画面绝不会自动让声音
进入成片。

```text
PreparedMedia + Window ──────────────────────────────────→ Visual / Audio occurrence

NarrativeAlignment + LocalDomain + Window ──────────────→ 绝对 Instant / Window

Instant / Window / TemporalExtent DAG ───────────────────→ Timeline
```

组件最终只消费 Timeline 与绝对 Instant/Window。领域投影先发布这些值，组件再通过普通 Source 引用使用它们。
