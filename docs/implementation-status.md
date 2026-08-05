# SVML implementation status

This page describes repository reality. Specifications describe laws; architecture records explain
why they exist.

Target package names and Runtime service ownership are now recorded in
[`package-vocabulary-and-ownership-v1.md`](./package-vocabulary-and-ownership-v1.md). The repository
has not yet performed those renames or splits; the package names below remain current implementation
names.

## v2 implemented

- `@svml/protocol`: immutable module, graph, build, event and provenance wire data.
- `@svml/core`: graph/request verification, Candidate selection, reverse Demand compilation,
  OperationId deduplication, finite-plan validation and verified BuildState reduction.
- `@svml/driver-node`: trusted in-process Producer and Provider execution, artifact access, JSON
  persistence and command regeneration on resume. It now exposes the minimal regenerated-command
  executor port used by an external Scheduler.
- `@svml/runtime`: environment-neutral Runtime executor, BuildStore and OperationStore contracts;
  static Runtime Module facets; sealed Runtime Profile/Closure resolution; implementation and
  permission locking; exact Provider coverage checks; verified in-memory CAS stores; and the first
  queue-free `LocalBuildScheduler`. One Scheduler shares named concurrency lanes across multiple
  Builds and independent commands inside one Build. Operation identity binds Build, Command,
  Endpoint implementation, Runtime Closure, request, attempt and stable submission key without
  entering BuildState. Recoverable Provider Endpoints journal that identity before `start`, persist
  pending checkpoints, use `resume` after restart and replay a stored completion into Core without
  another Endpoint call.
- `@svml/validation`: exact-Type semantic validator registry and the common Record admission gate.
  A Type owner may lock a validator digest in its static Manifest; Producer, Provider, authored and
  provided values then require a receipt bound to that exact Type and content. Core verifies the
  receipt without knowing the domain meaning.
- `@svml/compiler-node`: a domain-neutral registered-manifest resolver, exact transitive Module
  Closure construction, root-confined/read-once Node Source resolver, real-file compiler facade and
  named-export-to-BuildPlan entrypoint. The discovery pass and decode pass share locked SourceUnits.
- `@svml/cli`: the first trusted official v2 assembly. `check` compiles real Text sources with Script,
  Film, HyperFrames Render and recursively imported SVS. `plan` is wired directly to Core; the
  remaining full-video gap is package-local generation, Speech and Track Surfaces, not CLI logic.
- the physical `@svml/contracts` workspace distribution now carries independently digested logical
  `@svml/narrative`, `@svml/media`, `@svml/program-space`, `@svml/speech`, `@svml/semantic-time`
  and `@svml/composition` Manifests. Caption timing is owned by `@svml/caption`, not the shared waist.
  A future physical rename to `@svml/video` does not change those nominal identities.
- `@svml/text` and `@svml/script`: manifest-driven Text Frontend plus the official Script Surface.
  Text Surfaces may now contribute authored Records, Author Components and locked Graph Fragments;
  the whole document is collected before forward references are resolved. Script remains an
  explicitly record-only Surface.
- package-owned Structured Surfaces can resolve explicitly referenced public Records from already
  compiled source imports. This lets a consuming package validate a generic SVS Recipe and emit its
  own nominal typed Program during `check`; component outputs remain symbolic and forward-resolved.
  Imported Records are exposed as defensive copies and private child Records remain inaccessible.
- `@svml/svs`: a minimal record-only alternate Frontend for `<sheet version="1">`. It parses dotted
  rule names and primitive Recipe properties into generic immutable Recipe Records. It deliberately
  has no video property vocabulary, selector cascade or inheritance.
- `@svml/speech-take`: one atomic speech Product with deterministic audio-basis, generic VisualTrack
  and generic AudioTrack projections.
- `@svml/whisperx`, `@svml/speech-align`, `@svml/caption`: one-pass evidence, direct authoritative
  Script alignment, timed-caption planning and official style-to-VisualTrack lowering.
