# Narratage roadmap

Status: active priorities after the `svml.graph@1` / Satisfaction redesign, 2026-08-10.

Narratage can already execute one real paid talking-video build. The active roadmap is no longer
“make a video possible.” It is to finish the few remaining domain-neutral operational gaps, keep
execution environments replaceable, and make the first real video packages delivery-grade without
prematurely freezing their public ABI.

## A. Domain-neutral system

### A1. Self-described Author/Run compilation — first public slice implemented

Every Author and Run source now carries a mandatory exact Frontend Header. The official
`@narratage/run-markup` `.svrun` Frontend implements:

- named Targets and reusable Target sets;
- Provided-Value and Fragment Candidates;
- explicit Satisfaction edges and fidelity;
- one multi-export instance shared by several outputs;
- separately instantiated identical implementations;
- imports of trusted Run packages.

The Author Graph and complete Run Graph compile and bind into one final graph before execution. The
Frontend cannot contain credentials, Endpoint bindings or an inline unversioned execution callback.
The CLI no longer accepts `--pin`, `--target` or `--accept-substitute`; they would be invisible Run
Graph mutations.

Run-only Fragment Modules now extend a separately identity-bound execution Program Closure without
polluting Author imports. Trusted Fragment libraries use the generic Host Facet envelope rather than
a Package Loader special case. Remaining A1 work is diagnostics and public packaging, not another
graph model.

### A2. Runtime Profile usability — first public slice implemented

The typed Runtime Profile/Closure API now has a declarative `svml.runtime.json` Host frontend for
Scheduler defaults, replacement services, credential references, Endpoints, lanes and permissions.
Adapter names resolve from a separately verified physical package closure; the generic and video
CLIs import no Provider implementation. Effective Runtime implementation identity binds actual
package bytes, not a self-asserted development label. `doctor` checks locks, configuration,
credentials, executables and declared service health without running a Build or constructing an
Endpoint/Store. Runtime Adapter Host ABI `@1` gives every adapter a required pure configuration
gate, followed only for valid instances by optional read-only environment probes. A failed gate
suppresses dependent diagnostics for that instance. Executable TypeScript remains the advanced
trusted embedding API.

Runtime Profile is deployment configuration. It must not enter author semantic identity or
`.svrun` creative choices.

### A3. Public package lifecycle — release phase, not current execution work

- generate implementation locks through supported CLI commands;
- replace development implementation labels with release-built code identities;
- settle public package names without changing logical module identity;
- publish the already separated generic CLI engine and explicit video CLI Distribution;
- emit compiled ESM/declarations and verify npm, pnpm, Yarn and Bun consumer fixtures;
- add `LICENSE`, contribution and security policy after the project chooses its license.

Explicit installation of trusted packages already works. Automatic package discovery and a package
marketplace are not prerequisites for the first developer release.
The current release and restart boundary is documented in
[`open-source-distribution.md`](./open-source-distribution.md).

### A4. Trusted and untrusted extension levels — trusted works, arbitrary code is later

First make trusted local packages straightforward and diagnosable. Later add isolation for arbitrary
community Frontends, Producers and Validators:

- process or Wasm boundary;
- filesystem/network/environment permissions;
- CPU, memory, timeout and output limits;
- actual loaded-code digest verification;
- validator isolation or remote attestation.

### A5. Build archive inspection and egress — first CLI slice implemented

Make the already durable Build archive usable without confusing persistence with a destination
path:

- `inspect` lists target bindings, demanded Logical Outputs and every accepted Record;
- `get` reads any accepted Record or Build-referenced nested Artifact and optionally materializes
  its bytes or JSON;
- building without a path still archives the complete demanded closure;
- the Host-only Build Catalog powers `builds`, `inspect` presentation and `get --name` without
  entering Core identity or Runtime Closure;
- reachability-based orphan Artifact collection is explicit Runtime maintenance and dry-runs by
  default; Build release/retention windows remain deployment policy.

