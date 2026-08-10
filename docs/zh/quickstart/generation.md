---
title: 媒体与生成
description: 声明媒体资源并使用 Seedance 生成视频。
---

# 媒体与生成

本页介绍用于声明静态资源和生成新媒体的组件——这些是流入下游时序和 Track 阶段的原始素材。

此处展示的每个组件在使用前都必须通过包标识符导入：

```svml
<import as="media" from="@narratage/media@1"/>
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

该图片在下游通过 `{presenter}` 引用——例如，作为 `seedance:Speech` 中的角色参考或作为 B-roll 来源。

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

基于 Script 文本的确定性语音时长估算。无需外部服务调用——估算根据字数和语速参数在本地计算。

```svml
<estimate:Speech id="hook-duration"
  source={story.segment.hook.speech}
  policy={studio.speech.normal}/>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `source` | 是 | 要估算的 Script 文本——通常为 `{script.segment.NAME.speech}` |
| `policy` | 是 | 控制语速和边界的 SVS 语音 Recipe |

`policy` 引用一个 SVS Recipe（参见 [SVS 样式表](./styles.md#speech-estimation)）：

```svs
speech.normal {
  language: en;
  pace: normal;
  padding: 0.3;
  min: 4;
  max: 15;
  rounding: ceil;
}
```

你也可以直接内联指定估算参数，而不使用 SVS policy：

```svml
<estimate:Speech id="opening-duration"
  source={story.segment.opening.speech}
  language="en" pace="normal" padding="0.3" min="4" max="15" rounding="ceil"/>
```

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

## seedance:Speech

通过 Seedance 模型生成口播视频片段。这是低层生成组件——完整的模型输入 Text 已包含需要朗读的台词。

```svml
<seedance:Speech id="alice-take" model="mini"
  prompt={alice-direction}
  duration="8">
  <seedance:Reference image={alice-reference}/>
</seedance:Speech>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `model` | 是 | Seedance 模型名称：`mini` |
| `prompt` | 是 | 完整模型输入——引用普通 `Text` |
| `duration` | 是 | 片段时长（秒）（数字或 `{estimate.duration}` 引用） |
| `resolution` | 否 | 输出分辨率：`480p`、`720p`（默认值因模型而异） |
| `aspect-ratio` | 否 | 输出宽高比：`9:16`、`16:9`、`1:1` |

### seedance:Reference

提供参考图片以保持角色一致性的子元素：

```svml
<seedance:Reference image={alice-reference}/>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `image` | 是 | 引用 `media:Image` 组件 |

**输出：** `{alice-take}` 或 `{alice-take.video}`——生成的视频，传递给 `speech:Spine`。

## seedance:Video

生成独立的视频片段（非说话人头部——无对话口型同步）。

```svml
<seedance:Video id="product-motion" model="mini"
  prompt={product-direction} duration="5">
  <seedance:Reference image={product-reference}/>
</seedance:Video>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `model` | 是 | Seedance 模型名称：`mini` |
| `prompt` | 是 | 完整模型输入——引用普通 `Text` |
| `duration` | 是 | 片段时长（秒） |

同样接受 `<seedance:Reference>` 子元素作为参考图片。

**输出：** `{product-motion.video}`——用作 B-roll 来源。

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
