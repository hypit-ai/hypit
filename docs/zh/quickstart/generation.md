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
<import as="text" from="@narratage/text@1"/>
<import as="seedance" from="@narratage/seedance@1"/>
<import as="speaker-kit" source="./kits/speaker-v1.svs"/>
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

通常用作 `seedance:ReferenceVideo` 的语音音色参考。

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

英语官方档位为 `slow = 4.2`、`normal = 4.6`、`fast = 5.0` 音节/秒。项目需要档位之间的连续值时，可以用 `rate="4.75"` 代替 `pace`；二者不能同时出现。策略没有隐式值：无论内联还是引用 Recipe，都必须写明 `language`、`min`、`max`、
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
和 `2.5` 选择精确模型；调用形状则独立分为三种。三者都消费完整的普通 `Text` Prompt，并输出 `{id.video}`。

Seedance 2.5 复用同样的 Surface，而不是由 Runtime 把别的模型偷偷替换成 2.5。它的精确合同支持 480p/720p，最多 30 张参考图、10 段参考视频、10 段参考音频；时长可写 `-1`
交给模型选择，也可明确写 4–30 秒的整数：

```svml
<seedance:ReferenceVideo id="long-take" model="2.5"
  prompt={long-direction} duration="30" resolution="720p">
  <seedance:Reference image={presenter-reference}/>
  <seedance:Reference audio={presenter-voice}/>
</seedance:ReferenceVideo>
```

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

这个低层组件并不知道它被用来做口播；用途只存在于传入的 Text 中。公共属性包括
`id`、`model`、`prompt`、`duration`、`resolution`、
`aspect-ratio`、`generate-audio`；`duration` 可以是字面量或显式 `{estimate.duration}` 边。

可以直接抽取前一段生成视频里的音频，并通过普通图边给后续片段当作参考。这个操作不会把音频提升成语音证据，也不会凭空附加说话人语义：

```svml
<mediaop:ExtractAudio id="voice-from-opening"
  source={opening.video} audio="default"/>

<seedance:ReferenceVideo id="follow-up" model="mini"
  prompt={follow-up-direction} duration="5" generate-audio="true">
  <seedance:Reference image={presenter-reference}/>
  <seedance:Reference audio={voice-from-opening.audio}/>
</seedance:ReferenceVideo>
```

同一个媒体操作包还提供 `Transform`（按顺序截取、变速）和 `ExtractFrame`（首帧、尾帧、指定帧或指定时间取图）。本地 FFmpeg 与 AWS Lambda 只是这些精确 Need 的可互换 Runtime
Endpoint，不会改变作者图。

## Seedance 语义 Kit

`@narratage/seedance-kits` 包含七个纯数据 Text Template。Kit 不是模型包装器：先用通用
`text:Render` 生成 prompt，再把该 Text 与真实媒体引用显式接入低层 Seedance Surface。

只把项目实际选择的 Kit `.svs` 文件复制进视频项目的 `./kits/` 目录，并导入这份项目内副本，使 Kit 字节保持在 Source Closure 内；项目源码不要反向引用 Narratage 仓库 checkout。

