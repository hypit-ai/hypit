# @hypit/image-compose

Deterministic multi-layer raster composition for SVML.

The author graph supplies an explicit Canvas, an ordered list of image Layers, and an explicit Frame for every Layer. The package lowers that meaning to the shared `@hypit/raster` execution contract; an Endpoint such as `@hypit/provider-image-opencv-local` performs the pixels. Core knows nothing about images or compositing.

```xml
<compose:Image id="card" canvas={portrait} background="#00000000">
  <compose:Layer source={background.image} frame={full} fit="cover"/>
  <compose:Layer source={product.image} frame={productFrame} fit="contain"/>
</compose:Image>
```

Child order is paint order. Frames may extend beyond the Canvas and are clipped. Version 1 always produces a PNG using normal alpha compositing; it deliberately has no implicit base image, layout, or metadata propagation.
