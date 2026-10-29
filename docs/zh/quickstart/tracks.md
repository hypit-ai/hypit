---
title: 轨道
description: 对等 Track 组件——字幕、媒体、排版与作者声明的音频。
---

每个进入最终合成的视听内容都是一个对等的 **Track**。Track 是一个闭合贡献，不是其他 Track 的容器；
若若干 VisualTrack 的合成结果需要作为一张画面共同处理，Film 可以用 Stack 递归分组。每条 VisualTrack
出现的 `id` 与同级序列位置由父 Film 或 Stack 持有；可复用 Track 值只保留自己的局部 programme。本页介绍
Caption、Media、Typography 与 Audio Track 的作者语法。

## 字幕系统

字幕由 Script 产生的单一文档与可替换的样式族组成：

```text
Script → CaptionDocument + NarrativeCaptionBinding
绑定 + NarrativeProjection → 完整 Unit CaptionTiming
作者 Cues + CaptionTiming + Uses → 家族呈现 Schedule → VisualTrack
```

```svml
<import as="caption" from="@hypit/caption@1"/>
<import as="caption-fine" from="@hypit/caption-fine@1"/>
<import as="media" from="@hypit/media@1"/>
<import as="fonts" from="@hypit/fontsource@1"/>
```

公共 Caption 负责包含有序 Word、对应 Unit 和作者 Cue 的 CaptionDocument，以及完整 Alignment Unit 的 Selection/Role 查询、样式分配与扁平 Timeline 时间连接。Fine 是一种样式族，负责呈现这些 Cue，并拥有自己的几何、字形/Cue/Pill Paint 与局部动画。

### caption-fine:Style

一个 Style 是从包自有 SVS Recipe 解析出的渲染意图：

```svs
caption.primary {
 x: 0.5; y: 0.88; width: 0.84;
  height: 0.22;
  anchor-x: center; anchor-y: bottom;
  size: 58; line-height: 1;
  align: center; block-align: end; inline-size: fixed;
  wrap: word; max-lines: 2; max-words-per-line: 4;
  fill: #FFFFFF; stroke-color: #09090B; stroke-width: 2;
  background: #00000000; padding: 0; radius: 0;
  karaoke: trail; karaoke-transition: wipe; active-fill: #FFD54A;
  active-box: current; active-box-continuity: isolated;
  active-box-background: #FFD54ACC; active-box-padding: 4 8; active-box-radius: 8;
  active-underline: current; active-underline-color: #FFFFFF;
  cue-enter: spring; cue-enter-frames: 6;
  active-response: pop; active-response-frames: 5; active-scale: 1.08;
  lead-frames: 4; tail-frames: 4; handoff: cut;
}
```

```svml
<fonts:Face id="caption-latin" package="@fontsource-variable/inter" weight="700" style="normal"/>
<fonts:Face id="caption-han" package="@fontsource-variable/noto-sans-sc" weight="700" style="normal"/>
<media:FontStack id="caption-fonts" primary={caption-latin}>
  <media:Fallback font={caption-han}/>
</media:FontStack>
<caption-fine:Style id="primary-caption" recipe={recipes.caption.primary}
  font={caption-fonts}/>
```

必填的 `font=` 边携带一个按字节复现的 `FontStackRef`。字体家族、字重和字形只在这条边上声明一次；每个 Fallback 保留自己的真实字体信息。省略字体栈会在编译时失败，不会退回当前机器上的同名字体。

Cue 成员由 Script 的 Segment、Role 和作者写出的 `||` 决定；样式变化不改写 Cue。Fine 不声明任何
逐词规划字段；其他字幕包可以定义完全不同的渲染方式，无需修改公共 Caption。

Fine 不是一组互斥预设。基础/激活渐变、描边、阴影、长阴影、外发光、下划线、Pill
和动画均为正交维度。文字、下划线和 Pill 各自选择 `off | current | trail`；因此可以直接表达“文字保留已读色，但 Pill 只跟随当前词”。`active-box-continuity: joined` 会把已读前缀在每个真实换行片段内连成一个背景，而不是给每个词分别套胶囊。

