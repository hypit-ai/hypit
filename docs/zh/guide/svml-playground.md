# SVML Playground

单个 Source 的只读预览：右边是代码，左上是画面，左下是直接从 SVML 渲染出的时间轴。

```bash
pnpm svml:playground -- --source examples/talking-film-broll-preview/main.svml
# ➜  http://localhost:5179/
```

| 参数 | 含义 |
| --- | --- |
| `--source <main.svml>` | 要读取的 Author Source，必填。 |
| `--run <build.svrun>` | Run Source，用来读取其中已经指名的素材。 |
| `--port <number>` | 默认 `5179`。 |

Playground 从不写入。它没有任何可以改动你所写内容的路由，也没有编辑 Recipe 的表单
—— 那是[字幕 Playground](./caption-playground) 的职责。

## 它解决什么问题

**在任何东西被生成之前**，把 Source 当成时间轴来读。不需要 Seedance 生成、不需要
WhisperX 对齐、不需要 FFmpeg 渲染、不需要无头浏览器，就能回答「这条 B-roll 落在哪、
多长、卡片在画面里的位置对不对」。

一个只装着 `main.svml` 和它的 `.svs` 样式表的目录就能跑。不需要 package lock、
不需要 Runtime Profile、不需要构建。

## 通往同一个选中的三条路

时间轴、源码和画面是同一件事的三种视图，在任何一处选中，三处同时选中。

- **点时间轴的片段**：播放头移到它的第一帧，画面上把它框出来，源码滚动到放置它的
  那个 `<media-track:Item>`。
- **点源码里被标记的行**：结果相同。绑定了片段的行在行号旁有一条彩色竖条，所以哪里
  可点是静止可见的，不用靠鼠标扫过去发现。一对 Script 标记和它绑定的片段共用一个颜色。
- **点画面**：指针下面画的是什么就选中什么。

点击被标记的散文会落在**你点的那个标记里面**，而不是被甩到包着它的那一层的开头 ——
一个什么都不放置的标记依然有含义。

拖动标尺或轨道空白处可以 scrub。`空格` 播放/暂停，`←` `→` 逐帧（配合 `Shift` 为十
帧），`Home` / `End` 跳到首尾，`Esc` 取消选中。

## 层级

Segment 包着 Selection，Selection 还能再包 Selection。**每一层有自己的颜色**，在源码、
时间轴和画面上一致；而且**内层被框住时外层保持框住** —— 嵌套关系正是这些标记存在的
理由。同一层的两个范围是同一种东西，读起来也相同。

播放头经过的每一个范围都会被框出来，不管有没有轨道挂在它上面。

## 声音

HyperFrames **刻意只渲染无声画面**：programme audio 是独立的 Track，由 media pipeline
在最后 mux 进去。但预览不是渲染 —— 检查 B-roll 落点的前提就是能听见那句话，所以播放时
Speech Spine 自己的素材允许发声。Cutaway 保持静音，这和真实构建里的行为一致（除非显式
声明要带音频）。喇叭按钮可以关掉。

## 哪些是真实的，哪些是估算的

结构性的一切都是真实的。Placement Frame、padding、层叠顺序、动效和轨道布局，都由构建
所调用的同一批函数、从你的 Source 和样式表算出。

时间则是另一回事，顶栏的徽章会说明你正在看的是哪一种：

| 徽章 | 含义 |
| --- | --- |
| `timing: measured` | 读自已完成构建的对齐转写。 |
| `timing: estimated` | 按常速语速从 Script 文本推导。 |
| `picture: measured` | 每个元素都显示真实素材。 |
| `picture: partial` | 部分元素已有素材，其余仍是占位方块。 |
| `picture: estimated` | 尚无任何拍摄或生成产物。 |

两者是**独立的判断**。一份 Source 可以素材齐备而时间轴仍是估算的 —— 剪切点落在哪里
是关于语音的问题，不是关于文件的问题。

Playground 按以下顺序优先采用真实来源：

1. **已完成的构建。** 若 `.svml/state.sqlite` 中有构建完成的记录，它的 `timing.map`
   与 `speech.space` 会直接顶掉估算，`final.video` 成为画面。
2. **Run Source。** 用哪份时间戳是**作者的决定**，所以由 `<satisfy>` 指定：

   | 候选 | 提供什么 |
   | --- | --- |
   | `<file from="./shot.mp4" media-type="video/mp4"/>` | 你手上已有的素材。 |
   | `<value type="…" from="./timing.json"/>` | 磁盘上的一个值，例如别处产出的对齐结果。 |
   | `<build-record build="…" output="timing.map"/>` | 上一次构建已接受的值。 |

   素材是**逐元素降级**的：Take 或 Item 的来源已存在、且已在本程序的帧域内，就显示
   真实画面，否则显示占位方块。其他帧率的素材会被拒绝并说明原因，而不是重采样 ——
   归一化是真正的转码，属于 media pipeline。
3. **Script 文本。** Token 时长来自 `@narratage/estimate`，也就是流水线在生成之前
   使用的同一套音节模型。

估算出的时间轴是**比例，不是预测**：真实的剪切点会在 WhisperX 对齐真实音频之后移动。
若 store 来自更新的 schema，或其构建从未完成，Playground 会退回估算，而不是给你一条
它无法担保的「已测量」时间轴。

## 占位素材

素材是**逐元素降级**的。Take 或 Item 的来源若已经存在、且已经处于本程序的帧域内，
就显示真实画面；否则显示一个绘制出的矩形。把其他帧率的素材归一化是 media pipeline
的职责、需要真正转码，所以预览会拒绝并说明是哪个文件、为什么，而不是悄悄重采样。

占位色铺满的是整个 Placement Frame，因为 frame paint 本来就是这样工作的。凡是
Recipe 声明了 padding 的地方，会有一条虚线辅助框标出真实素材将会落在哪里。

## 它解释哪些元素

`<script>`、`<space:Canvas>`、`<space:Frame>`、`<space:AnchoredFrame>`、
`<space:AspectFrame>`、`<speech:Spine>` 及其 Take、`<media-track:Track>` 及其 Item、
`<fonts:Stack>`、`<caption-fine:Style>` 与 `<caption-fine:Track>`、用于取背景色的
`<film:Film>`，以及 `.svs` source import。

字幕会用 Source 指名的那一款字体真实绘制。Cue 的时间取自各轨读的同一份 map，按每个
Atom 对应的 Script token 定位 —— 所以字幕和 B-roll 落在同一条时间轴上，而不是另起一
套猜测。没有对应口语 token 的 Atom 才在自己的 Cue 内平分时间，顶栏会说明有多少个。

其余的一切 —— 所有生成类 Surface、`<whisperx:Alignment>`、排版轨、`<render:Video>`
—— 会被读取、计入信息条上的「not projected」，然后跳过。即使一份
Source 的大部分内容由 Provider 产出，它依然值得预览；点击那里的条目会把代码面板定位过去。

这是一个浅层解释器，不是编译器。它用 `@narratage/markup` 自己的解析器遍历所写的标记，
再调用各个包自己的纯投影函数。它从不细化图，也从不构造 Host。

## 关于 `<space:Frame>` 的一点说明

`right` 和 `bottom` 是**绝对边位置**，不是内缩量。占据父级中间 80% 的 Frame 写作
`left="8%" right="92%"`，而不是 `left="8%" right="8%"` —— 后者解出的宽度为零，会被
拒绝。Playground 会报出这一点，并高亮出错的元素。
