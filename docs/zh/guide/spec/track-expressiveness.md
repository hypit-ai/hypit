---
title: SVML Track 表现力门
description: E1–E8 全部门均可执行；仓库内部的 `svml.visual-track@1` 窄腰在公开发布前冻结。
---

# SVML Track 表现力门

状态：E1–E8 全部门均可执行；仓库内部的 `svml.visual-track@1` 窄腰在公开发布前冻结。

## 目的

一份公开的 Track 合同必须解决最终的视听合成问题，同时不假装所有作者包都共用同一套创作模型。Text、
Caption、Media、Ranking 以及未来的包各自拥有自己的 Program，并且可以各自独立地修订这些 Program。
它们只有在把包内专有含义 lower 成自包含、帧精确的贡献之后，才能进入 Composition。

这道门只回答一个问题：

> 生产中实际使用的文字、媒体盒、字幕、层叠与局部特效行为，能否在不向 Track、Composition 或 Core
> 添加包族专有字段的前提下，lower 进同一条 Track 窄腰？

通过这道门并不会产生一个统一的 `TrackProgram`。Track Program 的六条轴——内容、时间源、窗口投影、
空间源、占位与呈现——仍然是给包作者的分离纪律，而不是六个强制的公开字段。共享的创作法则和当前的
时间设计在 [`track-authoring.md`](./track-authoring.md) 中定义。

## 三个绝不能塌陷的层级

```text
Package Program              Resolved package facts              Public Track
───────────────────────      ────────────────────────────        ─────────────────────
TextLayout / CaptionMode     boxes, glyph runs, windows          Presents
Media sampling policy   ->   source-time and crop mapping   ->   exact frame spans
effect recipe                local animations                    absolute stacking
semantic/spatial locator     final placement                     self-contained elements
```

Package Program 是可编辑的作者真相。Resolved package facts 是编译器证据。公开 Track 是终端的视听贡献。
Composition 绝不能从第三层反推出前两层。

“扁平 Track”意味着不存在 Track 嵌套，也不存在隐式的 Track 层叠上下文。一个 Present 仍然可以拥有自己
内部的 element 树。一条创作 Track 可以在互不相关的绝对层叠位置上输出多个 Present，从而让对等 Track
能够穿插在它们之间。

## 必需的见证

### E1 —— Text 三盒 lowering

官方面向浏览器的参考 lowering 必须能够独立表达：

1. 一个外层 placement frame；
2. 一个控制折行、对齐、方向和溢出的内层 layout box；
3. 面向完整 frame、收缩包裹的内容、每一行或每一个词的 paint 目标。

辉光或阴影这类 paint 溢出，不能仅仅因为它可见于内容盒之外，就变成行测量的输入。包可以通过把 paint
挂到自己拥有的另一个 element 上来 lower 一个 paint 目标；公开 Track 绝不能因此获得
`textBackgroundTarget` 字段。

### E2 —— Caption range/cue/content lowering

Caption 包必须能够 lower 出一个硬性的区间边界、一个 cue 级的对齐/动画容器、收缩包裹的行，以及可以
独立设置样式或动画的词。双字体和逐词 paint 都是包内事实。Composition 只看到普通的 element 与 Present。

### E3 —— Media 双帧 lowering

media 包必须能够 lower 出一个已解析的 Placement Frame，其中包含同一个 Artifact 的两次独立采样。每次
采样按 [`spatial-layout.md`](./spatial-layout.md) 推导自己的 Content Frame：

- 一个背景采样，带自己的 cover/zoom/blur/tone 处理；
- 一个前景采样，带自己的 contain/cover/fit-height 与焦点对齐。

公开 Track 绝不能因此获得 B-roll、焦点预设或模糊背景字段。Artifact 依赖收集必须对共享的内容摘要去重。

### E4 —— 独立的绝对层叠

一个包可以在某个绝对层叠位置输出一块 board，同时在其他位置输出图标或标签。来自另一条 Track 的 Present
必须能够出现在它们之间。Track 身份只是把一份自包含的渲染贡献归组；来源信息存在于 Graph/Derivation 中，
而 Track 永远不构成渲染层叠上下文。

### E5 —— 局部 motion 与交接

帧精确的 opacity、transform、filter 与 clip 动画，可以作用在某一个 Present 所拥有的 element 上。同时
拥有交接双方素材的包，可以 lower 出互补的 Present。任何普通 Track 都不得采样其下方已累积的像素，也不得
修改同级 Track。