包在 Author Declaration 中把参数分成 **Where / How / When**，Studio 直接消费这份作者协议，无需再维护字幕专用参数全集。`lead-frames`、`tail-frames` 先产生显式可见 Schedule；`handoff: cut` 负责相邻 Cue 的交接，`overlap` 则保留双方包络。二者都不会修改 Karaoke 使用的原始词帧。

`wrap: word` 优先在完整 Alignment Unit 之间换行；单个显示单元若比 Region 还宽，会继续在内部回退换行，不会逃出范围。`max-words-per-line` 直接构造真实行；声明 `max-lines` 后，超过行数预算的 Cue 会被拒绝，不会裁掉文字、描边、阴影或外发光。Cue 分界由 Script 的结构和 `||` 决定。

Fine 是“统一文字流”字幕：同一 Cue 的每个 token 遵守同一 Recipe，只允许时间、顺序和播放状态驱动差异。若 Cue 内存在不同字体/布局角色、全屏反色、撕裂或前后语块之间的合成关系，就应新建另一个 Caption 包，而不是给 Fine 塞隐藏例外。

CJK 口播可以直接书写。若一个只负责显示的 emoji 仍需跟随语音计时，应显式写出对应，例如 `<🌐 | globe>`；系统不会替裸符号虚构一个口播词。

### caption-fine:Caption

字幕内容来自 Script 和 Timeline；Use 决定某段时间的呈现方式。后声明的 Use 在窗口内覆盖前面的样式，隐藏也遵守这个规则。

```svml
<caption:Hidden id="hidden"/>
<narrative-caption:Timing id="story-captions" document={story.caption}
  binding={story.caption-binding} projection={story-time}/>
<caption-fine:Caption id="captions" document={story.caption} timing={story-captions}
  timeline={speech.timeline} within={vertical.bounds}>
  <caption-fine:Use style={primary-caption}/>
  <caption-fine:Use role="ALICE" style={alice-caption}/>
  <caption-fine:Use role="BOB" style={bob-caption}/>
  <caption-fine:Use during={product-demo-window} style={dialogue-caption}/>
  <caption-fine:Use during={private-window} style={hidden}/>
</caption-fine:Caption>
```

`||` 决定 Cue 分组。窗口可以从 Cue 中间开始，完整文字和原来的逐词时间仍然保留。`role`
按说话人过滤内容，独立于时间窗口。需要限定时间的 Use 通过 `during` 引用已经解析的绝对 Window。

## Visual Clip 与 B-roll

B-roll 是 Visual Clip 的一种剪辑用途，不是独立 Track 家族。一个 Clip 可以在语义或绝对窗口内放置图片、生成视频、已准备的含时素材或 Compositable Surface。

```svml
<import as="visual" from="@hypit/visual-track@1"/>
<import as="transition" from="@hypit/visual-transition@1"/>
<import as="time" from="@hypit/timeline-author@1"/>
<import as="wording" from="@hypit/text@1"/>
<time:Clock id="clock" frame-rate="30"/>
```

### visual:Track 与 visual:Clip

位置是一条显式 Spatial Frame 边。fit 与源时间映射直接属于这次出现；像素处理
Recipe 与类型化 Motion 都只是可选的复用值：

