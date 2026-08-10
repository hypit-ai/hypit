---
title: 媒体与生成
description: 声明媒体资源并使用 Seedance 生成视频。
---

# 媒体与生成

本页介绍用于声明静态资源和生成新媒体的组件——这些是流入下游时序和 Track 阶段的原始素材。

此处展示的每个组件在使用前都必须通过包标识符导入：

```svml
<import as="media" from="@narratage/media@1"/>
<import as="mediaop" from="@narratage/media-pipeline@1"/>
<import as="estimate" from="@narratage/estimate@1"/>
<import as="seedance" from="@narratage/seedance@1"/>
<import as="speaker" from="@narratage/seedance-speaker@1"/>
```

## media:Image

声明一个来自本地文件的内容寻址图片资源。

```svml
<media:Image id="presenter" src="./assets/presenter.png"/>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 组件的唯一标识符 |
| `src` | 是 | 图片文件路径，相对于 `.svml` 源文件 |

该图片在下游通过 `{presenter}` 引用——例如，作为 `seedance:ReferenceVideo` 中的角色参考或作为 B-roll 来源。

## media:Audio

声明一个来自本地文件的内容寻址音频资源。

```svml
<media:Audio id="presenter-voice" src="./assets/presenter-voice.mp3"/>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `src` | 是 | 音频文件路径，相对于 `.svml` 源文件 |

通常用作 `speaker:Take` 的语音音色参考。

## estimate:Speech

基于 Script 实际读音文本的确定性语音时长规划。无需外部服务调用——时长根据读音单位和口播密度策略在本地计算。

```svml
<estimate:Speech id="hook-duration"
  source={story.segment.hook.speech}
  policy={studio.speech.normal}/>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `source` | 是 | 要估算的 Script 文本——通常为 `{script.segment.NAME.speech}` |
| `policy` | 否 | 控制语速和边界的 SVS 语音 Recipe；省略时使用内联参数 |

`policy` 引用一个 SVS Recipe（参见 [SVS 样式表](./styles.md#speech-estimation)）：

```svs
speech.normal {
  language: en;
  pace: normal;
  min: 4;
  max: 15;
  rounding: round;
}
```

你也可以直接内联指定估算参数，而不使用 SVS policy：

```svml
<estimate:Speech id="opening-duration"
  source={story.segment.opening.speech}
  language="en" pace="normal" min="4" max="15" rounding="round"/>
```

英语官方档位为 `slow = 4.2`、`normal = 4.6`、`fast = 5.0` 音节/秒。
项目需要档位之间的连续值时，可以用 `rate="4.75"` 代替 `pace`；二者不能同时出现。
策略没有隐式值：无论内联还是引用 Recipe，都必须写明 `language`、`min`、`max`、
`rounding`，并且在 `pace` 和 `rate` 中恰好选择一个。

**输出：** `{hook-duration.duration}`——估算的时长（秒），传递给生成组件。

## text:Value

一个可复用的字面 `Text` 值。它与模型无关，可以进入 Seedance、GPT Image 或任何声明的文字端口。

```svml
<import as="text" from="@narratage/text@1"/>

<text:Value id="alice-direction">
  Locked medium close-up. Alice speaks directly to camera in a quiet daylight studio.
  Calm, curious delivery; natural breathing and restrained hand movement.
  Spoken dialogue — say exactly: What if editing began with meaning?
</text:Value>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识符 |

元素主体就是精确的 Text 值。`text:Render` 也能用模板和显式图输入产出同一类型。

## Seedance 三种调用形状

Seedance 只暴露模型能力，不暴露“口播”“B-roll”等创作用途。`standard`、`fast`、`mini`
选择模型版本；调用形状则独立分为三种。三者都消费完整的普通 `Text` Prompt，并输出
`{id.video}`。

### seedance:TextVideo

纯 Prompt 生成。只有这种形状允许 `web-search`：

```svml
<seedance:TextVideo id="ambient" model="mini"
  prompt={ambient-direction} duration="5" web-search="false"/>
```

### seedance:FrameVideo

必须给首帧，可以额外给尾帧：

```svml
<seedance:FrameVideo id="transition" model="fast"
  prompt={transition-direction} duration="5"
  first-frame={opening-image} last-frame={closing-image}/>
```

### seedance:ReferenceVideo

多模态参考生成。至少需要一个 `Reference` 子元素，可以显式接入图片、视频和音频：

```svml
<seedance:ReferenceVideo id="alice-take" model="mini"
  prompt={alice-direction}
  duration={alice-duration.duration}
  generate-audio="true">
  <seedance:Reference image={alice-reference}/>
  <seedance:Reference audio={alice-voice}/>
</seedance:ReferenceVideo>
```

这个低层组件并不知道它被用来做口播；用途只存在于传入的 Text 或 `speaker:Take` 之类的
高层包中。公共属性包括 `id`、`model`、`prompt`、`duration`、`resolution`、
`aspect-ratio`、`generate-audio`；`duration` 可以是字面量或显式 `{estimate.duration}` 边。

可以直接抽取前一段生成视频里的音频，并通过普通图边给后续片段当作参考。这个操作不会
把音频提升成语音证据，也不会凭空附加说话人语义：

```svml
<mediaop:ExtractAudio id="voice-from-opening"
  source={opening.video} audio="default"/>

<seedance:ReferenceVideo id="follow-up" model="mini"
  prompt={follow-up-direction} duration="5" generate-audio="true">
  <seedance:Reference image={presenter-reference}/>
  <seedance:Reference audio={voice-from-opening.audio}/>
</seedance:ReferenceVideo>
```

