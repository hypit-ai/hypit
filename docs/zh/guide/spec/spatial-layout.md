---
title: 共享 Spatial 布局
description: 共享 Spatial 几何的可执行基础权威。`@narratage/spatial`。
---

# 共享 Spatial 布局

状态：共享 Spatial 几何的可执行基础权威。`@narratage/spatial` 实现了 CanvasSpace、Frame/Point/Path、
IntrinsicExtent、ContentFit 以及纯粹的 fitting；Film 现在消费与 Track 布局完全相同的显式 CanvasSpace。
Text、Media 以及四个 Ranking witness 均可执行，仓库内部的 Visual IR 兼容性审查已通过。公开的包 ABI
发布仍然是另一件事。

## 1. 结论

共享 spatial 系统拥有的是坐标几何，而不是 Text、Media 或 CSS。它的稳定词汇是：

```text
CanvasSpace       exact output coordinate system
SpatialPoint      one point in that system
SpatialFrame      one positive rectangular region
SpatialPath       one explicit vector path
IntrinsicExtent   one content item's natural two-dimensional size/aspect
ContentFit        how an extent is sized and aligned against a Frame
FittedContent     the deterministic result of that fit
```

当一个可视组件消费某个 `SpatialFrame` 时，该 frame 扮演的角色是它的 **Placement Frame**：组件被摆放
在哪里，以及 frame 级别的 Paint 可以存在于哪里。随后每一个实际的 text/media 样本都会依据自身的固有尺寸和
一个 `ContentFit` 推导出各自的 **Content Frame**。

这就是那两个 frame。它们并不总是嵌套关系：

```text
contain                 cover

Placement Frame         Content Frame
┌──────────────┐       ┌──────────────────┐
│  ┌────────┐  │       │  ┌────────────┐  │
│  │Content │  │       │  │ Placement  │  │
│  │ Frame  │  │       │  │   Frame    │  │
│  └────────┘  │       │  └────────────┘  │
└──────────────┘       └──────────────────┘
```

因此把第二个称作“内框”是错误的。在 `cover`、缩放或局部运动之下，Content Frame 可能超出 Placement
Frame。

一个 Placement Frame 可以包含若干个显式样本。纯色底衬没有 Content Frame。一个模糊样本和一个前景样本各自
拥有独立的 Content Frame，即使它们引用同一个 Artifact。不存在被所有图层共享的那种全局唯一“内框”。

## 2. 边界

聚焦的视频领域包是 `@narratage/spatial`。它拥有纯类型、validator、面向可复用几何的作者 Surface 以及确定性
的几何 Producer。它不拥有：

- 时间窗口或媒体的固有播放行为；
- 文字折行或字形测量；
- 媒体解码、流选择或容器旋转；
- 背景、模糊、不透明度、颜色、描边或阴影；
- z-order、转场或局部运动；
- Composition、Runtime、Provider 或 Core 的行为。

这些事实只通过图的边与 Spatial 相遇。例如，Media Inspection 选定一路可视流并产出其面向显示的 extent；
某个 Media 包再显式地把该 extent 转换成 `IntrinsicExtent`，交给 Spatial 做 fitting。Spatial 永远不会打开
一个 MP4，也不会猜测哪一路流是主流。

安装或修订这个包不得改变 Core。Core 看到的只是普通的带类型 Record 和 Operation。

## 3. CanvasSpace

`CanvasSpace` 在任何 Track 被撰写之前就确立了精确的坐标系：

```ts
type CanvasSpace = {
  readonly contract: "svml.canvas-space@1";
  readonly widthPx: number;
  readonly heightPx: number;
  readonly origin: "top-left";
  readonly xDirection: "right";
  readonly yDirection: "down";
  readonly pixelAspect: "square";
};
```

宽和高是正整数。颜色、clear Paint、帧率和时长不是空间事实，都留在这个值之外。

Canvas 必须先于 Track 声明，随后作为同一个图上的值连接到 Film/Composition。当前的 Film Surface 把宽高藏在
最终的 Film 声明内部，这对精确的 Text 和 Media 布局来说太晚了。它的重写必须把 Canvas 声明与最终的 Track
装配分开，而不是把宽高复制进每一份 Track Recipe。