- `@svml/hyperframes`: deterministic generic Composition-to-HTML compilation with content-addressed
  Artifact placeholders and a separate Runtime materialization boundary. HyperframesDocument now
  binds ProgramSpace, exact rational frame rate, integer frame count and canvas outside HTML; any
  legal frame or half-open Provider chunk can be addressed independently without entering Core.
- `@svml/hyperframes-render`: an explicit author Surface and exact render capability. It compiles any
  ordinary Composition to HyperframesDocument, pauses at a render Need, then projects the fulfilled
  Product to a common MediaArtifact. Product affinity binds the same document, frame domain and
  canvas, while local workers/Lambda chunking remains an Endpoint detail. Local versus hosted
  execution remains a Provider binding.
- `@svml/broll`: provider-neutral B-roll Programs lowered into independently stacked Presents plus
  source-audio/SFX AudioTrack clips; production-used pop/fade/slide motion and push/page-turn pair
  transitions remain package-owned and never sample another Track.
- `@svml/text-track`: provider-free persistent or timed editorial text lowered into ordinary,
  independently stacked VisualTrack Presents.
- `@svml/film`: package-owned arbitrary-arity Track assembly. A concrete Film declaration lowers to
  a finite immutable TrackSet fold and stops at ordinary Composition. The separate HyperFrames
  Fragment may consume that Composition; Core receives no variadic port, Track-family switch or
  privileged Film root. Its official Structured Surface now validates the generic `film.*` SVS
  Recipe into a typed FilmProgram and type-checks an arbitrary list of peer Track references.
- `@svml/elaborator`: a parser-independent two-phase Author Module linker plus hygienic static Graph
  Fragments. It first predeclares every component output, then resolves forward references, types
  and cycles before emitting an ordinary verified Core Graph. A non-video laboratory fixture proves
  that this layer does not require Text or audiovisual contracts.
- `@svml/realization`, `@svml/speech-program`: explicit Candidate overlays and the first end-to-end
  speech Demand fixture.

The test suite proves arbitrary Targets, selected Existing-Value and substitute Candidates, shared
Operation execution once, affinity rejection, monotonic conformance, derivation integrity and
resume without repeating completed paid work. It also proves that targeting a Text Track does not
demand Film, targeting Composition does not demand HyperFrames, and only the final document Target
collects every selected Track branch. A real non-video text source can declare a report before the
measurement it consumes, then pass through Text, Surface lowering, Author linking and Core
BuildPlan derivation. Component source reflow preserves AuthorModule identity; missing Fragment
definitions, duplicate components and unresolved references fail at their owning boundary.
Recursive Source Closure compilation now selects exact `using` Frontends, decodes dependencies
before importers, binds public exports through aliases, rejects cycles/conflicts and hygienically
keeps private identities independent of aliases and Host filesystem locations. The checked-in
`studio.svs` parses completely as ten generic Recipes. A real Node Host now performs the required
pre-discovery, resolves only registered exact manifests and their digest-bound dependencies, rejects
filesystem/symlink escape, and produces the same verified Source Closure and Core BuildPlan used by
in-memory tests. A separate non-video three-package fixture proves decentralized communication:
one package owns a nominal Measurement contract and validator, another produces it, a third consumes
it; structurally valid but semantically invalid Producer/Provider values, missing or mismatched
validators, receipt-free provided values and tampered receipts are rejected before state admission.
The first real rendering vertical also proves that author source lowers to the same finite plan,
that execution pauses at the exact HyperFrames capability when no Provider exists, and that a bound
Provider completes without entering Film or source parsing.
It also proves that two author-declared paid operations inside one Build execute in parallel up to
their shared Provider lane limit while their common upstream Producer executes exactly once; the
same lane is shared fairly by multiple Builds, and CAS rejects stale Scheduler state writes.
Runtime assembly tests additionally prove that same-name Provider code with another implementation
digest is rejected before execution, recoverable Endpoints require OperationStore, permissions need
an explicit Host allowlist, an unbound demanded Need fails before scheduling, and restart discovers
the same pending Operation/submission identity rather than inventing another request. They cover
both crash windows: after remote submission but before a checkpoint, and after completion is
journaled but before Core accepts the Event.

## Implemented audiovisual waist candidate

