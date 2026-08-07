---
title: 字幕、B-roll 与文字
description: 视觉 Track 组件——字幕、B-roll 叠加层和文字叠加层。
---

# 字幕、B-roll 与文字

每个进入最终合成的视听内容都是一个对等的 **Track**。Track 是扁平的（无嵌套），其 z 轴顺序由 SVS 中的 `stack-order` 属性决定。本页介绍三种主要的视觉 Track 类型：字幕、B-roll 和文字叠加层。

## 字幕系统

字幕由四个组件构成一条流水线：

```text
caption:Style → caption:Program → caption-ai:Planner → caption:Track
```

```svml
<import as="caption" from="@narratage/caption@1"/>
<import as="caption-ai" from="@narratage/caption-gemini@1"/>
```

### caption:Style

声明一种字幕样式的完整视觉外观及规划指令。

```svml
<caption:Style id="primary-caption" appearance={studio.caption.primary}
  mode="proportional-word">
  <caption:Cues>
    Split each Script Segment into short complete semantic phrases of two to
    seven words. Never cross a sentence or Segment boundary.
  </caption:Cues>
  <caption:Field id="important" type="boolean" min-per-cue="1" max-per-cue="2">
    Select one or two words whose emphasis best communicates this Cue.
  </caption:Field>
</caption:Style>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `appearance` | 是 | SVS 字幕 Recipe——位置、字体、颜色、容器 |
| `mode` | 否 | 字幕计时模式，例如 `proportional-word` |

**子元素：**

- `<caption:Cues>` —— 给 AI 规划器的自然语言指令，告诉它如何将文本拆分为提示单元。规划器接收显示文本（Dual Text 的左侧）和这些指令，但不会接收音频或时间数据。
- `<caption:Field>` —— 声明一个有类型的逐词注解。规划器将这些字段分配给每个提示单元中的各个词。

| `<caption:Field>` 属性 | 描述 |
|---|---|
| `id` | 字段名称（例如 `important`） |
| `type` | 字段类型：`boolean` |
| `min-per-cue` | 每个提示单元的最少注解数 |
| `max-per-cue` | 每个提示单元的最多注解数 |

`<caption:Field>` 的元素主体是给规划器的自然语言指令。

### caption:Program

将字幕样式分配给叙事。声明一个默认样式，并可选择按角色或按 Selection 覆盖。

```svml
<caption:Program id="caption-program" narrative={story} default={primary-caption}>
  <caption:Use role="ALICE" style={alice-caption}/>
  <caption:Use role="BOB" style={bob-caption}/>
  <caption:Use on={story.selection.product-demo} style={dialogue-caption}/>
</caption:Program>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `narrative` | 是 | Script 组件 |
| `default` | 是 | 所有文本的默认 `caption:Style` |

**子元素：**

`<caption:Use>` 用于应用样式覆盖。规则按源代码顺序应用——后匹配优先。

| `<caption:Use>` 属性 | 描述 |
|---|---|
| `role` | 按 Role Cue 标签匹配（例如 `"ALICE"`） |
| `on` | 按 Selection 引用匹配（例如 `{story.selection.product-demo}`） |
| `style` | 要应用的 `caption:Style` |

使用 `role=` 为不同说话者设置不同的字幕颜色。使用 `on=` 在特定 Selection 期间覆盖样式（例如产品演示部分使用不同的字幕样式）。

### caption-ai:Planner

通过 Gemini 驱动的 AI 提示单元规划。规划器接收显示文本原子、Style 指令和 Program 分配，将文本拆分为提示单元并分配 Field 值。

```svml
<caption-ai:Planner id="caption-plan" narrative={story}
  program={caption-program} model="gemini-2.5-flash"/>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `narrative` | 是 | Script 组件 |
| `program` | 是 | `caption:Program` |
| `model` | 是 | Gemini 模型：`gemini-2.5-flash` |

规划器不会接收音频、时间数据或 Dual Text 的语音侧。它完全基于字幕（显示）投影进行工作。

**输出：**`{caption-plan.plan}` —— 提示单元计划，传递给 `caption:Track`。

### caption:Track

将提示单元计划、SemanticMap、ProgramSpace 和 Program 组合在一起，生成一个带时间信息的 VisualTrack。

```svml
<caption:Track id="captions" narrative={story} map={timing.map}
  space={speech.space} program={caption-program} plan={caption-plan.plan}/>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `narrative` | 是 | Script 组件 |
