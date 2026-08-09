# @narratage/provider-hyperframes-local

Trusted local Provider for the `@narratage/render-hyperframes#render-visual` capability. It stages the
content-addressed dependencies declared by a `HyperframesDocument`, renders a silent MP4 with the
HyperFrames CLI, probes the bytes, and returns a verified `RenderedVisual`. Before staging a typed
Surface it decodes the exact bytes and checks declared dimensions, still/frame timing, SDR/sRGB and
opaque/straight-alpha facts. Artifact size and SHA-256 are checked for every dependency.

The receipt-covered renderer attestation includes the HyperFrames version, exact browser executable
digest/version, document digest and all Surface verification evidence. The Driver separately binds
the locked Endpoint implementation and configuration; neither identity is self-asserted by the
handler.

There are deliberately two concurrency controls:

- `defaultConcurrency` limits whole render requests admitted by the Runtime lane.
- `workers` controls HyperFrames' parallel Chrome frame workers inside one admitted render.

The Provider owns both controls because they are deployment policy, not author intent. It never
renders program audio; `@narratage/provider-media-local` separately prepares `TimelineAudio` and muxes
the final media.

```ts
const provider = createLocalHyperframesProvider({
  workers: 4,
  defaultConcurrency: 1,
});
```

The current package executes trusted official code in a local process. It is not a sandbox for
untrusted documents or community renderer implementations.
