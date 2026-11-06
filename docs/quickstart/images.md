---
title: Image Preparation
description: Keep model references and finished-picture composition distinct.
---

An image can serve either as an independent model reference or as part of one deliberately baked
reference board. These are preparation choices, not NLE Tracks.

## Prefer independent references for independent meaning

When a model accepts several image references, pass the selected person, product and setting images
separately. Their order and the prompt explain their roles. Do not flatten them merely because they
will be consumed together.

## Bake a reference board only when layout is evidence

Sometimes the spatial relationship itself is the direction: two people must occupy the upper and
lower halves, or a cutout must appear in a particular corner of a concept frame. A creation tool may
bake selected Raster images, their `SpatialMap`s, opacity and paint order into one PNG through
`@hypit/raster-composition`.

That PNG is a new physical reference asset. The operation carries no person, product, prompt, model,
Timeline or Track meaning, and it does not make the input layers editable downstream. Use it when the
model should reinterpret one composed concept frame.

If the final video must preserve exact split-screen geometry or an independently adjustable overlay,
keep the Pictures or videos separate and compose them in the audiovisual Programme instead.

## Do not hide correction inside a model

Generation packages return the selected Provider output unchanged. Denoising, grading, cropping or
encoding is not silently applied by GPT Image or another model package. When a production genuinely
needs permanent asset preparation, let the Agent perform it explicitly or implement the project-owned
component that owns that decision.

## Moving-person matting remains editable

For a presenter over another picture, process the generated or supplied video with
[`@hypit/volcengine-matting`](https://github.com/hypit-ai/hypit/blob/main/packages/volcengine-matting/README.md).
The resulting transparent video remains ordinary Media. Place it in the audiovisual Programme, where
its Window, spatial mapping and draw order remain editable.