预期的源码形态是：

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>

<!-- Track declarations consume vertical or Frames derived from it. -->

<film:Film id="main" canvas={vertical} space={program} appearance={studio.film.main}>
  ...
</film:Film>
```

精确的 Surface 写法仍处于冻结前状态。单值数据流是规范性的。

## 4. SpatialFrame 的构造

一个已解析的 `SpatialFrame` 是 Canvas 像素坐标系中的有限矩形：

```ts
type SpatialFrame = {
  readonly contract: "svml.spatial-frame@1";
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
};
```

宽和高必须为正。`xPx` 与 `yPx` 可以为负，也可以延伸到 Canvas 之外。画布外的 Frame 对进出场运动很有用，
不得被悄悄 clamp、求交或拒绝。哪些像素可见由 Canvas 光栅化决定。Clamp 永远是一次显式的投影选择。

作者输入可以使用相对 Canvas 的百分比或像素。它们会在消费者布局其内容之前编译成这一种已解析形式。百分比相对
的是显式连接的父 Frame 的宽/高，而不是渲染器碰巧创建的某个 DOM 容器。

三个作者组件在不需要 mode 字段的前提下覆盖了常见的构造语义：

1. `Frame`：在父 Canvas/Frame 内部的四条显式边；
2. `AnchoredFrame`：一个目标点、一组宽/高，以及九个自身锚点之一；
3. `AspectFrame`：一个目标点、一个主尺寸，以及一个显式给出或连接进来的宽高比。

概念上：

```svml
<space:Frame id="safe" within={vertical}
  left="6%" top="4%" right="94%" bottom="96%"/>

<space:AnchoredFrame id="card" within={safe}
  x="50%" y="78%" width="82%" height="28%" anchor="center"/>

<space:AspectFrame id="sticker" within={safe}
  x="100%" y="100%" width="32%" aspect={portrait.extent} anchor="bottom-right"/>
