# @hypit/background-removal

Declares one external image capability: turn an input image into an image with its background removed.
Use it for a product, portrait or graphic that will be composited over another picture.

```xml
<import as="remove" from="@hypit/background-removal@1"/>
<remove:Background id="cutout" source={portrait.image}/>
```

`source` accepts an image BlobArtifact, including an ordinary image file declaration or a generated
image Output. `{cutout.image}` publishes one image BlobArtifact with transparency. Keep its actual
dimensions when placing it in Media Track, or use Image Compose when a flattened still is wanted.

The package declares the visual operation; the selected Endpoint implements it. The existing
`@hypit/provider-kie` route uses
[KIE Recraft Remove Background](https://docs.kie.ai/market/recraft/remove-background), sending
`model: "recraft/remove-background"` and `input.image`. It follows the ordinary submit, poll and
collect lifecycle and expects one image result. Another Provider can fulfill the same capability
without changing the Source. This operation therefore needs no separate Recraft-specific author
Model to use the existing KIE implementation.

For a moving portrait, [Volcengine Matting](../volcengine-matting/README.md) provides
`<matte:Portrait source={performance.video}/>` through HypiHub. Normalize its processed video
before using it in a track.

This capability handles still images. Moving-person background removal requires a video-capable
operation and a result that preserves the changing silhouette and frame correspondence. Removing
one portrait's background does not remove the background of a subsequently generated performance.