Add richer graph/plan views and structured diagnostics after this slice. The Catalog may
later support richer history search, but it must only help the user author explicit Candidates.
There is no automatic result reuse or hidden Candidate selection.

## B. Environment and Provider work

### B1. Explicit live Run sources — implemented

One paid four-take generation Build plus one explicit Candidate-reuse Build covered the combined
path on 2026-08-07. The two reusable execution choices are already the checked-in Run sources:

- `build.svrun` targets the final video with `exact` fidelity and therefore demands fresh generation;
- `reuse-generated.svrun` explicitly selects four historical Build-Record Candidates and prunes
  their generation branches;
- `doctor`, `plan`, `build --follow` and `get` are the ordinary user path around either Run;
- credentials, local source assets, Build databases and paid outputs remain outside Git.

A future uninterrupted paid rerun is operational evidence obtained by executing `build.svrun`, not
a missing compiler feature and not a reason to add an example-specific TypeScript orchestrator.

### B2. Remote execution only where demanded

Local media, WhisperX and parallel HyperFrames execution are implemented. S3 Artifact streaming,
AWS media execution and the recoverable AWS HyperFrames Endpoint are also implemented. The exact
FFmpeg Layer plus ZIP-packaged media service have passed the original five-operation live canary;
the shared implementation now also contains generic trim/retime and audio/frame extraction, whose
Lambda deployment still needs refreshing. HyperFrames has passed a real distributed render,
recovery, ingestion and cleanup canary.
Complete the remaining deployment work only when a deployment needs it:

- deploy WhisperX only as a persistent warm service and add the corresponding remote-service
  Provider when a team environment needs it; do not put the model behind Lambda.

The generic Lambda transport already exists. Each Endpoint must return the existing capability and
contract; Lambda placement cannot define another media meaning.

### B3. Production environment adapters

- Secrets Manager, Vault or multi-store credential composition only when a concrete deployment
  requires one; environment and Keychain stores already exist, and current profiles select one;
- hosted Build/Operation stores and distributed leases only for a real multi-process deployment;
- Build release/retention windows and S3 lifecycle policy.

Authentication, tenants, credits, billing and dashboards belong to an embedding product, not to
open-source Core.

### B4. Additional Providers

KIE generation, Xiaomi MiMo TTS, Vertex Caption planning, local media, local OpenCV image transforms,
local WhisperX and local HyperFrames are implemented. Volcengine, Fal, API-key Gemini or a hosted service can
be added as independent Endpoint packages without changing author model packages or Core. None is a
current batch-migration target: add one only when a concrete deployment selects that service,
following the port-mapping laws in [`model-input-ports.md`](./model-input-ports.md).

Deterministic still-image work is also explicit rather than hidden in Track code:
`@narratage/image-compose` and `@narratage/image-transform` lower their different author forms to the
single `@narratage/raster` execution contract, and the local OpenCV Endpoint implements that one
capability on its one configured lane.
External cutout work is a separate `@narratage/background-removal` Need; KIE currently realizes it
with Recraft without leaking that vendor choice into Core.

## C. Current video-domain work after the terminal waist freeze