```

`Frame` 不代表一个可见的盒子。它只产出几何。`AspectFrame` 可以消费一条通用的 `IntrinsicExtent` 边；它不
依赖 Media。

九个规范锚点名是：

```text
top-left       top-center       top-right
middle-left    center           middle-right
bottom-left    bottom-center    bottom-right
```

编译后的数学是点吸附，而不是九套硬编码的布局算法：

```text
frame.x = target.x - frame.width  × selfAnchor.x + offset.x
frame.y = target.y - frame.height × selfAnchor.y + offset.y
```

每个具名锚点不过是一对可读的 `(0 | 0.5 | 1, 0 | 0.5 | 1)`。更高级的 Surface 可以暴露任意归一化锚点，而不必
改变编译后的合同。

安全区、左栏、标题区和商品区都是从 Canvas 或父 Frame 派生出来的普通具名 Frame。它们不是保留的全局 token。

## 5. IntrinsicExtent

`IntrinsicExtent` 是保持内容形状所需的最小通用事实：

```ts
type IntrinsicExtent = {
  readonly contract: "svml.intrinsic-extent@1";
  readonly widthPx: number;
  readonly heightPx: number;
};
```

这两个值是内容面向显示的、为正的自然像素 extent。`contain`、`cover`、`fit-width`、`fit-height` 和
`stretch` 只需要它们的比值；`native` 和 `scale-down` 还会用到它们与 Canvas 像素的绝对关系。Media 可以在应用
容器旋转和 sample aspect 信息之后推导它们。Text 可以从精确的字体排版推导它们。矢量组件必须选择一个显式的
标称光栅 extent，而不是假装任意的 view-box 单位就是 Canvas 像素。它们都不会把源 Artifact、字体、组件族或
上游摘要存进 `IntrinsicExtent`；这些关系仍然显现在图的边与 Derivation 上。

## 6. ContentFit 与两个 frame 的方程

`ContentFit` 选择尺寸策略、对齐方式，以及一个可选的对齐约束：

```ts
type ContentFit = {
  readonly contract: "svml.content-fit@1";
  readonly sizing:
    | "contain"
    | "cover"
    | "fit-width"
    | "fit-height"
    | "native"
    | "scale-down"
    | "stretch";
  readonly framePoint: { readonly x: number; readonly y: number };
  readonly contentPoint: { readonly x: number; readonly y: number };
  readonly offsetPx: { readonly x: number; readonly y: number };
  readonly constraint: "bounded" | "free";
};
```

两个点都在各自的 Frame 内归一化。`framePoint` 说明所选的内容点想落在 Placement Frame 的哪个位置。
`contentPoint` 说明源上的哪个固有点是重要的。这比旧的单一 `focalX/focalY` 更有表达力 —— 后者在两边悄悄用了
同一个坐标。两个点的坐标都必须落在 `[0,1]`；有意超出该范围的位移使用 `offsetPx`，当结果必须留在范围之外
时使用 `constraint="free"`。

给定 Placement Frame `(Vx, Vy, Vw, Vh)` 和固有 extent `(Sw, Sh)`，保持宽高比的基础缩放为：

```text
contain      min(Vw / Sw, Vh / Sh)
cover        max(Vw / Sw, Vh / Sh)
fit-width    Vw / Sw
fit-height   Vh / Sh
native       1
scale-down   min(1, contain-scale)
```

对这些模式：

```text
Cw = Sw × scale
Ch = Sh × scale
```

`stretch` 有意放弃源宽高比，产出 `(Cw, Ch) = (Vw, Vh)`。它之所以是显式的，是因为成熟的编辑器允许形变；其他
任何尺寸模式都不得形变。

约束之前：

```text
Cx = Vx + Vw × framePoint.x - Cw × contentPoint.x + offset.x
Cy = Vy + Vh × framePoint.y - Ch × contentPoint.y + offset.y
```

对 `free` 而言，这些坐标就是最终结果。对 `bounded` 而言，每条轴按同一条法则做最小限度的 clamp：

- 内容较小时，让完整的 Content Frame 留在 Placement Frame 内部；
- 内容较大时，让完整的 Placement Frame 被 Content Frame 覆盖。

对水平轴来说这意味着：

```text
Cw <= Vw: clamp Cx to [Vx,           Vx + Vw - Cw]
Cw >= Vw: clamp Cx to [Vx + Vw - Cw, Vx          ]
```

垂直方向的法则完全相同。这支持了真正的焦点摆放，比如“源上的 `(0.8, 0.35)` 这个点应当出现在 Frame 的中心”，
同时不会允许意外露出未被覆盖的边条。

常见的九种对齐只是 `framePoint === contentPoint` 时的简写。居中 contain 和居中 cover 两边都是 `(0.5, 0.5)`。
`top-left` 两边都是 `(0,0)`。如果作者刻意要让内容跑到外面，或者刻意让 Placement Frame 不被完全覆盖，就选择
`free`；Runtime 绝不替他做这个创作决定。

`FittedContent` 只包含推导出的 Content Frame，不重复上游血缘：

```ts
type FittedContent = {
  readonly contract: "svml.fitted-content@1";
  readonly contentFrame: SpatialFrame;
};
```

当需要裁剪到 Placement Frame 时，对应的源采样窗口是由 Placement Frame 与 Content Frame 的交集机械推导出来
的。它不是第三个由作者撰写的盒子。fit 之后的旋转或透视变换可能让采样边界不再是矩形，因此要放在这层基础布局
之后应用。

## 7. Fit 不是运动，也不是占用

一次 fit 计算产出的是基础 Content Frame。缩放、平移、旋转、透视和入场运动会在之后对该结果做变换。它们不会
改动 `ContentFit`，也不会改动源宽高比。

这避免了旧有的歧义：`zoom` 被塞进 `contain`/`cover` 里，从而可能悄悄让所声明的 fit 不再成立。如果一段 Ken
Burns 运动把一张 contain 的图片缩放到发生裁切，基础 fit 仍然是 `contain`，裁切是由之后的变换显式造成的。

Spatial 的尺寸策略与固有时间占用也毫无关系。一段视频可以在空间上是 `contain`，同时在时间上播放一次、循环或
拉伸。一张图片并不会仅仅因为它有固有的空间 extent 就获得某种固有的时间播放模式。

## 8. 裁剪与 frame 形状

Spatial 几何从不决定 Placement Frame 之外的像素是否可见。消费该几何的组件拥有显式的裁剪策略：

```text
none                 owned content may paint outside the Placement Frame
placement-frame      rectangular or rounded Frame clip
owned-shape          explicit shape/path owned by the same component
```

圆角半径、椭圆/路径蒙版、描边和阴影属于表现，不属于坐标。Text 的辉光完全可以合理地溢出它的 Placement
Frame；Media 卡片通常会把每个局部样本都裁剪到同一个圆角 Placement Frame。Runtime 不会根据内容类型推断出任何
默认值。

自有形状只能裁剪同一个组件贡献内的元素。它不能蒙版或采样另一个同级 Track。

## 9. 透明、纯色、模糊与替代底衬

Placement Frame 中未被 Content Frame 绘制的区域本身不具备空间语义。Media/Text 的表现层提供的是一组有序的、
显式自有图层。

### 透明

不产出任何底衬图层。透明像素会在 Composition 时自然露出更低的 Track。这不是跨 Track 采样：该 Track 在那里
根本没有贡献像素。

### 纯色或渐变

一个 frame Paint 图层填满 Placement Frame。它没有源输入、没有 IntrinsicExtent、也没有 Content Frame。

### 同源的模糊副本

同一个源被显式地第二次连接进来，成为另一个局部样本：

```text
same source Artifact ─┬─> cover ContentFit -> blur/tone -> backing layer
                      └─> contain ContentFit            -> foreground layer