```svml
<wording:Value id="product-direction">
  A clean vertical product film: the written script becomes semantic regions,
  then those regions assemble into a finished video.
</wording:Value>

<seedance:ReferenceVideo id="product-motion" model="mini"
  prompt={product-direction} duration="5">
  <seedance:Reference image={product-reference} person-reference="false"/>
</seedance:ReferenceVideo>

<space:Frame id="product-frame" within={vertical.bounds}
  left="8%" top="20%" right="92%" bottom="68%"/>

<mediaop:Prepare id="product-media" source={product-motion.video}
  video="primary-moving" audio="none" span-authority="video"/>

<visual:Motion id="product-motion-in">
  <visual:Pose at="start" y="80" opacity="0" easing="ease-out"/>
  <visual:Pose at="8f" y="0" opacity="1"/>
  <visual:Pose at="end" y="0" opacity="1"/>
</visual:Motion>

<visual:Track id="product-broll" timeline={speech.timeline}>
  <visual:Clip media={product-media.media} frame={product-frame}
    during={product-demo} fit="contain"
    treatment={recipes.visual.product} motion={product-motion-in}>
    <visual:Map/>
  </visual:Clip>
</visual:Track>
```

`visual:Map` 增加一段精确仿射源时间关系。源位置需要非线性变化时，使用单调的
`visual:Curve`；target 参数保持线性，四个必填值都是 PreparedMedia 局部域里的位置：

```svml
<visual:Clip media={product-media.media} frame={product-frame}
  during={product-demo} fit="contain">
  <visual:Curve source-at-start="start" source-control-1="start+250ms"
    source-control-2="end-250ms" source-at-end="end"/>
</visual:Clip>
```

Curve 只声明 `target time -> source position`。补帧或光流属于 Renderer 政策，不进入 Track 关系。

`left`、`top`、`right`、`bottom` 是父 Frame 内的边坐标；`right` 和 `bottom` 不是 CSS 式外边距。
Narrative 投影可以在上游发布 `product-demo`；Visual Track 只消费完成的 Window。同一个
fit 是构造 Clip 源局部平面到节目画面 `SpatialMap2D` 的常用入口；解析后的 Program 保存 Map，
而不是另存一个“内容框”。当组件或源局部证据已经拥有精确仿射关系时，可以声明
`<space:Map>`，并用 `mapping={...}` 代替全部 fit 属性。Clip 的 `frame` 仍独立负责裁剪和外框处理。
同一个
Clip 模型也能表达全屏切换、分屏和角落小窗。公开 Clip 只有一个来源。Transition 显式连接两个相邻
Clip occurrence，并引用由效果包拥有的 effect；更广泛的多来源、多 Clip 关系属于组件，而不是内置 Sequence 语法。

### Clip 之间的 Transition

先让两个 Clip 各自声明真实且重叠的 Window，再制作 effect 并显式指认关系。两个 Window 的完整交集就是
Transition span；Hypit 不根据时间邻近猜参与者、不要求作者重复声明交集，也不虚构 source handle。
两个 Clip 必须在 Track 顺序中相邻，且 outgoing 先开始、先结束；包含关系或多画面编排属于组件关系，
不是普通镜头交接。

```svml
<transition:CrossDissolve id="soft-mix" easing="ease-in-out"/>

<visual:Track id="cut" timeline={speech.timeline}>
  <visual:Clip id="wide" media={wide.media} during={wide-window} frame={full} fit="cover"/>
  <visual:Clip id="close" media={close.media} during={close-window} frame={full} fit="cover"/>
  <visual:Transition id="wide-to-close"
    outgoing="wide" incoming="close" effect={soft-mix}/>
</visual:Track>
```

重叠期间两个 Clip 仍分别使用自己的 TemporalMap。Visual Track 只验证关系，效果包负责如何组合两张各自含时的
画面；更复杂的视听联动仍由组件负责。

官方包还提供 `DipToColor`、`Push`、`Slide`、`LinearWipe`、`Iris`、`ZoomDissolve` 和
`BlurDissolve`。例如：

```svml
<transition:Push id="push-left" direction="left" easing="ease-in-out"/>
<transition:LinearWipe id="wipe-right" direction="right"/>
<transition:BlurDissolve id="blur-mix" radius="24"/>
```

声明产生一个效果值；同一个 `visual:Transition` 关系按剪辑需要选择相应效果。直接切镜不需要声明 Transition。

