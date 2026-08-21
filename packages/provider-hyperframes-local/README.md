# @hypit/provider-hyperframes-local

Trusted local Provider for the `@hypit/render-hyperframes#render-visual` capability. It stages the
content-addressed dependencies declared by a `HyperframesDocument`, renders a silent MP4 with the
HyperFrames CLI, probes the bytes, and returns a verified `RenderedVisual`. Before staging a typed
Surface it decodes the exact bytes and checks declared dimensions, still/frame timing, SDR/sRGB and
opaque/straight-alpha facts. Artifact size and SHA-256 are checked for every dependency. These are
admission gates, not hidden output metadata.

There are deliberately two concurrency controls:

- `defaultConcurrency` limits whole render requests admitted by Runtime pool/lane resources.
- `workers` controls HyperFrames' parallel Chrome frame workers inside one admitted render.

The Provider owns both controls because they are deployment policy, not author intent. It never
renders program audio; `@hypit/provider-media-local` separately prepares `TimelineAudio` and muxes
the final media.

`browserGpu` picks Chrome's rasterizer and defaults to `hardware`, so composited frames are drawn by
the GPU. The cost of the alternative is large rather than marginal: on `software` the same
1080×1920 render falls to SwiftShader on the CPU and takes tens of minutes where the GPU takes a few.
Set `software` on a machine with no usable GPU, or `auto` to let the HyperFrames CLI decide.

The Runtime Adapter also declares one managed browser program. `programs up` invokes the pinned
HyperFrames CLI's `browser ensure`; its probe resolves and starts that browser and checks
ffprobe before a Build.

```ts
const provider = createLocalHyperframesProvider({
  workers: 4,
  defaultConcurrency: 1,
});
```

The current package executes trusted official code in a local process. It is not a sandbox for
untrusted documents or community renderer implementations.