```

两个样本共享同一个 Placement Frame，但拥有各自独立的 Content Frame 和效果。Artifact 收集会对完全相同的字节
去重；渲染仍然执行两次显式采样。模糊实现必须在裁剪之前做边缘扩展/超采，以免高斯核造出非预期的透明或发暗
边框。

### 另一张图片或另一段视频

替代源通过自己的图边进入，并获得属于自己的 Inspection、IntrinsicExtent、ContentFit，对于有时长的媒体还包括
占用策略。它不是藏在某个 Style Recipe 里的字符串路径。

因此通用的 Media 作者模型是有序的局部图层，而不是特殊的 `foreground/background` 字段：

```svml
<media:Item id="portrait-card" frame={card} clip={rounded-card}>
  <media:Paint recipe={studio.media.card-base}/>
  <media:Layer source={portrait} fit={cover} effects={blurred}/>
  <media:Layer source={portrait} fit={contain}/>
</media:Item>
```

把第二个源换成另一张图片，表达的就是替代底衬。删掉前两个子节点，表达的就是透明底衬。当需要与同级 Track
交错时，每个图层都可以下降为自己的绝对堆叠 Present；作者层的 Track 绝不会变成隐式的堆叠上下文。

完整的 Item/Sequence 作者模型见 [`media-track.md`](./media-track.md)。独立的深度堆叠集合模型见
[`deck-track.md`](./deck-track.md)。两者都复用显式图层与边的法则，而不会把 Deck 变成 Media 的一种模式。

### 仍然被禁止的做法

对已经累积出来的 Composition 施加 `backdrop-filter` 不属于上述任何一种情形。那会让结果依赖于任意的下层
Track。要模糊另一个视觉物，组件必须显式接收那个视觉/媒体。要模糊一个已完成的下层合成，必须由更高阶的组件先
显式拥有并物化那个合成。

## 10. Text、Ranking 与 Caption 的用法

Spatial 提供公共几何，同时不强加单一布局模型：

- Point Text 消费一个 `SpatialPoint`，并从精确的文字 extent 推导其 Content Frame；
- Area Text 消费一个 Placement Frame，然后在其内部执行包自有的段落排流；
- Path Text 消费一条显式的 `SpatialPath`；
- Media 消费一个 Placement Frame，并为每个样本推导一个 Content Frame；
- Ranking 消费一个 Placement Frame，并在其内部拥有 board、slot 和暂存区布局；
- Comment Sticker 消费一个 Placement Frame，并拥有自己的头像/文字/内部布局；
- Caption 可以消费一个 Placement Frame，但 Cue/Atom 的折行仍归 Caption 所有。

Text 的布局盒和 Media 的 Content Frame 并不会仅仅因为都是矩形就成为同一个语义 Type。它们可以使用同样的纯几何
辅助函数，同时各自仍然是包自有的已解析事实。

## 11. 图数据流与不传播元数据

```text
CanvasSpace + Frame Projection
              │
              ▼
         SpatialFrame ───────────────────────────────┐
                                                     │