同一个媒体操作包还提供 `Transform`（按顺序截取、变速）和 `ExtractFrame`（首帧、尾帧、
指定帧或指定时间取图）。本地 FFmpeg 与 AWS Lambda 只是这些精确 Need 的可互换 Runtime
Endpoint，不会改变作者图。

## speaker:Take

基于领域无关 Text Program 构建的更高层口播组件。无需内联原始提示，只需提供生成 Recipe 和显式组装模型输入文字的 Text Template。

```svml
<import as="speaker" from="@narratage/seedance-speaker@1"/>
<import as="ugc" source="../../packages/seedance-speaker/kits/official-ugc-v1.svs"/>

<speaker:Take id="hook-take"
  dialogue={story.segment.hook.dialogue}
  duration={hook-duration.duration}
  recipe={studio.speaker.host}
  kit={ugc.official-ugc-v1}>
  <speaker:Reference image={presenter-clean} role="character-and-scene"/>
  <speaker:Reference audio={presenter-voice} role="voice-timbre"/>
</speaker:Take>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `dialogue` | 是 | Script 文本——通常为 `{script.segment.NAME.dialogue}` |
| `duration` | 是 | 来自 `estimate:Speech` 的估算时长 |
| `recipe` | 是 | SVS speaker Recipe（参见 [SVS 样式表](./styles.md#speaker)） |
| `kit` | 是 | Text Template SVS——用于组装模型输入文字的模板 |

### speaker:Reference

提供参考媒体的子元素。同时接受图片和音频：

```svml
<speaker:Reference image={presenter-clean} role="character-and-scene"/>
<speaker:Reference audio={presenter-voice} role="voice-timbre"/>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `image` | image/audio 二选一 | 引用 `media:Image` |
| `audio` | image/audio 二选一 | 引用 `media:Audio` |
| `role` | 是 | 参考用途：`character-and-scene`、`voice-timbre` |

**输出：** `{hook-take.video}`——生成的视频，传递给 `speech:Spine`。

### Text Template

Text Template 可以用 SVS 表达有序块、有限分支、轴参数和 Slot。官方模板位于 `packages/seedance-speaker/kits/official-ugc-v1.svs`。

该源码自己选择可选的 Text Template SVS Frontend：

```svs
<?svml using="@narratage/text/svs@1"?>
```

`studio.svs` 中的 Recipe 设置轴参数值。`speaker:Take` 把这些值和 Script 台词变成显式 Text Bindings；Text 渲染结果再通过普通图边进入 Seedance 的精确 `prompt` 端口。

## 组合示例

一个四段拍摄的设置，估算时长作为输入传递给 `speaker:Take` 生成：

```svml
<import as="media" from="@narratage/media@1"/>
<import as="estimate" from="@narratage/estimate@1"/>
<import as="speaker" from="@narratage/seedance-speaker@1"/>
<import as="studio" source="./studio.svs"/>
<import as="ugc" source="../../packages/seedance-speaker/kits/official-ugc-v1.svs"/>

<media:Image id="presenter-clean" src="./assets/presenter-clean.png"/>
<media:Image id="presenter-alt" src="./assets/presenter-alt.png"/>
<media:Audio id="presenter-voice" src="./assets/presenter-voice.mp3"/>

<estimate:Speech id="hook-duration"
  source={story.segment.hook.speech} policy={studio.speech.normal}/>
<estimate:Speech id="meeting-duration"
  source={story.segment.meeting.speech} policy={studio.speech.normal}/>
<estimate:Speech id="evidence-duration"
  source={story.segment.evidence.speech} policy={studio.speech.normal}/>
<estimate:Speech id="payoff-duration"
  source={story.segment.payoff.speech} policy={studio.speech.normal}/>

<speaker:Take id="hook-take" dialogue={story.segment.hook.dialogue}
  duration={hook-duration.duration} recipe={studio.speaker.host}
  kit={ugc.official-ugc-v1}>
  <speaker:Reference image={presenter-clean} role="character-and-scene"/>
  <speaker:Reference audio={presenter-voice} role="voice-timbre"/>
</speaker:Take>

<speaker:Take id="meeting-take" dialogue={story.segment.meeting.dialogue}
  duration={meeting-duration.duration} recipe={studio.speaker.host}
  kit={ugc.official-ugc-v1}>
  <speaker:Reference image={presenter-alt} role="character-and-scene"/>
  <speaker:Reference audio={presenter-voice} role="voice-timbre"/>
</speaker:Take>

<speaker:Take id="evidence-take" dialogue={story.segment.evidence.dialogue}
  duration={evidence-duration.duration} recipe={studio.speaker.host}
  kit={ugc.official-ugc-v1}>
  <speaker:Reference image={presenter-alt} role="character-and-scene"/>
  <speaker:Reference audio={presenter-voice} role="voice-timbre"/>
</speaker:Take>

<speaker:Take id="payoff-take" dialogue={story.segment.payoff.dialogue}
  duration={payoff-duration.duration} recipe={studio.speaker.host}
  kit={ugc.official-ugc-v1}>
  <speaker:Reference image={presenter-clean} role="character-and-scene"/>
  <speaker:Reference audio={presenter-voice} role="voice-timbre"/>
</speaker:Take>
```

每个 `speaker:Take` 生成一个 `{*.video}` 输出，传递给下一阶段的 `speech:Spine`。不同的拍摄段可以使用不同的参考图片（例如，演示者在某些 Segment 中持有产品而在其他段中没有），同时共享相同的语音音色和生成 Recipe。
