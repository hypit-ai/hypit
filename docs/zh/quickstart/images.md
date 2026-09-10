---
title: 图片操作
description: 在图片流向生成器或 Track 之前，对它做合成、校正与抠图。
---

有三个包接收一张图片、交还一张图片。它们都不产出 Track：每个输出都是一张可供下游引用的图片——作为 Seedance 的参考帧、作为 Media Item，或作为下一次操作的来源。

它们都需要 Endpoint。`image-compose` 与 `image-transform` 索取 raster 能力，由 `@hypit/provider-image-opencv-local` 在本机运行 OpenCV 来满足；`background-removal` 索取的是它自己声明的能力，由 `@hypit/provider-kie` 远程满足。使用这些操作时，在 [Runtime Profile](/zh/guide/runtime) 中选择支持它们的 Endpoint。

## 合成图层

`compose:Image` 按书写顺序把各图层画到同一张画布上，交还一张 PNG。

```svml
<import as="compose" from="@hypit/image-compose@1"/>
```

元素接受 `id` 与 `canvas`，以及可选的 `background`——它必须带 alpha，写作 `#RRGGBBAA`，默认为完全透明。子元素是 `compose:Layer`，至少一个、至多六十四个，各自为空：

| 属性 | 取值 |
|---|---|
| `source` | 必填——一张图片 |
| `frame` | 必填——一个 `space:Frame` |
| `fit` | 可选——`contain`（默认）、`cover` 或 `stretch` |
| `interpolation` | 可选——`nearest`、`linear`、`cubic`、`area` 或 `lanczos`（默认） |
| `opacity` | 可选——0 到 1，默认 1 |

```svml
<compose:Image id="card" canvas={portrait} background="#00000000">
  <compose:Layer source={background.image} frame={full} fit="cover"/>
  <compose:Layer source={product.image} frame={product-frame} fit="contain"/>
</compose:Image>
```

**输出：** `{card.image}`——一张图片，不是 Track。

## 校正图片

`image:Program` 是一份具名的操作清单，`image:Transform` 把它作用在某个来源上。这样拆开是有意的：一份写好的 program 可以套用到每一个需要同样处理的镜头上。

```svml
<import as="image" from="@hypit/image-transform@1"/>
```

`image:Program` 只接受 `id`，操作以子元素形式书写，按书写顺序依次施加：

| 操作 | 属性 |
|---|---|
| `Crop` | `x`、`y`、`width`、`height`；可选 `unit="fraction" \| "pixel"` |
| `Resize` | `width`、`height`；可选 `fit`、`interpolation`、`background` |
| `Rotate` | `degrees`，只能是 `90`、`180` 或 `270` |
| `Flip` | 可选 `axis="horizontal" \| "vertical" \| "both"` |
| `Denoise` | 可选 `luma`、`chroma`、`template-window`、`search-window`、`saturation-recovery` |
| `Color` | 可选 `exposure-stops`、`contrast`、`saturation`、`temperature`、`tint`、`gamma` |
| `Sharpen` | 可选 `amount`、`radius`、`threshold` |
| `Blur` | `sigma` |
| `Alpha` | 可选 `mode="preserve" \| "flatten"`；`flatten` 要求给出 `background`，`preserve` 则拒绝它 |
| `Encode` | 可选 `format="png" \| "jpeg" \| "webp"`、`quality`、`background` |

一份 program 至多只能有一个 `Encode`，且必须放在最后。除 `Blur`、`Rotate` 与 `Crop` 之外，每个操作都能仅凭默认值运行，所以 `<image:Denoise/>` 本身就是一条完整的指令。

`image:Transform` 接受 `id`、`source` 与 `program`，全部必填。

```svml
<image:Program id="clean-gpt-image">
  <image:Denoise/>
  <image:Encode format="png"/>
</image:Program>

<image:Transform id="clean-shot" source={shot.image} program={clean-gpt-image}/>
```

**输出：** `{clean-shot.image}`。program 本身不产出任何图片——它是一份配方，在 `Transform` 中指名它才会真正运行。

## 去除背景

```svml
<import as="remove" from="@hypit/background-removal@1"/>
```

`remove:Background` 必须为空，接受 `id` 与 `source`。它不挑选模型、阈值或存储——那是 endpoint 的事，不是 Source 的事。

```svml
<remove:Background id="cutout" source={portrait.image}/>
```

**输出：** `{cutout.image}`——通常喂给一个 Media Item，好让出镜者叠在画面上，而不是待在一个方框里。

## 移动人物抠像

人物需要出现在其他画面之上时，可以将生成或已有视频交给 [`@hypit/volcengine-matting`](https://github.com/hypit-ai/hypit/blob/main/packages/volcengine-matting/README.md)，由支持该能力的 HypiHub Endpoint 执行：

```svml
<import as="matte" from="@hypit/volcengine-matting@1"/>
<matte:Portrait id="cutout" source={performance.video}/>
```

将 `cutout.video` 归一化，准备进入时间线。如果它建立说话节目的语义骨架，再把准备好的媒体与 Script Segment 对齐，通过 Speech Track 装配。画面由 Media Track 或项目场景按选择的位置、绘制顺序呈现。作为 B-roll 时，归一化后的抠像可以直接进入 Media Track。抠像改变画面背景，具体角色由编排决定。