Media 包还必须额外证明：进入、维持、退出、逐层采样 motion 与 Sequence 配对交接，始终是分离的通道并具有
固定的合成顺序。独立的 Depth-Stack Deck 包必须证明其集合状态的重排能与 Card 局部 motion 组合，且不会把
Deck 含义带进终端 Track。完整模型在 [`media-track.md`](./media-track.md) 和
[`deck-track.md`](./deck-track.md) 中定义。

### E6 —— 物化的视觉兜底

如果某个组件的确定性视觉结果无法用参考 element 树表达，它必须能够把自己拥有的结果物化，并作为带类型的
Surface 贡献出来。为了实现透明穿插，最终的公开合同必须绑定足够的 surface 信息，以区分可合成的带 alpha
视觉与不透明视频。仅仅命名一个 `.webm` Artifact 并不能证明这一性质。

### E7 —— 通用音频 lowering

官方 Audio 包必须能把任意显式的归一化源、源裁切、一次性播放、循环、有界的保持音高拉伸、起止对齐、增益
与淡入淡出，全部 lower 进同一条对等的 `AudioTrack` 窄腰。重叠的 clip 混合时不做优先级裁剪，也没有特权
的 Base 声道。容器流选择、响度处理与 Provider 放置仍然是上游或下游图中显式的工作。完整边界在
[`audio-track.md`](./audio-track.md) 中定义。

### E8 —— 自包含的屏幕叠加

全画布特效必须 lower 成普通的绝对层叠 Present，由自己拥有的 Visual IR element 或自己拥有的带 alpha
Surface 构成。它不能读取已累积的下层合成结果，不能预留最高 z-index，也不能引入合成后阶段。因此无源的
模糊、调色和真实的 zoom-blur 都会 fail closed；它们诚实的形态是在 Screen Overlay 包之外消费显式的媒体或
Surface 输入。参见 [`screen-overlay.md`](./screen-overlay.md)。

## 旧系统攻击矩阵

| 历史行为 | 包所拥有的真相 | 必需的终端见证 |
|---|---|---|
| Text 的 placement/layout/paint 盒 | Text Program | 自己拥有的嵌套 element |
| frame/content/line/word 背景 | Text Program | paint 挂在所选的自有层级上 |
| caption 的 range/cue/content 盒 | Caption Program | 自己拥有的嵌套 element 与词级局部动画 |
| 双字体、中日韩、emoji 与书写方向 | Text/Caption Program | 文本 element 加锁定的字体/布局依赖 |
| 媒体内容盒加前景/背景采样 | media 包 | 引用同一个 Artifact 的同级媒体 element |
| 焦点裁切与 fit-height | media 包 | 确定性的采样/放置结果 |
| 全画幅 B-roll、角落 GIF 与下方媒体卡 | Media Item + Recipe | 同一个 Item 对不同 Frame 的 lowering |
| 显式的媒体替换组 | Media Sequence | 协同的自有 outgoing/incoming Present |
| 可见的卡片历史与深度重排 | Depth-Stack Deck Track | 建立在普通 Present 之上的包内集合状态 |
| 处在互不相关 z 值上的 Ranking board 与图标 | Ranking Program | 多个绝对层叠 Present |
| Media 的进入/退出与配对转场 | Media Program | 覆盖自有 Present 的局部帧精确 keyframe |
| 任意的自包含视觉 | component/provider | 物化的可合成 Surface Artifact |
| 音乐/音效/额外人声的放置 | Audio Program | 普通的帧精确 AudioTrack clip |
| 闪白/暗角/颗粒/蒙层 | Screen Overlay Program | 自有的全画布 Present 或 alpha Surface |
| 对一张画面做模糊/调色 | 显式输入的媒体特效 | 变换后的自有素材，绝不是背景采样 |

## 当前的可执行证据

`packages/hyperframes/test/track-expressiveness.test.ts` 构造的是包内私有的 lowering 见证，而不是往公开
合同里加 Text、Caption、Media 或 Ranking 字段。已有的包测试另外证明了普通的 Text、Caption 与 Media
Program 都经由同一条 Track 与 Composition 路径 lower。

当前的 `VisualTrack / VisualPresent / VisualElement` 候选显式绑定 `svml.visual-ir@1`，能够编码结构性的
三盒、两盒、词级局部和绝对层叠等情形。有两条通用的终端事实现在是可执行的，而不是包族补丁：

1. `FontArtifactRef` 把每个精确的 fallback 字面、weight 和 style 绑定到一个或多个 Blob 源。
   Unicode-range 分片仍然算一个逻辑字面；精确的文本 lowering 会为每个源输出按内容寻址的
   `@font-face` 规则，并禁用字体合成；