Official Track-package authoring is governed by
[`../spec/track-authoring.md`](../spec/track-authoring.md). Its temporal projection, strict
occurrence expansion, rational frame quantization and triggered scheduling now execute in the
focused `@narratage/temporal` package. Shared Canvas/Frame/Point/Path geometry and two-frame fitting
now execute in `@narratage/spatial`; Film consumes CanvasSpace explicitly rather than hiding
dimensions or frame rate in its Recipe. All four independent Ranking components now execute through
the shared Temporal/Spatial and peer Track contracts specified in
[`../spec/ranking-track.md`](../spec/ranking-track.md). Typography's old-system/editor attack audit,
complete two-dimensional author model, terminal-IR gaps and Caption feedback are recorded in
[`../spec/typography-track.md`](../spec/typography-track.md). The shared Canvas/Frame geometry, two-frame fitting,
focal alignment and backing ownership boundary are recorded in
[`../spec/spatial-layout.md`](../spec/spatial-layout.md). Generic Audio placement, sample occupancy
and mix boundaries now execute in `@narratage/audio-track` as exact sample-domain plans.
Self-contained full-canvas effects and the prohibition on hidden lower-composite sampling now
execute in `@narratage/screen-overlay`, including real sequential/parallel pixel evidence. Unified Media Item/Sequence authoring,
ordered local layers, lifecycle/sampling motion, internal handoffs, explicit audio projection and
Speech Spine reuse are recorded in [`../spec/media-track.md`](../spec/media-track.md). The old
depth-stack Deck now executes as the independent higher-order `@narratage/deck-track` package
specified in [`../spec/deck-track.md`](../spec/deck-track.md), including real partitioned browser
evidence. Comment cards now execute through the independent `@narratage/comment-sticker` package:
content, Spatial Frame, SVS appearance and Temporal projection remain explicit, while its output is
an ordinary self-contained peer Visual Track.

Caption Fine's complete field-free surface is implemented: exact primary/fallback fonts, CJK,
emoji/symbols, multiline layout, solid/gradient Paint, outline/shadow/long-shadow/glow/underline,
independent glyph/Pill/underline activation, joined wrapped trail geometry and layered deterministic
local motion. Glyph karaoke modes and joined Pill geometry have real browser evidence. It
deliberately has no line-clipping or `max-lines` behavior.

The complete pre-release Text and Media Item/Sequence packages execute through the shared
Temporal/Spatial foundation. The repository-internal Track/Visual IR waist is frozen; individual
author Surfaces may continue against real delivery examples without reopening it:

- the implemented Text Document, Point/Area/Path forms, ordered Paint, selector-motion, local Mask
  and materialized advanced fallback;
- the implemented Media Item/Sequence model, with the retired B-roll package kept out of the graph;
- the implemented independent Depth-Stack Deck Track in place of the old Deck implementation;
- the implemented TierBoard, Column, TopThree and TypewriterList Ranking components;
- independent future author packages only when a real design is ready.

The current implementations remain executable vertical slices and regression witnesses. This work
does not wait for release packaging, optional Providers or arbitrary-code isolation, and it must not
reopen Core to add video-specific meaning.

### C1. Seedance author templates complete

Fine Caption's field-free Style surface, measured display-Atom timing and documented motion
vocabulary are implemented. Deterministic speech Estimate is now a Text-to-duration graph component
with an explicit authored policy and model-admissible duration output; it remains separate from
measured speech timing. The useful distinct Seedance author semantics are now finite data-only
Text Templates, and aliases that merely duplicated prompt assembly were removed.

The retained set is finite: Speaker, silent B-roll, co-present Podcast, video Call, Street
Interview, body-Motion Reference and camera-Path Reference. Keyframe and generic multimodal
reference remain the low-level `FrameVideo` and `ReferenceVideo` surfaces, not additional Kits. All seven use generic
`text:Render` plus exact Seedance fragments; none adds Provider, queue, media-processing or Core
code. The next work is real-delivery use and correction of template prose, not another layer.

VLM-assisted temporal or spatial interpretation is not part of this version. If later demanded,
it must arrive as separately imported packages with explicit Video + Text inputs and explicit
selection/evidence outputs. It may not become a hidden Locate mode, Core feature or metadata side
channel.

## Explicit non-goals for the current phase

- no automatic cache or prompt-based semantic reuse;
- no Core `Pin` primitive;
- no Runtime guessing of creative method or model family;
- no universal queue package;
- no hosted multi-tenant platform required for local developer use;
- no cross-Track effect system or Base FX placeholder.
- no VLM temporal locator or spatial query package in this version.
