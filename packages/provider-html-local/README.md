# `@hypit/provider-html-local`

Endpoint and Runtime adapter for the direct Chromium implementation in
`@hypit/html-chromium-local`:

- `@hypit/html-program@1#rasterize-visual` → `TimelineVisual`;
- `@hypit/html-program@1#rasterize-frames` → self-describing sRGB PNG frame images.

The Provider consumes a typed `HtmlProgram`. The direct renderer stages only the Artifacts selected by the request,
extracts exact source samples through FFmpeg, applies absolute integer frames through
`window.__hypitFrameProgram`, captures opaque PNG frames through Chrome DevTools Protocol and writes
encoded visual output through an ordered FFmpeg pipe.

The Chromium package owns executable selection, installation primitives, frame capture and its
disposable worker process. This Provider owns Endpoint admission and explicit Runtime preparation;
it does not select another renderer as a fallback. The separate
`@hypit/provider-html-electron-local` package owns Electron execution and offers encoded visual output
only. Both renderers use `@hypit/html-render-local` for staging, limits and worker supervision.
Provider-specific progress and Runtime configuration live in `@hypit/html-runtime-local`; neither
shared package makes renderer choice a request field.

## Exact request subset

The current implementation accepts:

- 8-bit sRGB/full-range RGB still pictures;
- 8-bit BT.709/limited-range video pictures;
- opaque BT.709 8-bit H.264/yuv420p visual delivery;
- sRGB 8-bit PNG frame delivery.

The Endpoint exposes this subset through request-local `supports`, and execution reuses the same
predicate as a boundary assertion. Unsupported material outside a selected half-open interval does
not reject a partial render.

Timed media uses compiler-owned display planes and typed source occurrences. The Provider samples
the source's sided Temporal Map, compares exact rational source time with the selected stream's
integer PTS ticks, and lazily decodes bounded frame windows. Reverse, hold, loop and rational-rate
mapping do not use rounded seconds or an average-frame-rate resample.

Picture Operators have already closed their named inputs before `HtmlProgram` reaches this Provider.
The capture path therefore has no parallel Scope Process rasterization plan and does not inspect HTML
to reconstruct visual topology. Direct still dependencies and timed media retain distinct typed validation
and decoding paths.

## Runtime configuration

The Runtime Profile owns deployment policy:

- `chromePath`, or an exact `browserVersion` plus `browserCacheDirectory`;
- `workers`, `maxWorkers`, `defaultConcurrency` and `browserCapacity`;
- `ffmpegPath` and `ffprobePath`;
- optional process, stage and byte limits.

Managed Chrome uses the package's exact recommended version and is installed only by explicit Runtime
preparation:

```sh
hypit programs prepare --runtime ./hypit.runtime.json --endpoint html.local
```

Inspection and execution never search environment browser hints or silently substitute a different
browser. `chromePath` selects a user-managed executable; `browserVersion` selects one exact managed
Chrome for Testing version.

## Frame selection and resources

A continuous request preserves absolute frame identities. Sparse frame requests accept strictly
increasing non-contiguous frames. Independent workers may start directly at any requested frame.

Decoded source frames and completed PNGs use request-local bounded working sets. One exact value
required for progress may be the sole resident value when it is larger than a configured admission
budget; `maxRenderedBytes` remains a hard output limit.

Each request owns its temporary directory, localhost server, browser processes, decoded source frames,
encoder and Resource I/O. Cancellation closes these resources and terminates the request's process
tree on a best-effort basis.

## Direct use

```ts
import { rasterizeChromiumHtmlProgram } from "@hypit/html-chromium-local";

const visual = await rasterizeChromiumHtmlProgram(
  { program, delivery },
  { resources, workers: "auto" },
);
```

Direct Chromium execution belongs to `@hypit/html-chromium-local`. Whole-project picture, audio and
mux assembly belongs to the calling application, with `@hypit/nle-local` owning the local NLE case.
This package only adapts Chromium execution to Endpoint and Runtime contracts.
