---
title: SVS 样式表
description: SVS Recipe 语言——用于影片、字幕、媒体、文本及生成设置的类 CSS 样式表。
---

# SVS 样式表

SVS（`.svs`）文件使用类 CSS 语法定义可复用的类型化配置值。它们用于配置影片外观、字幕外观、Media 呈现与运动、文本样式、语音估算参数、生成设置和字体选择。SVS 中的值称为 **Recipe**——它们是不可变的类型化记录，由消费组件进行验证和解释。

## 基本语法

```svs
<?svml using="@narratage/svs@1"?>

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

- 处理指令 `<?svml using="@narratage/svs@1"?>` 用于选择 SVS 解析器。
- `<sheet>` 元素包裹所有声明。`id` 属性成为顶层命名空间。
- 每个块的格式为 `namespace.name { ... }`，属性以 `;` 结尾的键值对形式书写。
- 注释使用 `/* ... */`。

## 导入与引用

在 `.svml` 源文件中通过命名空间前缀导入 SVS 文件：

```svml
<import as="studio" source="./studio.svs"/>
```

然后通过 `{studio.film.vertical}`、`{studio.caption.primary}` 等方式引用各个 Recipe。前缀来自 `as=` 属性；路径来自样式表中的 `namespace.name`。

## Film

Film 外观只拥有画布清除颜色。画布尺寸是显式的 `space:Canvas` 图值，帧率来自
ProgramSpace。

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
<film:Film id="main" canvas={vertical} space={speech.space} appearance={studio.film.vertical}>
```

## Caption Fine

第一种官方 Caption 样式族把规划要求和渲染参数放在同一个 Recipe 中。

```svs
caption.dialogue {
  cue-min-words: 2;
  cue-max-words: 7;
  stack-order: 70;
  x: 0.08;
  y: 0.76;
  width: 0.84;
  font: Inter;
  weight: 600;
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
| `cue-min-words`、`cue-max-words` | 通用 Cue 字数边界 |
| `stack-order` | 所有 Track 之间的 Z 轴层叠顺序（值越大越靠前） |
| `x`、`y` | 位置，以画布比例表示（0–1） |
| `width` | 宽度，以画布比例表示 |
| `font` | Recipe 中便于阅读的字体标签；精确字节来自必填的 `font=` 图边 |
| `weight` | 请求的字体粗细（1–1000） |
| `size` | 字体大小（像素） |
| `line-height` | 行高倍数 |
| `align` | 文本对齐方式：`left`、`center`、`right` |
| `fill` | 文本颜色（十六进制，支持透明度） |
| `background` | 容器背景颜色（十六进制，支持透明度，如 `#09090BCC`） |
| `padding` | 容器内边距（像素）（单个值或 `垂直 水平`） |
| `radius` | 容器圆角半径（像素） |

若要可复现渲染，应在 `.svml` 源码中显式选择已安装的精确字体，并把该 Record 传给 Fine
Style。主字体的 `weight` 与 `style` 必须和 Recipe 一致：

```svml
<fonts:Face id="caption-font" family="inter" weight="600" style="normal"/>
<caption-fine:Style id="primary-caption" recipe={studio.caption.dialogue}
  font={caption-font}/>
```

### 按角色设置字幕样式

为不同说话者定义多个字幕 Recipe：

```svs
caption.alice {
  cue-min-words: 2; cue-max-words: 5;
  stack-order: 70;
  x: 0.08; y: 0.76; width: 0.84;
  font: Inter; weight: 600; size: 58;
  fill: #73FBD3;
  background: #09090BCC;
  padding: 16 24; radius: 18;
}

caption.bob {
  cue-min-words: 2; cue-max-words: 5;
  stack-order: 70;
  x: 0.08; y: 0.76; width: 0.84;
  font: Inter; weight: 600; size: 58;
  fill: #FFD166;
  background: #09090BCC;
  padding: 16 24; radius: 18;
}
```

然后通过 `caption:Program` 进行分配：

```svml
<fonts:Stack id="caption-font" family="inter" weight="600" style="normal"/>
<caption-fine:Style id="default-caption" recipe={studio.caption.dialogue} font={caption-font}/>
<caption-fine:Style id="alice-caption" recipe={studio.caption.alice} font={caption-font}/>
<caption-fine:Style id="bob-caption" recipe={studio.caption.bob} font={caption-font}/>
<caption:Program id="caption-program" display={story.caption} default={default-caption}>
  <caption:Use role="ALICE" style={alice-caption}/>
  <caption:Use role="BOB" style={bob-caption}/>
</caption:Program>
```

## Media Track