Media Inspection -> display extent -> IntrinsicExtent│
                                                     ├─> fit -> FittedContent
authored ContentFit ─────────────────────────────────┘          │
                                                                ▼
                               package Paint/motion/clip -> VisualTrack
```

每一条依赖都是图上的一条边。`BlobArtifact` 不会长出摆放字段。`SpatialFrame` 不会长出源、角色、时间或
Artifact 摘要。`VisualTrack` 不会长出 `focal`、B-roll 或 Text 字段。亲和性由多输入的 fitting/lowering
Operation 校验，而不是靠把血缘元数据复制到每一个值上。

## 12. 保留与废弃的历史结论

保留：

- 归一化的作者摆放，以及感知源宽高比的锚定摆放；
- 相互独立的源 fitting 与时间占用；
- contain、cover、fit-width 和 fit-height 的方程；
- 相互独立的前景采样与底衬采样；
- 源焦点对齐与显式吸附点；
- 可选的透明、纯色和自身模糊底衬；
- 叠加在采样/摆放之上的局部运动。

废弃：

- 把区域、VLM 推断、避让、路径信号和固定盒子混在一起的联合体 `SpaceLocator`；
- 把九宫格代号当作彼此独立的算法；
- 用同一份 `focalX/focalY` 同时充当源点和目标点；
- `MediaBoxStyle` 把“恰好一个前景加一个特殊底衬”当成通用模型；
- 把 zoom 嵌进 fit；
- 把渲染器专属的 CSS 与 FFmpeg 公式当成两份真相来源；
- 隐式的 `object-fit`、`object-position` 或 `backdrop-filter` 默认值。

## 13. 实现与验收顺序

1. **已实现：** 新增聚焦的 `@narratage/spatial` 包，含 `CanvasSpace`、Frame/Point/Path、
   `IntrinsicExtent`、`ContentFit` 以及纯粹的 fit 校验；
2. **已实现：** 把 Canvas 声明从 Film 装配中拆出，并把同一个 Canvas 值连接到 Track 布局与 Composition；
3. **已实现：** 让一个简单的 Text Area 和一张简单的 Media 静态图片走通共享几何；
4. **已实现：** 为每一条 fit 与对齐法则补上精确的浏览器测试；
5. **已实现：** 验证有序的 透明/纯色/自身模糊/替代源 Media 图层；
6. **已实现：** 让四个 Ranking 组件全部走显式的共享 Frame；Comment Sticker 在拥有自己的设计之前继续搁置；
7. 只有到这时才冻结 Spatial 的 Type 以及相关的 Visual IR 行为。

测试矩阵必须包含：

- 竖版、横版和方形的固有 extent，分别对上竖版、横版和方形的 Frame；
- 每一种尺寸模式，包括显式形变与 scale-down；
- 全部九种等点对齐，外加源/frame 焦点不相等的情形；
- bounded 与 free 对齐的对比；
- 为负的、部分越界的以及完全在画布之外的 Placement Frame 与 Content Frame；
- 父 Frame 百分比与像素偏移；
- 在进入 Spatial 之前已归一化的源旋转/sample aspect；
- 透明、纯色、同源模糊，以及替代图片/视频图层；
- 相互独立的底衬 Content Frame 与前景 Content Frame；
- 由所选渲染器实现锁定的取整/光栅行为；
- 共享 Type 中不存在 Core、Runtime、Film 族、Text 族或 Media 族的判别字段。

纯几何矩阵与真实 Chromium witness 现已覆盖每一种尺寸模式、全部九种等点对齐、不相等的 bounded/free 焦点，
以及部分/完全越出 Canvas 的 Frame。Media 归一化还会在推导 `IntrinsicExtent` 之前，把容器旋转和非方形 sample
aspect 物化成方形像素的视觉。Ranking 现在消费同样的显式 Frame 几何，且没有增加族判别字段。最终的 Visual IR
兼容性审查现已通过；Spatial 自己的作者 Surface 仍处于预发布状态，在此期间不应再生长出任何包内局部的百分比
词汇。
