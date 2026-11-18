# Package architecture and intermediate representations

> Status: current package-boundary proposal. A package is created only when its release, ownership, consumer,
> selection, platform-weight or deployment boundary is real.

## Representation boundaries

Author programs materialize durable NLE Project facts. The delivery compiler reads an accepted snapshot and
produces resource-complete `HtmlProgram` and `AudioProgram` values for one request. Picture and Audio share the
exact occurrence and source-time computation inside the compiler. Executors consume the resulting programs and
own local decoding, capture, process state, caches and encoding.

## Current release shape

The package graph remains small while separating platform execution from owner semantics:

```text
@hypit/temporal
  ├── @hypit/media
  ├── @hypit/media-asset
  └── @hypit/nle

@hypit/authoring  -> @hypit/nle
project component packages -> @hypit/authoring
@hypit/project    -> @hypit/media-asset
@hypit/html-render-local -> @hypit/html-program
@hypit/html-chromium-local -> @hypit/html-render-local
@hypit/html-electron-local -> @hypit/html-render-local
@hypit/html-video -> @hypit/html-program + @hypit/audio-program
@hypit/html-video-local -> @hypit/html-video + local HTML/Audio execution
@hypit/nle-delivery -> @hypit/nle + @hypit/project + @hypit/html-video + @hypit/html-program + @hypit/audio-program
@hypit/application -> @hypit/project
@hypit/application-home -> @hypit/application
@hypit/nle-studio -> @hypit/application + @hypit/project + @hypit/nle + @hypit/nle-delivery
@hypit/hypit     -> Application + Home + selected Products + selected AIGC Execution Environments
```

The arrows describe source dependencies, not authority. `@hypit/temporal` supplies exact values and mappings. Media
packages interpret accepted media. `@hypit/nle` owns the Project document, transactions and materialization target.
`@hypit/nle-delivery` owns compilation for preview and delivery. A future `@hypit/authoring` package
would own the TSX authoring vocabulary and materialization adapter, but its first implementation may remain a source
module inside the NLE release until a second consumer proves an independent release boundary.

The NLE release contains the SVML Reader, serializer and current schema. A separate serialization release becomes
justified when an independent owner consumes the same format with its own release lifecycle.

## Core package responsibilities

### `@hypit/temporal`

Owns exact temporal values, finite local domains, target-to-source maps, controls, composition and preimage
operations. It does not own NLE placement, media selection, frame grids or renderer policy.

### `@hypit/media` and `@hypit/media-asset`

`@hypit/media` owns execution-independent stream observations and interpretations. `@hypit/media-asset` owns
portable accepted-media documents and adoption. Neither owns NLE placement or authoring components.

### `@hypit/authoring` (planned boundary)

Owns the TypeScript/TSX authoring vocabulary and materialization of a finite author program into NLE commands or a
Project value. It may provide `Timeline`, `Track`, `Media`, `Component`, `TimeMap`, `Control`, Present-local `Process`,
`Transition`, `Matte` and spatial authoring elements.

It does not own durable edits, AIGC recipes, semantic evidence, renderer selection or executor state.

The package must distinguish author-time materialization from frame evaluation. A component can be materialized to
an editable NLE Composition or remain an opaque Component Present with a package symbol and closed parameters.

### `@hypit/nle`

Owns the durable NLE Project document and SVML schema, Reader and serializer, Project Service, edit transactions,
Composition and Track facts, Present occurrences, source-time relations, Present-local Processes and timed Adjusts,
Transitions, Mattes and shared values.

NLE Project serialization is the SVML representation of the edit. It contains no TSX source text, View
selection, Service revision or execution plan.

### `@hypit/html-program` and `@hypit/audio-program`

`@hypit/html-program` owns a portable, resource-complete HTML document with finite frame count, canvas, frame rate and
the `prepare/applyFrame` page ABI. It owns the Picture resources and source-frame observations for execution.

`@hypit/audio-program` owns the renderer-facing continuous audio graph after package implementations and Media have
been resolved.

### Executors and product adapters

Preview, review and delivery executors own output clocks, decoding, browser or native processes, GPU plans, caches,
encoding, progress, cancellation and recovery. Hosts select installed component packages and executor capabilities;
execution state belongs to each request.

