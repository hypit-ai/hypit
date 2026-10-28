# `@hypit/image-operations`

Official deterministic still-image operations for Hypit. One installed package owns two separate
author meanings and two separate Provider capabilities:

- `Transform`: one image plus an ordered `ImageTransformProgram` becomes one image through
  `transform-image`;
- `Compose`: explicit Canvas, Frames and ordered Layers become one PNG through `compose-image`.

They share one package because they have the same owner, installation decision and release
lifecycle. They do not share one Capability: a Provider may accurately implement either or both.
The package contains no OpenCV, filesystem, queue or Provider policy.

The package also owns the syntax-neutral Program, Transform and Compose declarations and their graph
lowering. Markup contributes only their tag spelling; Providers remain selected later from the two
explicit Capabilities.

```xml
<import as="image" from="@hypit/image-operations@1"/>

<image:Program id="soft-denoise">
  <image:Denoise/>
  <image:Encode format="png"/>
</image:Program>

<image:Transform id="clean-shot" source={shot.image} program={soft-denoise}/>

<image:Compose id="comparison" canvas={comparison-canvas.canvas} background="#EEEAE2FF">
  <image:Layer source={before.image} frame={before-panel} fit="contain"/>
  <image:Layer source={after.image} frame={after-panel} fit="contain"/>
</image:Compose>
```

Transform operation order is author meaning. Model- or component-specific Programs belong to their
owning packages and use this package's generic operations. Compose performs rectangular alpha
composition only; use a generative edit when the desired result is a newly directed scene, and keep
independently timed or editable layers in Film.