每个直接 Clip 或采样 Layer 都必须且只能声明一种视觉输入形式：

| 输入 | 值 | 含义 |
|---|---|---|
| `image={...}` + `picture="srgb"` + `extent={...}` | Blob + 显式像素解释 + 作者声明的像素尺寸 | 没有自带时长的静态图 |
| `media={...}` | `PreparedMedia` | 直接连接显式准备好的含时素材 |
| `surface={...}` | `CompositableSurfaceRef` | 直接连接带透明度语义的静态或含时 Surface |

生成或导入的视频 Blob 经 `<mediaop:Prepare>` 进入 Track：它检查该 Blob、选出其中的流，并保留精确的源时间关系而不选择 Film 帧钟；输出的 `.media` 即 `media=` 所连接的值。视觉消费者只在需要执行时，才按 Track 的 Timeline 求值。输入名必须显式，是为了绝不靠猜测把一个通用 Blob 当成图片或视频。

**输出：**`{product-broll.program}` 与 `{product-broll.visual}`。音频始终在 Audio Track
中单独声明；这里连接 PreparedMedia 不会顺带选择它的音频成员。

### 复用一个闭合的视听 Composition

完整的子 Composition 可以直接进入另一个 Film，不必先导出成视频。先声明一次 occurrence，
再把画面和声音分别投影成普通的对等 Track：

```svml
<import as="nest" from="@hypit/composition-clip@1"/>

<nest:Occurrence id="intro-use" timeline={program.timeline}
  source={intro.composition} during={intro-window}/>
<nest:Visual id="intro-picture" timeline={program.timeline}
  picture={working-picture} occurrence={intro-use.occurrence} frame={layout.full}/>
<nest:Audio id="intro-sound" timeline={program.timeline}
  occurrence={intro-use.occurrence} gain="1" fade-in="0f" fade-out="0f"/>
```

`Occurrence` 是目标局部时间到子 Timeline 的唯一关系所有者；需要循环、倒放、停帧或变速时，
在其中加入 `Map` 或 `Curve`。`Visual` 与 `Audio` 可以单独使用，也可以一起进入 Film；二者消费
同一关系，不各自推导时间。当前视觉复用要求父子声明完全相同的 Working Picture；音频使用固定的
48 kHz stereo programme 环境。Renderer 递归求值子作品，不会把中间视频写成作者值。

## Audio Track

`@hypit/audio-track` 把显式准备好的音频放进与视觉 Track 相同的 Timeline。`Clip`
消费 `PreparedMedia`；先准备已声明或生成的音频 Blob，再选择精确节目窗口与源时间关系：

```svml
<import as="media" from="@hypit/media@1"/>
<import as="mediaop" from="@hypit/media-operations@1"/>
<import as="audio" from="@hypit/audio-track@1"/>
<import as="time" from="@hypit/timeline-author@1"/>

<time:Clock id="clock" frame-rate="30"/>
<media:Audio id="music" src="./assets/music.wav"/>
<mediaop:Prepare id="music-media" source={music}
  video="none" audio="default" span-authority="audio"/>

<audio:Track id="music-bed" timeline={speech.timeline}>
  <audio:Clip source={music-media.media} during={speech.window}
    gain="0.28" fade-in="600ms" fade-out="800ms">
    <audio:Map target-at="end" source-at="end" rate="1"
      wrap-from="start" wrap-until="end"/>
  </audio:Clip>
</audio:Track>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `Track.id` | 是 | 稳定的 Audio Track 身份 |
| `Track.timeline` | 是 | 定义精确采样域与帧域的 Timeline |
| `Clip.source` | 是 | 显式选流后的 `PreparedMedia` |
| `during` | 是 | 具名绝对 Window |
| `Map` / `Curve` 子节点 | 否 | 该 Clip occurrence 自有的目标时间到源时间偏函数；省略时为有界局部恒等映射 |
| `reconstruction` | 否 | 显式、由包拥有的信号重建；省略时采用普通逐点取样 |
| `gain`、`fade-in`、`fade-out` | 否 | 显式的单 Clip 混音值 |

该包不会自动提取、物化、duck 或分配 bus。同一 Track 内的多个 Clip 与多个对等 Audio
Track 都会作为独立输入进入 Film。输出 `{music-bed.audio}` 是普通 `AudioTrack`。

默认本地 Renderer 会在普通逐点取样下，把 affine、reverse、hold、wrap、gap、cubic 与多阶段 Map
统一作为源位置关系求值。若恒速变速需要保持音高，从 `@hypit/audio-stretch@1` 声明
`<stretch:PreservePitch id="natural"/>`，再以 `reconstruction={natural}` 显式引用。速度仍只存在于 Map；
本地 Provider 当前对完整的正向、非循环仿射关系支持 PreservePitch，并准确拒绝其他形态。

需要显式设置 gain，并把若干 AudioTrack 闭合成一个贡献时，使用 Audio Mix：

```svml
<import as="mix" from="@hypit/audio-mix@1"/>
<mix:Track id="dialogue" timeline={speech.timeline}>
  <mix:Input id="host" source={host.audio}/>
  <mix:Input id="guest" source={guest.audio} gain="0.9"/>
