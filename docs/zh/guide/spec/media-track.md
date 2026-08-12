---
title: SVML Media Track 创作
description: 统一官方 Media Track 的可执行预发布权威文档。Item/Sequence。
---

# SVML Media Track 创作

状态：统一官方 Media Track 的可执行预发布权威文档。Item/Sequence 两个 Surface、定时素材、
有序 Layer、运动、Handoff、独立的音频投影以及受限的 Speech 投影均已实现。原先的
`@narratage/broll` 垂直切片已被移除，而不是作为兼容层保留。本合同尚不是冻结的公开 ABI。

## 1. Conclusion

全画幅插叙、下方证据卡、角落图片、透明贴纸、动图、短视频以及普通的替换序列，并不是各不相同的
终端 Track family。它们只是同一组媒体关注点的不同组合：

```text
source material
target time / trigger schedule
source-time occupancy
Placement Frame
ordered local layers and Content Fits
clip and frame Paint
entry / sustain / exit motion
per-layer sampling motion
absolute stacking
optional owned pairwise replacement relationship
optional explicit audio projection
```

它们属于同一个视频领域包 `@narratage/media-track`，并且全部下降为普通的对等 `VisualTrack`；
只有在作者显式声明时，才会同时下降为 `AudioTrack` 值。

一个包不等于一个带条件分支的超级组件。作者 Surface 暴露两个语义不同的组件：

```text
Media Item       one independent presentation with one projected window
Media Sequence   ordered members replace one another on one shared surface
```

`Item` 和 `Sequence` 共享聚焦的值族和下降代码。它们之所以是两个独立组件，是因为拓扑、校验和端口
都不同。不存在 `mode="broll | sequence | overlay"` 这样的字段，也不存在“选了某个 mode 就冒出另一个
隐藏组件”的步骤。

深度堆叠的 Deck 被刻意排除在本包之外。它是更高阶的集合状态组件，而不是媒体原语。官方的迁移模型在
[`deck-track.md`](./deck-track.md) 中独立规定；未来的 Carousel、Fan、Grid 或其他 Deck 包并不必须采用
那套模型。

“B-roll” 仍是有用的剪辑术语或 Recipe 名称，但它不是公开的数据 Type。

## 2. Boundary

统一后的包是一个作者包，同时也是确定性编译器：

```text
@narratage/media             intrinsic media facts and normalized sources
@narratage/media-pipeline    inspection, stream selection and normalization vocabulary
@narratage/temporal          points, occurrences, windows and trigger schedules
@narratage/spatial           Canvas, Placement Frame, Content Fit and fitted geometry
@narratage/media-track       Item / Sequence author Programs and lowering
@narratage/deck-track        independent depth-stack Deck authoring and lowering
@narratage/composition       terminal VisualTrack / AudioTrack waist
```

它不做这些事：

- 生成图像或视频；
- 挑选模型或 Provider；
- 检查凭据、URL 或本地可执行文件；
- 让 Runtime 或 Provider 自行发明流选择策略；
- 拥有 Program 时钟或 Canvas；
- 读取兄弟 Track 或已累积的下层合成结果；
- 往 Core、Film、Composition 或 HyperFrames 里添加 B-roll、Sequence、Deck 或 Speech 分支。

Core 只看到固定的图 Operation、Record 和边。Runtime 执行任何显式的媒体检查/归一化 Need，或
Surface 物化 Need。Provider 不会重新解释 placement、motion、transition 或音频策略。

## 3. Source truth

每一个可见 sample 都通过显式的图边进入。作者 Surface 区分四种形态，而不是从单一 Blob 类型去猜：

- 静态图像素材，带内容寻址的 Artifact 和精确的显示方向尺寸；
- 生成的/原始视频素材，使用 Track 的 ProgramSpace 帧率，通过通用 Media Pipeline 下降，并带显式的
  纯视觉或 A/V 策略；
- 已归一化的定时视觉素材，带精确帧率、帧数和尺寸；
- 带类型的 `CompositableSurface` 素材，带精确的静态/逐帧时序和 alpha 模式。

固有事实的所有者仍然是 `@narratage/media`。Media Track 包内部可以使用包内的已解析联合类型，但不得
再造一个通用媒体 Type，也不得把 provider、源路径、Narrative 摘要或上游血缘复制进每一个 item。

