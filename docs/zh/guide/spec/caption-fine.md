---
title: Fine Caption Style 族
description: 已实现的预发布 Style 族，所声明的表面均有完整的浏览器证据。
---

# Fine Caption Style 族

状态：已实现的预发布 Style 族，所声明的表面均有完整的浏览器证据。

## 目的与边界

`@narratage/caption-fine` 是官方的、无字段的细粒度 Caption Style 族。这里的 “Fine” 指的是：不可变的
显示 Atom 被规划成短的语义 Cue，再经由一套确定性视觉系统渲染。它**不**表示 `important`、语义强调分类
或逐词的随机样式。

这个包消费三份已经存在的事实：

1. `CaptionProgram`，它给每个显示 Word 指派一份完整的 Style；
2. `TimedCaptionProjection`，它给每个 Cue 和每个完整 Atom 一个已证实的时间窗口；
3. `CaptionDisplaySequence`，它保留作者精确的可见文字与标点。

它输出一条普通的对等 `VisualTrack`。它绝不修改文字、绝不调用模型、绝不推断 Dual Text Atom 内部的时间，
也绝不往其他合同里塞 Caption 元数据。

| 归属 | 职责 |
|---|---|
| `@narratage/caption` | 通用 Style 外壳、Cue/字段 Plan 法则、全覆盖 Style 赋值与 Atom 时间 join |
| `@narratage/caption-fine` | Fine Recipe schema、layout、Paint、局部 motion 与 VisualTrack lowering |
| `@narratage/media` | `FontArtifactRef` 这类精确可复用的字节，绝不涉及 Fine 的排版策略 |
| `@narratage/visual-ir` | 封闭的、无代码的终端 element/style/keyframe 词汇 |
| Core | 只负责图的 demand、校验、派生和执行；不含任何 Caption 含义 |

只要现有公开合同还能表达结果，改动 Fine 的阴影、锚点、卡拉 OK 模式或 Cue 盒子，就不得修改 Caption、
Media、Composition、Visual IR 或 Core。

## 完整的正交表面

Fine 拥有一棵单字体的 Cue/Atom layout 树。它的各个维度互相独立：一份 Recipe 可以同时组合渐变字形、
当前词盒子、拖尾文字、下划线和局部 motion，而不必换一个渲染器。只有当某种外观改变了 layout 树、或者
需要 planner 字段时——例如双字体的编排式排版——才有理由新开一个包；仅仅增加 Paint 或局部 motion 不算。

### 1. Cue 规划

- `cue-min-words`
- `cue-max-words`

planner 只能在完整 Atom 之间切分。不可分割的作者 Atom 可以超过偏好的最大值；绝不会为了凑数字而把它
拆开。

### 2. 放置与布局

- 归一化的 `x`、`y`、`width`
- `anchor-x: left | center | right`
- `anchor-y: top | center | bottom`
- `align: left | center | right`
- `direction: ltr | rtl`
- `line-height`、`letter-spacing`、`word-gap`
- 绝对的 `stack-order`

Cue 只会在 Atom 之间自然换行。同一个 Atom 内的 Word 绝不会被拆到不同行。Fine 没有 `max-lines` 属性：
硬性行数限制要么丢弃作者文字，要么把浏览器测量偷偷带进确定性 lowering。Fine 绝不裁剪、绝不截断。作者
通过 Cue 词数边界、宽度和字号来控制密度。如果确实需要一条硬性布局断言，它必须是一个单独连接的组件，
其失败在图中是显式的。

### 3. 排版

- Recipe：`size`
- `text-transform: none | uppercase | lowercase`

text transform 只是终端呈现。它绝不改变 `CaptionDisplaySequence`、planner 输入、Word/Atom 身份、语音
对应或时间。

family、weight 和 style 被刻意排除在 Recipe 之外。每个 Style 都必须从 `@narratage/fonts-open` 引入
精确的已安装字面，或用 `<media:Font>` 声明自定义/品牌字节。`font=` 接受一个精确字面加上有序的、
Style 所属的 Fallback 子节点，或者一个可复用的通用 `FontStackRef`。开放字体的紧凑写法是：

```svml
<fonts:Stack id="caption-fonts" family="inter" weight="700" style="normal" emoji="color">
  <fonts:Fallback family="noto-sans-sc" weight="700" style="normal"/>
</fonts:Stack>
<caption-fine:Style id="primary" recipe={studio.caption.primary} font={caption-fonts}/>
```