</mix:Track>
```

输出 `{dialogue.audio}` 仍是普通 AudioTrack。Film 只看到这个闭合输出；Audio Mix 不会归一化、限幅、
发明 Master，也不会按 Track 名寻址。

## 文字叠加层

在屏幕上显示的静态或定时文字——标题、标注、下方三分之一字幕条。

```svml
<import as="text" from="@hypit/text-fine@1"/>
<import as="wording" from="@hypit/text@1"/>
```

### text:Flow、text:Point 与 text:Path

细粒度文字没有聚合容器。每个独立标题、标签或短篇编辑文字都是一个 occurrence，并各自
产生一条普通 VisualTrack 贡献。

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="title-frame" within={vertical.bounds}
  left="6%" top="6%" right="94%" bottom="16%"/>
<fonts:Face id="title-font" package="@fontsource-variable/inter" weight="900" style="normal"/>
<text:Style id="title-style" recipe={recipes.text.title} font={title-font}/>
<text:Flow id="title" timeline={speech.timeline} within={title-frame}
  style={title-style} align="center" during={speech.window}>
  EDIT MEANING, NOT TIMELINES
</text:Flow>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `timeline` | 是 | 拥有 occurrence 窗口的绝对 Timeline |
| `during` | 是 | 一个具名绝对 Window |
| `within`、`point` 或 `path` | 是 | 与 `Flow`、`Point` 或 `Path` 对应的位置 |
| `style` | 是 | 由 SVS Recipe 与精确字体字节编译出的 Style |
| 形式布局 | 否 | `Flow` 的对齐/换行、`Point` 的锚定或 `Path` 的边距/方向，只写在对应 occurrence 上 |

每个 occurrence 都明确选择一种位置形式、一份精确 Style 和一个绝对时间表达式。`Flow`
把流式文字放入 `SpatialFrame`：

```svml
<text:Flow id="meaning" timeline={speech.timeline} within={title-frame}
  style={title-style} align="center" during={speech.window}>
  MEANING
</text:Flow>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 稳定的文字 occurrence 身份 |
| 子内容或 `content` | 是 | 内联纯文本/富文本，或普通图 `Text` 引用；两种形式互斥 |
| 时间 | 是 | `during={具名 Window}` |
| 位置 | 是 | 与 occurrence 形式匹配的 `SpatialPoint`、`SpatialFrame` 或 `SpatialPath` |
| `style` | 是 | 由 SVS Recipe 与精确字体字节共同编译出的 `text:Style` |
| 形式布局 | 否 | 所选 `Flow`、`Point` 或 `Path` 直接声明的布局属性 |