按文件名推断是非法的。具体来说：

- 动图 GIF 或动图 WebP 不能继续作为由浏览器计时的 `<img>` 存在，因为并行渲染时第 `n` 帧必须能独立
  渲染；
- 它必须被归一化为精确逐帧计时的视觉素材，或者带类型的动画 Surface；
- 静态图像即使其文件格式也支持动画，仍然没有时长；
- 含音频的 MP4 不会因此就让那段音频可听；
- 带 alpha 的视觉素材必须保留显式的 alpha 合同。

多个 Layer 可以引用同一个 Artifact。图和 Artifact 收集器会对字节做去重；渲染器仍然独立求值每一个
被声明的 sample。

## 4. The orthogonal item model

从概念上说，一个独立 Item 拥有：

```ts
type MediaItemProgram = {
  readonly id: string;
  readonly temporal: TemporalBinding;
  readonly frame: SpatialFrameInput;
  readonly framePresentation: MediaFramePresentation;
  readonly layers: readonly MediaLayerProgram[];
  readonly motion: MediaLifecycleMotion;
  readonly stacking: AbsoluteStackingIntent;
  readonly sourceAudio?: MediaSourceAudioProjection;
};
```

各个正交轴是：

| 轴 | 负责 | 不负责 |
|---|---|---|
| source | 精确的静态/定时/Surface 素材 | Provider 或素材发现 |
| temporal | occurrence 展开与 item 窗口 | 素材播放 |
| frame | Placement Frame | 可见 Paint 或内容宽高比 |
| layers | 有序的 Paint/媒体 sample | Track 相对的 z 上下文 |
| content fit | 每个 sample 一个 Content Frame | zoom/pan 或播放 |
| occupancy | 源裁剪与源时间映射 | 目标窗口 |
| frame presentation | 裁剪、圆角、描边、阴影、内边距 | 几何构造 |
| lifecycle motion | 自有像素的进入、持续与退出 | member 之间的 handoff |
| sampling motion | 单个媒体 Layer 内部的 pan/zoom/旋转 | Placement Frame 的运动 |
| stacking | 绝对 Present 位置 | Track family 优先级 |
| source audio | 显式投影某一个被选中 Layer 的音频 | 自动的容器音频 |

这些都是包内的 Program 事实。它们不会变成 Core 或终端 Track 合同上的字段。

## 5. Illustrative author Surface

最终的 Surface 必须优先使用具名 Frame 和 SVS Recipe，而不是大段内联参数堆。一种可能的写法是：

```xml
<media:Track id="editorial-media" map={timing.map} space={speech.space} canvas={vertical}>
  <media:Item
    id="full-cutaway"
    video={demo.video}
    during={story.selection.demo}
    frame={vertical}
    appearance={studio.media.full-cutaway}
  />

  <media:Item
    id="corner-loop"
    surface={reaction.surface}
    at={story.moment.reaction}
    for="2s"
    frame={layout.top-right-sticker}
    appearance={studio.media.corner-loop}
  />

  <media:Sequence
    id="steps"
    frame={layout.lower-card}
    appearance={studio.media.evidence-sequence}
    until={story.selection.explanation.end}
  >
    <media:Member id="step-1" image={step1.image} extent={step1.extent} at={story.moment.step1}/>
    <media:Member id="step-2" image={step2.image} extent={step2.extent} at={story.moment.step2}/>
    <media:Member id="step-3" video={step3.video} at={story.moment.step3}/>
    <media:Handoff from="step-1" transition={studio.media.transitions.push-left}/>
    <media:Handoff from="step-2" transition={studio.media.transitions.crossfade}/>
  </media:Sequence>

</media:Track>
```

这段语法只是示意。规范性的要点是：

- 声明与可复用外观留在使用点之外；
- 每一个 source、Frame、Selection 和 Moment 都是显式引用；
- `image`、`video`、`media` 和 `surface` 表示互斥的 source 形态；绝不会去猜一个通用 Blob 到底是静态还是
  动态素材；
- `Item` 与 `Sequence` 在作者视角下是明显不同的语义；
- `during`、`at`、`for`、`until` 这类简写全部下降到同一套 Temporal 代数；
- 任何 Runtime 都不参与决定某个东西是插叙、卡片还是贴纸。

