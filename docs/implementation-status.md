# Implementation status

Repository reality as of 2026-08-07. Specifications define laws; this page says what currently
executes. SVML is pre-release and no author-facing video ABI is frozen.

## End-to-end status

On 2026-08-07 the v2 branch completed a real paid vertical-video acceptance sequence covering the
combined path:

```text
Script → Estimate → two KIE Seedance Mini generations
       → media inspection and normalization → Speech Spine
       → local WhisperX → SemanticMap
       → Vertex Gemini CaptionPlan → Caption and Text Tracks
       → Film → local parallel HyperFrames render
       → audio program → mux → H.264/AAC MP4
```

The acceptance used two explicit Build identities. The first submitted the two real paid KIE shots
and paused when its selected Vertex project lacked service access. After correcting deployment
configuration, a second Build reused those accepted take Records through explicit Build-Record
Candidates, issued no KIE Operation, ran the reachable media/WhisperX/Vertex/HyperFrames path and
preserved `substitute` through the final Record. This is the intended recovery/substitution model,
not an implicit cache or continuation under changed Runtime identity.

The resulting artifact is a 10.07-second 480×854 H.264/AAC MP4. Frame inspection confirmed the
speech visual, planned Caption Track and selection-located Text Track in the final Composition. The
checked-in source and Runtime assembly are in
[`examples/talking-film-live`](../examples/talking-film-live/README.md). Credentials, presenter
assets and generated outputs are intentionally ignored. A fresh uninterrupted all-`exact` paid
acceptance remains part of automating the opt-in live harness; no implementation gap was bypassed by
the completed Candidate Build.

## Domain-neutral system

Implemented:

- `@svml/protocol`: immutable Manifests, Types, Graph, Build and provenance wire data;
- `@svml/artifact`: domain-neutral nominal `BlobArtifact` contract, independent of video Media and
  Runtime ArtifactStore implementations;
- `@svml/core`: `svml.graph@2`, independent Candidate, explicit Satisfaction, arbitrary Targets,
  reverse reachability, finite `svml.plan@2` derivation and verified `svml.build@2` state machine;
- one Operation instance fans out once; distinct instances never content-deduplicate;
- Provided Values, multi-export Run Fragments, partial substitution and fully pruned defaults;
- digest-bound Derivation and Receipt integrity, monotonic conformance and regenerated resume
  Commands;
- `@svml/elaborator`: two-phase forward-reference linking and hygienic static Fragment expansion;
- `@svml/source`: mandatory bounded Source Header selecting an exact Frontend without suffix or
  Distribution defaults;
- digest-separated Author Source Closure identity for original bytes, Frontend implementation and
  decoded semantics; every recursively imported source selects its own Frontend;
- `@svml/realization`: internal typed realization overlays and inert Build-Record Candidates;
- `@svml/run`: syntax-neutral Run Source Closure, complete mandatory Run Graph, named Target sets,
  Provided/Build-Record/Fragment Candidates and explicit Satisfaction edges;
- `@svml/run-text`: optional official `.svrun` Text Frontend;
- official compilation binds both Author Graph and Run Graph identities before deriving a finite
  BuildPlan; `plan` and `build` accept no hidden Target/Pin CLI intent;
- Run-only Fragment Producer Modules extend a separately bound execution Program Closure without
  changing Author imports or Author Graph identity;
- `@svml/validation`: package-owned semantic validators and common Record admission;
- `@svml/component-kit`: host-neutral deterministic Producer/validator registration;
- `@svml/host`, `@svml/workspace-fs-node`, `@svml/compiler-node`: replaceable Workspace and the
  reference Node compiler Host;
- `@svml/package-loader-node`: syntax-neutral installed-package byte locking and trusted facet
  loading;
- `@svml/compiler-text-node`: the explicit official Text Frontend and Text Surface Host assembly;
- `@svml/cli`: a generic command engine requiring one explicit `CliDistribution`;
- `@svml/video-cli`: the current video Distribution selecting the Text compiler, video Prelude and
  video Runtime-config adapter registry;
- `@svml/text`, `@svml/script`, `@svml/svs`: official markup, Script and Recipe Frontends without
  Core parser branches; `.svml` and `.svs` remain human suffix conventions only;
- `@svml/runtime`: Scheduler/Store ports, Profile/Closure locking, concurrency lanes and
  recoverable Endpoint lifecycle;
- `@svml/driver-node`: trusted Node Producer/Endpoint execution and exact command regeneration;
- `@svml/store-sqlite`: durable CAS BuildStore and OperationStore;
- `@svml/artifact-store-fs`, `@svml/artifact-store-s3`: interchangeable content-addressed bytes;
- `@svml/credential-store-env`: explicit credential slots without secrets in BuildState;
- `@svml/local`: zero-service developer assembly over SQLite and filesystem defaults;
- declarative `svml.runtime.json` loading through an explicit adapter registry, with TypeScript
  Runtime assembly retained as the advanced embedding API;
- domain-neutral Build archive inspection and Record egress: accepted intermediate Records remain
  durable independently of optional `inspect` / `get --to` Host reads;
- Host-only Build Catalog history and source output aliases through `builds`, `inspect` and
  `get --name`, without changing Core Build identity or Runtime Closure;
- `@svml/transport`, `@svml/transport-process`, `@svml/transport-aws-lambda`: capability-neutral
  invocation seams.

