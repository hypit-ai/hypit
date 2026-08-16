# `@narratage/image-transform`

An ordinary graph component with two inputs and one result:

```text
BlobArtifact(image) + ImageTransformProgram -> Need -> BlobArtifact(image)
```

The result is the transformed image itself. It contains no source digest, Provider name,
post-processing report or copied upstream metadata. The graph already contains the source and
program edges; the Runtime selects the endpoint that fulfills the explicit Need.

`gptImageDenoiseV1` applies the GPT Image cleanup profile: YCrCb NLM with luma 2,
chroma 10, 7/21 windows and 1.02 saturation recovery, followed by PNG encoding. It is now an
explicit reusable Program rather than hidden behavior inside GPT Image generation.

The official Markup Surface separates declaration from use:

```xml
<image:Program id="clean-gpt-image">
  <image:Denoise/>
  <image:Encode format="png"/>
</image:Program>

<image:Transform id="clean-shot" source={shot.image} program={clean-gpt-image}/>
```

Operation order is author meaning. Geometry, NLM denoise, color, sharpen/blur, alpha handling and
encoding are bounded closed data. OpenCV is only one Runtime realization.