### SVML structure and SVS parameter bundles

SVML 拥有拓扑：source、Frame、时间引用、Item/Sequence 成员关系、Handoff 边、标签和声音输入。
SVS 拥有具名的可复用参数包：Content Fit、frame Paint、裁剪、运动参数和转场外观。

SVS Recipe 不能隐藏一条 source 边，不能创建 member，不能选择 Provider，也不能让两个独立的 Item 变成
一个 Sequence。把一个转场 Recipe 应用到整个 Sequence，会在解析后的 Program 里把这个选择物化到每一条
被声明的 Handoff 上。因此 Recipe 既保持简洁，又不会退化成第二套图语言。

### Small framed inset with a smooth rise

小画框不是另一个组件。它就是一个普通 Item，只不过它显式的 Placement Frame 比 Canvas 小。使用点的
结构依然可读：

```svml
<space:AnchoredFrame id="product-inset" within={safe}
  x="50%" y="78%" width="82%" height="28%" anchor="center"/>

<media:Track id="proof" map={timing.map} space={speech.space} canvas={vertical}>
  <media:Item
    id="product-proof"
    video={product.video}
    during={story.selection.proof}
    frame={product-inset}
    appearance={studio.media.fuzzy-card}
    motion={studio.motion.smooth-rise}
  />
</media:Track>
```

被引用的 Recipe 在概念上解析出彼此独立的参数，例如：

```text
media.fuzzy-card
  content fit        contain or cover
  frame fill         explicit color/gradient/transparent Paint
  content padding    exact pixels
  frame clip         rounded rectangle or owned shape
  edge treatment     border/shadow, or an explicit rough-edge layer

motion.smooth-rise
  enter operator     translate
  from               below the Canvas or an exact positive y offset
  to                 resolved Placement Frame pose
  duration           exact frames
  easing             ease-out, or a package-compiled custom frame curve
```

“下方”必须无歧义。`below-canvas` 由 Canvas 和解析后的 Item 尺寸推导出一个画布外的起始位姿；
`offset-y: 120px` 则从最终 Frame 的下方开始，未必要离开画面。两者都下降为逐帧精确的局部变换，并且
都不改变最终的 Spatial Frame。

普通的柔边或发光边缘下降为自有的 border 加 box shadow/drop shadow。真正不规则的毛边、撕纸边或噪点边
不是什么魔法 `border-style`：它是一个显式的局部 Layer，比如一张透明边框 Artifact 或一个确定性的
`CompositableSurface`。由于该 Layer 会影响图拓扑和 Artifact 收集，它的 source 必须在 SVML 里接上
（例如写成 `<media:Layer surface={fuzzyFrame.surface}/>`）；SVS 可以给它上样式，但不能隐藏这条 source
边。外层的生命周期包裹器会带着 frame Paint、边缘 Layer 和内容一起运动。

内置的缓动名称可以直接下降到 Visual IR。更复杂的贝塞尔或弹簧 Recipe 仍归 Media 包管，可以被确定性地
采样为按帧寻址的关键帧；这不需要 Core、Composition 或 Runtime 学会一种新的运动类型。

## 6. Independent Item timing

Item 使用 [`track-authoring.md`](./track-authoring.md) 中的通用流水线：

1. 定位 Selection、Moment 或 Program 点；
2. 展开 `one` 或 `each` occurrence；
3. 为每个 occurrence 投影一个目标窗口；
4. 与 ProgramSpace 求交并校验；
5. 在该 item 窗口内求值每一个 Layer 的源裁剪与 occupancy；
6. 求值生命周期运动与采样运动；
7. 产出自包含的 Present。

独立的 Item 保持独立。它们的窗口可以重叠，并按各自显式的绝对 stacking key 合成。Program 顺序不会让
它们互斥，不会裁掉优先级更低的 item，不会自动缝合空隙，也不会推断出一个 Sequence。

全屏 B-roll 不过是一个 Placement Frame 等于 Canvas、前景 Layer 通常用 `cover` 的 Item。小图、GIF 或
视频只是同一个 Item 配上更小的 Frame。“不要挡住人脸”不是 Media 的某个 mode：作者要么消费一个合适的
具名 Frame，要么由上游具备主体感知能力的布局组件显式产出一个。