Media 将空间位置、框呈现与生命周期运动分开。`SpatialFrame` 负责位置和尺寸；外观 Recipe
负责素材适配与框材质；可选的 motion Recipe 负责入场、持续和退场。

```svs
media.product {
  stack-order: 40;
  fit: contain;
  playback: hold-start;
  frame-paint: #111116;
  clip: rounded;
  radius: 28;
  padding: 0;
  border-width: 1;
  border-style: solid;
  border-color: #FFFFFF20;
  shadows: 0 10 24 0 #00000066;
}

motion.product {
  enter: slide;
  enter-frames: 8;
  enter-direction: up;
  enter-easing: ease-out;
  exit: fade;
  exit-frames: 6;
  exit-easing: ease-in;
}
```

| 属性 | 描述 |
|---|---|
| `stack-order` | Z 轴层叠顺序 |
| `fit` | `contain`、`cover`、`fit-width`、`fit-height`、`native`、`scale-down` 或 `stretch` |
| `frame-x`、`frame-y` | 放置 Frame 内的对齐点 |
| `content-x`、`content-y` | 素材内部独立选择的焦点 |
| `playback` | `once-start`、`hold-start`、`loop-end`、`stretch` 等有时长素材占用方式 |
| `frame-paint` | 采样素材背后的纯色或渐变 Paint |
| `clip`、`radius`、`padding` | 框裁切与内缩 |
| `border-*`、`shadows` | 框自有的边框与有序阴影 |
| `enter`、`exit` | 生命周期算子；帧数、缓动和方向使用独立属性 |
| `sustain` | 零个或多个确定性局部运动，例如 `float 12 2 up` |

位置始终是一条显式图边：

```svml
<space:Frame id="product-frame" within={vertical}
  left="8%" top="20%" right="8%" bottom="32%"/>
<media-track:Item source={product-media.media}
  during={story.selection.demo} frame={product-frame}
  appearance={studio.media.product} motion={studio.motion.product}/>
```

## 文本

文本叠加层外观——排版与 Paint。位置由另一条 `SpatialFrame` 图边提供。

```svs
text.title {
  stack-order: 90;
  weight: 900;
  size: 64;
  align: center;
  fill: #FFFFFF;
  tracking: -1;
}
```

| 属性 | 描述 |
|---|---|
| `stack-order` | Z 轴层叠顺序 |
| `weight` | 字体粗细 |
| `size` | 字体大小（像素） |
| `align` | 文本对齐方式 |
| `fill` | 文本颜色 |
| `tracking` | 字间距调整 |

先与精确字体字节一起编译为 `text:Style`，再由具体放置形式引用：

```svml
<fonts:Stack id="title-font" family="inter" weight="900" style="normal"/>
<text:Style id="title-style" recipe={studio.text.title} font={title-font}/>
<text:Area id="meaning" placement={title-frame} style={title-style} during="program">
  MEANING
</text:Area>
```

## 语音估算

确定性语音时长估算的参数。

```svs
speech.normal {
  language: en;
  pace: normal;
  min: 4;
  max: 15;
  rounding: round;
}
```

| 属性 | 描述 |
|---|---|
| `language` | 语言代码（如 `en`） |
| `pace` | 语速：`slow`、`normal`、`fast` |
| `rate` | 正数的每秒读音单位数；不能和 `pace` 同时使用 |
| `min` | 最小时长（秒） |
| `max` | 最大时长（秒） |
| `rounding` | 取整模式：`none`、`round`、`ceil` |

英语三个具名档位分别解析为每秒 `4.2`、`4.6`、`5.0` 个音节。项目需要连续可调值时，
用数值 `rate` 代替 `pace`。
所有属性都必须显式提供：`language`、`min`、`max`、`rounding`，并且在 `pace` 与
`rate` 中恰好选择一个。Estimate 包不会补充隐藏策略默认值。

通过 `estimate:Speech` 的 `policy` 属性引用：

```svml
<estimate:Speech id="hook-duration" source={story.segment.hook.speech}
  policy={studio.speech.normal}/>
```

## Speaker

Seedance Speaker 生成设置——控制 `speaker:Take` 如何生成说话人头像片段的 Recipe。

```svs
speaker.host {
  kind: ugc-talking-head;
  model: mini;
  resolution: 720p;
  aspect-ratio: 9:16;
  composition-stability: soft-locked;
  camera-motion: none;
  edit-rhythm: continuous-take;
  performance: natural-explainer;
  gesture: natural;
  voice-mode: single-speaker;
}
```

