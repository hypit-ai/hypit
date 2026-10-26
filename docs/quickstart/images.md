---
title: Image Operations
description: Compose and correct images before they reach a generator or a Track.
---

One Image Operations package works on pictures and hands back a picture. It does not produce a Track: each output
is an image you reference downstream — as a Seedance reference frame, as a Visual Clip, or as the
source of another operation.

Transform and Compose ask for separate image capabilities. The default
`@hypit/provider-image-opencv-local` Endpoint implements both by running OpenCV in bounded Python
processes on your own machine.

## Composing layers

`image:Compose` paints layers onto one canvas, in the order they are written, and hands back a PNG.

```svml
<import as="image" from="@hypit/image-operations@1"/>
```

The element takes `id` and `canvas`, and optionally `background` — which must carry alpha, as
`#RRGGBBAA`, and defaults to fully transparent. Its children are `image:Layer`, at least one and at
most sixty-four, each empty:

| Attribute | Takes |
|---|---|
| `source` | required — an image |
| `frame` | required — a `space:Frame` |
| `fit` | optional — `contain` (default), `cover` or `stretch` |
| `interpolation` | optional — `nearest`, `linear`, `cubic`, `area` or `lanczos` (default) |
| `opacity` | optional — 0 to 1, default 1 |

```svml
<image:Compose id="card" canvas={portrait.canvas} background="#00000000">
  <image:Layer source={background.image} frame={full} fit="cover"/>
  <image:Layer source={product.image} frame={product-frame} fit="contain"/>
</image:Compose>
```

**Output:** `{card.image}` — an image, not a Track.

## Correcting an image

An `image:Program` is a named list of operations; an `image:Transform` runs one over a source. The
split is deliberate: a program written once is applied to every shot that needs the same treatment.

```svml
<import as="image" from="@hypit/image-operations@1"/>
```

`image:Program` takes only `id`, and holds its operations as children, applied in the order written:

| Operation | Attributes |
|---|---|
| `Crop` | `x`, `y`, `width`, `height`; optional `unit="fraction" \| "pixel"` |
| `Resize` | `width`, `height`; optional `fit`, `interpolation`, `background` |
| `Rotate` | `degrees`, which must be `90`, `180` or `270` |
| `Flip` | optional `axis="horizontal" \| "vertical" \| "both"` |
| `Denoise` | optional `luma`, `chroma`, `template-window`, `search-window`, `saturation-recovery` |
| `Color` | optional `exposure-stops`, `contrast`, `saturation`, `temperature`, `tint`, `gamma` |
| `Sharpen` | optional `amount`, `radius`, `threshold` |
| `Blur` | `sigma` |
| `Alpha` | optional `mode="preserve" \| "flatten"`; `background` is required by `flatten` and refused by `preserve` |
| `Encode` | optional `format="png" \| "jpeg" \| "webp"`, `quality`, `background` |

A program may hold at most one `Encode`, and it must be last. Every operation but `Blur`, `Rotate`
and `Crop` runs on defaults alone, so `<image:Denoise/>` is a complete instruction.

`image:Transform` takes `id`, `source` and `program`, all required.

```svml
<image:Program id="clean-gpt-image">
  <image:Denoise/>
  <image:Encode format="png"/>
</image:Program>

<image:Transform id="clean-shot" source={shot.image} program={clean-gpt-image}/>
```

**Output:** `{clean-shot.image}`. The program on its own produces no image — it is a recipe, and
naming it in a `Transform` is what runs it.

## Matting a moving person

For a presenter over another picture, process the generated or supplied video with
[`@hypit/volcengine-matting`](https://github.com/hypit-ai/hypit/blob/main/packages/volcengine-matting/README.md),
served by a supporting HypiHub Endpoint:

```svml
<import as="matte" from="@hypit/volcengine-matting@1"/>
<matte:Portrait id="cutout" source={performance.video}/>
```

Prepare `cutout.video` to obtain `PreparedMedia` and its local domain. If it carries spoken
meaning, align that local domain to its Script Segment, then project the alignment through the
equal-length Timeline Window. Place the prepared cutout as an ordinary Visual Clip. Matting changes the picture's
background; the composition determines its role.