## 7. Ordered local layers

一个 Item 在一个 Placement Frame 内拥有一份有序的局部 Layer 列表：

```ts
type MediaLayerProgram =
  | MediaFramePaintLayer
  | MediaSampleLayer;

type MediaSampleLayer = {
  readonly id: string;
  readonly source: MediaSourceInput;
  readonly fit: ContentFit;
  readonly trim?: VisualSourceTrim;
  readonly occupancy: VisualOccupancy;
  readonly appearance: MediaSampleAppearance;
  readonly samplingMotion?: MediaSamplingMotion;
};
```

[`spatial-layout.md`](./spatial-layout.md) 中列出的全部衬底情形，都只是普通的 Layer 列表：

- 透明：没有衬底 Layer；
- 纯色或渐变：一个 frame Paint Layer；
- 自身模糊：同一个 source 进入一个 cover/模糊 Layer 和一个前景 Layer；
- 替代衬底：由另一个显式 source 提供衬底 Layer；
- 装饰卡片：Paint、border/阴影/内边距，再加一个或多个媒体 Layer。

每个媒体 Layer 都由自己的固有尺寸和 `ContentFit` 推导出自己的 Content Frame。不存在特殊的
前景/背景配对，也不存在唯一的共享内框。

Frame 级裁剪是显式的：不裁、裁到 Placement Frame，或裁到自有形状。圆角、border、阴影、内边距和
frame Paint 都属于表现层。它们不能改变 Spatial 几何，也不能采样另一个 Track。

## 8. Source-time occupancy

静态素材没有固有播放时长，在其 Layer 处于活动状态的整个区间内持续绘制。定时视频、动图或动画 Surface
先执行显式 trim，再套用通用的视觉 occupancy 法则：

```text
once/start     play from the source head, then disappear or truncate
once/end       align the source tail to the window end
hold/start     play from the head, then hold the last visual frame
hold/end       hold the first visual frame, then play to the end
loop/start     loop from source-head phase
loop/end       choose phase so the source tail meets the window end
stretch        map the complete effective source interval onto the window
```

不存在 `auto`、`native`、`finish`、`freeze` 或 `phased` 这类作者枚举值。图像不会被塞一个假的播放模式。
源 trim 在 occupancy 之前执行。空间上的 contain/cover 与时间上的 stretch 互不相干。

即使某个 `once` Layer 提前结束，Item 的目标窗口依然有效。其他 Paint 或媒体 Layer 可以继续存在。若作者
希望整个 item 保持可见，就选 `hold`、补一个常驻 Layer，或者直接写一个更短的目标窗口；编译器绝不会靠
猜哪个 Layer 是主 Layer 来收缩 Item。

## 9. Media motion has four separate channels

旧的 B-roll 行为拆成四条由包自有、彼此显式分离的通道：

```ts
type MediaLifecycleMotion = {
  readonly enter?: MediaEdgeMotion;
  readonly sustain?: readonly MediaSustainMotion[];
  readonly exit?: MediaEdgeMotion;
};

type MediaSamplingMotion = {
  readonly keyframes: readonly MediaSamplingKeyframe[];
};
```

### Entry motion

作用于一个 Item 或 Group 在其可见包络起始处所拥有的全部像素。合理的带类型 Recipe 包括淡入、方向滑入、
缩放、弹出、回弹、局部模糊显现、擦除、翻转和旋转。

### Sustain motion

作用于可见包络期间。漂浮、呼吸、脉冲、摇摆、抖动和漂移都是合理的算子。被声明的有序列表按确定性方式
求值；多个变换不会悄悄互相覆盖。

### Exit motion

作用于包络结束处的全部自有像素。它有自己的算子和时长；它不会自动成为 entry 的逆过程。

### Sampling motion

作用于某一个媒体 Layer 已完成 fit 的 Content Frame。归一化关键帧可以驱动缩放、源点/内容点位移和旋转。
Ken Burns 是一个采样运动 Recipe，既不是 Base 特效，也不是 occupancy 模式。

