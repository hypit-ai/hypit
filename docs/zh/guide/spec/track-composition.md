---
title: SVML Track 与 Composition
description: 可执行的仓库内部 `@1` 兼容窄腰；所有门禁均已通过。
---

# SVML Track 与 Composition

状态：可执行的仓库内部 `@1` 兼容窄腰；[`track-expressiveness.md`](./track-expressiveness.md) 中的所有门禁均已通过，公开发布仍然是另一件事。

## 法则

除了共享的 ProgramSpace 与画布几何之外，进入 Composition 的每一份视听贡献都是同级 Track。Composition 负责校验、排序和合并 Track。它不认识 Caption、Speech、Media、Text、Seedance 或任何作者包家族。

```text
Speech visual ───────────────> VisualTrack ─┐
Media ───────────────────────> VisualTrack ─┤
TimedCaption + style/cues ───> VisualTrack ─┤
Text + style ────────────────> VisualTrack ─┼─> Composition
Vignette / overlay ──────────> VisualTrack ─┤
Speech audio / BGM / SFX ────> AudioTrack ──┘
```

## ProgramSpace

ProgramSpace 拥有时长和精确的有理数帧率。它的时长必须结束在整数帧边界上。Track 不会把 ProgramSpace 的摘要复制进每一个值。在两者关系需要被校验的地方，图会显式连接 Track 与 ProgramSpace；validator 会拒绝落在所提供空间之外的帧窗口。

画布宽度、高度和 clear color 是 Composition 的结构性事实。任何视频 Track 都不定义时长，也不会成为享有特权的
Base。

## VisualTrack

一个 VisualTrack 是由某个作者包拥有的、自包含的渲染贡献。它显式绑定
[`svml.visual-ir@1`](./visual-ir.md) 终端语言，并拥有零个或多个帧精确的 `VisualPresent` 值；每个 Present
拥有自己的绝对 `(order, tieBreak)` 堆叠键，以及一棵自包含、不含代码的元素树，其素材来自 box、text、普通媒体和带类型的可合成 Surface 原语。父引用是 Present 局部的。媒体和精确字体通过内容寻址的 Artifact 引用进入，而不是通过 CSS URL 或环境字体名。每一个终端文本元素都带有非空的精确 Font 栈。它与 ProgramSpace 的身份关系是内在的，因为没有时钟就无法解释这个 Track。是哪些 Record 产生了它，属于
Graph/Derivation 真相，被刻意排除在 Track 之外。

Composition 会先把所有 Track 的 Present 拍平，再对它们排序。因此一个 Media 包可以在 z=30 拥有一块 board、在
z=80 拥有一个图标，而来自另一个 Track 的 Text Present 位于 z=50。z 随时间变化由两个互不重叠、堆叠键不同的
Present 表示。Track 的归属关系绝不会创建渲染堆叠上下文或来源链。

每个元素都可以可选地携带帧精确的局部关键帧，作用于 opacity、transform、filter 或 clip-path。这些关键帧只作用于该 Present 的元素树。Media 包可以把一次成对转场下降为它自己两个 Present 上互补的动画，而不必让 Composition
知道这个转场的名字或语义。

VisualTrack 刻意不具备：

- 家族或来源种类字段；
- 对同级 Track 或 Present 的引用；
- 任意脚本或全局 CSS 选择器；
- 采样下层 Track 的 backdrop 滤镜或混合模式；
- 跨 Track 的蒙版、求交或转场输入。

当一个局部滤镜、裁切、变换、动画或转场只作用于该作者包显式拥有的素材，并下降为自包含的 Present 时，它就是合法的。需要两份原始素材的效果，必须在最终下降为 Track 之前显式收到这两份素材。任何 Present 都不得采样已经累积出来的下层合成。

## AudioTrack

一个 AudioTrack 拥有精确的 48 kHz 采样域片段、带类型的规范 WAV Artifact、源区间、循环相位、保持音高的播放速率、目标区间、增益，以及采样精确的淡入淡出。它没有视觉堆叠键，没有无实际作用的总线标签，也与 Speech Track
没有任何特殊关系。语音音频、音乐、源声和音效使用同一份合同。

## Composition

Composition 包含一个画布和一组 VisualTrack/AudioTrack 值。ProgramSpace 是通往 Film 和最终渲染 Operation 的一条同级输入边，而不是被反复复制的血缘元数据。Composition：

