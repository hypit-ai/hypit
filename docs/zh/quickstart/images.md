---
title: 图片操作
description: 在图片流向生成器或 Track 之前，对它做合成与校正。
---

一个 Image Operations 包接收已有图片、交还一张图片。它不产出 Track：每个输出都是一张可供下游引用的图片——作为 Seedance 的参考帧、作为 Visual Clip，或作为下一次操作的来源。

Transform 与 Compose 索取两项不同的图像能力；默认的 `@hypit/provider-image-opencv-local` Endpoint 在本机通过有界 Python 进程同时实现二者。

## 合成图层

`image:Compose` 按书写顺序把各图层画到同一张画布上，交还一张 PNG。

```svml
<import as="image" from="@hypit/image-operations@1"/>
```

元素接受 `id` 与 `canvas`，以及可选的 `background`——它必须带 alpha，写作 `#RRGGBBAA`，默认为完全透明。子元素是 `image:Layer`，至少一个、至多六十四个，各自为空：

| 属性 | 取值 |
|---|---|
| `source` | 必填——一张图片 |
| `frame` | 必填——一个 `space:Frame` |
| `fit` | 可选——`contain`（默认）、`cover` 或 `stretch` |
| `interpolation` | 可选——`nearest`、`linear`、`cubic`、`area` 或 `lanczos`（默认） |
| `opacity` | 可选——0 到 1，默认 1 |

```svml
<image:Compose id="card" canvas={portrait.canvas} background="#00000000">
  <image:Layer source={background.image} frame={full} fit="cover"/>
  <image:Layer source={product.image} frame={product-frame} fit="contain"/>
</image:Compose>
```

**输出：** `{card.image}`——一张图片，不是 Track。

## 校正图片

`image:Program` 是一份具名的操作清单，`image:Transform` 把它作用在某个来源上。这样拆开是有意的：一份写好的 program 可以套用到每一个需要同样处理的镜头上。

```svml
<import as="image" from="@hypit/image-operations@1"/>
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

## 移动人物抠像

人物需要出现在其他画面之上时，可以将生成或已有视频交给 [`@hypit/volcengine-matting`](https://github.com/hypit-ai/hypit/blob/main/packages/volcengine-matting/README.md)，由支持该能力的 HypiHub Endpoint 执行：

```svml
<import as="matte" from="@hypit/volcengine-matting@1"/>
<matte:Portrait id="cutout" source={performance.video}/>
```

准备 `cutout.video`，得到 `PreparedMedia` 及其局部时间域。如果它承载说话语义，就在该局部时间域上与 Script Segment 对齐，再通过等长的 Timeline Window 投影对齐证据。然后把这份准备媒体作为普通 Visual Clip 放置。抠像改变画面背景，具体角色由编排决定。