即使 entry 与 exit 重叠，它们各自被声明的时长也保持不变。包在每一帧同时求值两者，并确定性地合成它们
彼此独立的 opacity、transform、filter 和 clip 通道。它绝不会按比例压缩任何一侧，也绝不会把 Item 跑两遍。
可见的 Item 窗口仍然是最终的裁剪边界。

变换栈是固定的，因此各通道不会互相覆盖：

```text
absolute Present stacking
└─ fixed Placement Frame
   └─ group/item entry + exit wrapper
      └─ ordered sustain wrappers
         └─ member handoff wrapper (Sequence only)
            └─ frame Paint and clip
               └─ base fitted Content Frame
                  └─ layer sampling motion
                     └─ media pixels
```

下降器可以在代数上合并矩阵，也可以产出嵌套的 Visual IR 元素，但顺序和像素必须完全一致。这些是 Media
包的合同，不是某个通用的公开 `effects` 参数袋。

## 10. Sequence: explicit member replacement

一个 Sequence 拥有两个或更多嵌套的 Member，它们共享一个 Placement Frame 和一个外层生命周期。它必须被
显式创建；相邻的 Item、重叠的窗口或某个转场 Recipe 都不会隐含成员关系。

每个 Member 拥有：

- 稳定的作者身份；
- 显式的媒体 Layer 以及逐 Layer 的 fit/occupancy/采样运动；
- 恰好一个由 Moment 或某个 Selection 边界推导出的激活点；
- 没有独立的外层 entry 或 exit 运动。

Sequence 有一个显式的终止点。对于激活帧 `p1..pN` 和终止点 `T`：

```text
p1 < p2 < ... < pN < T

logical member 1 phase   [p1, p2)
logical member 2 phase   [p2, p3)
...
logical member N phase   [pN, T)
```

源码中的 occurrence 顺序具有权威性。编译器绝不按物理时间排序。缺失、同帧、逆序或超出 Program 范围的
激活点，会让整个 Sequence 原子性失败。

每一对相邻成员都拥有一条显式的 Handoff。不存在只活在编辑器或 Runtime 里的转场默认值；“应用到全部”
会把同一个被选中的转场物化到每一条边上。

### Pair transition

官方的初始集合是：

- cut；
- crossfade；
- push；
- wipe；
- cover；
- page turn。

一个转场拥有算子身份、精确时长、带类型的参数，以及位于 `[0,1]` 的边界位置比例 `r`。给定逻辑边界 `p`
和时长 `d`：

```text
handoff.start = p - r × d
handoff.end   = p + (1-r) × d
```

帧量化保持转场总长度精确不变。相邻的 handoff 窗口不得重叠；非法时长直接失败，而不是造出一个隐式的
三源转场。

在 handoff 期间，退出与进入的 Member surface 都由该 Sequence 拥有。它们的媒体 sample 在各自被展开的
视觉跨度上连续播放。转场既不改变 ProgramSpace，也不改变上游的 Selection/Moment 点。

Sequence 的 handoff 只能在其共享的 Placement Frame 内部工作。这让 cut、crossfade、push、wipe、cover 和
page turn 都成为诚实的局部关系。针对 `composite_below` 的外层 handoff 被刻意废弃：它会读取并改动无关的
下层 Track。

Sequence 自身可以使用普通的 entry/exit 运动。在下层 Track 之上做全屏淡出是合法的，因为改变的只是
Sequence 的不透明度；而把下层 Track 推走或翻页则不合法。

## 11. Audio is explicit and projected separately

视觉素材默认静音，除非作者显式地从恰好一个具名媒体 Layer 中选取源音频。这是 item 级别的，因此前景与
它自身的模糊副本不会意外地把同一个源混两遍。

```ts
type MediaSourceAudioProjection = {
  readonly fromLayer: string;
  readonly gain: number;
};
```

音频投影复用被选中 Layer 的精确 trim、播放映射和已解析的调度。Sequence 的每条边各自拥有自己的音频关系：

- `cut` 在逻辑激活点切换可听性，即使视觉 surface 存在重叠；
- `crossfade` 使用显式声明的音频 handoff 窗口；
- 视觉转场绝不会悄悄替你选一个音频转场。

entry/exit 或 handoff 的音效是显式的音频 Artifact 输入，带显式增益。它们在解析出的精确 entry、exit 或
边界点上下降。它们不是包级全局文件名、不是可变的音效库默认值，也不是隐藏的通道音效。

