# @hypit/provider-html-local

Trusted local implementation of:

- `@hypit/html-program@1#rasterize-visual` → `TimelineVisual`;
- `@hypit/html-program@1#rasterize-frames` → self-describing sRGB PNG frame images.

The Provider consumes the typed `HtmlProgram` directly. This package contributes the portable
Chromium Endpoint: it obtains exact source samples through FFmpeg, presents them to Chrome as PNG
images, captures PNG frames through Chrome DevTools Protocol and streams them into FFmpeg.

The separate `@hypit/provider-html-electron-local` package contributes an encoded-visual-only
Endpoint. It decodes the compiler's
  exact source samples, transfers the composed frame as an offscreen shared
  texture, encodes with WebCodecs H.264 and uses FFmpeg for container muxing.
  Neither source-video input nor composed-video output crosses PNG.

The Electron implementation carries its pinned Mediabunny browser runtime and
corresponding MPL source inside this Provider package. It is a private decoder
implementation, not a dependency installed into the author's TypeScript
environment; its WebCodecs ambient declarations therefore cannot change a
consumer's global DOM types.

Both Endpoint packages apply absolute integer frames through
`window.__hypitFrameProgram` and publish the same verified `TimelineVisual`.
Endpoint selection is deployment policy; it does not change `HtmlProgram`, Film,
Composition, Prepared Media or the delivery requirement.

When an `HtmlProgram` declares Scope Process input passes, both implementations render the named
input scopes as request-private transparent Pictures before evaluating the package-owned process programme.
Chromium currently transfers these stage Pictures as PNG; Electron uses the same correct stage boundary
while retaining shared textures for the terminal encoded output. Programs without a Scope Process retain
the original single-pass path.

Both implementations expose one exact subset: 8-bit sRGB/full-range RGB stills or
8-bit BT.709/limited-range video inputs, and opaque BT.709 8-bit H.264/yuv420p delivery.

The Endpoint publishes this same closed subset through request-local `supports`. `plan` and
deployment preflight can therefore reject an unsupported source interpretation,
encoded delivery or PNG picture before capture starts. Execution reuses the same predicate as a
boundary assertion; it does not maintain a second, later-only format table.

For a range or sparse request, one typed absolute-frame selection drives both
Artifact staging and `window.__hypitFrameProgram.prepare(selection)` in the
actual Program page. Unselected Present roots are removed before their deferred
URLs or component runtimes become active. Chromium and Electron therefore do
not depend on different pre-document injection mechanisms, and an Electron
capture shell does not need to copy hidden state into the Program frame.

Visual Process inputs use compiler-owned fixed full-canvas stages. The capture path executes selected
stages by their compiler-owned keys and order; it does not scan markup to reconstruct a Process plan.

Support is request-local. Picture Artifacts and Surfaces are checked through their typed absolute usage,
timed sources through occurrence usage, and Process work through `processUsages`. Unsupported material in
an unselected half-open range does not make a partial export unsupported.

Timed media is addressed through the compiler-owned display plane named by `HtmlVideoSource.elementId`.
The Provider replaces only the private decoded-media slot inside that plane's payload host. It does not copy
computed style or insert a sibling into the authored tree, so source decoding cannot change selector,
flex/grid, adjacent-sibling or intrinsic layout semantics.

`PreparedVisualSource.interpretation.picture` is decoder input authority. The portable FFmpeg
path expands the selected SDR matrix and range into full-range RGB PNG payloads. It does not add a
second BT.709-to-sRGB transfer conversion or inherit container colour tags. The same interpretation's quarter-turn is applied explicitly
before pixels enter the stable plane; decoder/container rotation never replaces it. Coded pixels are
rotated first, while the plane applies the separately declared sample-aspect display geometry. Its exact timed-source subset is 8-bit BT.709 sRGB/RGB/full
or BT.709 transfer/matrix/limited, with opaque or straight alpha.

