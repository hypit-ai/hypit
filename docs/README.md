# Documentation

Use the shortest path that matches what you are trying to do. The author guides explain the product;
the developer guides explain extension points; architecture and specifications define implementation
boundaries.

## Make a video

1. [`../README.md`](../README.md) — understand Narratage and run the first provider-free commands.
2. [`quickstart.md`](./quickstart.md) — install the checkout, compile a complete video graph and set
   up a project outside the repository.
3. [`quickstart/script.md`](./quickstart/script.md) through
   [`quickstart/composition.md`](./quickstart/composition.md) — author Script, style, generation,
   timing, Tracks, Film and rendering.
4. [`quickstart/run.md`](./quickstart/run.md) — choose Targets, configure the Runtime, build, inspect,
   reuse and retrieve results.

The website publishes these pages at [narratage.hypit.ai](https://narratage.hypit.ai/).

## Extend Narratage

1. [`guide/develop.md`](./guide/develop.md) — repository setup and guide index.
2. [`guide/packages.md`](./guide/packages.md) — package layers, facets and dependency rules.
3. [`guide/author-packages.md`](./guide/author-packages.md) — add author vocabulary and graph lowering.
4. [`guide/providers.md`](./guide/providers.md) — implement an external capability endpoint.
5. [`guide/runtime-profile.md`](./guide/runtime-profile.md) — assemble Schedulers, Stores and Providers.

## Understand the system

1. [`architecture.md`](./architecture.md) — current Author Graph, Run Graph, Satisfaction, Runtime
   and package boundaries.
2. [`../spec/core-kernel.md`](../spec/core-kernel.md) — compact normative Kernel laws for the
   current `@1` wire data.
3. [`implementation-status.md`](./implementation-status.md) — what actually executes today.
4. [`roadmap.md`](./roadmap.md) — remaining domain-neutral, environment and video-package work.
5. [`open-source-distribution.md`](./open-source-distribution.md) — packaging facts and release gates.

## Domain-neutral implementation records

- [`graph-first-value-boundary.md`](./graph-first-value-boundary.md) — graph edges own
  dependency truth; values contain only intrinsic meaning.
- [`model-input-ports.md`](./model-input-ports.md) — models declare the inputs they accept;
  Providers only map those ports onto their own wire.
- [`node-package-activation.md`](./node-package-activation.md) — trusted installed package
  locking, contributions and Host-selected facet activation.
- [`local-developer-runtime.md`](./local-developer-runtime.md) — local SQLite/filesystem
  Runtime, recovery and environment replacement.
- [`runtime-execution-control.md`](./runtime-execution-control.md) — target durable Build dispatch,
  Worker lifecycle, transparent queue inspection and unambiguous Build/Operation cancellation.
- [`runtime-provider-scheduling.md`](./runtime-provider-scheduling.md) — explicit Provider
  Authorities, exact capability Routes, immutable Runtime Revisions and atomic resource tickets.
- [`cli-experience.md`](./cli-experience.md) — complete human/CI/machine terminal design,
  command hierarchy, visual language and decentralized Endpoint authentication.
- [`runtime-adapter-loading.md`](./runtime-adapter-loading.md) — separately locked Provider
  and Store activation, physical-code identity, diagnostics and explicit Artifact maintenance.
- [`validation-boundaries.md`](./validation-boundaries.md) — the single-owner validation gates;
  what is mandatory, what stays optional and what must never be revalidated downstream.
- [`build-archive-and-egress.md`](./build-archive-and-egress.md) — Targets, durable Records,
  Artifact retention and optional Host materialization as four separate concerns.
- [`speech-alignment.md`](./speech-alignment.md) — the Script and the recording as two
  independent observations, and what locating guarantees.
- [`demo-assets.md`](./demo-assets.md) — distribution boundary and provenance gate for documentation media.
- [`source-and-run-compilation.md`](./source-and-run-compilation.md) — mandatory Source Header,
  peer Author/Run graphs, deterministic composition and compilation data gates.
- package READMEs under [`../packages`](../packages) — executable APIs and ownership.

## Video-domain specifications

- [`../spec/script-surface.md`](../spec/script-surface.md)
- [`../spec/author-surface-binding.md`](../spec/author-surface-binding.md)
- [`../spec/caption-program.md`](../spec/caption-program.md)
- [`../spec/caption-fine.md`](../spec/caption-fine.md) — implemented first field-free Caption Style
  family and its completed browser evidence.
- [`../spec/track-authoring.md`](../spec/track-authoring.md) — shared package-authoring discipline;
  its temporal projection and occurrence-expansion laws are implemented across the current Track packages.
- [`../spec/spatial-layout.md`](../spec/spatial-layout.md) — shared Canvas/Frame/Point/Path geometry,
  two-frame fitting, alignment and explicit backing-layer boundary.
- [`../spec/typography-track.md`](../spec/typography-track.md) — complete two-dimensional Text model, old-system
  and editor attack audit, terminal-IR gaps and Caption feedback.
- [`../spec/ranking-track.md`](../spec/ranking-track.md) — old Ranking audit, separate official
  components, triggered group schedule and executable renderer-neutral lowering.
- [`../spec/media-track.md`](../spec/media-track.md) — unified Item/Sequence media model, ordered
  layers, playback, motion, internal handoffs, audio projection and Speech reuse.
- [`../spec/deck-track.md`](../spec/deck-track.md) — independent depth-stack Deck Track, collection
  state, visible neighborhood and deterministic whole-group reflow.
- [`../spec/audio-track.md`](../spec/audio-track.md) — explicit normalized audio inputs, temporal
  placement, sample occupancy, mixing boundary and old-system migration.
- [`../spec/screen-overlay.md`](../spec/screen-overlay.md) — self-contained full-canvas visual
  contributions and the hard boundary against cross-Track adjustment effects.
- [`../spec/track-composition.md`](../spec/track-composition.md)
- [`../spec/track-expressiveness.md`](../spec/track-expressiveness.md)
- [`../spec/visual-ir.md`](../spec/visual-ir.md)

The finite seven-member Seedance Kit family is complete as data-only Text Templates. Low-level
Seedance invocation, Estimate, media utilities and final Blob flow remain shared and must not be
reopened as Kit-specific execution code. Superseded migration ledgers live in Git history rather
than the current documentation tree.

The shared `svml.visual-track@1` / `svml.visual-ir@1` terminal waist is frozen inside the repository
before publication. Individual author Surfaces remain pre-release unless their own specification
says otherwise.

## Video execution records

- [`kie-generation-modules.md`](./kie-generation-modules.md)
- [`media-inspection-and-normalization.md`](./media-inspection-and-normalization.md)
- [`media-execution-boundary.md`](./media-execution-boundary.md)
- [`hyperframes-aws-runtime.md`](./hyperframes-aws-runtime.md) — recoverable Endpoint semantics,
  deployment resource review and the live AWS canary.
- [`image-transform.md`](./image-transform.md) — transforms, ordered composition and external cutout boundaries
- [`caption-gemini-provider-contract.md`](./caption-gemini-provider-contract.md)
- [`../services/whisperx/README.md`](../services/whisperx/README.md)
- [`../examples/talking-head-aroll/README.md`](../examples/talking-head-aroll/README.md) — current four-take
  live acceptance and explicit historical-Candidate reuse witness.
- [`../examples/talking-film-live/README.md`](../examples/talking-film-live/README.md)

## Documentation rules

- `spec/` states normative laws and versioned contracts.
- `docs/architecture.md` states current ownership and boundaries.
- `docs/implementation-status.md` states repository reality.
- `docs/roadmap.md` states planned work and non-goals.
- package and example READMEs explain one executable unit.
- `docs/public/` contains documentation media cleared for redistribution; its provenance rules are
  tracked in `demo-assets.md`.

Do not preserve a superseded design in the current tree merely as a discussion log. Keep durable
decisions in the current architecture/specification, and rely on Git history for rejected drafts.