编译器不会返回一个同时包含两个终端 Track 的原子 `MediaProduct`。它解析出一个包自有的 Media Program，
并提供彼此独立的确定性投影 Operation：

```text
Resolved Media Program ─┬─> project visual ─> VisualTrack
                        └─> project audio  ─> AudioTrack
```

因此，任一终端输出都可以被 Run Graph 独立地定向、替换或满足。当两者同时被需求时，它们仍通过一条显式的
图边共享同一份已解析调度，而不是复制两份时序元数据。

一个纯视觉 Item 不会仅因为它的源容器里带音频流，就去要求音频归一化或渲染。

## 12. Stacking and flat Tracks

Media Track 自身没有 z-index。每一个解析出的顶层 Item 或 Sequence surface，以及任何可被单独穿插的
member/Layer，都会产出绝对的 Present stacking key。

frame Paint 与紧耦合的媒体 sample 可以留在同一棵 Present 局部元素树里。当对等 Track 必须能出现在某块
板、卡片、图标或 Layer 之间时，包会产出带独立绝对 key 的独立 Present。Track 归属关系绝不创建 stacking
上下文。

Sequence handoff 内部的临时顺序由包自有，且只在该关系的那些帧内存在。它不会预留一条全局 z 带。

## 13. Speech Spine's restricted Media projection

Speech Spine 不应再维护第二套临时的媒体渲染器。它的视觉投影使用同一套 Media 下降实现，只是生成的
Program 被刻意限制：

```text
one normalized speech-bearing Take per Segment; its visual stream is optional
exact already-established Segment frame span
explicit authored Spatial Frame
one foreground layer
explicit fit and absolute stacking order chosen by the author
muted visual
cut between contiguous takes
no entry, sustain or exit motion
no Sequence state
no source-audio projection
```

Speech 的作者 Surface 接受原始 `video=`，并在装配前展开同一套通用的检查与归一化图，按 Spine 显式的
帧率选取主运动视频加默认音频。原始 `audio=` 展开为音频权威的归一化图，不贡献任何视觉 Present；它绝不
凭空造出黑场素材。已准备好的 `media=` 仍是直接的精确输入。视觉 Take 继承 Spine 显式的 `visual-frame`、
`visual-appearance` 和 `visual-z`，并可在这几个受限的轴上做逐 Take 覆盖。装配之后，Speech 音频仍走独立的
规范路径 `SpeechAudioBasis -> AudioTrack` 投影；受限的视觉下降器本身保持静音，不会去重新发现容器音频。

这可以是对聚焦的 Media 下降辅助函数的代码依赖。当没有任何外部组件消费那个中间值时，它并不需要暴露
一个公开的 `MediaProgram` 图 Type。若日后真的出现图消费者，包可以暴露自己的带版本已解析 Type；Core 仍然
不会注册 Media 语义。

作者导入的是 Speech Spine，其 manifest 声明了自身的包依赖。作者不需要仅仅因为实现复用了 Media 下降，
就再导入第二个解析器。

普通 Media Item 可以直接消费 `during={story.segment.answer}`。这不是隐式 Selection：Temporal 解析的是
Segment 早已存在的结构性起止锚点。当作者的真实意图是 Selection 和 Moment 时，同一个 Item 仍然可以消费
它们。

## 14. Legacy audit: retained and retired

保留：

- 通过统一的 Item 模型表达全画幅插叙、分屏和角落叠加；
- 静态图像、类 GIF 动画和视频；
- 彼此独立且可重叠的媒体呈现；
- 显式的 contain/cover/焦点采样，以及前景/自身模糊衬底；
- 源 trim 与 once/hold/loop/stretch occupancy；
- entry、exit、持续的外层运动和内部采样运动；
- 显式的 Sequence 成员关系与共享 surface 的成对转场；
- 提示位置比例，以及跨转场窗口的连续视觉采样；
- 显式的源音频与转场/边缘音效；
- 稳定的作者身份与确定性的声明顺序。

废弃：

