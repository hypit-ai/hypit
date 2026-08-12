---
title: SVML Screen Overlay 作者面
description: 可选官方 Screen Overlay 包的已实现预发布合同及其自描述 Surface。
---

# SVML Screen Overlay 作者面

状态：可选官方 Screen Overlay 包的已实现预发布合同。它的自描述 Surface、十一个带类型的组件以及顺序 /
并行浏览器证据均可执行；它还不是冻结的公开 ABI。

## 目的

`@narratage/screen-overlay` 在作者声明的时间窗口内贡献自包含的、通常是全画布的像素。一次 Flash、暗角、
扫描线薄纱或确定性漏光，都只是普通的 `VisualTrack`，与 Text、Caption、Media 或 Ranking 完全一样。

它不是调整图层、不是有特权的后合成钩子、不是转场引擎，也不是读取下层 Track 像素的手段。

```text
Moment / Selection / Program ─> shared temporal projection ─┐
CanvasSpace ────────────────────────────────────────────────┼─> Overlay Program
effect parameters / explicit owned assets ─────────────────┘          │
                                                                      ▼
                                                Visual IR elements or owned Surface
                                                                      │
                                                                      ▼
                                                                 VisualTrack
```

Core、Runtime 和 Composition 都不认识 Screen Overlay。Composition 只校验并排列它那些自包含的 Present。

## 1. 自包含像素法则

每个 overlay 条目都必须仅凭以下内容就能渲染：

- 它自己作者声明的参数；
- 显式连接的 CanvasSpace 与 ProgramSpace；
- 该条目拥有的零个或多个显式资产；
- 它确定性的局部帧号。

它不得采样：

- 位于其下方的累积 Composition；
- 兄弟 Track；
- 隐藏的 Base Track；
- 上一个或下一个场景；
- 浏览器 backdrop 或环境纹理。

普通的 source-over alpha 合成是允许的：每个带 alpha 的 Track 都是这样抵达画布的。凡是结果依赖未知下层像素
的混合模式或滤镜，都不是自包含的。

这条法则意味着旧的、无源的 `backdrop-filter` 版高斯模糊、Color Adjust 和 Zoom Blur 都不是 Screen Overlay。
若要诚实地保留这些效果，媒体效果组件必须通过图边接收要变换的精确媒体或可合成 Surface，然后输出它自己
变换后的素材或 Track。如果将来某个组件显式地把一组选定的 Track 光栅化成一个 Surface，消费那个 Surface 同样
是显式的；Screen Overlay 永远不会获得一个隐秘的“当前帧”输入。

## 2. 作者包，不是算子注册表

官方包可以在同一个命名空间下暴露若干可读的作者组件：

```xml
<screen:Track id="screen-paint" canvas={vertical} space={speech.space}>
  <screen:Flash at={story.moment.hit} map={timing.map} for="240ms" z="90"
    color="#ffffff" intensity="0.9" attack="2" hold="3" decay="5"/>
  <screen:Vignette during="program" z="20"
    center-x="0.5" center-y="0.5" radius-x="0.82" radius-y="0.68"
    softness="0.3" color="#000000" opacity="0.28"/>
  <screen:Grain during="program" z="70"
    amount="0.12" size="3" chroma="monochrome" motion-rate="0.5" seed="23"/>
</screen:Track>
```

这只是示意性的 Surface 语法。编译出的 Program 包含显式的组件身份、参数和时间绑定；它不是一个由 Core 拥有
的、字符串化的 `effect="..."` 开关。

对这个小规模的官方集合来说，一个包很方便，但它不是中心注册表。第三方可以发布另一个自描述的包，把新组件
lower 到同一个 Visual Track 窄腰。只要现有的 Visual IR 或一个带类型的 Surface 能表达出来，新增一个 overlay
就不得要求改动 Core、Film、Composition 或 HyperFrames。

外观默认值和具名组合属于 `.svs` recipe。包拥有参数校验和确定性 lowering。Runtime Profile 与 Provider 不
选择视觉效果。

## 3. Program 的各个轴

每个 overlay 条目都有四个相互独立的作者关注点：

