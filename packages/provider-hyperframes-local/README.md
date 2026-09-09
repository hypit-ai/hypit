# @hypit/provider-hyperframes-local

Trusted local Provider for the `@hypit/render-hyperframes#render-visual` capability. It stages the
Resource dependencies declared by a `HyperframesDocument`, renders a silent MP4 with the
HyperFrames engine, probes the bytes, and returns a verified `RenderedVisual`. Before staging a typed
Surface it decodes the exact bytes and checks declared dimensions, still/frame timing, SDR/sRGB and
opaque/straight-alpha facts. These checks validate the typed rendering input; they do not create
content identity or hidden output metadata.

Normalized transparent videos displayed by Media or project components use the ordinary video path.
The engine decodes them to PNG frames with alpha, then Chrome blends them with lower layers and
the authored Canvas background. PNG is the intermediate capture format; it does not ask to erase
the Film's background. The returned MP4 contains the completed composition.

Runtime configuration separates work size from shared capacity:

- `defaultConcurrency` limits whole render requests admitted by the Endpoint's Runtime capacity resource.
- Optional `browserCapacity` limits Chrome slots shared by all render Needs in the same `pool`.
  Each Need reserves its actual worker count atomically with the whole-request slot. A request larger
  than this budget reports a configuration error; it does not silently reduce the requested workers.
  Both reservations last for the whole Need, including preparation and final encoding. Closing one
  Chrome early does not release part of that reservation. Without `browserCapacity`, admission uses
  the whole-request limit alone.
- `workers` controls independent Chrome processes inside one admitted render. Explicit counts are
  honored, capped only by selected frame count. `auto` uses half the available CPU parallelism,
  bounded to 1–4 workers.

The Runtime Profile configures these controls through the Provider because they are deployment policy.
`auto` is resolved when the Provider is activated, so admission and execution use the same count. It never
renders program audio; `@hypit/provider-media-local` separately prepares `TimelineAudio` and muxes
the final media.

For a Runtime Profile, place `pool` on the Endpoint entry and these Provider settings inside
`config`. This is an illustrative entry to merge into the Profile's existing `endpoints`:

```json
"hyperframes.local": {
  "use": "@hypit/provider-hyperframes-local",
  "pool": "local-render",
  "config": {
    "workers": 4,
    "defaultConcurrency": 2,
    "browserCapacity": 6
  }
}
```

This configuration admits one 4-worker request at a time under its 6-browser budget even though
the whole-request limit is 2. Two 4-worker requests would need 8 browser slots. Choose budgets from
the actual machine and shared workloads; the example is not an automatic tuning recommendation.
Reload the Runtime Worker after changing its Profile and restart Studio if it uses that Profile.

`browserGpu` picks Chrome's rasterizer and defaults to `hardware`. Set `software` without a usable
GPU, or `auto` to let the engine decide. Capture uses screenshots and independent browser processes;
the CLI's automatic worker and drawElement policies do not override the count.

The Runtime Adapter also declares one managed browser program. `programs up` invokes the pinned
HyperFrames CLI's `browser ensure`; its probe resolves and starts that browser and checks
the FFmpeg/FFprobe toolchain before a Build.

The same executor is exported for callers with an already compiled document:

```ts
import { renderHyperframesVisual } from "@hypit/provider-hyperframes-local";

const visual = await renderHyperframesVisual(
  { document, range: { startFrame: 240, endFrameExclusive: 360 } },
  { resources, workers: 4, onProgress: (event) => console.log(event) },
);
```

Omit `range` for the complete document. Ranges are zero-based and half-open on the original
programme clock. At 30 fps, `[240, 360)` returns 120 frames covering seconds 8–12.
`onProgress` reports preparation, worker ranges, browser PIDs, completion and elapsed time to direct
executor callers. The Runtime Provider does not currently forward these events as Build progress.
`processTimeoutMs` defaults to 30 minutes and starts one deadline before resource preparation. It
covers resource reads, Surface validation, rendering and output storage. `signal` can end the same
execution earlier. ResourceStore I/O and Surface probes receive the cancellation signal; a custom
ResourceStore must implement the port's cancellation behavior, including streaming reads and writes.

Browser launch, source extraction, capture and encoding run in one disposable child process per
render. At cancellation it receives a stop request and has up to five seconds to clean up. The owner
then terminates any remaining process tree, including Chrome's separate process groups, and awaits
the child exit before removing temporary files and returning failure. This also covers engine calls
that do not accept a signal. The deadline initiates shutdown; the call may spend additional time
closing resources. Completed Outputs in the Build remain available for a new Run and Build.

Deployments may additionally set `initializationTimeoutMs` or `frameTimeoutMs` when they have a
measured stage deadline. Initialization here means initializing an already created browser session;
Chrome launch precedes it. Stage deadlines are otherwise unset, allowing a busy machine to spend
more of the shared render budget on a slow initialization or frame.
An explicit stage-timeout error names the worker and stage/frame, aborts sibling workers and awaits
cleanup. A completed worker closes its Chrome immediately.

One call stages the HTML and every declared asset once. Typed Surface validation includes a complete
decoded-frame count, even for a short render interval. The renderer then finds source-frame windows
needed by that interval, merges overlapping windows, and extracts them one source/window at a time.
Decoded PNGs are shared by all workers in this call. Each worker initializes its own page and captures
its assigned frames at their original absolute times. Output numbering starts at zero; final H.264
encoding runs once after all workers finish. More workers parallelize capture, while staging,
validation, source extraction and final encoding still contribute their own cost.

Each call has its own temporary directory, local server port and Chrome processes. Separate renders
do not share staged files or decoded PNGs. Exact compiler sampling markers retain loops, holds and
fractional playback rates. There is no SVML rewrite, intermediate cut MP4 or repeat normalization.
Already compiled video documents need the current compiler's frame markers.

Source extraction uses the pinned engine's FFmpeg/FFprobe resolver. `ffmpegPath` selects the final
H.264 encoder; `ffprobePath` verifies output and typed surfaces. `nodePath` and `hyperframesCliPath`
serve managed browser installation. The requested frame range travels in the Model's Need.

```ts
import { createLocalHyperframesProvider } from "@hypit/provider-hyperframes-local";

const provider = createLocalHyperframesProvider({
  pool: "local-render",
  workers: 4,
  defaultConcurrency: 2,
  browserCapacity: 6,
});
```

Two instances in `local-render`, configured with 4 and 2 workers and identical capacity limits, can
render together. With `browserCapacity: 4`, the second waits. Coordination applies to Builds sharing
the same Runtime Execution Store; the pool name alone does not coordinate separate stores or machines.
Direct `renderHyperframesVisual()` calls do not enter Runtime's shared admission system.

The current package executes trusted official code in a local process. It is not a sandbox for
untrusted documents or community renderer implementations.
