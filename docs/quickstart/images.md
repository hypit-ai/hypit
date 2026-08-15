---
title: Image Operations
description: Compose, correct and cut out images before they reach a generator or a Track.
---

# Image Operations

Three packages work on a picture and hand back a picture. None of them produces a Track: each output
is an image you reference downstream — as a Seedance reference frame, as a Media Item, or as the
source of another operation.

They all need an endpoint. `image-compose` and `image-transform` ask for the raster capability, which
`@narratage/provider-image-opencv-local` answers by running OpenCV in a bounded Python process on
your own machine; `background-removal` asks for its own capability, which `@narratage/provider-kie`
answers remotely. No example in this repository binds either, so add the endpoint to your
[Runtime Profile](/guide/runtime) before planning a Build that uses one.

## Composing layers

`compose:Image` paints layers onto one canvas, in the order they are written, and hands back a PNG.

```svml
<import as="compose" from="@narratage/image-compose@1"/>
```

The element takes `id` and `canvas`, and optionally `background` — which must carry alpha, as
`#RRGGBBAA`, and defaults to fully transparent. Its children are `compose:Layer`, at least one and at
most sixty-four, each empty:

| Attribute | Takes |
|---|---|
| `source` | required — an image |
| `frame` | required — a `space:Frame` |
| `fit` | optional — `contain` (default), `cover` or `stretch` |
| `interpolation` | optional — `nearest`, `linear`, `cubic`, `area` or `lanczos` (default) |
| `opacity` | optional — 0 to 1, default 1 |

```svml
<compose:Image id="card" canvas={portrait} background="#00000000">
  <compose:Layer source={background.image} frame={full} fit="cover"/>
  <compose:Layer source={product.image} frame={product-frame} fit="contain"/>
</compose:Image>
```

**Output:** `{card.image}` — an image, not a Track.

## Correcting an image

An `image:Program` is a named list of operations; an `image:Transform` runs one over a source. The
split is deliberate: a program written once is applied to every shot that needs the same treatment.

```svml
<import as="image" from="@narratage/image-transform@1"/>
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

## Removing a background

```svml
<import as="remove" from="@narratage/background-removal@1"/>
```

`remove:Background` is empty and takes `id` and `source`. It picks no model, threshold or storage —
that is the endpoint's business, not the Source's.

```svml
<remove:Background id="cutout" source={portrait.image}/>
```

**Output:** `{cutout.image}` — typically fed to a Media Item so a presenter sits over the picture
rather than in a box.