`speech.window` 表示完整 Timeline。作者声明的 Timeline Window，或者上游语义、节拍等
领域的投影，也可以提供普通的绝对 Window；细粒度文字组件不认识这个 Window 来自哪个领域：

```svml
<text:Style id="callout-style" recipe={recipes.text.callout} font={title-font}/>
<text:Flow id="callout-copy" timeline={speech.timeline} within={callout-frame}
  style={callout-style} during={program.callout}>
  EXACTLY THE RIGHT MOMENT
</text:Flow>
```

图中产生的文字会保留为显式边：

```svml
<wording:Value id="headline">EXACTLY THE RIGHT MOMENT</wording:Value>
<text:Flow id="callout-copy" timeline={speech.timeline} content={headline}
  within={callout-frame} style={callout-style} during={speech.window}/>
```

通用 `Text` 只提供字符；Typography 仍然拥有文档包装、位置、时间、样式与动画。作者需要富文本
片段时，继续使用内联 `P`/`Span`/`Break`。

每个 occurrence 发布 `{callout-copy.occurrence}` 供同族文字工具使用，并发布
`{callout-copy.visual}` 供 `film:Film` 使用。多个无关标题仍是 Film 的多个显式输入；若它们
共享行为，应由项目组件负责协调，而不是偶然聚成一条文字集合。

## 榜单板

榜单板让一份有序列表跟着 Script 动起来。Ranking、Depth Stack 与 Comment Sticker 是可选包，不随默认
Hypit 安装。使用前先把所选发布版本写入视频项目的普通 `package.json` 与 lockfile，再检查已安装包的词汇。
具体容器、条目和 Style 仍由各包自己声明。

| 容器 | 条目 | 样式 |
|---|---|---|
| `ranking:Column` | `ranking:ColumnItem` | `ranking:ColumnStyle` |
| `ranking:TopThree` | `ranking:TopThreeItem` | `ranking:TopThreeStyle` |

```bash
npm install @hypit/ranking
```

```svml
<import as="ranking" from="@hypit/ranking@1"/>
```

### 样式标签

标签必须为空，三个属性全部必填：`id`、`recipe`（一份 SVS Recipe）与 `font`（Font Stack 或字体产物）。Recipe 由选中的组件变体定义，其他组件族的 Recipe 会被指名拒绝。

### 容器标签

| 属性 | 取值 |
|---|---|
| `timeline` | 板据以计时的绝对 Timeline |
| `within` | 所选板型拥有独立揭示区或讲解区时使用的 `space:Frame` |
| `frame` | 一个 `space:Frame`——选中组件声明的板面位置 |
| `during` | 选中组件声明的时间形式 |
| `style` | 对应的样式记录，且只接受本变体的 |
| `terminal` | 完整板定格的绝对 Instant。仅 `TopThree` |
| `appear-sound`、`move-sound` | 可选，带音频成员的 `PreparedMedia` |

只使用所选包明确声明的时间形式；不要从另一个组件族推断 terminal 或 reveal 规则。

### 条目标签

每个变体只接受自己的那一种，至少一个，且 id 在同一块板内不可重复。

- **`TopThreeItem`** —— `label` 与 item 自己的具名绝对 Instant `at` 必填，可选 `icon` 与
  `stack`，最多三条。揭示顺序由这些 Instant 的真实帧顺序决定。
- **`ColumnItem`** —— `label` 与 `rank` 必填，可选 `icon` 与 `stack`。非 preset item 用
  `during` 引用自己的绝对 Window；`preset="true"` 的 item 开场已在位且不写 `during`。

```svml
<ranking:ColumnStyle id="board-style" recipe={recipes.ranking.board} font={ui-font}/>
<ranking:Column id="board" timeline={speech.timeline} within={vertical.bounds} frame={board-frame}
  during={board} style={board-style}>
  <ranking:ColumnItem id="row-regen" rank="1" label="ReGen" icon={icon-regen}
    during={regen-reveal}/>
  <ranking:ColumnItem id="row-chatgpt" rank="2" label="ChatGPT" icon={icon-chatgpt}
    during={chatgpt-reveal}/>
  <ranking:ColumnItem id="row-remini" rank="3" preset="true" label="Remini" icon={icon-remini}/>
</ranking:Column>
```

