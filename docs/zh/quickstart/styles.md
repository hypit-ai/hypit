---
title: SVS 样式表
description: SVS Recipe 语言——用于影片、字幕、媒体、文本及生成设置的类 CSS 样式表。
---

SVS（`.svs`）文件使用类 CSS 语法定义可复用的类型化配置值。它们用于配置影片外观、字幕外观、Media 呈现与运动、文本样式、生成设置和字体选择。SVS 中的值称为 **Recipe**——它们是不可变的类型化记录，由消费组件进行验证和解释。

## 基本语法

```svs
<?svml using="@hypit/recipe@1"?>

<sheet version="1" id="studio">
  film.vertical {
    background: #09090B;
  }

  /* Comments use CSS-style block syntax. */
  caption.primary {
    fill: #FFFFFF;
    size: 58;
  }
</sheet>
```

- 处理指令 `<?svml using="@hypit/recipe@1"?>` 用于选择 SVS 解析器。
- `<sheet>` 元素包裹所有声明。`id` 属性成为顶层命名空间。
- 每个块的格式为 `namespace.name { ... }`，属性以 `;` 结尾的键值对形式书写。
- 注释使用 `/* ... */`。

## 导入与引用

在 `.svml` 源文件中通过命名空间前缀导入 SVS 文件：

```svml
<import as="recipes" source="./recipes.svs"/>
```

然后通过 `{recipes.film.vertical}`、`{recipes.caption.primary}` 等方式引用各个 Recipe。前缀来自 `as=` 属性；路径来自样式表中的 `namespace.name`。

## Film

Film 外观只拥有画布清除颜色。画布尺寸是显式的 `space:Canvas` 图值，帧率来自 Timeline 使用的 Clock。

```svs
film.vertical {
  background: #09090B;
}
```

| 属性 | 描述 |
|---|---|
| `background` | 画布清除颜色（十六进制） |

通过 `film:Film` 的 `appearance` 属性引用：

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<film:Film id="main" canvas={vertical.canvas} timeline={speech.timeline} appearance={recipes.film.vertical}>
```

## Caption Fine

第一种官方 Caption 样式族把规划要求和渲染参数放在同一个 Recipe 中。

```svs
caption.dialogue {

  x: 0.08;
  y: 0.76;
  width: 0.84;
  size: 58;
  line-height: 0.96;
  align: center;
  fill: #FFFFFF;
  background: #09090BCC;
  padding: 16 24;
  radius: 18;
}
```

| 属性 | 描述 |
|---|---|
| `x`、`y` | 位置，以画布比例表示（0–1） |
| `width` | 宽度，以画布比例表示 |
| `size` | 字体大小（像素） |
| `line-height` | 行高倍数 |
| `align` | 文本对齐方式：`left`、`center`、`right` |
| `fill` | 文本颜色（十六进制，支持透明度） |
| `background` | 容器背景颜色（十六进制，支持透明度，如 `#09090BCC`） |
| `padding` | 容器内边距（像素）（单个值或 `垂直 水平`） |
| `radius` | 容器圆角半径（像素） |

若要可复现渲染，应在 `.svml` 源码中显式选择已安装的精确字体，并把该 Record 传给 Fine
Style。字体家族、字重和字形只在这条精确字体边上声明一次：

```svml
<fonts:Face id="caption-font" package="@fontsource-variable/inter" weight="600" style="normal"/>
<caption-fine:Style id="primary-caption" recipe={recipes.caption.dialogue}
  font={caption-font}/>
```

### 按角色设置字幕样式

为不同说话者定义多个字幕 Recipe：

```svs
caption.alice {

  x: 0.08; y: 0.76; width: 0.84;
  size: 58;
  line-height: 0.96;
  align: center;
  fill: #73FBD3;
  background: #09090BCC;
  padding: 16 24; radius: 18;
}

caption.bob {

  x: 0.08; y: 0.76; width: 0.84;
  size: 58;
  line-height: 0.96;
  align: center;
  fill: #FFD166;
  background: #09090BCC;
  padding: 16 24; radius: 18;
}
```

然后在 Track 中通过 Use 选择呈现样式：

```svml
<fonts:Face id="caption-font" package="@fontsource-variable/inter" weight="600" style="normal"/>
<caption-fine:Style id="default-caption" recipe={recipes.caption.dialogue} font={caption-font}/>
<caption-fine:Style id="alice-caption" recipe={recipes.caption.alice} font={caption-font}/>
<caption-fine:Style id="bob-caption" recipe={recipes.caption.bob} font={caption-font}/>
<caption-fine:Caption id="captions" document={story.caption} timing={story-captions}
  timeline={speech.timeline} within={vertical.bounds}>
  <caption-fine:Use style={default-caption}/>
  <caption-fine:Use role="ALICE" style={alice-caption}/>
  <caption-fine:Use role="BOB" style={bob-caption}/>
</caption-fine:Caption>
```