| `map` | 是 | 来自 `whisperx:Alignment` 的 SemanticMap |
| `space` | 是 | 来自 `speech:Spine` 的 ProgramSpace |
| `program` | 是 | `caption:Program` |
| `plan` | 是 | 来自 `caption-ai:Planner` 的提示单元计划 |

**输出：**`{captions.track}` —— 添加到 `film:Film` 的 VisualTrack。

### 字幕组合示例

包含按角色样式的完整字幕流水线：

```svml
<caption:Style id="dialogue-caption" appearance={studio.caption.dialogue}>
  <caption:Cues>Use short complete semantic phrases, two to five words.</caption:Cues>
</caption:Style>

<caption:Style id="alice-caption" appearance={studio.caption.alice}>
  <caption:Cues>Use short complete semantic phrases, two to five words.</caption:Cues>
  <caption:Field id="important" type="boolean" min-per-cue="0" max-per-cue="2">
    Select at most two words whose emphasis best communicates this Cue.
  </caption:Field>
</caption:Style>

<caption:Style id="bob-caption" appearance={studio.caption.bob}>
  <caption:Cues>Use short complete semantic phrases, two to five words.</caption:Cues>
</caption:Style>

<caption:Program id="caption-program" narrative={story} default={dialogue-caption}>
  <caption:Use role="ALICE" style={alice-caption}/>
  <caption:Use role="BOB" style={bob-caption}/>
  <caption:Use on={story.selection.product-demo} style={dialogue-caption}/>
</caption:Program>

<caption-ai:Planner id="caption-plan" narrative={story}
  program={caption-program} model="gemini-2.5-flash"/>

<caption:Track id="captions" narrative={story} map={timing.map}
  space={speech.space} program={caption-program} plan={caption-plan.plan}/>
```

ALICE 使用绿色字幕（`#73FBD3`），BOB 使用金色字幕（`#FFD166`），在 product-demo Selection 期间两者都切换为中性对话样式。`important` Field 仅应用于 ALICE 的样式——她的强调词会获得特殊处理。

## B-roll

B-roll 在语义时间位置叠加生成的或预先提供的视频/图像。

```svml
<import as="broll" from="@narratage/broll@1"/>
```

### broll:Track

B-roll 项目的容器。接收 SemanticMap 用于时间解析。

```svml
<broll:Track id="product-broll" map={timing.map} space={speech.space}>
  <broll:Item source={product-motion.video}
    during={story.selection.product-demo}
    appearance={studio.broll.product}/>
</broll:Track>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `map` | 是 | 来自 `whisperx:Alignment` 的 SemanticMap |
| `space` | 否 | ProgramSpace（某些配置需要） |

### broll:Item

每个项目将一个来源放置在语义时间位置上，并附带样式外观：

```svml
<broll:Item source={product-motion.video}
  during={story.selection.product-demo}
  appearance={studio.broll.product}/>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `source` | 是 | 视频或图像——来自 `seedance:Video`、`media:Image` 等 |
| `during` | 是 | Selection 引用——该项目何时出现 |
| `appearance` | 是 | SVS B-roll Recipe——位置、大小、适配方式、动画 |

`during` 属性接收一个 Selection 引用，如 `{story.selection.product-demo}`。B-roll 项目在屏幕上显示的时长恰好等于该 Selection 的持续时间，通过 SemanticMap 解析确定。

外观 Recipe 控制进场/退场动画：

```svs
broll.product {
  stack-order: 40;
  x: 0.08; y: 0.20; width: 0.84; height: 0.48;
  fit: contain;
  background: #111116;
  radius: 28;
  enter: slide-up 8f;
  exit: fade 6f;
}
```

**输出：**`{product-broll.visual}` —— 添加到 `film:Film` 的 VisualTrack。

### B-roll 示例

