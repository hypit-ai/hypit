---
title: 媒体与生成
description: 声明媒体资源并使用 Seedance 生成视频。
---

# 媒体与生成

本页介绍用于声明静态资源和生成新媒体的组件——这些是流入下游时序和 Track 阶段的原始素材。

此处展示的每个组件在使用前都必须通过包标识符导入：

```svml
<import as="media" from="@hypit/media@1"/>
<import as="mediaop" from="@hypit/media-pipeline@1"/>
<import as="text" from="@hypit/text@1"/>
<import as="seedance" from="@hypit/seedance@1"/>
<import as="speaker-kit" source="@hypit/seedance-kits/speaker"/>
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

## 时长是字面量

生成片段的长度由作者决定，直接写在需要它的元素上。先量稿子，再写数字：

```bash
hypit measure main.svml --segment hook --language en --pace normal --rounding round
# 7s
```

```svml
<seedance:ReferenceVideo id="hook-take" model="mini" prompt={hook-prompt} duration="7">
  …
</seedance:ReferenceVideo>
```

`hypit measure` 按口播策略——`language`、`pace`（英语 `slow = 4.2`、`normal = 4.6`、`fast = 5.0` 音节/秒）或数值 `rate`、`rounding`——统计 Segment 台词的读音单位，不调用任何外部服务。图里没有任何东西在计算时长，所以 `hypit plan` 在 Build 开始前就是完整的。同一套策略写在 `estimated:SemanticTake` 上或它引用的 SVS Recipe 里（参见 [SVS 样式表](./styles.md#speech-estimation)），用于把 Segment 的词按音节权重铺到预览媒体上。

## text:Value

一个可复用的字面 `Text` 值。它与模型无关，可以进入 Seedance、GPT Image 或任何声明的文字端口。

```svml
<import as="text" from="@hypit/text@1"/>

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
创作规则要求每条 take 都从一张已验收的图开始，所以实际创作用的是首帧或有序引用这两种形状。这里记录这个形状是因为模型有它，而不是因为一条 take 应该在没有画面的情况下开始。


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
  duration="5"
  generate-audio="true">
  <seedance:Reference image={alice-reference}/>
  <seedance:Reference audio={alice-voice}/>
</seedance:ReferenceVideo>
```

这个低层组件并不知道它被用来做口播；用途只存在于传入的 Text 中。公共属性包括
`id`、`model`、`prompt`、`duration`、`resolution`、
`aspect-ratio`、`generate-audio`；`duration` 是模型范围内的整秒字面量，事先用 `hypit measure` 量好。

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

`@hypit/seedance-kits` 包含七个纯数据 Text Template。Kit 不是模型包装器：先用通用
`text:Render` 生成 prompt，再把该 Text 与真实媒体引用显式接入低层 Seedance Surface。

直接从已安装的包导入选中的公开 Kit Source。包管理器或当前 Distribution 管理实际安装版本，
Source Closure 沿着这个显式包导入读取内容。如果共享措辞不适合当前作品，也可以在项目里创作并导入自己的 Kit。

创作前阅读
[`@hypit/seedance-kits` 指南](https://github.com/hypit-ai/hypit/blob/main/packages/seedance-kits/README.md)
和 [所选 Kit 源文件](https://github.com/hypit-ai/hypit/tree/main/packages/seedance-kits/kits)，判断它的镜头假设和措辞是否适合当前表演。也可以直接编写 prompt Text，或创作项目自己的 Kit。提示词语言按所选模型决定，对白使用实际需要说出的语言。

```svml
<import as="text" from="@hypit/text@1"/>
<import as="seedance" from="@hypit/seedance@1"/>
<import as="broll-kit" source="@hypit/seedance-kits/broll"/>

<text:Value id="product-story">
  Show the product opening, the primary feature activating, and the finished result in one readable sequence.
</text:Value>
<text:Render id="demo-prompt"
  template={broll-kit.broll-v1}
  recipe={recipes.broll.product-demo}>
  <text:Set name="story" text={product-story}/>
</text:Render>

<seedance:ReferenceVideo id="demo" model="mini"
  prompt={demo-prompt} duration="5"
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
| 街访 | `street-interview-v1` | `dialogue`；可选 `action` | image 1/2/3 = 采访者/受访者/双人视角；audio 1/2 = 采访者/受访者 |
| 动作迁移 | `motion-reference-v1` | 可选 `direction` | image 1 = 主体；video 1 = 动作参考 |
| 运镜迁移 | `camera-reference-v1` | 可选 `direction` | image 1 = 主体；video 1 = 运镜参考 |

这些形状仍然清楚地写在 `seedance:ReferenceVideo` 中；Kit 渲染不会隐藏媒体数量与顺序。

## 街访 Prompt 组装

使用 `street-interview-v1` 复用视角顺序、角色、麦克风、音色和无叠加文字契约。构图、节奏、表演、反应与手势由 SVS Recipe 选择；每段的镜头变化和表演按实际发生顺序直接写在 `action` 中：

