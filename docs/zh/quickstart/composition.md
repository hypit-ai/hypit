---
title: Film 与渲染
description: 装配并列的画面与声音贡献，再渲染所选节目区间。
---

Film 是普通作者组件。它把显式选择的 VisualTrack、AudioTrack 与一个 Canvas、一个 Timeline
组合成 Composition。渲染器再把 Composition 变成视频。

```svml
<import as="space" from="@hypit/spatial@1"/>
<import as="film" from="@hypit/film@1"/>
<import as="html" from="@hypit/html-video@1"/>
```

## 装配 Film

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>

<film:Film id="main" canvas={vertical.canvas} timeline={speech.timeline}
  appearance={recipes.film.vertical}>
  <film:Track id="picture" source={picture.visual}/>
  <film:Track source={mix.audio}/>
  <film:Track id="cards" source={cards.visual}/>
  <film:Track id="captions" source={captions.visual}/>
  <film:Track id="meaning" source={meaning.visual}/>
</film:Film>
```

| 属性 | 必填 | 含义 |
|---|---|---|
| `id` | 是 | 公开 Composition 身份 |
| `canvas` | 是 | 画面坐标系 |
| `timeline` | 是 | 有限的绝对节目范围 |
| `appearance` | 是 | Film Recipe，包括清屏颜色 |

每个 `<film:Track>` 接受一个 VisualTrack 或 AudioTrack。Film 不会发现某个输出的“兄弟端口”。
如果同一份准备媒体要同时贡献画面和声音，就分别从它声明一个 Visual Clip 和一个
Audio Clip，并在这里显式选择两边产出的 Track。

常见输出包括：

| 来源 | 类型 | 角色 |
|---|---|---|
| `{picture.visual}` | VisualTrack | Visual Track 放置的画面出现关系 |
| `{mix.audio}` | AudioTrack | Audio Track 中的语音、音乐与效果 |
| `{cards.visual}` | VisualTrack | 独立图片或视频 Clip |
| `{captions.visual}` | VisualTrack | Caption 家族 |
| `{scene.visual}` | VisualTrack | 项目组件 |

公开输出是 `{main.composition}`。

## 画面顺序属于父 Scope

Film 子项负责选择并放置贡献。每个视觉 `<film:Track>` 与 `<film:Stack>` 都携带由直属父
VisualScope 拥有的 `id`；同级成员按声明顺序从后向前绘制。组件只发布可复用的 Track 局部 programme，
不携带它在未知未来 Film 中的位置。Stack 封闭子 VisualScope，并在自身声明的位置作为一张画面进入父
Scope。id 只负责寻址，不会暗中参与绘制顺序。同一个 VisualTrack 可以通过不同成员 id 重复放置。

```svs
film.vertical { background: #09090B; }
media.speaker { fit: cover; }
media.card { fit: contain; }
caption.base { }
```

item 保持在所属 Track 的放置关系内。若多张画面、图形与文字因为共享布局或运动而需要局部交错顺序，
应由一个组件拥有该 programme 及其内部元素树或浏览器程序；仍可独立使用的贡献保持为并列 Track。

## 闭合局部视觉栈

若一组画面需要先合成为一张 Picture，并让一个 Adjustment 只作用于该组，使用 Film Stack：

```svml
<import as="adjust" from="@hypit/visual-adjustment@1"/>

<adjust:Track id="look" timeline={speech.timeline}>
  <adjust:Adjustment id="grade" during={speech.window}
    appearance={recipes.look.cinematic}/>
</adjust:Track>

<film:Film id="main" canvas={vertical.canvas} timeline={speech.timeline}
  appearance={recipes.film.vertical}>
  <film:Track id="background" source={background.visual}/>
  <film:Stack id="treated-subject">
    <film:Track id="subject" source={subject.visual}/>
    <film:Track id="look" source={look.visual}/>
  </film:Stack>
  <film:Track id="captions" source={captions.visual}/>
  <film:Track source={dialogue.audio}/>
</film:Film>
```

Stack 从透明画面开始，在父 Scope 中按自身声明位置作为一张画面进入。Adjustment 只变换该 Stack 内已经累积的
画面。AudioTrack 保持在 Film 根上，不会继承视觉 Stack 的归属。

## 渲染完整视频

```svml
<html:Video id="final"
  composition={main.composition} timeline={speech.timeline}/>
```

渲染器编译视觉贡献、捕获所需帧、渲染 AudioTrack，并复用封装为交付文件。
`{final.video}` 是普通 Resource-backed `Blob`，通常也是 Run Target。

```svml
<?svml using="@hypit/markup/run@1"?>
<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
</svrun>
```

## 渲染帧区间

```svml
<html:Video id="detail" composition={main.composition} timeline={speech.timeline}
  start-frame="240" end-frame-exclusive="360"/>
```

边界使用原 Timeline 的半开区间。30 fps 时，这个例子渲染第 8–12 秒。即使输出片段从零
开始，动画和媒体采样仍保留原节目位置。区间渲染只限制最终捕获与编码；上游工作仍由 Run
选择的图决定，因此应显式复用已接受的媒体与对齐输出。

## 完全由组件绘制的影片

Timeline 不要求语音或媒体：

```svml
<import as="time" from="@hypit/timeline-author@1"/>

<time:Clock id="animation-clock" frame-rate="30"/>
<time:Timeline id="animation" clock={animation-clock} end="8s">
  <time:Instant id="question" at="0.5s"/>
  <time:Instant id="answer" at="2s"/>
</time:Timeline>

<chat:Scene id="conversation" timeline={animation.timeline} within={canvas.bounds}
  during={animation.window}>
  <chat:Message id="question" at={animation.question} sender="Maya" text="Ready?"/>
  <chat:Message id="answer" at={animation.answer} sender="Leo" text="Let's go."/>
</chat:Scene>

<film:Film id="main" canvas={canvas.canvas} timeline={animation.timeline}
  appearance={recipes.film.main}>
  <film:Track id="conversation" source={conversation.visual}/>
</film:Film>
<html:Video id="final" composition={main.composition} timeline={animation.timeline}/>
```

组件用普通绝对时间拥有自己的阅读节奏。没有选择 AudioTrack 时，结果是静音的。在语音作品
中，Narrative Projection 可以把 Moment 或 Selection 显影成同样的绝对 Instant 与 Window 输入。

## 执行前检查

```bash
hypit check main.svml
hypit plan build.svrun
```

`check` 在不调用外部服务的情况下验证导入、类型和图边。`plan` 编译选定 Run 并显示将要
请求的 Operations。付费执行前应检查该计划。

[时间与装配](./timing.md)解释媒体准备、Timeline 构造、媒体放置与语义投影；
[Tracks](./tracks.md)解释 Visual 和 Audio 的作者形式。