All final audiovisual contributions lower to self-contained peer Tracks in one ProgramSpace.
Visual Tracks contain independently stacked Presents, so one author package can contribute multiple
absolute z positions without turning the complete Track into a stacking boundary. Composition may
not identify Caption, Speech or B-roll families and may not let one Track read, mask, transform or
reinterpret a sibling. Timed captions are an intermediate value; styled captions must become an
ordinary VisualTrack.

The implemented order is:

1. implement the first `ProgramSpace / VisualTrack / AudioTrack / Composition` contract candidate;
2. lower Speech and Caption into the generic Track waist;
3. add a HyperFrames Composition reference implementation;
4. lower B-roll and Text through the same Track contracts;
5. assemble arbitrary Track references through an ordinary Film Graph Fragment.

The candidate is not yet an open-source compatibility promise. The executable gate in
`spec/track-expressiveness-v1.md` proves structural Text three-box, Caption range/cue/content,
media foreground/backdrop sampling and cross-Track absolute stacking without domain fields. It now
also proves content-addressed exact-font lowering and a typed sRGB/alpha/timing Surface path. An
opt-in real-browser test verifies one local Hyperframes frame at the pixel level.

Public freeze still requires official Text/Caption components to stop relying on environment fonts,
plus a renderer receipt/validation rule that binds the exact layout implementation and verifies
declared Surface media facts in local and hosted Runtime endpoints.

The author-package boundary is now specified and executable in the non-video Recipe fixture. The
next vertical work is:

1. implement the namespaced generation, Speech and Track Surfaces
   specified by `examples/talking-film-golden` without changing their generic Track waist;
2. connect the implemented generic HyperFrames render Need to local and hosted Provider packages;
3. build the local Runtime, Artifact Store and real WhisperX/Seedance Provider packages.

## Deliberately not implemented

- arbitrary third-party parser or Producer execution;
- sandboxed or remotely attested third-party Type validator execution (the current registry accepts
  trusted in-process implementations only);
- automatic npm/workspace package installation, lock-aware executable facet loading and community
  package discovery (the registered-manifest resolver and production-style local Source resolver
  are implemented);
- production credentials, durable queues, hosted scheduling or distributed workers;
- real Seedance, WhisperX or HyperFrames Provider endpoints;
- official generation, Speech, Caption, B-roll and Text Track Surfaces and their package-owned SVS
  Recipe schemas;
- the complete `examples/talking-film-golden` source; Script, Film and HyperFrames Render are
  executable individually, while the intervening producer/Track Surfaces are still missing;
- a cross-Track effect or adjustment-layer model.
- a dedicated Base FX model or compatibility placeholder.

## Domain-neutral package boundary

A non-video language reusing the build system needs only:

1. `@svml/protocol` for immutable wire data;
2. `@svml/core` for verification, reverse Demand compilation and the Build state machine;
3. normally `@svml/elaborator` for modular author declarations and Graph Fragment expansion;
4. `@svml/compiler-node` when it wants the reference filesystem/registered-package compiler Host;
5. a Driver/Runtime implementation when it wants to execute the resulting Commands.

`@svml/runtime` supplies the reference environment-neutral scheduling and BuildStore ports;
`@svml/driver-node` is still the provisionally named trusted Node executor implementation.

If one of its Types declares a semantic refinement, the Host also needs a validator/admission
implementation; `@svml/validation` is the reference package. This does not make that domain Type a
Core registration or require a Core release.

`@svml/realization` is needed only for externally supplied Candidates such as reuse, preview or
manual values. `@svml/text` is needed only when the author chooses the official XML-like syntax.
Script, video contracts, Film, Tracks, HyperFrames and Providers are domain/application packages.
There is deliberately no `@svml/author` package and no mandatory `.svk` suffix.

The current package named `@svml/contracts` is audiovisual vocabulary despite its generic name. It
must be migrated atomically to an explicitly video-scoped public name before compatibility freeze;
its types are not part of Core and are not required by other domains.

The root v1 compiler and `stdlib/` remain an executable research oracle. Their fixed compilation
path and legacy `.svk/.svc` file taxonomy are not v2 compatibility promises.