```svml
<import as="text" from="@hypit/text@1"/>
<import as="seedance" from="@hypit/seedance@1"/>
<import as="interview-kit" source="@hypit/seedance-kits/street-interview"/>

<text:Value id="interview-action">
  Begin with the shared view from @image3 while A asks the question.
  Cut to B's view from @image2 as B pauses briefly, then answers.
</text:Value>

<text:Render id="interview-prompt"
  template={interview-kit.street-interview-v1}
  recipe={recipes.interview.street}>
  <text:Set name="dialogue" text={story.segment.interview.dialogue}/>
  <text:Set name="action" text={interview-action}/>
</text:Render>

<seedance:ReferenceVideo id="interview-take" model="mini"
  prompt={interview-prompt} duration="8"
  resolution="720p" aspect-ratio="9:16" generate-audio="true">
  <seedance:Reference image={interviewer-view}/>
  <seedance:Reference image={guest-view}/>
  <seedance:Reference image={shared-view}/>
  <seedance:Reference audio={interviewer-voice}/>
  <seedance:Reference audio={guest-voice}/>
</seedance:ReferenceVideo>
```

对白使用明确的 `A:`/`B:` 顺序：A 是采访者并绑定第一段音频参考，B 是受访者并绑定第二段。固定英文 Prompt 骨架由 Kit 负责，不要在手写 Prompt 中重复一遍。

## 口播 Prompt 组装

口播创作不需要一个特殊的可执行组件。数据化的 `speaker-v1` Template、项目 Recipe 与每段的
dialogue/action 由普通 Text 模块组装，结果再像其他生成任务一样通过显式 `prompt` 边进入 Seedance。

```svml
<import as="text" from="@hypit/text@1"/>
<import as="seedance" from="@hypit/seedance@1"/>
<import as="speaker-kit" source="@hypit/seedance-kits/speaker"/>

<text:Value id="hook-action">
  Begin with urgent direct eye contact, then let the final admission land more quietly.
</text:Value>

<text:Render id="hook-prompt"
  template={speaker-kit.speaker-v1}
  recipe={recipes.speaker.host}>
  <text:Set name="dialogue" text={story.segment.hook.dialogue}/>
  <text:Set name="action" text={hook-action}/>
</text:Render>

<seedance:ReferenceVideo id="hook-take" model="mini"
  prompt={hook-prompt} duration="8"
  resolution="720p" aspect-ratio="9:16" generate-audio="true">
  <seedance:Reference image={presenter-clean}/>
  <seedance:Reference audio={presenter-voice}/>
</seedance:ReferenceVideo>
```

`speaker-v1.svs` 自己选择 Text Template Frontend。`recipes.svs` 提供具名轴值，`dialogue` 与
`action` 保持为普通图输入。Kit 和 Text 都不选择模型、参考素材或 Provider。

## 组合示例

一个两段拍摄的设置，量好的时长写成字面量，显式 Text 组装与 Seedance 生成：

```svml
<import as="media" from="@hypit/media@1"/>
<import as="text" from="@hypit/text@1"/>
<import as="seedance" from="@hypit/seedance@1"/>
<import as="recipes" source="./recipes.svs"/>
<import as="speaker-kit" source="@hypit/seedance-kits/speaker"/>

<media:Image id="presenter-clean" src="./assets/presenter-clean.png"/>
<media:Image id="presenter-alt" src="./assets/presenter-alt.png"/>
<media:Audio id="presenter-voice" src="./assets/presenter-voice.mp3"/>

<text:Value id="hook-action">Start urgently, then become quieter.</text:Value>
<text:Value id="meeting-action">Indicate the product, then return to the lens.</text:Value>

<text:Render id="hook-prompt" template={speaker-kit.speaker-v1} recipe={recipes.speaker.host}>
  <text:Set name="dialogue" text={story.segment.hook.dialogue}/>
  <text:Set name="action" text={hook-action}/>
</text:Render>
<text:Render id="meeting-prompt" template={speaker-kit.speaker-v1} recipe={recipes.speaker.host}>
  <text:Set name="dialogue" text={story.segment.meeting.dialogue}/>
  <text:Set name="action" text={meeting-action}/>
</text:Render>

<seedance:ReferenceVideo id="hook-take" model="mini" prompt={hook-prompt}
  duration="8" resolution="720p" aspect-ratio="9:16" generate-audio="true">
  <seedance:Reference image={presenter-clean}/>
  <seedance:Reference audio={presenter-voice}/>
</seedance:ReferenceVideo>
<seedance:ReferenceVideo id="meeting-take" model="mini" prompt={meeting-prompt}
  duration="6" resolution="720p" aspect-ratio="9:16" generate-audio="true">
  <seedance:Reference image={presenter-alt}/>
  <seedance:Reference audio={presenter-voice}/>
</seedance:ReferenceVideo>
```

每个 `seedance:ReferenceVideo` 产出 `{*.video}`，进入下一阶段的 `speech:Track`。不同 Take
可以使用不同参考图，同时共享相同的音色与 Prompt Recipe。