- 独立的 B-roll 终端 family；
- 会改变合法端口或设置的 `mode`；
- 用 URL 扩展名猜测 image/video/GIF 行为；
- Track 级 z-index 与隐式 item 优先级；
- `auto` 播放、`finish`、`freeze`、`phased` 以及渲染器兜底修复；
- 自动排序或 `linkNext` 推断；
- 用同一组 `focalX/focalY` 同时表示源点和目标点；
- 用固定的前景/背景字段取代有序的局部 Layer；
- 用一个 CSS transform 槽位让各运动通道互相覆盖；
- 对重叠的 entry/exit 时长按比例压缩；
- 通道级全局音效与自动选中的音频；
- 外层 `composite_below` 转场以及一切 Base FX 依赖；
- 把 VisualTrack 与 AudioTrack 的满足耦合在一起的打包式 B-roll Product。

旧的 Deck 行为在 [`deck-track.md`](./deck-track.md) 中独立迁移；把它从 Media Track 移除并不等于删掉这项
能力。

## 15. Package and implementation shape

预期的包关系是：

```text
@narratage/media-track
├─ author Surfaces: Track, Item, Sequence, Member, Handoff
├─ package-owned Program validators
├─ pure Item window/layer/motion lowering
├─ pure Sequence schedule + pair transition lowering
├─ VisualTrack projection
└─ AudioTrack projection

depends on
├─ @narratage/media
├─ @narratage/temporal
├─ @narratage/spatial
├─ @narratage/svs
└─ @narratage/composition
```

包内部可以使用聚焦的文件划分，或未来仅供实现使用的库。但它不得造出一个被 Text、Caption、Ranking 和
Media 共用的大一统创作库，也不得在新增一个媒体 Recipe、运动算子或组件包时要求 Core 发版。

原先的 `@narratage/broll` 包在迁移期间用作回归见证，现已废弃。由于项目处于预发布阶段，不保留任何兼容包。
“B-roll” 仍是描述某个 Item 或 Sequence 的有用剪辑术语，而不是终端 Type 或作者包。源素材与生成文件保持
原样，不受影响。

## 16. Implementation order

只有在共享的 Temporal 与 Spatial 切片就位之后才实现：

1. **已实现：** 引入 `@narratage/media-track`，先支持一个静态图像 Item，其 BlobArtifact、
   IntrinsicExtent、SpatialFrame、ContentFit 和 ProgramSpace 是彼此独立的语义输入；
2. **已实现：** 加入定时素材的源 trim 以及全部 occupancy/对齐策略；
3. **已实现：** 加入有序的 Paint/媒体 Layer、裁剪和双 Frame 的 fit 模型；
4. **已实现：** 加入生命周期运动与采样运动，并固定变换栈；
5. **已实现：** 加入显式的 Sequence 调度与成对转场；
6. **已实现：** 加入独立的源音频与音效投影；
7. **已实现：** 把 Speech Spine 的视觉投影接到受限下降器上；
8. **已实现：** 迁移仓库中已签入的 B-roll 示例并废弃旧包；
9. **已实现：** 用结构性证据、真实媒体证据和分区浏览器证据闭合包内验收矩阵。
   [`track-expressiveness.md`](./track-expressiveness.md) 中独立的共享 Track/Visual IR 关卡同样通过。
10. **已实现：** 让 `video=` 按已连接的 ProgramSpace 帧率下降到共享的 Media Pipeline，同时保留显式的
    `media=` 作为“已准备素材”的逃生口。

其中没有任何一步需要改动 Core、Runtime、队列或 Provider。Surface 物化可以使用某个已显式注册的 Provider
能力，但普通的 Item/Sequence 下降是确定性的本地编译。

## 17. Acceptance matrix

### Material

- 不透明与带 alpha 的静态图像；
- 竖版、横版和正方形图像；
- 生成的/原始视频，在有和没有显式选中音频两种情况下自动归一化；
- 已显式准备好的归一化视频直接接入，不再做第二次归一化；
- 动图 GIF/WebP 归一化为精确逐帧计时；
- 静态与动画的 Compositable Surface；
- 重复使用同一个 Artifact，不产生重复存储或重复源音频。

### Item