Direct browser stills, including package-owned `HtmlVisual` picture dependencies, have no such transform.
Their typed declaration reaches staging through `HtmlProgram.artifacts`; the Provider does not discover
an `<img>`, CSS URL or colour profile by inspecting component markup. They are limited to 8-bit BT.709 sRGB/RGB/full,
opaque or straight alpha. Staging verifies pixel depth, compatible alpha storage and exactly one decoded frame.
An absent alpha component is the all-opaque subset of straight alpha. Missing embedded colour tags do not
override the typed declaration; present contradictory tags are rejected. `HtmlVisual` data dependencies are
staged as opaque bytes and are never accepted as a presentation path. Still Surfaces use the same rule. Timed Surfaces are
byte-validated against their complete declared picture and decoded through the explicit timed-source
path.

The visual Need also carries a `VisualDeliverySpec`. It, rather than this Provider's
Runtime configuration, selects delivery quality, picture tags and the opaque matte. The
Provider verifies the encoded stream against that requirement before publishing
`TimelineVisual`. Browser/GPU choice, FFmpeg paths, concurrency and memory budgets remain
deployment policy and do not enter the Result.
Frame capture receives the minimal `FrameOutputPictureSpec`, so its sRGB/full-range interpretation and
matte are request semantics rather than a hidden local screenshot default. Its `FrameImages` result
retains that picture interpretation and every original absolute frame identity. It does not receive
video codec, quality, audio or container fields because it produces PNG pictures, not a finished video.

Filesystem staging is private to this local Provider. `@hypit/html-program`
retains only the portable program and its pure frame function; it
does not expose a Node project/staging subpath for hypothetical executors.
Inspection of staged Compositable Surface files and probing the selected media
tools are private here for the same reason: they validate inputs used by this
executor and do not establish a shared media-execution ABI.

## Runtime boundary

The Endpoint facet is `rasterize`. Runtime configuration owns deployment policy:

- `workers`: fixed browser-worker count or `auto`;
- `maxWorkers`: automatic ceiling;
- `defaultConcurrency`: whole requests admitted in this Endpoint pool;
- `browserCapacity`: browser-worker slots reserved across admitted requests;
- `chromePath`, or exact `browserVersion` plus `browserCacheDirectory`;
- `ffmpegPath` and `ffprobePath`;
- optional process/stage deadlines and byte budgets.

The package recommendation is stored as `hypit.htmlBrowser.version`. Managed
Chrome defaults to `~/.cache/hypit/html-rasterizer/chrome`; its ManagedProgram
state is stored below `.hypit-html-browser-program`. Browser installation occurs
only through explicit Runtime preparation:

```sh
hypit programs prepare --runtime ./hypit.runtime.json --endpoint html.local
```

Inspection and execution never search environment variables or silently choose a
different system browser. `chromePath` selects a user-managed executable;
`browserVersion` selects one exact managed Chrome for Testing version. The two
selection modes are mutually exclusive.

Electron is never downloaded, selected as a fallback or substituted for Chrome. Select the separate
Endpoint package explicitly and supply an executable from Electron 45 or newer:

```json
{
  "endpoints": {
    "html.gpu": {
      "use": "@hypit/provider-html-electron-local",
      "pool": "local-render",
      "config": {
        "electronPath": "/Applications/Electron.app/Contents/MacOS/Electron",
        "workers": 1
      }
    }
  }
}
```

An Electron Endpoint offers `rasterize-visual` only because its terminal product
is encoded video. `rasterize-frames` intentionally remains a Chromium capability:
its requested result consists of self-describing PNG images. A Runtime that needs
both can configure and bind two Endpoint instances. Electron cannot be combined
with Chrome-selection fields or software-only browser compositing. Unsupported
shared-texture or WebCodecs H.264 configurations fail on that Endpoint;
execution does not rewrite the request or switch implementations.

