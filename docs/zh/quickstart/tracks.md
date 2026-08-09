---
title: 字幕、B-roll 与文字
description: 视觉 Track 组件——字幕、B-roll 叠加层和文字叠加层。
---

# 字幕、B-roll 与文字

每个进入最终合成的视听内容都是一个对等的 **Track**。Track 是扁平的（无嵌套），其 z 轴顺序由 SVS 中的 `stack-order` 属性决定。本页介绍三种主要的视觉 Track 类型：字幕、B-roll 和文字叠加层。

## 字幕系统

字幕由一套很小的公共语言与可替换的样式族组成：

```text
Script 显示全集 → Caption Program → Planner + Atom 实测时间 → 样式族 Track
```

```svml
<import as="caption" from="@narratage/caption@1"/>
<import as="caption-fine" from="@narratage/caption-fine@1"/>
<import as="caption-ai" from="@narratage/caption-gemini@1"/>
<import as="media" from="@narratage/media@1"/>
<import as="fonts" from="@narratage/fonts-open@1"/>
```

公共 Caption 只负责 Cue 字数边界、可选的通用逐词字段、完整样式分配、Plan 校验与时间
拼接。Fine 是第一种无字段样式族，负责自己的几何、字形/Cue/Pill Paint 与局部动画。

### caption-fine:Style

一个 Style 是不可拆分的“规划要求 + 渲染参数”。Fine 从一个包自有的 SVS Recipe
同时解析两者：

```svs
caption.primary {
  cue-min-words: 2; cue-max-words: 7;
  stack-order: 70; x: 0.5; y: 0.88; width: 0.84;
  anchor-x: center; anchor-y: bottom;
  font: Inter; weight: 700; size: 58; line-height: 1; align: center;
  fill: #FFFFFF; stroke-color: #09090B; stroke-width: 2;
  background: #00000000; padding: 0; radius: 0;
  karaoke: trail; karaoke-transition: wipe; active-fill: #FFD54A;
  active-box: current; active-box-continuity: isolated;
  active-box-background: #FFD54ACC; active-box-padding: 4 8; active-box-radius: 8;
  active-underline: current; active-underline-color: #FFFFFF;
  cue-enter: spring; cue-enter-frames: 6;
  active-response: pop; active-response-frames: 5; active-scale: 1.08;
}
```

```svml
<fonts:Stack id="caption-fonts" family="inter" weight="700" style="normal" emoji="color">
  <fonts:Fallback family="noto-sans-sc" weight="700" style="normal"/>
</fonts:Stack>
<caption-fine:Style id="primary-caption" recipe={studio.caption.primary}
  font={caption-fonts}/>
```

显式的 `font=` 边携带一个按字节复现的 `FontStackRef`。主字体必须与 Recipe
的 weight/style 一致；每个 Fallback 保留自己的真实字体信息。省略字体栈则明确使用
Recipe 的环境字体兜底名；Caption 和 Runtime 都不会替作者猜字体。

Recipe 同时包含 `cue-min-words`、`cue-max-words` 和完整字体/框参数。Fine 不声明任何
逐词字段；其他字幕包可以定义完全不同的字段和渲染方式，无需修改公共 Caption。

Fine 不是一组互斥预设。基础/激活渐变、描边、阴影、长阴影、外发光、下划线、Pill
和动画均为正交维度。文字、下划线和 Pill 各自选择 `off | current | trail`；因此可以
直接表达“文字保留已读色，但 Pill 只跟随当前词”。`active-box-continuity: joined` 会把
已读前缀在每个真实换行片段内连成一个背景，而不是给每个词分别套胶囊。

Fine 只在完整 Atom 之间自然换行，永不裁掉作者文字，因此有意不提供 `max-lines`。
需要控制行数时，应调整 Cue 字数边界、Track 宽度与字号。

CJK 口播可以直接书写。若一个只负责显示的 emoji 仍需跟随语音计时，应显式写出对应，
例如 `<🌐 | globe>`；系统不会替裸符号虚构一个口播词。

### caption:Program

Program 消费 Script 显式输出的完整有序显示词全集。一个必填的默认 Style 自动覆盖
所有词，不需要作者制造 `@whole` 或补集。`Use` 按源码顺序替换整个 Style，后命中
者获胜。

```svml
<caption:Program id="caption-program" display={story.caption}
  default={primary-caption}>
  <caption:Use role="ALICE" style={alice-caption}/>
  <caption:Use role="BOB" style={bob-caption}/>
  <caption:Use words={story.caption.selection.product-demo}
    style={dialogue-caption}/>
</caption:Program>
```

`role=` 是词子集查询的作者语法，不是时间条件。`words=` 接收 Selection 的字幕专用
词投影；通用 Selection 的公开值仍只有语义首尾锚点。

### caption-ai:Planner

```svml
<caption-ai:Planner id="caption-plan" display={story.caption}
  program={caption-program} model="gemini-2.5-flash"/>
```

Planner 只接收不可改写的显示 Atom/Word 与已解析好的 Style runs。它只能在完整 Atom
之间分 Cue，并给 Word id 附上样式声明的字段；Fine 没有字段。它看不到音频、时间或
Dual Text 右侧。

### caption-fine:Track

```svml
<caption-fine:Track id="captions" display={story.caption} correspondence={story.caption.correspondence} map={timing.map}
  space={speech.space} program={caption-program} plan={caption-plan.plan}/>
```

公共 Caption 先把 Plan 与独立 SemanticMap 拼接，Fine 再把所有默认/覆盖样式渲染成
一个普通的对等 `VisualTrack`：`{captions.track}`。

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
<import as="caption-fine" from="@narratage/caption-fine@1"/>
<import as="caption-ai" from="@narratage/caption-gemini@1"/>
<import as="broll" from="@narratage/broll@1"/>
<import as="text" from="@narratage/text-track@1"/>

<!-- Captions: primary style for all text -->
<caption-fine:Style id="base-caption" recipe={studio.caption.base}/>
<caption:Program id="caption-program" display={story.caption} default={base-caption}/>
<caption-ai:Planner id="cue-plan" display={story.caption}
  program={caption-program} model="gemini-2.5-flash"/>
<caption-fine:Track id="captions" display={story.caption} correspondence={story.caption.correspondence} map={timing.map}
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