| 属性 | 描述 |
|---|---|
| `kind` | 生成类型（如 `ugc-talking-head`） |
| `model` | 模型名称：`mini` |
| `resolution` | 输出分辨率：`480p`、`720p`、`1080p` |
| `aspect-ratio` | 输出宽高比：`9:16`、`16:9`、`1:1` |
| `composition-stability` | 镜头/构图一致性：`flexible-ugc`、`soft-locked`、`strict-locked` |
| `camera-motion` | 镜头运动：`none`、`subtle-punch-in-return` |
| `edit-rhythm` | 剪辑风格：`continuous-take`、`pause-trim-jump-cuts` |
| `performance` | 表演风格：`natural-explainer`、`high-energy-ugc`、`calm-authority`、`reactive-playful` |
| `gesture` | 手势强度：`restrained`、`compact`、`natural`、`expressive` |
| `voice-mode` | 语音配置：`single-speaker` |

通过 `speaker:Take` 的 `recipe` 属性引用：

```svml
<speaker:Take id="hook-take" dialogue={story.segment.hook.dialogue}
  duration={hook-duration.duration} recipe={studio.speaker.host} kit={ugc.official-ugc-v1}>
```

## 精确字体声明

SVS 描述字体策略，但不选择或打开字体字节。常用开源字体由私有的预发布字体目录显式
导入；只有作者图真正引用的字体会进入本次 Build：

```svml
<import as="fonts" from="@narratage/fonts-open@1"/>

<fonts:Stack id="caption-fonts" family="inter" weight="600" style="normal" emoji="color">
  <fonts:Fallback family="noto-sans-sc" weight="600" style="normal"/>
</fonts:Stack>
```

| 属性 | 描述 |
|---|---|
| `family` | 字体包有限目录中的字体族 |
| `weight` | 精确选择的字体粗细 |
| `style` | `normal` 或该字体族支持的 `italic` |
| `emoji` | `Stack` 可选的 `color`（COLRv1）或 `mono` 兜底 |

目录现有 109 个开源字体族，覆盖手写、书法、展示、无衬线、衬线、等宽、CJK、其他
文字系统与 Emoji。Fontsource 依赖固定为 `5.3.0`，Chromium 兼容的 COLRv1 Emoji 包另行
锁定版本；编译器把已安装字节哈希成内容寻址的字体值，Build 过程不会下载字体，Runtime
也不猜字体：

```svml
<caption-fine:Style id="dialogue" recipe={studio.caption.dialogue}
  font={caption-fonts}/>
```

`fonts:Stack` 产出通用 `FontStackRef`：主字体必须和 Recipe 的 weight/style 一致，Fallback
保留自己的真实元数据。CJK 与 Emoji 即使由多个 Unicode-range 文件组成，在作者图中仍是
一条逻辑边。终端 Text 与 Fine Caption 都拒绝省略字体栈；Visual IR 不接受机器字体兜底。
对于同时具有文本与 Emoji 两种呈现的符号，作者应写真实的 Unicode Emoji 序列（例如
包含 VS16 的 `☎️`）；任何包都不会为了强制彩色而改写显示稿。

品牌字体与自定义字体仍是显式作者资产，不会被塞进共享目录：

```svml
<import as="media" from="@narratage/media@1"/>
<media:Font id="brand" src="./assets/Brand-Semibold.woff2"
  weight="600" style="normal"/>
```

## 综合示例

一个完整的 `studio.svs` 文件，用于四段式说话人头像项目：

```svs
<?svml using="@narratage/svs@1"?>

<sheet version="1" id="studio">
  speech.normal {
    language: en;
    pace: normal;
    min: 4;
    max: 15;
    rounding: round;
  }

  speaker.host {
    kind: ugc-talking-head;
    model: mini;
    resolution: 720p;
    aspect-ratio: 9:16;
    composition-stability: soft-locked;
    camera-motion: none;
    edit-rhythm: continuous-take;
    performance: natural-explainer;
    gesture: natural;
    voice-mode: single-speaker;
  }

  film.vertical {
    background: #09090B;
  }

  caption.primary {
    cue-min-words: 2;
    cue-max-words: 5;
    stack-order: 70;
    x: 0.08;
    y: 0.74;
    width: 0.84;
    font: Inter;
    weight: 800;
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
<import as="studio" source="./studio.svs"/>

<estimate:Speech id="hook-duration" source={story.segment.hook.speech}
  policy={studio.speech.normal}/>

<speaker:Take id="hook-take" ... recipe={studio.speaker.host} .../>

<caption-fine:Style id="primary-caption" recipe={studio.caption.primary} font={caption-font}/>

<space:Canvas id="vertical" width="720" height="1280"/>
<film:Film id="main" canvas={vertical} space={speech.space} appearance={studio.film.vertical}>
```