```ts
type ScreenOverlayItemSpec = {
  readonly id: string;
  readonly content: ScreenOverlayComponent;
  readonly projection: TemporalWindowProjection;
  readonly expansion: OccurrenceExpansion;
  readonly stackingOrder: number;
};
```

- `content` 标识实际的视觉组件及其带类型的参数；
- 组件自有的包络与局部运动参数留在那个带类型的组件内部，而不是塞进一个通用的呈现口袋；
- `projection` 与 `expansion` 使用共享的 Selection / Moment / Program 代数；
- `stackingOrder` 结合稳定的作者身份解析为一个普通的绝对 Present 键。

画布几何在这里不是作者选择的 Spatial Frame。Screen Overlay 有意拥有整个连接进来的 CanvasSpace。局部画面的
光效、图像、卡片或模糊属于普通的 Media、Text 或组件 Track，使用
[`spatial-layout.md`](./spatial-layout.md)。

条目默认相互独立。重叠是合法的，会产生多个普通 Present。不存在单例的 Screen Overlay 泳道，也没有全局的
合并步骤。

## 4. 时间与局部包络

Selection、Moment、Program 和绝对时间都通过 [`track-authoring.md`](./track-authoring.md) 下沉。Screen Overlay
没有自己的 `from`、`until`、`manual` 或短语匹配式的时间法则。

投影出的窗口只回答条目在哪里存在。窗口内的包络属于组件呈现。例如 Flash 可以定义 attack、峰值和 decay；
Directional Matte 可以把一条边从一侧移到另一侧；Grain 可以保持稳定。旧的那个在每个效果时长 30% 处达到峰值
的通用三角包络，作为隐藏的呈现策略被废弃。

Recipe 默认值可以提供包络，但解析后的 Program 必须包含精确的参数。效果不能为了容纳动画而扩张自己投影出的
窗口。作者写得更长的包络只会被该窗口裁剪；它不会被拒绝，也不会被偷偷加速。非法或零长度的窗口仍然通过公共
时间 validator 失败。

## 5. 可移植的官方组件集

有用的旧效果按两种诚实的 lowering 方式分为两组。

### 直接由 Visual IR 承载的候选

它们通常可以 lower 成全画布的矩形、渐变和局部关键帧：

- `Flash` —— 带显式不透明度包络的纯色；
- `ColorWash` —— source-over 的色彩薄纱；没有依赖下层像素的隐藏混合模式；
- `Vignette` —— 作者声明的中心、半径、柔和度、圆度、颜色和不透明度；
- `ScanLines` —— 间距、粗细、角度、不透明度和局部运动；
- `DirectionalMatte` —— 角度、覆盖范围、羽化、颜色、不透明度和进度；
- `WhipVeil` —— 方向、宽度、柔和度、行程和不透明度；
- `GlitchVeil` —— 确定性的、自有的色带 / 色块，而不是对下层像素的位移。

### 自有 Surface 的候选

把它们做成确定性的、带 alpha 的 `CompositableSurface` 值可能更容易或更精确，但当前的官方实现正好能完全
落在封闭的、无代码的 Visual IR 里：

- `Grain` —— 数量、颗粒尺寸、单色 / 彩色、运动速率和必需的 seed；
- `LightLeak` —— 颜色、角度、柔和度、行程、强度，以及随机时必需的 seed；
- `Bokeh` —— 数量、尺寸范围、颜色 / 色温、漂移和必需的 seed；
- `TVStatic` —— 数量、噪点尺寸、扫描线贡献、运动速率和必需的 seed。

只有当两种方式都产出完全相同的声明像素时，选择 Visual IR 还是 Surface 才是 lowerer 的实现决策。它不能取决
于恰好由哪个 Runtime 执行这次 Build。做实体化的实现可以发出一次普通的 Provider Need，但该 Need 返回的是带
类型的自有 Surface，而不会收到下层合成结果。

一切随机行为都要求一个显式解析出的 seed。`Math.random()`、墙上时钟、GPU 噪声或依赖渲染器的熵都是非法的。

## 6. 明确排除的效果

以下旧名称被排除在这个无源包之外：