## Visual Track Clip

Visual Clip 将空间、源时间、像素处理与局部运动分开。`SpatialFrame` 负责位置和尺寸；
fit 与可选的源时间偏映射是这次出现的直接事实。处理 Recipe 只复用图像与 Frame 的
绘制，而类型化 Motion 是仿射/透明度关键帧，不是封闭的效果名。

```svs
visual.product {
  frame-paint: #111116;
  clip: rounded;
  radius: 28;
  padding: "0";
  border-width: 1;
  border-style: solid;
  border-color: #FFFFFF20;
  shadows: 0 10 24 0 #00000066;
}
```

| 属性 | 描述 |
|---|---|
| `fit` | `contain`、`cover`、`fit-width`、`fit-height`、`native`、`scale-down` 或 `stretch` |
| `frame-x`、`frame-y` | 放置 Frame 内的对齐点 |
| `content-x`、`content-y` | 素材内部独立选择的焦点 |
| `Map` 子节点 | 该 Clip occurrence 自有的含时素材坐标偏映射 |
| `frame-paint` | 采样素材背后的纯色或渐变 Paint |
| `clip`、`radius`、`padding` | 框裁切与内缩 |
| `border-*`、`shadows` | 框自有的边框与有序阴影 |
| `motion` / `Pose` | Clip 局部时钟上的可选仿射与透明度状态 |

位置始终是一条显式图边：

```svml
<space:Frame id="product-frame" within={vertical.bounds}
  left="8%" top="20%" right="92%" bottom="68%"/>
<visual:Motion id="product-in">
  <visual:Pose at="start" y="80" opacity="0" easing="ease-out"/>
  <visual:Pose at="8f" y="0" opacity="1"/>
  <visual:Pose at="end" y="0" opacity="1"/>
</visual:Motion>
<visual:Clip media={product-media.media}
  during={demo} frame={product-frame} fit="contain"
  treatment={recipes.visual.product} motion={product-in}>
  <visual:Map/>
</visual:Clip>
```

如果行为要协调多个对象、改变结构或赋予素材新的视觉角色，就编写组件。Motion 是共享的
数学底座，不是试图枚举未来所有效果的目录。

## 文本

细粒度文字 Style 只拥有可复用的排版与 Paint。几何和具体形式的布局由每次 occurrence 直接拥有；
它在 VisualScope 中的位置由父级成员序列拥有，因为这些事实会随同一 Style 的不同使用而改变。

```svs
text.title {
  weight: 900;
  size: 64;
  fill: #FFFFFF;
  tracking: -1;
}
```

| 属性 | 描述 |
|---|---|
| `weight` | 字体粗细 |
| `size` | 字体大小（像素） |
| `fill` | 文本颜色 |
| `tracking` | 字间距调整 |

先与精确字体字节一起编译为 `text:Style`，再由具体放置形式引用：

```svml
<fonts:Face id="title-font" package="@fontsource-variable/inter" weight="900" style="normal"/>
<text:Style id="title-style" recipe={recipes.text.title} font={title-font}/>
<text:Flow id="meaning" timeline={speech.timeline} within={title-frame}
  style={title-style} align="center" during={speech.window}>
  MEANING
</text:Flow>
```

## Speaker Text Template

这个 Recipe 选择纯数据 `speaker-v1` Text Template 声明的 Prompt 轴。模型、分辨率、参考素材与时长仍是 `seedance:ReferenceVideo` 的显式输入，不藏在 Recipe 里。

```svs
speaker.host {
  composition-stability: soft-locked;
  camera-motion: none;
  edit-rhythm: continuous-take;
  performance: natural-explainer;
  gesture: natural;
}
```

| 属性 | 描述 |
|---|---|
| `composition-stability` | 镜头/构图一致性：`flexible-ugc`、`soft-locked`、`strict-locked` |
| `camera-motion` | 镜头运动：`none`、`subtle-punch-in-return` |
| `edit-rhythm` | 剪辑风格：`continuous-take`、`pause-trim-jump-cuts` |
| `performance` | 表演风格：`natural-explainer`、`high-energy-ugc`、`calm-authority`、`reactive-playful` |
| `gesture` | 手势强度：`restrained`、`compact`、`natural`、`expressive` |
与 Kit 的 Template 一起由 `text:Render` 引用：

```svml
<text:Render id="hook-prompt"
  template={speaker-kit.speaker-v1} recipe={recipes.speaker.host}>
  <text:Set name="dialogue" text={story.segment.hook.dialogue}/>
  <text:Set name="action" text={hook-action}/>
</text:Render>
```

## 通用 Text Template Recipe

