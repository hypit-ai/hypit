---
title: SVS 样式表
description: SVS Recipe 语言——用于影片、字幕、B-roll、文本及生成设置的类 CSS 样式表。
---

# SVS 样式表

SVS（`.svs`）文件使用类 CSS 语法定义可复用的类型化配置值。它们用于配置影片尺寸、字幕外观、B-roll 布局、文本样式、语音估算参数、生成设置和字体选择。SVS 中的值称为 **Recipe**——它们是不可变的类型化记录，由消费组件进行验证和解释。

## 基本语法

```svs
<?svml using="@narratage/svs@1"?>

<sheet version="1" id="studio">
  film.vertical {
    width: 1080;
    height: 1920;
    frame-rate: 30;
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

Film 外观——画布尺寸和背景颜色。

```svs
film.vertical {
  width: 1080;
  height: 1920;
  frame-rate: 30;
  background: #09090B;
}
```

| 属性 | 描述 |
|---|---|
| `width` | 画布宽度（像素） |
| `height` | 画布高度（像素） |
| `frame-rate` | 每秒帧数（通常为 30） |
| `background` | 画布清除颜色（十六进制） |

通过 `film:Film` 的 `appearance` 属性引用：

```svml
<film:Film id="main" space={speech.space} appearance={studio.film.vertical}>
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
| `font` | 便于阅读的字体族标签，也是环境字体兜底名 |
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
<caption-fine:Style id="default-caption" recipe={studio.caption.dialogue}/>
<caption-fine:Style id="alice-caption" recipe={studio.caption.alice}/>
<caption-fine:Style id="bob-caption" recipe={studio.caption.bob}/>
<caption:Program id="caption-program" display={story.caption} default={default-caption}>
  <caption:Use role="ALICE" style={alice-caption}/>
  <caption:Use role="BOB" style={bob-caption}/>
</caption:Program>
```

## B-roll

B-roll 项目外观——位置、适配方式、容器以及进入/退出动画。

```svs
broll.product {
  stack-order: 40;
  x: 0.08;
  y: 0.20;
  width: 0.84;
  height: 0.48;
  fit: contain;
  background: #111116;
  radius: 28;
  enter: slide-up 8f;
  exit: fade 6f;
}
```

| 属性 | 描述 |
|---|---|
| `stack-order` | Z 轴层叠顺序 |
| `x`、`y` | 位置，以画布比例表示 |
| `width`、`height` | 尺寸，以画布比例表示 |
| `fit` | 源内容适配容器的方式：`cover`、`contain` |
| `background` | 容器背景颜色 |
| `radius` | 容器圆角半径 |
| `enter` | 进入动画：`slide-up Nf`、`fade Nf`（N = 帧数） |
| `exit` | 退出动画：`fade Nf`、`slide-down Nf` |

通过 `broll:Item` 的 `appearance` 属性引用：

```svml
<broll:Item source={motion.video} during={story.selection.demo}
  appearance={studio.broll.product}/>
```

## 文本

文本叠加层外观——位置、排版。

```svs
text.title {
  stack-order: 90;
  x: 0.06;
  y: 0.06;
  width: 0.88;
  height: 0.10;
  font: Inter;
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
| `x`、`y` | 位置，以画布比例表示 |
| `width`、`height` | 尺寸，以画布比例表示 |
| `font` | 字体族名称 |
| `weight` | 字体粗细 |
| `size` | 字体大小（像素） |
| `align` | 文本对齐方式 |
| `fill` | 文本颜色 |
| `tracking` | 字间距调整 |

通过 `text:Item` 的 `appearance` 属性引用：

```svml
<text:Item text="MEANING" during="full" appearance={studio.text.title}/>
```

## 语音估算

确定性语音时长估算的参数。

```svs
speech.normal {
  language: en;
  pace: normal;
  padding: 0.3;
  min: 4;
  max: 15;
  rounding: ceil;
}
```

| 属性 | 描述 |
|---|---|
| `language` | 语言代码（如 `en`） |
| `pace` | 语速：`slow`、`normal`、`fast` |
| `padding` | 添加到估算值的额外填充时间（秒） |
| `min` | 最小时长（秒） |
| `max` | 最大时长（秒） |
| `rounding` | 取整模式：`ceil`、`floor`、`round` |

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
一条逻辑边。省略字体栈时会使用
Recipe 的环境字体兜底名，适合原型，但不能保证字节级复现。
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
    padding: 0.3;
    min: 4;
    max: 15;
    rounding: ceil;
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
    width: 720;
    height: 1280;
    frame-rate: 30;
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

<caption-fine:Style id="primary-caption" recipe={studio.caption.primary}/>

<film:Film id="main" space={speech.space} appearance={studio.film.vertical}>
```