2. `CompositableSurfaceRef` 把尺寸、sRGB 色彩空间、不透明/直通 alpha 语义以及静帧/逐帧时间绑定到 Blob
   字节。带动画的 Surface 必须与所在 Present 的帧数和 ProgramSpace 速率完全一致。

`packages/hyperframes/test/browser-visual.test.ts` 还会驱动真实的 Hyperframes 浏览器帧：已安装的按内容
寻址开放字体通过有序的 fallback 栈绘制拉丁、中日韩与 emoji/符号字形；Text 证明了 Point/Area/Path 布局、
全部 Box 目标、富文本 run、水平/垂直排版流、clip/ellipsis/有界收缩、有序 Paint、局部 Mask 以及正/反向的
选择器时钟；Fine Caption 证明了多行折行、完整字形 Paint、每一种字形卡拉 OK 模式以及 joined 拖尾 Pill 的
行几何；DepthStack Deck 证明了显式的新旧集合状态重排、精确标签以及单 worker 与分区渲染逐字节一致的帧；
全部十一个官方 Screen Overlay 组件在顺序渲染与并行帧渲染下保持完全相同的像素；一张 50% 直通 alpha 的
PNG 在蓝色 Track 上合成，得到预期的像素值。这个 opt-in 的宿主测试通过 `SVML_BROWSER_TESTS=1` 运行；
它证明的是当前本地渲染器路径，而不是未来所有的托管 Runtime。

IR 的 style 词汇是封闭的，而不是任意 CSS：组件无法在不改变协议版本的前提下加入未知属性、依赖环境的值
或另一种浏览器语言。现在每个终端文本 element 都携带非空的精确 Font Artifact 栈；系统字体兜底和原型字族
都是非法的。Runtime 在通用 Receipt 中绑定其锁定的实现。HyperFrames 还会把精确的本地浏览器摘要，或所
配置的远程渲染器部署摘要，记录在受 receipt 覆盖的元数据中。共享的、基于 ffprobe 的 Surface 字节校验，
会在本地暂存之前证明所声明的尺寸、时间、SDR/sRGB 与 alpha 事实；不具备这一能力的 Endpoint 会拒绝携带
Surface 的文档。

E1–E5、E7 和 E8 现在都有各自的官方包见证。`@narratage/typography-track` 在不引入公开 Text 字段的前提下
证明了完整的三盒/Text 终端模型；Caption 和 Media 证明了它们各自独立的包模型。`@narratage/audio-track`
证明了精确的 48 kHz 源/目标映射、重叠法则、有界拉伸以及一份共享的本地/远程 `AudioProgramPlan`；
`@narratage/screen-overlay` 证明了只使用自包含的自有像素、显式种子、扁平层叠，以及对下层合成类特效的
fail-closed 拒绝；`@narratage/deck-track` 证明了在新旧可见 Card 并集之上的纯绝对帧集合重排，同时复用了
Card 局部的 Media lowering。`@narratage/ranking` 提供了真正的 E4 见证：board、stage 与独立层叠的 Item
与一条无关的对等 Track 相互穿插，同时四个 Ranking 组件在分区浏览器渲染下都保持帧纯净的渐进状态。E6
则通过带类型的路径、独立安装的非原生 Text 见证、字节校验器以及 fail-closed 的 Endpoint 能力检查得以完成。

## 冻结标准

仓库内部的 Track v1 窄腰满足以下全部条件：

1. E1–E8 都具备可执行的结构、HTML lowering 与音频 plan 见证；
2. 官方的 Text/Caption lowerer 要么绑定精确的字体 Artifact，要么显式物化其字形结果，并且用于布局的
   渲染器实现是受 receipt 绑定的；
3. E6 具备一条带类型的可合成 Surface 路径，其 Runtime 会校验所声明的媒体事实并记录渲染器实现；
4. 安装一个新的 Track 包，不需要改动 Core、Film、Composition 或族注册表；
5. 公开的 Track 数据中不含任何 Caption、Text、Media、Ranking 或 provider 判别字段；
6. 一个包可以修订自己的 Program schema，同时只需保持或版本化自己的 lowerer；
7. 不受支持的跨 Track 采样 fail closed。

因此该实现对后续的仓库包工作已经冻结。公开的 npm 发布、非受信代码隔离与最终的发布版本号仍然是独立的
发布门；它们不会重新打开这条窄腰的视频含义。
