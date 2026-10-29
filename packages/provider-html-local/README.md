# @hypit/provider-html-local

Trusted local implementation of:

- `@hypit/html-program@1#rasterize-visual` → `TimelineVisual`;
- `@hypit/html-program@1#rasterize-frames` → self-describing sRGB PNG frame images.

The Provider consumes the typed `HtmlProgram` directly and offers two explicit
execution implementations for the same visual Need:

- `chromium` is the portable implementation. It obtains exact source samples
  through FFmpeg, presents them to Chrome as PNG images, captures PNG frames
  through Chrome DevTools Protocol and streams them into FFmpeg;
- `electron` is the encoded-visual implementation. It decodes the compiler's
  exact source samples, transfers the composed frame as an offscreen shared
  texture and owns two exact delivery pipelines. SDR uses WebCodecs H.264 plus
  FFmpeg container muxing. HDR10 uses a linear `rgbaf16` Program surface,
  an explicit BT.709-linear-to-BT.2020/PQ P010 transform and `libx265` Main10;
  the Provider writes the authored mastering-display and content-light metadata and verifies both
  kinds in the first decoded output frame.
  Neither source-video input nor composed-video output crosses PNG.

The Electron implementation carries its pinned Mediabunny browser runtime and
corresponding MPL source inside this Provider package. It is a private decoder
implementation, not a dependency installed into the author's TypeScript
environment; its WebCodecs ambient declarations therefore cannot change a
consumer's global DOM types.

Both implementations apply absolute integer frames through
`window.__hypitFrameProgram` and publish the same verified `TimelineVisual`.
Renderer selection is deployment policy; it does not change `HtmlProgram`, Film,
Composition, Prepared Media or the delivery requirement.

When an SDR `HtmlProgram` declares Scope Process input passes, both implementations render the named
input scopes as request-private transparent Pictures before evaluating the package-owned process programme.
Chromium currently transfers these stage Pictures as PNG; Electron uses the same correct stage boundary
while retaining shared textures for the terminal encoded output. Programs without a Scope Process retain
the original single-pass path. HDR10 rejects Scope Process input passes because an 8-bit stage cannot
preserve its linear extended-range working picture. Nested child Programs that require such passes are
rejected by HTML compilation until the renderer owns recursive child surfaces.
This limitation is only the recursive visual-Process surface path. AudioProgram nesting is compiled and
rendered by the independently selected audio Renderer, while HDR10 plus a root Scope Process is rejected
by this Provider's support decision before capture.

For a nested Composition, the root `HtmlProgram` already contains the fully composed source-sampling
plan and an exact nested-document target for each source occurrence. Chromium and Electron keep source
decode, cache and sample selection at the root Provider boundary, then inject the selected frame into
that target document. They do not materialize a child video, ask the iframe to rediscover its media
semantics or copy renderer addresses into Composition.

Chromium implements one exact SDR subset: an sRGB, premultiplied, 100-nit-reference working
picture; 8-bit sRGB/full-range RGB stills or 8-bit BT.709/limited-range video inputs; and opaque
BT.709 8-bit delivery. Electron implements that same subset and an additional HDR10 subset:
a linear BT.709 premultiplied working picture with explicit reference white, optional opaque
BT.2020/PQ/BT.2020-NCL/limited 10-bit video sources, and opaque BT.2020/PQ/BT.2020-NCL/limited
HEVC Main10 delivery with explicit HDR10 static metadata. HDR still images and HDR Compositable
Surfaces remain unsupported. HLG,
other gamut/transfer combinations and other higher-bit-depth values remain valid common-domain
requests but are rejected here. The Provider never guesses a replacement profile, silently
tone-maps unsupported input or changes delivery after execution starts.

For an HDR10 video source, Chromium's opaque hardware-decoder texture is deliberately not used
as picture authority: importing it as a display texture applies a browser view transform. The
Provider lazily decodes only the exact samples selected by the Program's Temporal Map into
temporary I420P10 planes, then performs the authored PQ/BT.2020-to-linear-working transform in
WebGPU. These files are a bounded, request-private decoder working set, not Prepared Media or a
new Result format. The final `rgbaf16` Program surface is transformed to P010 and streamed into
the explicitly configured software Main10 encoder; it is never retained as an intermediate video.

The Endpoint publishes this same closed subset through request-local `supports`. `plan` and
deployment preflight can therefore reject an unsupported working picture, source interpretation,
encoded delivery or PNG picture before capture starts. Execution reuses the same predicate as a
boundary assertion; it does not maintain a second, later-only format table.

For a range or sparse request, one typed absolute-frame selection drives both
Artifact staging and `window.__hypitFrameProgram.prepare(selection)` in the
actual Program page. Unselected Present roots are removed before their deferred
URLs or component runtimes become active. Chromium and Electron therefore do
not depend on different pre-document injection mechanisms, and an Electron
capture shell does not need to copy hidden state into its child page.

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

- `renderer`: `chromium` (default) or `electron`;
- `workers`: fixed browser-worker count or `auto`;
- `maxWorkers`: automatic ceiling;
- `defaultConcurrency`: whole requests admitted in this Endpoint pool;
- `browserCapacity`: browser-worker slots reserved across admitted requests;
- for `chromium`, `chromePath`, or exact `browserVersion` plus
  `browserCacheDirectory`;
- for `electron`, an explicit user-managed `electronPath`;
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

Electron is never downloaded, selected as a fallback or substituted for Chrome.
Select it explicitly in the Runtime Profile and supply an executable from
Electron 45 or newer. The configured FFmpeg must expose `libx265`; the Electron
Program readiness probe reports a mismatch otherwise, because that Endpoint
publishes the complete SDR plus HDR10 request subset:

```json
{
  "endpoints": {
    "html.gpu": {
      "use": "@hypit/provider-html-local",
      "pool": "local-render",
      "config": {
        "renderer": "electron",
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
shared-texture, SDR WebCodecs or HDR10 `libx265` configurations fail on that Endpoint;
execution does not rewrite the request or switch implementations.

## Frame selection and parallelism

A continuous request retains original absolute frame identities. A sparse request
accepts strictly increasing, non-contiguous frames. Workers are independent
browser processes and may start at any requested frame; they do not wait for an
earlier worker to traverse the program.

The compiler's typed `videoSources` plan determines exact selected streams and source-video samples,
including reverse, hold, loop and rational-rate mappings. The Chromium
implementation compares the Map's exact rational source time with FFprobe's integer PTS ticks and
stream time base, then decodes bounded FFmpeg windows lazily. It does not compare rounded decimal
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
SDR path, shared textures are copied to bounded `VideoFrame` storage and enter
WebCodecs in ordinal order; FFmpeg receives encoded H.264 only for container
muxing. In the Electron HDR10 path, the same ordered shared textures enter the
WebGPU output transform; bounded P010 batches stream directly into `libx265`.
Neither path creates a CPU bitmap, PNG sequence or intermediate composed video.
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
import { rasterizeHtmlProgram } from "@hypit/provider-html-local";

const visual = await rasterizeHtmlProgram(
  {
    program,
    delivery,
    range: { startFrame: 240, endFrameExclusive: 360 },
  },
  {
    resources,
    renderer: "electron",
    electronPath: "/Applications/Electron.app/Contents/MacOS/Electron",
    workers: 1,
  },
);
```

Omit `range` for the complete program. Audio is not part of this result;
`@hypit/media-local` and the author assembly prepare audio and mux the
final artifact.
