# @hypit/image-compose

Deterministically flatten a fixed arrangement of existing still images into one PNG.

The author graph supplies an explicit Canvas, an ordered list of image Layers, and an explicit Frame for every Layer. The package lowers that meaning to the shared `@hypit/raster` execution contract; an Endpoint such as `@hypit/provider-image-opencv-local` performs the pixels. Core knows nothing about images or compositing.

```xml
<import as="space" from="@hypit/spatial@1"/>
<import as="compose" from="@hypit/image-compose@1"/>

<space:Canvas id="comparison-canvas" width="2048" height="1024"/>
<space:Frame id="before-panel" within={comparison-canvas}
  left="0%" top="0%" right="50%" bottom="100%"/>
<space:Frame id="after-panel" within={comparison-canvas}
  left="50%" top="0%" right="100%" bottom="100%"/>

<compose:Image id="comparison" canvas={comparison-canvas} background="#EEEAE2FF">
  <compose:Layer source={before.image} frame={before-panel} fit="contain"/>
  <compose:Layer source={after.image} frame={after-panel} fit="contain"/>
</compose:Image>
```

Child order is paint order. Frames may extend beyond the Canvas and are clipped. Version 1 always produces a PNG using normal alpha compositing; it deliberately has no implicit base image, layout, or metadata propagation.

This operation does no visual reasoning. It does not reconcile perspective, depth, light, subject scale, scene continuity or a natural seam between its inputs. Use an image-generation or image-editing model when the desired result should become one newly directed camera image. Keep independently timed or editable layers in Tracks and Film. Image Compose is for the narrower case where the intended result is precisely the fixed two-dimensional arrangement itself.