| 旧效果 | 排除原因 | 诚实的替代方案 |
|---|---|---|
| `gaussian_blur` | 必须读取被模糊的像素 | 带显式输入的媒体 / surface 滤镜 |
| `color_adjust` | 曝光 / 对比 / 饱和 / 色相会改变输入像素 | 带显式输入的媒体 / surface 色彩变换 |
| `zoom_blur` | 真正的径向模糊需要被采样的画面 | 带显式输入的媒体 / surface 效果 |
| screen / multiply / overlay 混合薄纱 | 结果依赖下层像素 | source-over alpha 近似，或带显式输入的实体化 |

这并不删除视觉效果本身。它拒绝的是旧有的那种特权：一个号称普通的 Track 竟能改动它下方的一切。

Screen Overlay 同样不能：

- 改变 Program 时长或播放速率；
- 拥有相邻媒体条目之间的切点；
- 为两个兄弟 Track 做转场；
- 预留最顶层的 z-index；
- 把音效藏在视觉条目内部。

被视觉遮盖的硬切仍然是两个独立事实：Media 包拥有那个切点，而 Screen Overlay 恰好覆盖了其中一些帧。作者
组合出的 `Impact` Fragment 可以从同一个 Moment 产出一个 Visual Track 和一个 Audio Track，但两个输出仍然是
进入 Film 的显式同级边。

## 7. Stacking

旧的固定 `z_index: 200` 规则被废弃。“Screen”描述的是全画布几何，不是某个魔法渲染阶段。每个 Present 都获得
一个显式的绝对 stacking 意图，Composition 把它与其他所有 Present 一同展平。

作者可以有意把暗角放在字幕之下、把闪光放在字幕之上，或者把颗粒放在两个图形层之间。包的 recipe 可以提供
方便的 stacking 默认值，但 Film 和 Composition 绝不会按包的家族做分支，也绝不会强行把它顶到最上层。

如果某个 overlay 包在不同的 stacking 位置发出多个 Present，同级 Track 可以按照扁平 Track 法则的要求在它们
之间交错。

## 8. 旧系统迁移审计

保留：

- 短促的 Moment 命中与长时段的 Program overlay；
- Selection、Moment 和绝对时间放置；
- 全画布的闪光、薄纱、暗角、漏光、颗粒、扫描线、散景和雪花视觉；
- 确定性的效果专属参数与局部包络；
- 多个效果同时存在；
- 可选的显式自有纹理或实体化的 alpha Surface。

废弃：

- 单例槽位语义；
- 固定的最顶层 z-index 和字幕之后的特殊渲染阶段；
- 把一个中心字符串算子注册表当作系统事实；
- 通用的 30% 峰值包络；
- 隐藏的 `backdrop-filter` 访问；
- 跨 Track 的 `mix-blend-mode`；
- 把屏幕命中假装成场景转场；
- 隐藏的泳道级进出音效；
- 任何 Base FX 对应物或占位实现。

## 9. Lowering 与验收

实现遵循共享的 Temporal 合同和既有的 Visual Track 合同：

1. **已实现：** 自描述的 `@narratage/screen-overlay` 作者包；
2. **已实现：** 十一个相互独立的带类型作者组件，而不是一个不做校验的口袋；
3. **已实现：** 精确的、无代码的 `svml.visual-ir@1` lowering；当未来某个组件无法被精确表达时，通用的带类型
   自有 Surface 逃生口仍然可用；
4. **已实现：** 使用连接进来的 CanvasSpace 与 ProgramSpace，绝不使用 Film 全局量；
5. **已实现：** 普通的绝对 stack Present；
6. **已实现：** 每个组件与每种包络的确定性结构 / 帧测试；
7. **已实现：** 单 worker 与三 worker 的真实 Chromium 渲染产出完全相同的像素；
8. **已实现：** 多个 Overlay Track 按 stacking 键与同级 Track 交错；
9. **已实现：** 拒绝任何下层合成结果、兄弟 Track、backdrop-filter 或隐藏音频依赖的反例测试。

如果新增一个 overlay 需要在 Core 里加分支、在 Composition 里加家族、在 HyperFrames 里加组件开关，或者需要
对已合成像素做隐式快照，那么这个设计就是失败的。