创作前阅读
[`@narratage/seedance-kits` 指南](https://github.com/hypit-ai/narratage/blob/main/packages/seedance-kits/README.md)
和[所选 Kit 源文件](https://github.com/hypit-ai/narratage/tree/main/packages/seedance-kits/kits)。格式匹配时优先使用官方 Kit。生成指令与动态 prompt slot 必须使用英语；只有需要逐字说出的对白保留作者原语言。七个 Kit 都不适用时，才编写自由格式的英语 prompt。

```svml
<import as="text" from="@narratage/text@1"/>
<import as="seedance" from="@narratage/seedance@1"/>
<import as="broll-kit" source="./kits/broll-v1.svs"/>

<text:Value id="product-story">
  Show the product opening, the primary feature activating, and the finished result in one readable sequence.
</text:Value>
<text:Render id="demo-prompt"
  template={broll-kit.broll-v1}
  recipe={studio.broll.product-demo}>
  <text:Set name="story" text={product-story}/>
</text:Render>

<seedance:ReferenceVideo id="demo" model="mini"
  prompt={demo-prompt} duration={demo-duration.duration}
  resolution="720p" aspect-ratio="9:16" generate-audio="false">
  <seedance:Reference image={scene}/>
  <seedance:Reference image={product}/>
</seedance:ReferenceVideo>
```

项目 Recipe 选择模板声明的轴；显式 `text:Param` 可以覆盖 Recipe。按格式选择 Kit，再提供它声明的动态 slot 与有序参考：

| 格式 | Kit | 动态 slot | 有序参考 |
|---|---|---|---|
| 单人口播 | `speaker-v1` | `dialogue`；可选 `action` | image 1 = 人物/场景；audio 1 = 声音 |
| 无声 B-roll | `broll-v1` | `story` | 一张或多张作者声明图片 |
| 双人 Podcast | `podcast-v1` | `dialogue`；可选 `action` | image 1/2 = A/B 视角；audio 1/2 = A/B 声音 |
| 视频通话 | `call-v1` | `dialogue`；可选 `action` | image 1/2 = 相反通话布局；audio 1/2 = A/B 声音 |
| 街访 | `street-interview-v1` | `dialogue`；可选 `action` | image 1 = 完整场景；audio 1/2 = 采访者/受访者 |
| 动作迁移 | `motion-reference-v1` | 可选 `direction` | image 1 = 主体；video 1 = 动作参考 |
| 运镜迁移 | `camera-reference-v1` | 可选 `direction` | image 1 = 主体；video 1 = 运镜参考 |

这些形状仍然清楚地写在 `seedance:ReferenceVideo` 中；Kit 渲染不会隐藏媒体数量与顺序。

## 街访 Prompt 组装

使用 `street-interview-v1` 复用场景、角色、麦克风、音色和无叠加文字契约。构图、剪辑、节奏、表演、反应与手势由 SVS Recipe 选择；动态输入只保留对白与可选的单段动作：

```svml
<import as="text" from="@narratage/text@1"/>
<import as="seedance" from="@narratage/seedance@1"/>
<import as="interview-kit" source="./kits/street-interview-v1.svs"/>

<text:Value id="interview-action">
  Let the guest pause briefly before the answer; keep the microphone handoff natural.
</text:Value>

<text:Render id="interview-prompt"
  template={interview-kit.street-interview-v1}
  recipe={studio.interview.street}>
  <text:Set name="dialogue" text={story.segment.interview.dialogue}/>
  <text:Set name="action" text={interview-action}/>
</text:Render>

<seedance:ReferenceVideo id="interview-take" model="mini"
  prompt={interview-prompt} duration={interview-duration.duration}
  resolution="720p" aspect-ratio="9:16" generate-audio="true">
  <seedance:Reference image={interview-scene}/>
  <seedance:Reference audio={interviewer-voice}/>
  <seedance:Reference audio={guest-voice}/>
</seedance:ReferenceVideo>
```

对白使用明确的 `A:`/`B:` 顺序：A 是采访者并绑定第一段音频参考，B 是受访者并绑定第二段。固定英文 Prompt 骨架由 Kit 负责，不要在手写 Prompt 中重复一遍。

## 口播 Prompt 组装

口播创作不需要一个特殊的可执行组件。数据化的 `speaker-v1` Template、项目 Recipe 与每段的
dialogue/action 由普通 Text 模块组装，结果再像其他生成任务一样通过显式 `prompt` 边进入 Seedance。

```svml
<import as="text" from="@narratage/text@1"/>
<import as="seedance" from="@narratage/seedance@1"/>
<import as="speaker-kit" source="./kits/speaker-v1.svs"/>

<text:Value id="hook-action">
  Begin with urgent direct eye contact, then let the final admission land more quietly.
</text:Value>

<text:Render id="hook-prompt"
  template={speaker-kit.speaker-v1}
  recipe={studio.speaker.host}>
  <text:Set name="dialogue" text={story.segment.hook.dialogue}/>
  <text:Set name="action" text={hook-action}/>
</text:Render>

<seedance:ReferenceVideo id="hook-take" model="mini"
  prompt={hook-prompt} duration={hook-duration.duration}
  resolution="720p" aspect-ratio="9:16" generate-audio="true">
  <seedance:Reference image={presenter-clean}/>
  <seedance:Reference audio={presenter-voice}/>
</seedance:ReferenceVideo>
```

`speaker-v1.svs` 自己选择 Text Template Frontend。`studio.svs` 提供具名轴值，`dialogue` 与
`action` 保持为普通图输入。Kit 和 Text 都不选择模型、参考素材或 Provider。

## 组合示例

一个两段拍摄的设置，估算时长进入显式 Text 组装与 Seedance 生成：

```svml
<import as="media" from="@narratage/media@1"/>
<import as="estimate" from="@narratage/estimate@1"/>
<import as="text" from="@narratage/text@1"/>
<import as="seedance" from="@narratage/seedance@1"/>
<import as="studio" source="./studio.svs"/>
<import as="speaker-kit" source="./kits/speaker-v1.svs"/>

<media:Image id="presenter-clean" src="./assets/presenter-clean.png"/>
<media:Image id="presenter-alt" src="./assets/presenter-alt.png"/>
<media:Audio id="presenter-voice" src="./assets/presenter-voice.mp3"/>

<estimate:Speech id="hook-duration"
  source={story.segment.hook.speech} policy={studio.speech.normal}/>
<estimate:Speech id="meeting-duration"
  source={story.segment.meeting.speech} policy={studio.speech.normal}/>
<text:Value id="hook-action">Start urgently, then become quieter.</text:Value>
<text:Value id="meeting-action">Indicate the product, then return to the lens.</text:Value>

<text:Render id="hook-prompt" template={speaker-kit.speaker-v1} recipe={studio.speaker.host}>
  <text:Set name="dialogue" text={story.segment.hook.dialogue}/>
  <text:Set name="action" text={hook-action}/>
</text:Render>
<text:Render id="meeting-prompt" template={speaker-kit.speaker-v1} recipe={studio.speaker.host}>
  <text:Set name="dialogue" text={story.segment.meeting.dialogue}/>
  <text:Set name="action" text={meeting-action}/>
</text:Render>

<seedance:ReferenceVideo id="hook-take" model="mini" prompt={hook-prompt}
  duration={hook-duration.duration} resolution="720p" aspect-ratio="9:16" generate-audio="true">
  <seedance:Reference image={presenter-clean}/>
  <seedance:Reference audio={presenter-voice}/>
</seedance:ReferenceVideo>
<seedance:ReferenceVideo id="meeting-take" model="mini" prompt={meeting-prompt}
  duration={meeting-duration.duration} resolution="720p" aspect-ratio="9:16" generate-audio="true">
  <seedance:Reference image={presenter-alt}/>
  <seedance:Reference audio={presenter-voice}/>
</seedance:ReferenceVideo>
```

每个 `seedance:ReferenceVideo` 产出 `{*.video}`，进入下一阶段的 `speech:Spine`。不同 Take
可以使用不同参考图，同时共享相同的音色与 Prompt Recipe。
