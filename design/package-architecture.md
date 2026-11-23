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

Composition Sources -> @hypit/nle/authoring
@hypit/script/timing -> @hypit/temporal + @hypit/timed-transcript
@hypit/project    -> @hypit/media-asset + @hypit/execution (client types)
@hypit/html-render-local -> @hypit/html-program
@hypit/html-chromium-local -> @hypit/html-render-local
@hypit/html-electron-local -> @hypit/html-render-local
@hypit/html-video -> @hypit/html-program + @hypit/audio-program
@hypit/html-video-local -> @hypit/html-video + local HTML/Audio execution
@hypit/nle-delivery -> @hypit/nle + @hypit/project + @hypit/html-video + @hypit/html-program + @hypit/audio-program
@hypit/text-fine -> @hypit/nle + @hypit/nle-delivery + @hypit/html-program
@hypit/seedance   -> @hypit/execution/model
@hypit/provider-hypihub -> @hypit/seedance + @hypit/execution/provider
@hypit/application -> @hypit/project + @hypit/execution (environment types)
@hypit/application-home -> @hypit/application
@hypit/nle-studio -> @hypit/application + @hypit/project + @hypit/nle + @hypit/nle-delivery
@hypit/hypit     -> Application + Home + selected Products + selected AIGC Execution Environments
```

The arrows describe source dependencies, not authority. `@hypit/temporal` supplies exact values and mappings. Media
packages interpret accepted media. `@hypit/nle` owns the Project document, transactions and materialization target.
`@hypit/nle-delivery` owns compilation for preview and delivery. `@hypit/nle/authoring` provides the TSX authoring
vocabulary and pure materialization to the NLE document within the NLE release.

The NLE release contains the SVML Reader, serializer and current schema. A separate serialization release becomes
justified when an independent owner consumes the same format with its own release lifecycle.

## Core package responsibilities

### `@hypit/temporal`

Owns exact temporal values, finite local domains, target-to-source maps, composition and preimage
operations. It does not own NLE placement, media selection, frame grids or renderer policy.

### `@hypit/media` and `@hypit/media-asset`

`@hypit/media` owns execution-independent stream observations and interpretations. `@hypit/media-asset` owns
portable accepted-media documents and adoption. Neither owns NLE placement or authoring components.

### `@hypit/script` and `@hypit/timed-transcript`

`@hypit/script` owns the Script Reader and its speech, caption and boundary projection. Its `timing` subpath
binds a parsed Segment to measured word times in the caller-selected source window. Both entry points are in
the same release. `@hypit/timed-transcript` owns the transcript format and explicit authored-word alignment.
The project program selects both inputs, and the chosen subtitle component owns its parameter shape.

### `@hypit/nle`

Owns the durable NLE Project document and SVML schema, Reader and serializer, Project Service, edit transactions,
Composition and Track facts, Present occurrences, source-time relations, Present-local Processes and timed Adjusts,
Transitions, Mattes, linked-edit Groups and shared values.

The `authoring` subpath validates the declarations of a synchronous Composition Source into a new Project value.
Local input resolution and file creation are responsibilities of the calling project program.
The `node` subpath opens the canonical Project file through its owner Service and owns revision-checked file persistence. Studio leases the Service and owns its session.

NLE Project serialization is the SVML representation of the edit. It contains no TSX source text, editor
selection, Service revision or execution plan.

`@hypit/text-fine` is a selectable component package. It supplies rich text layout, text motion and editing facets.
NLE owns each Item’s placement and source-time map. The component produces its Picture using the shared HTML text renderer.

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
lifecycle and visual consumer justify a release boundary outside headless `@hypit/nle`. It composes the Project Service with its session navigation and locks through the NLE Editing Surface, and accepts Project Media Service and preview Executor ports without
absorbing their facts or execution state.

`@hypit/canvas` owns the Canvas document, revision transactions and shared Service. Its `node` subpath
provides Project file persistence, one-card request preparation, Invocation attachments and history observations,
and explicit adoption into Project Media. It uses the Project's installed Model
contributions and its scoped Execution clients.

`@hypit/canvas-studio` owns the Canvas Product Provider, browser artifact and session protocol. The browser
uses a Canvas Product Session. The CLI and project programs can open the Canvas owner through Project leases.

`@hypit/application` owns the generic ApplicationHost lifecycle, ProjectHost and Product Session registries,
AIGC Execution connection directory and Node loopback adapter. It knows Product Providers by stable product identity and opaque
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

## AIGC package and deployment boundaries

Model and Provider packages are independent npm releases. A Model package such as `@hypit/seedance` owns its exact
Capabilities, request validation and output types, and may supply project authoring contributions. A Provider package
such as `@hypit/provider-hypihub` owns the mapping to its service, request support, credential requirements and the
Provider-side submission, polling and collection protocol. It declares compatible ranges for the Model contracts
it implements and for the Provider API.

A Model package follows the model family. Separately selectable model variants retain separate Capability IDs,
and input modes stay inside the Capability request. A Provider maps each supported mode to the service route it uses.
For example, Seedance 2.5 and Seedance 2.5 Flash share one npm package, and each accepts text, frame and reference modes.
GPT Image 2.5 Flare and Sunburst each keep one Capability while HypiHub selects a text or edit service model ID.

`@hypit/execution` is the AIGC execution release. Its public contracts support Model authors, Provider authors,
Invocation callers and Environment deployments. Keep these contracts and the initial Node Environment in one release
with separate entry points:

- `@hypit/execution/model` supplies the small Capability declaration contract consumed by Model packages.
- `@hypit/execution/provider` supplies the Endpoint adapter contract consumed by Provider packages.
- `@hypit/execution` exposes the Invocation and Publication client contract.
- `@hypit/execution/node` implements the local Environment, capacity admission, durable Invocation recovery, and
  Publication storage. Its Node ExecutionHost serves the same client contract across the process boundary.
  Scheduler, journal, storage and transport are modules inside this release.

The Model and Provider entry points load independently of the Node runtime and storage modules. The execution
package consumes explicit Capability declarations and Endpoint adapters supplied by the deployment. The Environment
receives scoped input resources and publishes completed outputs through its own contract.

```text
Model packages    -> @hypit/execution/model
Provider packages -> Model contracts + @hypit/execution/provider
Node distribution -> @hypit/application + selected Environment implementations and Provider packages
```

`@hypit/application` retains environment registration, discovery and project client leases. `@hypit/hypit` selects
the available Environment instances in its distribution. The default Node distribution starts its
local ExecutionHost independently. A program embedding the Environment directly uses the same client contract.
Credential sources, capacity and the data root are deployment configuration. The local data root owns its persisted Environment ID.

Project dependencies and the project lockfile select Model packages used by authoring. Deployment dependencies and
its lockfile select the Environment and Provider implementations; deployment configuration explicitly enables the
capabilities it supplies. Published npm artifacts use the same public import specifiers as development source and
declare ordinary compatibility ranges. Verify release closure by installing the packed artifacts outside the
monorepo in the roles they serve.

See [Invocation ownership and capacity](explicit-programs-and-execution.md#capability-invocation-and-publication).

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
3. resolve 41 Project Media Assets and five selected project packages;
4. compile the accepted snapshot to closed Picture and Audio programs;
5. start one Project-scoped 720×1280, 24 fps Delivery Action with a local HTML Video Executor;
6. close one `HtmlProgram` and one `AudioProgram`, then execute 1397 Picture frames and the Audio graph into
   H.264/AAC MP4;
7. keep the completed resource outside Project Media until a caller explicitly adopts it.

The production path establishes each durable seam before it becomes an independent release boundary.
