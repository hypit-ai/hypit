# @hypit/provider-hyperframes-local

Trusted local Provider for the `@hypit/render-hyperframes#render-visual` capability. It stages the
Resource dependencies declared by a `HyperframesDocument`, renders a silent MP4 with the
HyperFrames engine, probes the bytes, and returns a verified `RenderedVisual`. Before staging a typed
Surface it decodes the exact bytes and checks declared dimensions, still/frame timing, SDR/sRGB and
opaque/straight-alpha facts. These checks validate the typed rendering input; they do not create
content identity or hidden output metadata.

Runtime configuration separates work size from shared capacity:

- `defaultConcurrency` limits whole render requests admitted by the Endpoint's Runtime capacity resource.
- Optional `browserCapacity` limits Chrome slots shared by all render Needs in the same `pool`.
  Each Need reserves its actual worker count atomically with the whole-request slot. A request larger
  than this budget reports a configuration error; it does not silently reduce the requested workers.
- `workers` controls independent Chrome processes inside one admitted render. Explicit counts are
  honored, capped only by selected frame count. `auto` uses half the available CPU parallelism,
  bounded to 1–4 workers.

The Runtime Profile configures these controls through the Provider because they are deployment policy.
`auto` is resolved when the Provider is activated, so admission and execution use the same count. It never
renders program audio; `@hypit/provider-media-local` separately prepares `TimelineAudio` and muxes
the final media.

`browserGpu` picks Chrome's rasterizer and defaults to `hardware`. Set `software` without a usable
GPU, or `auto` to let the engine decide. Capture uses screenshots and independent browser processes;
the CLI's automatic worker and drawElement policies do not override the count.

The Runtime Adapter also declares one managed browser program. `programs up` invokes the pinned
HyperFrames CLI's `browser ensure`; its probe resolves and starts that browser and checks
ffprobe before a Build.

The same executor is exported for callers with an already compiled document:

```ts
const visual = await renderHyperframesVisual(
  { document, range: { startFrame: 240, endFrameExclusive: 360 } },
  { resources, workers: 4, onProgress: (event) => console.log(event) },
);
```

Omit `range` for the complete document. Ranges are zero-based and half-open on the original
programme clock. At 30 fps, `[240, 360)` returns 120 frames covering seconds 8–12.
`onProgress` reports preparation, worker ranges, browser PIDs, completion and elapsed time.
`signal` cancels capture and encoding; `processTimeoutMs` bounds the complete operation and defaults
to 30 minutes. Deployments may additionally set `initializationTimeoutMs` or `frameTimeoutMs` when
they have a measured stage deadline. Stage deadlines are otherwise unset: a busy machine must not
turn one slow Chrome start or frame into a false render failure while the operation deadline remains.
An explicit stage-timeout error names the worker and stage/frame, aborts sibling workers and awaits
cleanup. A completed worker closes its Chrome immediately.

One call stages the HTML and assets once, merges overlapping source-frame extraction windows,
and shares decoded PNGs across workers. Each worker initializes its own page and captures its
assigned frames at their original absolute times. Output numbering starts at zero; encoding runs
once. Exact compiler sampling markers retain loops, holds and fractional playback rates. There is
no SVML rewrite, intermediate cut MP4 or repeat normalization. Already compiled video documents
need the current compiler's frame markers.

Source extraction uses the pinned engine's FFmpeg/FFprobe resolver. `ffmpegPath` selects the final
H.264 encoder; `ffprobePath` verifies output and typed surfaces. `nodePath` and `hyperframesCliPath`
serve managed browser installation. The requested frame range travels in the Model's Need.

```ts
const provider = createLocalHyperframesProvider({
  pool: "local-render",
  workers: 4,
  defaultConcurrency: 2,
  browserCapacity: 6,
});
```

Two instances in `local-render`, configured with 4 and 2 workers and identical capacity limits, can
render together. With `browserCapacity: 4`, the second waits. This budget covers Chrome slots;
source decoding and final encoding remain separate phases, not per-frame Chrome workers. Direct
`renderHyperframesVisual()` calls do not enter Runtime's shared admission system.

The current package executes trusted official code in a local process. It is not a sandbox for
untrusted documents or community renderer implementations.