**输出：** `{board.visual}`——一条 VisualTrack。带了声音的板还会导出 `{board.audio}`，一条 AudioTrack；没有声音时就没有这个输出。

## 卡片堆

卡片堆按深度排布卡片：一张在最前，其余向后退去，每张新卡在一个 Instant 上发出。Visual Clip 是把一个镜头放进一个 Frame，而卡片堆是在同一个 Frame 里维持一叠并整体移动它们。

```bash
npm install @hypit/depth-stack
```

```svml
<import as="deck" from="@hypit/depth-stack@1"/>
```

### deck:DepthStack

`id`、`timeline`、`frame`、`appearance` 与 `until` 全部必填。`until` 引用具名
绝对 Instant；它既可以来自 Narrative Projection，也可以来自直接时间声明。

### deck:Card

DepthStack 的直接子元素，自闭合，至少一张，按书写顺序发出。

| 属性 | 取值 |
|---|---|
| `source` | 必填——静态图片、PreparedMedia 或 Compositable Surface |
| `extent` | 静态图片必填，其余情况给了会被拒绝 |
| `picture` | 静态图片必填（`srgb`），其余情况给了会被拒绝 |
| `at` | 必填——具名绝对发牌 Instant |
| `appearance` | 可选——它自己的 Recipe，否则沿用整叠的 |
| `label` | 可选——一条 `deck:Label` 记录 |

### deck:Label

`id` 与 `font` 必填。文案来自 `content=` 引用或元素自身的文字，两个都给会被拒绝。`size`、`color`、`align`、`block`、`padding` 可选。

```svml
<space:Frame id="deck-frame" within={vertical.bounds} left="44%" top="60%" right="98%" bottom="88%"/>
<deck:DepthStack id="deck" timeline={speech.timeline}
  frame={deck-frame} appearance={recipes.deck.stack} until={done}>
  <deck:Card id="card-spatial" source={icon-spatial} extent={square} picture="srgb" at={deal-one}/>
  <deck:Card id="card-type" source={icon-type} extent={square} picture="srgb" at={deal-two}/>
</deck:DepthStack>
```

**输出：** `{deck.visual}`——一条 VisualTrack，与 Film 中其它每一条 Track 平级。

## 评论贴纸

放置在 Frame 中的社交风格评论卡：头像、作者、评论正文，以及可选的一行附注。

```bash
npm install @hypit/comment-sticker
```

```svml
<import as="comment" from="@hypit/comment-sticker@1"/>
```

`comment:Style` 必须为空，接受 `id`、`recipe` 与 `font`，全部必填。Recipe 承载整张卡的外观——背景、描边、圆角、气泡尾、头像、三行文字，以及进入/停留/退出的动效——每个键都有默认值，所以一份 recipe 只需写它要改的部分。

`comment:Track` 接受 `id` 与 `timeline`，两者皆为必填。

`comment:Sticker` 必填 `id`、`frame`、`style` 与 `during`；`during` 引用具名绝对 Window。
文案来自 `comment=` 属性或元素自身的文字，两个都给会被拒绝。可选的 `author`、`header` 与
`meta` 各接受字符串或 Text 引用，`avatar` 接受一张图片；这里没有组件级 `z`。可选的
`stack-order` Recipe 值只排列同一条 Track 内的 Sticker；Film 再把整条 Track 放进父 Scope。

```svml
<comment:Style id="social" recipe={recipes.comment} font={ui-font}/>
<comment:Track id="comments" timeline={speech.timeline}>
  <comment:Sticker id="one" frame={comment-frame} style={social} avatar={viewer-avatar}
    author="@viewer" meta="Featured" during={reaction}>
    原来它把字幕钉在词上，而不是钉在秒上。
  </comment:Sticker>
</comment:Track>
```