无需领域包装器也能使用同一优先级。`text:Render` 可以读取任意 SVS Recipe，只投影模板明确声明的属性，并允许显式 `text:Param` 覆盖。这使 Seedance 的 B-roll、Podcast、Call、
Street Interview 与参考迁移 Kit 可以保持为纯数据，而不进入 Seedance 执行代码。

```svs
broll.product-demo {
  material-mode: product-beauty;
  story-shape: process-demo;
  edit-language: insert-cutaway;
  camera-language: product-macro;
  motion-intensity: readable;
}
```

Street Interview、Podcast 与 Call 使用同一套 Recipe 机制，不需要手写固定 Prompt。例如：

```svs
interview.street {
  framing: soft-handheld;
  pacing: compact;
  performance: natural-street;
  reaction: active;
  gesture: natural;
}
```

`street-interview-v1` 读取这五个轴，每段的镜头变化按作者顺序直接写在 `action` 中。`podcast-v1` 与 `call-v1` 读取同名的 `framing`、
`edit-language`、`pacing`、`performance`、`reaction` 和 `gesture` 轴，但使用各自的有限值。允许值和默认值以所选 Kit 文件为准。

模型、分辨率、时长和参考媒体不是模板策略；它们继续存在于精确模型声明与显式图边中。

## 精确字体声明

SVS 描述字体策略，但不选择或打开字体字节。官方 Hypit Distribution 已提供 Fontsource 适配器；
在视频项目自己的 `package.json` 中安装实际选中的上游字体包，普通 lockfile 固定真实版本：

```svml
<import as="fonts" from="@hypit/fontsource@1"/>
<import as="media" from="@hypit/media@1"/>

<fonts:Face id="caption-latin" package="@fontsource-variable/inter" weight="600" style="normal"/>
<fonts:Face id="caption-han" package="@fontsource-variable/noto-sans-sc" weight="600" style="normal"/>
<media:FontStack id="caption-fonts" primary={caption-latin}>
  <media:Fallback font={caption-han}/>
</media:FontStack>
```

| 属性 | 描述 |
|---|---|
| `package` | 一个已经安装的 `@fontsource` 或 `@fontsource-variable` 包 |
| `weight` | 精确选择的字体粗细 |
| `style` | `normal` 或该字体包支持的 `italic` |

Hypit 不维护有限字体目录，也不会在编译时安装字体族。适配器只把所选包的 metadata、CSS
和字体文件作为数据读取；编译器把已安装字节变成 Resource-backed 字体值。Build 过程不会下载字体，Runtime 也不猜字体：

```svml
<caption-fine:Style id="dialogue" recipe={recipes.caption.dialogue}
  font={caption-fonts}/>
```

`media:FontStack` 产出通用 `FontStackRef`，主字体与 Fallback 都保留自己的真实元数据；
Caption Recipe 只保存呈现参数；家族、字重与字形由 Font 值负责。CJK 与 Emoji 即使由多个 Unicode-range 文件组成，在作者图中仍是一条逻辑边。终端 Text 与 Fine Caption 都要求明确字体栈；Visual IR 只接受显式字体资源。对于同时具有文本与 Emoji 两种呈现的符号，作者应写真实的 Unicode Emoji 序列（例如包含 VS16 的 `☎️`），包按该显示稿绘制。

品牌字体与自定义字体仍是显式作者资产，不会被塞进中央目录：

```svml
<import as="media" from="@hypit/media@1"/>
<media:Font id="brand" src="./assets/Brand-Semibold.woff2"
  weight="600" style="normal"/>
```

## 综合示例

一个完整的 `recipes.svs` 文件，用于四段式说话人头像项目：

```svs
<?svml using="@hypit/recipe@1"?>

<sheet version="1" id="studio">

  speaker.host {
    composition-stability: soft-locked;
    camera-motion: none;
    edit-rhythm: continuous-take;
    performance: natural-explainer;
    gesture: natural;
  }

  film.vertical {
    background: #09090B;
  }

  caption.primary {

    x: 0.08;
    y: 0.74;
    width: 0.84;
    size: 44;
    line-height: 1;
    align: center;
    fill: #FFFFFF;
    background: #09090BCC;
    padding: 14 20;
    radius: 16;
  }
</sheet>
```

该文件在 `.svml` 源文件中导入一次，其值在整个文件中被引用：

```svml
<import as="recipes" source="./recipes.svs"/>

<text:Render id="hook-prompt" template={speaker-kit.speaker-v1}
  recipe={recipes.speaker.host}>...</text:Render>

<caption-fine:Style id="primary-caption" recipe={recipes.caption.primary} font={caption-font}/>

<space:Canvas id="vertical" width="720" height="1280"/>
<film:Film id="main" canvas={vertical.canvas} timeline={speech.timeline} appearance={recipes.film.vertical}>
```