1. 依据由显式图边提供的 ProgramSpace 校验每一个 Track；
2. 拒绝重复的 Track 身份和重复的视觉堆叠键；
3. 拍平每一个 VisualPresent，并按绝对 `(order, tieBreak)` 挂载；
4. 在 ProgramSpace 中混合 AudioTrack 片段；
5. 为一个被显式选定的最终渲染包产出与渲染器无关的输入。

Composition 不得按作者领域的家族做分支，也不得授予某个 Track 访问已累积下层像素的特权。因此全局 shatter、调整图层、Base FX 通道或 B-roll 垫底转场都不属于这个版本。也不会为 Base FX 保留任何专用占位。

TimedCaptionProjection 仍然是一个中间语义值。Caption 的分组、样式和 cue 下降必须在字幕作为普通 VisualTrack
进入 Composition 之前完成。

## 最终渲染边界

`@narratage/hyperframes` 是当前面向 Composition 及其唯一带版本 SVML Visual IR 的参考编译器。它绝不按 Speech、
Caption、Media 或作者包身份做分支。它确定性地产出一份内容寻址的 `HyperframesDocument`，其 HTML 按绝对堆叠键交错排布各个 VisualPresent。它不得把一个创作层的 Track 挂载成一个孤立的视觉包装层。AudioTrack 的编译与最终
mux 是同一个 ProgramSpace 之上相互独立的媒体操作；HyperFrames 是一个无声的可视目标。

这不是一条排他的边界。未来的 `render-remotion` 或基于 API 的渲染包，可以消费同样的 Composition 与
ProgramSpace，编译出另一份不可变的渲染器文档，并返回同一份媒体合同。Author Source 通过导入相应的包来选择这条路径；Core 和 Runtime 不会猜测渲染器。当前的示例显式选择 `render-hyperframes`。

该文档必须（MUST）绑定精确的有理数帧率、为正整数的帧数、画布尺寸、Artifact 集合以及生成的 HTML。与
ProgramSpace 的关系仍然显现在该 Producer 的输入边与 Derivation 上，而不是被复制进文档内容。它完整的视觉帧域是半开区间 `[0, frameCount)`。渲染第 `n` 帧必须只依赖这份不可变文档、它精确的 Artifact、被锁定的渲染器实现以及 `n`；它不得要求顺序求值第 `0..n-1` 帧。因此带状态的作者效果必须在进入这条边界之前物化成带类型的 Surface。

帧分区属于 Runtime 策略。合规的 Endpoint 可以把该域切分成任意一组互不重叠的半开跨度，只要它们按序并起来等于
`[0, frameCount)`，并在本地或远程求值这些跨度、对单个跨度重试，最后一次性拼装可视分块并 mux 音频。这些跨度不是作者声明、不是 Core Operation，也不是 Track 身份。已履约的渲染 Product 必须重复完全相同的 文档/帧域/画布绑定；亲和性会拒绝为另一个域拼装出来的结果。

编译出的文档中包含的是 `svml-artifact://` 占位符，不是本地路径、API URL 或签名 URL。解析这些占位符是渲染前一刻的 Runtime/Provider 动作。因此同一份编译好的文档既能本地渲染也能远程渲染，而不改变作者意图或它的编译身份。精确文字会变成生成的 `@font-face` 规则，并禁用字体合成。带类型的 Surface 在同一条 Artifact 边界上保持所声明的尺寸、色彩空间、alpha 模式以及静帧/逐帧时间；它们不会从文件扩展名推断。渲染器会在暂存之前校验这些字节事实，否则拒收该文档。它的通用 Need Receipt 绑定被锁定的 Endpoint 实现，而 receipt 覆盖的元数据中那份渲染器专属证据，绑定实际用于布局的精确浏览器或不可变的远程部署。

`@narratage/film` 把包级的任意元数装配实现为一次有限不可变的 TrackSet 折叠，随后是普通的 Composition。渲染是一个单独的、显式导入的下游 Fragment。Core 只收到定端口、单结果的 Operation，而以某个中间 Track 或 Composition
为 Target 并不要求渲染器。Film Surface 必须下降到已实现的那个 Fragment，既不向 Core 增加 Track 家族，也不让某个 Track 依赖累积出来的同级像素。