B-roll 搭配生成的 Seedance 视频，在 Script Selection 期间出现：

```svml
<seedance:Prompt id="product-direction">
  A clean vertical product film: the written script becomes semantic regions,
  then those regions assemble into a finished video.
</seedance:Prompt>

<seedance:Video id="product-motion" model="mini"
  prompt={product-direction} duration="5">
  <seedance:Reference image={product-reference} role="subject"/>
</seedance:Video>

<broll:Track id="product-broll" map={timing.map}>
  <broll:Item source={product-motion.video}
    during={story.selection.product-demo}
    appearance={studio.broll.product}/>
</broll:Track>
```

## 文字叠加层

在屏幕上显示的静态或定时文字——标题、标注、下方三分之一字幕条。

```svml
<import as="text" from="@narratage/text-track@1"/>
```

### text:Track

文字项目的容器。

```svml
<text:Track id="titles" space={speech.space}>
  <text:Item text="EDIT MEANING, NOT TIMELINES" during="full"
    appearance={studio.text.title}/>
</text:Track>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `space` | 是 | 来自 `speech:Spine` 的 ProgramSpace |
| `map` | 否 | SemanticMap——当项目使用基于 Selection 的计时时需要 |

### text:Item

每个项目是放置在某个时间位置的一段文本字符串：

```svml
<text:Item text="MEANING" during="full" appearance={studio.text.title}/>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `text` | 是 | 要显示的文本字符串 |
| `during` | 是 | 何时显示：`"full"`（整个节目时长）或 Selection 引用 |
| `appearance` | 是 | SVS 文字 Recipe——位置、字体、大小、颜色 |

`during` 属性接受字面字符串 `"full"`（表示整个节目时长），或 Selection 引用（用于语义计时）：

```svml
<text:Track id="callout" space={speech.space} map={timing.map}>
  <text:Item text="EXACTLY THE RIGHT MOMENT"
    during={story.selection.callout}
    appearance={studio.text.callout}/>
</text:Track>
```

**输出：**`{titles.track}` —— 添加到 `film:Film` 的 VisualTrack。

## 组合示例

三种 Track 类型在一个源文件中协同使用：

```svml
<import as="caption" from="@narratage/caption@1"/>
<import as="caption-ai" from="@narratage/caption-gemini@1"/>
<import as="broll" from="@narratage/broll@1"/>
<import as="text" from="@narratage/text-track@1"/>

<!-- Captions: primary style for all text -->
<caption:Style id="base-caption" appearance={studio.caption.base}>
  <caption:Cues>Prefer short complete semantic phrases.</caption:Cues>
  <caption:Field id="important" type="boolean" min-per-cue="0" max-per-cue="2">
    Select zero, one, or two words whose emphasis best communicates this Cue.
  </caption:Field>
</caption:Style>
<caption:Program id="caption-program" narrative={story} default={base-caption}/>
<caption-ai:Planner id="cue-plan" narrative={story}
  program={caption-program} model="gemini-2.5-flash"/>
<caption:Track id="captions" narrative={story} map={timing.map}
  space={speech.space} plan={cue-plan.plan} program={caption-program}/>

<!-- B-roll: generated video during a Selection -->
<broll:Track id="cards" map={timing.map} space={speech.space}>
  <broll:Item source={motion.video} during={story.selection.demo}
    appearance={studio.broll.card}/>
</broll:Track>

<!-- Text: persistent title overlay -->
<text:Track id="titles" space={speech.space}>
  <text:Item text="MEANING" during="full" appearance={studio.text.title}/>
</text:Track>

<!-- All three tracks feed into Film -->
<film:Film id="main" space={speech.space} appearance={studio.film.vertical}>
  <film:Track source={speech.visual}/>
  <film:Track source={speech.audioTrack}/>
  <film:Track source={cards.visual}/>
  <film:Track source={captions.track}/>
  <film:Track source={titles.track}/>
</film:Film>
```

每个 SVS Recipe 中的 `stack-order` 决定 z 轴排序：语音视觉层为 10，B-roll 为 40，字幕为 70，文字为 90。数值越高，渲染层越靠上。