字体这条边是 family、weight 和 style 的唯一真相来源。fallback 保留它自己诚实的字面元数据——例如 700
字重的拉丁主字面可以搭配 400 字重的符号 fallback。完全重复的字面会被拒绝。一个逻辑字面可以包含多个
按内容寻址的 Unicode-range 源，已安装的中日韩与 Emoji 字体就是如此。Fine 把 `FontStackRef` 展开成
同样有序的精确字面，并且只把它们放在自己的终端文本 element 上；Caption、Core 以及无关的图值保持不变。
省略 `font=` 是非法的，因此结果里不会混入任何 Runtime 或机器字体选择策略。

中日韩口播可以直接书写。纯显示的 emoji 仍然需要显式的语音对应，例如 `<🌐 | globe>`；Script 会正确地
拒绝为一个孤立符号发明口播 token。同时具有文字与 Emoji 呈现形态的字符，使用作者书写的精确 Unicode
序列（例如带 VS16 的 `☎️`）；没有任何 lowerer 会为了强制上色而改写显示文字。这是时间与文字真相问题，
不是字体能力问题。

### 4. 基础字形与激活字形的 Paint

- 纯色 `fill`，或 `gradient-from`、`gradient-to`、`gradient-angle`
- `opacity`
- 一层描边：`stroke-color`、`stroke-width`
- 一层阴影：`shadow-color`、`shadow-opacity`、`shadow-x`、`shadow-y`、`shadow-blur`
- 一层有界的方向性长阴影：`long-shadow-color`、`long-shadow-opacity`、
  `long-shadow-distance`、`long-shadow-angle`
- 一层辉光：`glow-color`、`glow-opacity`、`glow-blur`
- 一层基础下划线：`underline: off | always`、`underline-color`、`underline-thickness`、
  `underline-offset`

每个激活态 Paint 名字都带 `active-` 前缀。例如 `active-gradient-from`、`active-long-shadow-distance`
和 `active-glow-blur` 描述的是激活字形，不改变基础字形。

基础 Paint 与激活 Paint 形状相同。渐变替换该层的纯色填充；它不替换激活叠加层，也不替换卡拉 OK 过渡。
投影、长阴影和辉光是互相独立的作者贡献，会被 lower 成一条确定性的 `text-shadow` 声明。长阴影的展开有
实现上的上界，因此一份 Recipe 不可能造出无限膨胀的 CSS 负载。任意多层阴影、纹理、斜面和自由挤出仍在
Fine 之外。

### 5. Cue 盒子 Paint

- 纯色 `background`
- `border-color`、`border-width`
- 水平/垂直 `padding`
- `radius`

禁止背景采样，因为那会让这条 Track 去窥视另一条 Track 的像素。

### 6. 激活通道、卡拉 OK Paint 与时间

- 激活字形状态：`karaoke: off | current | trail`
- 激活字形过渡：`karaoke-transition: step | wipe`
- 激活盒子状态：`active-box: off | current | trail`
- 激活盒子连续性：`active-box-continuity: isolated | joined`
- 激活盒子 Paint：`active-box-background`、border、padding 和 radius
- 激活盒子 motion：`active-box-enter`、`active-box-exit`、`active-box-transition-frames`
- 激活下划线状态：`active-underline: off | current | trail`，以及颜色、粗细和偏移

激活状态与装饰几何被刻意分开。`current` 只激活其实测窗口包含当前帧的那个 Atom。`trail` 让每个已激活的
Atom 一直保留到 Cue 结束。`step` 整体切换激活字形层；`wipe` 在该 Atom 的实测窗口内逐步揭示它。RTL 会
反转 wipe 方向。字形、盒子和下划线可以各自选择不同的状态策略，因此历史上保留的那种行为——拖尾文字配
仅当前的 pill——可以直接表达。

isolated 盒子为每个已激活的 Atom 各画一个盒子。joined 拖尾把有序的已激活前缀画成连续的行内片段：同一
渲染行上的 atom 共享一个背景，而每个折行的行各自获得自己的端帽。决定这些片段的是浏览器的行布局，而不是
上游元数据。Fine 绝不把实测行盒子传播到图里。

卡拉 OK 刻意是 Atom 粒度的。在普通文字里，一个 Atom 通常就是一个可见 Word。在 `<45% | forty five percent>`
中，作者书写的可见 `45%` 是一个 Atom，作为一个整体激活。在多词显示 Atom 中，整个作者 Atom 一起激活。
下游任何包都不会发明作者与音频证据从未提供过的内部 Word 时间戳。

