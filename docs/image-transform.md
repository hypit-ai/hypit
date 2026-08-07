# Image Transform

Status: implemented author module and local OpenCV Endpoint; public compatibility is not frozen.

## Boundary

Image post-processing is an ordinary graph step:

```text
BlobArtifact(image) ──────┐
                          ├─ request-image-transform ─ Need ─> BlobArtifact(image)
ImageTransformProgram ────┘
```

The result is one image Blob. There is deliberately no `ImagePostprocessProduct`, source digest,
provider field, diagnostic field or inspection envelope. The source relationship is already the
Producer input edge; Core's Derivation binds that input Record to the result Record; Need and
Receipt bind the external execution.

OpenCV is not part of the authored meaning. `@svml/image-transform` owns the closed transformation
vocabulary and `@svml/provider-image-opencv-local` is one replaceable execution Endpoint. A future
Wasm, Sharp, libvips or Lambda Endpoint can fulfill the same exact capability.

## Author form

Declaration and use are separate:

```xml
<import as="image" from="@svml/image-transform@1"/>

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

The shipped `gptImageDenoiseV1` program is the exact useful behavior extracted from Twinit's hidden
GPT Image post-step. It is no longer mandatory behavior of GPT Image generation.

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
      "use": "@svml/provider-image-opencv-local",
      "instance": "image.opencv.local",
      "config": {
        "pythonExecutable": "./services/image-opencv/.venv/bin/python",
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

Set `pythonExecutable` to `./services/image-opencv/.venv/bin/python`. The ordinary Runtime Scheduler
owns admission and lane concurrency; the Provider does not create another queue. Temporary files
and OpenCV errors are Endpoint-local, while compact execution diagnostics live only in Receipt
metadata.
