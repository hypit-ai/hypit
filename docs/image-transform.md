# Image Operations

Status: transform, ordered composition, background-removal intent, local OpenCV execution and KIE
cutout execution are implemented; public compatibility is not frozen.

## Boundary

Image post-processing is an ordinary graph step:

```text
BlobArtifact(image) ──────┐
                          ├─ RasterRequest(transform) ─ execute-raster ─> BlobArtifact(image)
ImageTransformProgram ────┘
```

The result is one image Blob. There is deliberately no `ImagePostprocessProduct`, source digest,
provider field, diagnostic field or inspection envelope. The source relationship is already the
Producer input edge; Core's Derivation binds that input Record to the result Record; Need and
Receipt bind the external execution.

OpenCV is not part of the authored meaning. `@narratage/image-transform` owns the author-facing Program
Surface while `@narratage/raster` owns the closed execution vocabulary shared with Compose.
`@narratage/provider-image-opencv-local` is one replaceable execution Endpoint. A future
Wasm, Sharp, libvips or Lambda Endpoint can fulfill the same exact capability.

## Author form

Declaration and use are separate:

```xml
<import as="image" from="@narratage/image-transform@1"/>

<image:Program id="clean-gpt-image">
  <image:Denoise
    method="nlm-ycrcb"
    luma="2"
    chroma="10"
    template-window="7"
    search-window="21"
    saturation-recovery="1.02"
  />
  <image:Encode format="png"/>
</image:Program>

<image:Transform
  id="clean-shot"
  source={shot.image}
  program={clean-gpt-image}
/>
```

The shipped `gptImageDenoiseV1` program is the exact useful behavior extracted from the legacy hidden
GPT Image post-step. It is no longer mandatory behavior of GPT Image generation.

The same physical GPT Image package also exposes the optional logical module
`@narratage/gpt-image/clean@1`. Its component Fragment is deliberately expanded as two visible graph
operations:

```text
GPT Image RequestDraft + reference Blob edges
  ─> bind/finalize ─> generate ─> primary raw image
  ─> ImageTransformProgram ─> execute-raster ─> clean image
```

The component exports one clean image while preserving both Needs and every input edge in the graph.
The raw exact-model module remains usable on its own, and the cleanup Program remains replaceable.
This avoids repeating the denoise step in every author file without turning it into hidden Provider
behavior. A higher-level Prompt author Surface is intentionally deferred to the separate Prompt
redesign.

## Operations

Operation order is author meaning. The current program grammar supports:

- crop, resize, rotate and flip;
- YCrCb non-local-means denoise with separate luma/chroma strength and window sizes;
- exposure, contrast, saturation, temperature, tint and gamma;
- unsharp-mask sharpening and Gaussian blur;
- explicit alpha preservation or flattening;
- PNG, JPEG or WebP encoding.

Bounds and incompatible options fail during author/value validation. There are no silent clamps or
provider-selected creative defaults. If no Encode operation is present, the execution contract
produces PNG.

## Runtime form

The developer opts into the local Endpoint in `svml.runtime.json`:

```json
{
  "runtimePackageLock": "./svml.runtime-packages.lock",
  "endpoints": [
    {
      "use": "@narratage/provider-image-opencv-local",
      "instance": "image.opencv.local",
      "config": {
        "defaultConcurrency": 2
      }
    }
  ]
}
```

The repository provides a locked Python 3.13 environment:

```bash
uv python install 3.13
uv sync --project services/image-opencv --frozen
pnpm test:image-opencv
```

With no `pythonExecutable`, `services up` prepares the frozen project and the Adapter resolves its
`.venv` for the Endpoint, probe and doctor. Set `pythonExecutable` only to opt into an externally
managed compatible environment; that disables the managed prepare. The ordinary Runtime Scheduler
owns admission and atomic Authority/Route concurrency; the Provider does not create another queue. Temporary files
and OpenCV errors are Endpoint-local, while compact execution diagnostics live only in Receipt
metadata.

## Ordered composition

Reusable still composition is a different author operation from transforming one image:

```text
CanvasSpace ───────────────┐
Blob + SpatialFrame + Spec├─ ImageComposeLayerSet ─ RasterRequest(compose) ─ execute-raster ─> BlobArtifact(PNG)
Blob + SpatialFrame + Spec┘
```

`@narratage/image-compose` deliberately has no fixed “base” and “sticker” ports. Child order is
paint order. Every Layer carries an explicit source edge, Spatial Frame, `contain|cover|stretch`,
interpolation and opacity. Frames may extend outside the Canvas and the Endpoint clips them. The
version-1 result is always PNG using normal alpha-over; blend modes can be added only as explicit
contract vocabulary.

```xml
<import as="compose" from="@narratage/image-compose@1"/>

<compose:Image id="poster" canvas={portrait} background="#00000000">
  <compose:Layer source={background.image} frame={full} fit="cover"/>
  <compose:Layer source={product.image} frame={productFrame} fit="contain" opacity="0.95"/>
</compose:Image>
```

Both author packages lower to the same `execute-raster` capability. The local OpenCV Endpoint has one
Handler and one shared interpreter under its configured Authority/Route resources; neither author form owns a queue.

## Background removal

Background removal is external image understanding, not an OpenCV transform and not a misleading
“chroma key” operation:

```text
BlobArtifact(image) ─ request-background-removal ─ Need ─> BlobArtifact(image)
```

```xml
<import as="remove" from="@narratage/background-removal@1"/>
<remove:Background id="cutout" source={portrait.image}/>
```

`@narratage/background-removal` defines only that exact input/output meaning. The current KIE
Endpoint maps it to Recraft `remove-background`; a local segmentation Endpoint can fulfill the same
Need later. Model/API identity, polling and temporary URLs remain execution facts and never enter
the returned Blob or Core.