**输出：** `{comments.visual}`——一条 VisualTrack。

## 组合示例

四类 Track 在一个源文件中协同使用：

```svml
<import as="caption" from="@hypit/caption@1"/>
<import as="caption-fine" from="@hypit/caption-fine@1"/>
<import as="fonts" from="@hypit/fontsource@1"/>
<import as="media" from="@hypit/media@1"/>
<import as="mediaop" from="@hypit/media-operations@1"/>
<import as="visual" from="@hypit/visual-track@1"/>
<import as="text" from="@hypit/text-fine@1"/>
<import as="audio" from="@hypit/audio-track@1"/>
<import as="space" from="@hypit/spatial@1"/>
<import as="time" from="@hypit/timeline-author@1"/>

<time:Clock id="clock" frame-rate="30"/>

<!-- Captions: primary style for all text -->
<fonts:Face id="caption-font" package="@fontsource-variable/inter" weight="700" style="normal"/>
<fonts:Face id="title-font" package="@fontsource-variable/inter" weight="900" style="normal"/>
<caption-fine:Style id="base-caption" recipe={recipes.caption.base} font={caption-font}/>

<caption-fine:Caption id="captions" document={story.caption} timing={story-captions}
  timeline={speech.timeline} within={vertical.bounds}>
    <caption-fine:Use style={base-caption}/>
  </caption-fine:Caption>

<!-- 共享位置是显式边，与 Media/Text 外观分开。 -->
<space:Canvas id="vertical" width="1080" height="1920"/>

<space:Frame id="title-frame" within={vertical.bounds}
  left="6%" top="6%" right="94%" bottom="16%"/>

<space:Frame id="card-frame" within={vertical.bounds}
  left="10%" top="20%" right="90%" bottom="70%"/>

<!-- Media：Selection 期间显示一个普通 Clip -->
<mediaop:Prepare id="card-media" source={motion.video}
  video="primary-moving" audio="none" span-authority="video"/>
<visual:Track id="cards" timeline={speech.timeline}>
  <visual:Clip media={card-media.media} frame={card-frame}
    during={demo} fit="cover" treatment={recipes.visual.card}/>
</visual:Track>

<!-- Text: persistent title overlay -->
<text:Style id="title-style" recipe={recipes.text.title} font={title-font}/>
<text:Flow id="meaning" timeline={speech.timeline} within={title-frame}
  style={title-style} align="center" during={speech.window}>
  MEANING
</text:Flow>

<!-- Audio：先准备一份已声明素材，再把它放满整个节目 -->
<media:Audio id="music" src="./assets/music.wav"/>
<mediaop:Prepare id="music-media" source={music}
  video="none" audio="default" span-authority="audio"/>
<audio:Track id="music-bed" timeline={speech.timeline}>
  <audio:Clip source={music-media.media} during={speech.window}
    gain="0.28" fade-in="600ms" fade-out="800ms">
    <audio:Map target-at="end" source-at="end" rate="1"
      wrap-from="start" wrap-until="end"/>
  </audio:Clip>
</audio:Track>

<!-- 所有对等 Track 都进入 Film -->
<film:Film id="main" canvas={vertical.canvas} timeline={speech.timeline} appearance={recipes.film.vertical}>
  <film:Track id="picture" source={picture.visual}/>
  <film:Track source={mix.audio}/>
  <film:Track id="cards" source={cards.visual}/>
  <film:Track id="captions" source={captions.visual}/>
  <film:Track id="meaning" source={meaning.visual}/>
  <film:Track source={music-bed.audio}/>
</film:Film>
```

本例的 Recipe 将已放置的画面放在 10，Visual Clip 放在 40，字幕放在 70，文字放在 90。
数值越高，绘制位置越靠前；作者按作品需要选择这些关系。
