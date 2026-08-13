# @narratage/provider-hyperframes-local

Trusted local Provider for the `@narratage/render-hyperframes#render-visual` capability. It stages the
content-addressed dependencies declared by a `HyperframesDocument`, renders a silent MP4 with the
HyperFrames CLI, probes the bytes, and returns a verified `RenderedVisual`. Before staging a typed
Surface it decodes the exact bytes and checks declared dimensions, still/frame timing, SDR/sRGB and
opaque/straight-alpha facts. Artifact size and SHA-256 are checked for every dependency. These are
admission gates, not hidden output metadata. The Driver binds the locked Endpoint implementation,
configuration, request and returned value in the ordinary Need Receipt.

There are deliberately two concurrency controls:

- `defaultConcurrency` limits whole render requests admitted by Runtime Authority/Route resources.
- `workers` controls HyperFrames' parallel Chrome frame workers inside one admitted render.

The Provider owns both controls because they are deployment policy, not author intent. It never
renders program audio; `@narratage/provider-media-local` separately prepares `TimelineAudio` and muxes
the final media.

The Runtime Adapter also owns one non-daemon browser service. `services up` invokes the pinned
HyperFrames CLI's `browser ensure`; the service probe resolves and starts that browser and checks
ffprobe before a Build.

```ts
const provider = createLocalHyperframesProvider({
  workers: 4,
  defaultConcurrency: 1,
});
```

The current package executes trusted official code in a local process. It is not a sandbox for
untrusted documents or community renderer implementations.