The removed CLI `--pin`, `--target` and `--accept-substitute` path cannot synthesize hidden execution
intent. Reusable run choices live in a self-described Run Source; Core still has no Pin primitive.

Repository-level dependency tests now enforce an acyclic production graph and prove that the
declared domain-neutral distribution—including `@svml/local` and `@svml/package-loader-node`—closes
without Text, AIGC or video packages. A non-video Greeting Build exercises persistent scheduling,
an external Need, recovery and final Record assembly through that distribution.

## Environment and Provider packages

Implemented:

- provider-neutral generated image/video Product contracts and exact-model shell;
- author model packages for Seedance, MiniMax H3, Gemini Omni, Grok Imagine, GPT Image,
  Nano Banana and Seedream;
- `@svml/provider-kie`: upload, recoverable paid submission, checkpointed polling, bounded download
  and immediate ArtifactStore persistence for sixteen exact model capabilities;
- `@svml/provider-google-vertex`: display-only Gemini Caption planning;
- provider-neutral all-stream media inspection, attached-picture-safe selection, synchronized A/V
  normalization, audio-program rendering and final mux contracts;
- `@svml/provider-media-local`: bounded shell-free ffprobe/ffmpeg realization;
- canonical 48 kHz speech master to digest-bound 16 kHz mono evidence-audio projection;
- `@svml/provider-whisperx-local` and `services/whisperx`: pinned warm local WhisperX execution;
- `@svml/provider-hyperframes-local`: finite-frame parallel Chrome rendering with output probe
  validation;
- one Scheduler with global and named lane concurrency shared across Builds.

Not implemented:

- the opt-in, credential-free-by-default live acceptance harness around the real talking-film Build;
- AWS media, WhisperX and HyperFrames Endpoint packages—the generic Lambda transport exists;
- Keychain, Secrets Manager or Vault credential adapters;
- production multipart/ranged Artifact transfer and retention/garbage collection;
- hosted Scheduler, distributed leases, CommandDispatcher and multi-tenant product services;
- arbitrary Volcengine, Fal, API-key Gemini or Hypit Endpoint packages.

These are environment adapters. They must implement existing Capabilities and Types rather than
define alternate Core or video semantics.

## Video-domain slice

Implemented and executable:

- independently digested Narrative, Media, ProgramSpace, Speech, SemanticTime and Composition
  logical modules;
- Script Segments, optional Role Cues, Dual Text, Selection/Moment anchors and display/speech
  projections;
- deterministic speech estimate, atomic SpeechTake/SpeechBasis and peer VisualTrack/AudioTrack
  projections;
- one-pass WhisperX evidence and direct Script-to-evidence many-to-many alignment;
- planner-neutral CaptionPlan: ordered Cue cuts plus zero or more declared attributes per display
  atom, with no text rewrite or timing authority;
- total default Caption Style plus ordered Role/Selection whole-style overrides;
- Caption, B-roll, Text and Speech lowering to self-contained peer Tracks;
- arbitrary Track folding into Composition and separate HyperFrames rendering;
- B-roll-owned pop/fade/slide, push/page-turn and local SFX behavior;
- frame-addressable HyperFrames Visual IR, exact Artifact references and compositable Surface path.

Still pre-freeze and deliberately deferred:

- complete Text three-box, exact-font and layered-decoration behavior;
- Caption CJK/emoji/multiline/pixel acceptance;
- B-roll foreground/backdrop sampling and focal media-box acceptance;
- Ranking and other old production author packages;
- renderer receipts and complete Surface-byte validation;
- final Track and HyperFrames Visual IR compatibility promise.

There is intentionally no cross-Track sampling/effect model and no Base FX placeholder.

## Extension and security boundary

Installing a trusted package can add a nominal Type, Surface, Fragment, deterministic Producer,
validator or Endpoint without a Core release. Source imports activate author facets only; Provider,
credential, process and Runtime authority require an explicit Host profile and allowlist.

Arbitrary untrusted community Parser, Producer and Validator execution is not implemented. The
current in-process registry is suitable only for trusted locked code. Isolation, resource limits,
permission enforcement and loaded-code attestation remain release work.

## Current verification

- TypeScript v1 and v2 checks pass;
- v1 research oracle: 35/35 tests;
- v2: 316 passing, 3 environment-gated skips, 0 failures;
- the checked-in self-described talking-film Author Source passes `check`, and its mandatory Run
  Source passes `plan` through the dual-graph compiler without invoking a Provider;
- live KIE, local media, local WhisperX and two-worker HyperFrames paths have passed separately;
- generated credentials, media outputs and local databases are ignored by Git.

The paid acceptance above predates the mandatory Source Header and complete Run Graph migration.
The same video graph now closes and plans through the new path, but a fresh paid all-`exact` Build
has not yet been run after this compiler refactor. This is an acceptance gap, not a hidden
implementation claim.

All v2 workspace packages are currently private development packages that export TypeScript source.
The repository is usable from a checkout, but no npm-ready package distribution exists yet. See
[`open-source-distribution.md`](./open-source-distribution.md).

The v1 root compiler and fixtures remain only as executable regression evidence during the rewrite.
They are not the public v2 syntax, package taxonomy or compilation path.

See [`architecture.md`](./architecture.md) for boundaries and [`roadmap.md`](./roadmap.md) for the
two active workstreams.