`@hypit/html-video` owns the platform-neutral delivery plan and Executor contract. `@hypit/html-render-local`
owns request-local staging, HTTP serving, worker supervision, ordered frame joining and the `HtmlCaptureBackend`
contract. `@hypit/html-chromium-local` captures frame buffers; `@hypit/html-electron-local` transfers committed shared
GPU textures into WebCodecs. `@hypit/media-local` closes and inspects the selected local FFmpeg/FFprobe toolchain,
executes the closed Audio graph and muxes terminal outputs.
`@hypit/html-video-local` composes these operating-system capabilities as a local `HtmlVideoExecutor`.

`@hypit/nle-delivery` is the Project-scoped orchestration seam: it resolves one accepted SVML snapshot, Project Media
and selected package contributions. Its internal compiler prepares Picture and Audio programs, then the delivery
Service submits a `HtmlVideoDeliveryPlan` to its injected Executor. Its Service owns Action handles, observation, cancellation and Project destination validation; it
owns neither the document nor the exported resource.

`@hypit/nle-studio` supplies the NLE Product Provider and browser artifact registered by ApplicationHost. Its product
lifecycle and visual consumer justify a release boundary outside headless `@hypit/nle`. It composes Project and View
Services through the NLE Editing Surface, and accepts Project Media Service and preview Executor ports without
absorbing their facts or execution state.

`@hypit/application` owns the generic ApplicationHost lifecycle, ProjectHost and Product Session registries,
AIGC Execution Environment registry and Node loopback adapter. It knows Product Providers by stable product identity and opaque
session interface only. Product-specific protocols and browser artifacts remain in their product packages.

`@hypit/application-home` owns the application-level browser Surface and its Node static adapter. It consumes the
finite Application projection, temporarily leases a selected project while launching a product, and presents returned
Product Session capabilities. Product Providers retain their launch-input meaning and validation.

`@hypit/hypit` composes the long-lived ApplicationHost distribution. It registers ProjectHost, selected Product
Providers, Application Home, selected AIGC Execution Environments, specialized Executor dependencies and local adapters.
Its Node distribution publishes the live loopback endpoint used by Desktop, Agent and CLI callers. Installed AIGC
Execution Environment packages retain their own
deployment and recovery boundaries.

`@hypit/project` owns the Project manifest Reader, explicit installed-package activation, package contribution and
catalog provenance, open owner-Service leases and the ProjectHost lifecycle. Its `node` subpath supplies local path,
file and npm-resolution adapters. It does not depend on NLE, Canvas or another optional owner. The full boundary,
manifest and Host API are defined in [Project Boundary and Project Host](project-host.md).

## Component package contract

A project component package is an ordinary npm package selected by the Project Boundary and lockfile. It may export:

- an authoring component or materializer;
- stable parameter declarations and editable slots;
- explicit Media input names;
- finite authoring projections for Timeline or Inspector surfaces;
- one render contribution for a supported package symbol, with a local Picture visual, an effect
  implementation or a Picture sampling implementation.

The package owns parameter meaning and validation. NLE owns the occurrence, placement and bindings.
The delivery compiler translates these facts into exact source reads and control positions. Picture
implementations produce the same result for a given requested frame regardless of request order.
A component with a preparation phase may derive reusable data for its local frame function.

## Dependency and ownership rules

1. A package boundary follows an independent release and lifecycle, not a type namespace.
2. A source module remains inside its owner package while its consumers and release lifetime are shared.
3. Authoring depends on NLE facts; NLE does not depend on a project component's source language.
4. The Project document stores package symbols and closed values. The compiler reads accepted Media members
   and resolves component rendering through the explicit Project package selection.
5. AIGC and semantic owners enter through Publications, References and materialization; they never become renderer
   nodes by implication.
6. Executor-private plans, caches and process handles never enter any durable owner document.

## Established vertical slice

The Jensen ranking Project establishes the current vertical slice:

1. keep the current exact temporal foundation and NLE owner schemas;
2. accept a 99-Item SVML Project containing Media, Components, Picture and Audio Processes and Transitions;
3. resolve 41 Project Media Assets and four selected project packages;
4. compile the accepted snapshot to closed Picture and Audio programs;
5. start one Project-scoped 720×1280, 24 fps Delivery Action with a local HTML Video Executor;
6. close one `HtmlProgram` and one `AudioProgram`, then execute 1397 Picture frames and the Audio graph into
   H.264/AAC MP4;
7. keep the completed resource outside Project Media until a caller explicitly adopts it.

The production path establishes each durable seam before it becomes an independent release boundary.