### 7. 分层的局部 motion

- Cue 进入/退出：`none | fade | pop | scale | spring | bounce | elastic | stamp | tilt |
  zoom-blur | flip-x | flip-y | spin | squash | stretch | slide-left | slide-right | slide-up |
  slide-down | blur-in | wipe-left | wipe-right | wipe-up | wipe-down`
- Atom 进入与退出：同一套一次性词汇，时长独立
- Atom 揭示：`all | on-start | typewriter`
- 激活响应与激活盒子的进入/退出：同一套一次性词汇
- 连续的局部循环：`none | shake | wobble | glow-pulse | breathe | float | pulse | flicker`，
  作用于 Cue 或激活 Atom

扁平的 Recipe 名字是 `cue-enter`、`cue-exit` 及其各自独立的 `*-frames`；`atom-enter`、
`atom-enter-frames`、`atom-exit`、`atom-exit-frames`、`atom-reveal`；`active-response`、
`active-response-frames`、`active-scale`；
`slide-distance`；以及 `loop`、`loop-target`、`loop-period-frames`、`loop-intensity`。

Cue、Atom 生命周期、激活响应和循环各自拥有独立的包裹层，因此它们的 transform 是叠加组合而不是互相
覆盖。typewriter 在一个完整 Atom 内逐个揭示作者书写的显示字素；它是视觉插值，不代表字符级时间戳，
也绝不改变 Atom 边界。连续 motion 是有界的确定性帧函数，不含任何随机输入。任意路径运动和随机变化仍在
Fine 之外；它们属于通用 Typography 或独立的特效包，而不属于 Caption 的预设词汇。

## 一个渲染器，一棵 layout 树

静态输出与卡拉 OK 输出共享这套结构：

```text
placement
└── cue motion
    └── cue box
        ├── joined/isolated decoration underlay
        └── cue loop
            └── atom entry
                └── active response
                    ├── base words
                    └── active glyph/underline overlay
```

装饰底层只重复那份为了获得诚实的浏览器行片段所必需的、同样的透明字形几何。它不会制造出第二份文字真相。
激活叠加层复用同一份 Atom 几何。每个动画都会在 HyperFrames 看到它之前，lower 成有限的、按帧寻址的
`VisualTrack` keyframe。

## 默认值与兼容性

最初那十五个基线属性仍然是必填的，因此最小的 Recipe 也会对规划、几何、排版和可见盒子给出显式说明。
新增维度是可选的，并解析成一个完整的不可变参数对象：

- 左上锚点、LTR、normal 字体、零字距，以及四分之一 em 的词间距；
- 无描边、无阴影、无长阴影、无辉光、无下划线、无边框；
- 纯色填充，text transform 为 none；
- 激活字形、激活盒子和激活下划线均关闭；
- Cue/Atom/盒子的 motion 与循环均关闭，所有 Atom 可见；启用激活响应通道时，其 scale 默认为 1.08；
- 启用卡拉 OK 但未指定其他激活 Paint 时，激活填充默认为 `#FFD54A`，其余激活 Paint 维度继承基础 Paint。

未知属性一律拒绝。默认值属于包的实现策略，因此被其实现摘要覆盖；它们不是隐藏的 Runtime 行为。

## 已完成的证据门

完整设计是渐进交付的，而不是拆成互不兼容的版本：

1. **已解析模型与静态 lowering** —— 完整参数、锚点、布局、基础/激活 Paint、Cue 盒子与严格校验。
2. **定时 lowering** —— current/trail、step/wipe、Cue 淡入淡出、Atom 揭示和激活 scale，全部只使用已
   证实的整 Atom 时间。
3. **可复现性证据** —— 有序的精确 Font Artifact 栈、中日韩、emoji/符号 fallback、多行折行、描边、阴影、
   辉光以及全部四种字形卡拉 OK 模式，都有真实的浏览器/像素见证。`max-lines` 是被刻意拒绝，而不是被
   推迟。
4. **表现力 Paint 与 motion 证据** —— 仅当前盒子与拖尾盒子、isolated 与 joined 几何、渐变、下划线、
   长阴影、text transform、分层的一次性 motion、typewriter 揭示与确定性循环，各自都有终端 IR 见证；
   joined 几何另外还有真实折行的浏览器/像素见证。

没有任何一道门改动 Core 或公共 Caption。精确的字体选择是 Media Font Surface 与 Fine Style Surface 之间
一条显式的作者图引用，而不是沿着 Caption 流水线传播的元数据。