- `one` 下的 Program/绝对窗口，以及 `one` 和 `each` 下的 Selection/Moment 窗口；
- 位于互不相关的绝对 stacking key 上、彼此独立且重叠的 Item；
- 全部源 trim 情形，以及更短/相等/更长的 occupancy 情形；
- 全 Canvas、分屏、下方卡片、角落和画布外 Frame；
- 透明、纯色、渐变、自身模糊和替代 source 的衬底 Layer；
- 每一种 Content Fit，以及内容焦点与 frame 焦点不一致的情形；
- entry、sustain、exit 与采样运动，分别使用以及组合使用；
- 对重叠的 entry/exit 时长做确定性合成，不做隐藏的重新计时。

### Sequence

- 图-图、视频-视频、图-视频以及 alpha Surface 之间的 handoff；
- 严格的声明激活顺序与稳定的 member 身份；
- cut、crossfade、push、wipe、cover 和 page turn；
- start/center/end 三种边界位置比例；
- 跨 handoff 重叠区间的连续源采样；
- 转场时长小于、等于和大于相邻逻辑相位间距的情形，前提是显式 Sequence 包络与“无三源”法则仍然成立；
  非法的包络/重叠必须失败；
- 缺失、重复、逆序和同帧激活的失败情形；
- 不存在隐式的三成员重叠，也不存在下层合成输入；
- 组的 entry/exit 只作用于自有像素。

### Audio and execution

- 纯视觉 source 不产生任何音频工作需求；
- 恰好一个被显式选中的 source Layer 贡献音频；
- 硬切与交叉淡化两种 Sequence 音频 handoff；
- 同一边界上同时发生的 exit/entry 音效混合；
- 独立的 BGM 保持不变；
- 独立地定向/替换视觉与音频投影；
- 本地与远程执行下产出完全一致的 Visual Track/Audio Track 计划；
- 任意帧分区渲染出字节级一致的确定性帧。

### Architecture

- 安装另一个 Media 组件不会改动 Core、Film、Composition 或 HyperFrames 的任何 family 注册表；
- 所有 source、时间、空间、声音和标签依赖都是图边；
- 任何 Track 都不包含 provider、路径、Narrative 摘要或 source family 元数据；
- 没有任何 operation 采样已累积的下层合成结果；
- Speech Spine 的受限投影与普通 Item 遵循同一套下降法则。

### Executable evidence

上面的矩阵由可执行证据闭合，而不是靠包状态的文字描述：

- `packages/media-track/test/media-track.test.ts` 覆盖每一种 Item 绑定、严格的 occurrence 展开、全部
  已记录的 Frame 与 Content Fit、有序的 Paint/sample/衬底 Layer、trim 与 occupancy、生命周期/sustain/采样
  运动、每一个 Handoff 算子与比例、精确的源音频/音效投影、非法 Sequence 的拒绝，以及显式的作者图边；
- `packages/provider-media-local/test/provider.test.ts` 对带音频和不带音频的运动视频、附带图片、源 A/V
  偏移、动图 GIF、动图 WebP、精确音频渲染和最终混流跑真实的 FFmpeg 检查与归一化；
- `packages/media-execution/test/webp.test.ts` 单独证明本地与 Lambda 执行共用的动图 WebP 直通 alpha 混合与
  dispose 行为；
- `packages/provider-media-aws-lambda/test/provider.test.ts` 证明远程执行收到的是完全相同的
  `AudioProgramPlan`；本地与 Lambda 媒体环境都执行 `@narratage/media-execution`，而不是各自拥有另一套
  媒体语义；
- `packages/speech-spine/test/surface.test.ts` 和 `packages/speech-basis/test/product.test.ts` 证明受限的
  Speech 投影、单一共享的生成 Product，以及视觉/音频 Candidate 的独立满足；
- `packages/hyperframes/test/browser-visual.test.ts` 通过真实 Chromium 渲染不透明图像、直通 alpha Surface、
  双 Frame fit、局部运动和一次 Sequence handoff，然后跨不同 worker 分区比对每一帧解码后的 RGBA；
- 包 manifest 中不含任何 Media family 注册表，公开的值类型中也不含隐藏血缘或 Provider 元数据。

因此，本地包作为构建于冻结的仓库内部 `svml.visual-track@1` / `svml.visual-ir@1` 窄腰之上的预发布 Media
实现已经完整。这并不意味着 Media 作者 Surface 已被发布或被单独冻结。