## Frame selection and parallelism

A continuous request retains original absolute frame identities. A sparse request
accepts strictly increasing, non-contiguous frames. Workers are independent
browser processes and may start at any requested frame; they do not wait for an
earlier worker to traverse the program.

The compiler's typed `videoSources` plan determines exact selected streams and source-video samples,
including reverse, hold, loop and rational-rate mappings. The Provider binds the shared sided evaluator
for each source's single Temporal Map; it does not maintain a parallel sampling model. The Chromium
implementation compares the Map's exact rational source time with FFprobe's integer PTS ticks and
stream time base, then decodes bounded FFmpeg windows lazily. Electron receives that same selected
ordinal and exact PTS tick; its browser decoder must return the selected timestamp or execution rejects.
It never re-evaluates a reverse boundary by subtracting a floating-point epsilon. Neither path compares rounded decimal
seconds or resample through an average frame rate. It
shares decoded images only within the current execution and leases them under
`maxDecodedSourceBytes`. The Electron implementation consumes the same plan with
browser-side demux/decode and a request-local bounded sample cache. Arbitrary
author HTML is not parsed to infer temporal sampling semantics.

At a source-frame boundary, negative-rate sampling selects the decoded interval
on the boundary's left; positive and held sampling select the interval on its
right. This is the Provider's terminal quantization of one continuous Temporal
Map, not an adjustment to the authored relation.

In the Chromium path, completed PNGs enter a bounded ordered sink. In the Electron
path, shared textures are copied to bounded `VideoFrame` storage and enter
WebCodecs in ordinal order; FFmpeg receives encoded H.264 only for container
muxing. The Electron path creates no CPU bitmap, PNG sequence or intermediate composed video.
Current macOS VideoToolbox rejects Electron's imported shared image as a direct
encoder input, so the Provider keeps that machine-local compatibility boundary.
Capture of later frames can continue while earlier frames are encoded.
Sparse frame output writes only requested PNGs and is bounded by
`maxRenderedBytes`.

`maxDecodedSourceBytes` and `maxPendingFrameBytes` are working-set admission
budgets. One exact frame required for progress may be the sole resident value
even when it is larger than the configured budget; speculative and concurrent
values remain bounded. `maxRenderedBytes` is instead a hard result-size limit.
When the final occurrence of one Electron source leaves the selected frame, its
cursor, input and retained decoded samples are released together.

Execution diagnostics divide one Electron request into setup, Programme
evaluation, source decode/draw, resource readiness, paint and texture transfer,
GPU output work, ordered IPC/encoder input, container completion and output
verification. They are request-local observations used to find the dominant
implementation cost. Per-frame and per-batch accumulated work can overlap in
the pipeline and is not added into a second wall-clock total. These diagnostics
do not become Progress, Result metadata, Programme fields or persisted machine
capabilities.

## Lifecycle and failure

Each request owns its temporary directory, localhost server, browser process or
windows, decoded-source working set and encoder. Nothing is shared across
requests. Cancellation or failure closes page sessions, decoded samples,
shared-texture references, processes and resource I/O.
Process-tree cleanup is best effort after abnormal exits; hard OS termination
requires containment supplied by the deployment.

The executor waits for page frame listeners, declared fonts, dynamic image
decodes and compositor settlement before accepting a screenshot. Readiness is
scoped to compiler-published capture roots when available; real global stylesheet
edits intentionally fall back to whole-document inspection.

## Direct use

```ts
import { rasterizeChromiumHtmlProgram } from "@hypit/provider-html-local";

const visual = await rasterizeChromiumHtmlProgram(
  {
    program,
    delivery,
    range: { startFrame: 240, endFrameExclusive: 360 },
  },
  {
    resources,
    workers: 1,
  },
);
```

Omit `range` for the complete program. Audio is not part of this result;
`@hypit/media-local` and the author assembly prepare audio and mux the
final artifact.
