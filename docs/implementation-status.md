# Implementation status

Repository reality as of 2026-08-08. Specifications define laws; this page says what currently
executes. Narratage is pre-release and no author-facing video ABI is frozen.

## End-to-end status

On 2026-08-07 the repository completed a real paid four-take vertical-video acceptance sequence
covering the combined path:

```text
Script → Estimate → four KIE Seedance Mini generations
       → media inspection and normalization → Speech Spine
       → local WhisperX → SemanticMap
       → Vertex Gemini CaptionPlan → Caption Track
       → Film → local parallel HyperFrames render
       → audio program → mux → H.264/AAC MP4
```

The acceptance used two explicit Build identities. The first submitted the four real paid KIE
shots. The second used `reuse-generated.svrun` to expose those verified Records as four zero-input
Build-Record Candidates and selected them through explicit Satisfaction edges. Its compiled plan
contained no Seedance Operation or KIE Need, while the reachable
media/WhisperX/Vertex/Film/HyperFrames path executed normally and preserved `substitute` through the
final Record. This is the intended realization model—not an implicit cache, mutable resume or
Runtime-selected fallback.

The resulting artifact is a 57.13-second 720×1280, 30 fps H.264/AAC MP4. Frame inspection confirmed
the four ordered speech visuals and measured Caption Track in the final Composition. The checked-in
source, exact Run, reuse Run and Runtime assembly are in
[`examples/echo-pro-aroll`](../examples/echo-pro-aroll/README.md). Credentials, presenter assets,
Build databases and generated outputs are intentionally ignored. A fresh uninterrupted all-`exact`
acceptance remains part of automating the opt-in live harness; the explicit Candidate Build did not
bypass any downstream implementation gap.

## Domain-neutral system

Implemented:

- `@narratage/protocol`: immutable Manifests, Types, Graph, Build and provenance wire data;
- `@narratage/artifact`: domain-neutral nominal `BlobArtifact` contract, independent of video Media and
  Runtime ArtifactStore implementations;
- `@narratage/core`: `svml.graph@1`, independent Candidate, explicit Satisfaction, arbitrary Targets,
  reverse reachability, finite `svml.plan@1` derivation and verified `svml.build@1` state machine;
- one Operation instance fans out once; distinct instances never content-deduplicate;
- Provided Values, multi-export Run Fragments, partial substitution and fully pruned defaults;
- digest-bound Derivation and Receipt integrity, monotonic conformance and regenerated resume
  Commands;
- `@narratage/elaborator`: two-phase forward-reference linking and hygienic static Fragment expansion;
- `@narratage/source`: mandatory bounded Source Header selecting an exact Frontend without suffix or
  Distribution defaults;
- digest-separated Author Source Closure identity for original bytes, Frontend implementation and
  decoded semantics; every recursively imported source selects its own Frontend;
- `@narratage/run`: syntax-neutral Run Source Closure, complete mandatory Run Graph, typed Candidate
  fragments, inert Build-Record Candidates, named Target sets,
  Provided/Build-Record/Fragment Candidates and explicit Satisfaction edges;
- `@narratage/run-text`: optional official `.svrun` Text Frontend;
- official compilation binds both Author Graph and Run Graph identities before deriving a finite
  BuildPlan; `plan` and `build` accept no hidden Target/Pin CLI intent;
- Run-only Fragment Producer Modules extend a separately bound execution Program Closure without
  changing Author imports or Author Graph identity;
- `@narratage/validation`: package-owned semantic validators and common Record admission;
- `@narratage/component-kit`: host-neutral deterministic Producer/validator registration;
- `@narratage/prompt-kit`: immutable author-time compilation of declarative fixed/axis/variant/slot
  Kit Specs and Invocations into authored ordered Prompt Programs;
- `@narratage/host`, `@narratage/workspace-fs-node`, `@narratage/compiler-node`: replaceable Workspace and the
  reference Node compiler Host;
- `@narratage/package-loader-node`: syntax-neutral installed-package byte locking and trusted facet
  loading;
- `@narratage/compiler-text-node`: the explicit official Text Frontend and Text Surface Host assembly;
- `@narratage/cli`: a generic command engine requiring one explicit `CliDistribution`;
- `@narratage/video-cli`: the current video command application selecting the Text compiler, with no
  built-in author-package aggregate or Provider registry;
- `@narratage/text`, `@narratage/script`, `@narratage/svs`: official markup, Script and Recipe Frontends without
  Core parser branches; `.svml` and `.svs` remain human suffix conventions only;
- `@narratage/runtime`: Scheduler/Store ports, Profile/Closure locking, concurrency lanes and
  recoverable Endpoint lifecycle;
- `@narratage/runtime-adapter`, `@narratage/runtime-adapter-node`: locked deployment-adapter ABI, physical
  package-byte identity, project-root executable resolution and diagnostic hooks;
- `@narratage/driver-node`: trusted Node Producer/Endpoint execution and exact command regeneration;
- `@narratage/store-sqlite`: durable CAS BuildStore and OperationStore;
- `@narratage/artifact-store-fs`, `@narratage/artifact-store-s3`: interchangeable content-addressed bytes;
- `@narratage/credential-store-env`: explicit credential slots without secrets in BuildState;
- `@narratage/local`: zero-service developer assembly over SQLite and filesystem defaults;
- declarative `svml.runtime.json` loading through a separate locked Runtime Adapter package closure,
  with TypeScript Runtime assembly retained as the advanced embedding API;
- domain-neutral Build archive inspection and Record egress: accepted intermediate Records remain
  durable independently of optional `inspect` / `get --to` Host reads;
- Host-only Build Catalog history and source output aliases through `builds`, `inspect` and
  `get --name`, without changing Core Build identity or Runtime Closure;
- `doctor` configuration diagnostics for the current trusted adapters, filesystem streaming Artifact
  transfer and explicit dry-run/apply reachability GC over every retained BuildState and Operation;
- `@narratage/transport`, `@narratage/transport-process`, `@narratage/transport-aws-lambda`: capability-neutral
  invocation seams.

The removed CLI `--pin`, `--target` and `--accept-substitute` path cannot synthesize hidden execution
intent. Reusable run choices live in a self-described Run Source; Core still has no Pin primitive.

Repository-level dependency tests now enforce an acyclic production graph and prove that the
declared domain-neutral distribution—including `@narratage/local` and `@narratage/package-loader-node`—closes
without Text, AIGC or video packages. A non-video Greeting Build exercises persistent scheduling,
an external Need, recovery and final Record assembly through that distribution.

## Environment and Provider packages

Implemented:

- provider-neutral generated image/video Product contracts and exact-model shell;
- independently activatable exact-model packages for Seedance, MiniMax H3, Gemini Omni,
  Grok Imagine, GPT Image, Nano Banana and Seedream;
- `@narratage/provider-kie`: upload, recoverable paid submission, checkpointed polling, bounded download
  and immediate ArtifactStore persistence for eleven exact models, mapped from their declared input
  ports without importing any model package;
- `@narratage/provider-google-vertex`: display-only Gemini Caption planning;
- provider-neutral all-stream media inspection, attached-picture-safe selection, synchronized A/V
  normalization, audio-program rendering and final mux contracts;
- `@narratage/provider-media-local`: bounded shell-free ffprobe/ffmpeg realization;
- canonical 48 kHz speech master to content-addressed 16 kHz mono evidence-audio projection;
- `@narratage/provider-whisperx-local` and `services/whisperx`: pinned warm local WhisperX execution;
- `@narratage/provider-hyperframes-local`: finite-frame parallel Chrome rendering with output probe
  validation;
- `@narratage/image-transform`: explicit image-plus-Program to image graph component, including the
  extracted Twinit GPT Image YCrCb denoise preset;
- `@narratage/provider-image-opencv-local` and `services/image-opencv`: bounded OpenCV/NumPy execution
  with a locked Python 3.13 environment that returns only a new content-addressed image Blob;
- one Scheduler with global and named lane concurrency shared across Builds.

Not implemented:

- the opt-in, credential-free-by-default live acceptance harness around the real talking-film Build;
- AWS media, WhisperX and HyperFrames Endpoint packages—the generic Lambda transport exists;
- Keychain, Secrets Manager or Vault credential adapters;
- production S3 multipart/ranged Artifact transfer and deployment-specific Build release policy;
- hosted Scheduler, distributed leases, CommandDispatcher and multi-tenant product services;
- arbitrary Volcengine, Fal, API-key Gemini or Hypit Endpoint packages.

These are environment adapters. They must implement existing Capabilities and Types rather than
define alternate Core or video semantics.

## Video-domain slice

Implemented and executable:

- independently digested Narrative, Media, ProgramSpace, Speech, SpeechEvidence, SemanticMap,
  VisualIR and Composition logical modules; the former `video-contracts` umbrella is gone;
- Script Segments, optional Role Cues, Dual Text, Selection/Moment anchors and display/speech
  projections;
- deterministic speech estimate, atomic SpeechBasis and peer VisualTrack/AudioTrack
  projections;
- authored image/audio Blob references and reusable SVS-backed speech-estimate policies;
- `@narratage/seedance-speaker`: a thin official UGC binding from Script dialogue, explicit image/audio
  references, an inert project SVS Recipe and one explicitly imported PromptKitSpec; the
  self-described `official-ugc-v1.svs` Source Module contains defaults, ordering,
  parameter-to-Prompt mappings and finite reference-count branches, all lowered during author
  compilation before the existing exact Seedance request path;
- one-pass WhisperX evidence and direct Script-to-evidence many-to-many alignment;
- planner-neutral CaptionPlan: ordered Cue cuts plus zero or more declared attributes per display
  atom, with no text rewrite or timing authority;
- total default Caption Style plus ordered Role/Selection whole-style overrides;
- Caption, B-roll, Text and Speech lowering to self-contained peer Tracks;
- arbitrary Track folding into Composition and an explicitly imported HyperFrames render route;
- B-roll-owned pop/fade/slide, push/page-turn and local SFX behavior;
- renderer-neutral, frame-addressable Visual IR, exact Artifact references and compositable Surface
  path; HyperFrames is its current reference compiler/renderer route rather than the IR owner.

Still pre-freeze and deliberately deferred:

- complete Text three-box, exact-font and layered-decoration behavior;
- field-dependent Caption word painting—the current renderer preserves planned fields as typed
  Track data attributes but does not yet map them to distinct word visuals;
- Caption CJK/emoji/multiline/pixel acceptance;
- B-roll foreground/backdrop sampling and focal media-box acceptance;
- Ranking and other old production author packages;
- renderer receipts and complete Surface-byte validation;
- final Track and Visual IR compatibility promise;
- Remotion or API-backed final render packages; these can be added beside `render-hyperframes`
  without changing Composition or Core.

There is intentionally no cross-Track sampling/effect model and no Base FX placeholder.

## Extension and security boundary

Installing a trusted package can add a nominal Type, Surface, Fragment, deterministic Producer,
validator or Endpoint without a Core release. Source imports activate author facets only; Provider,
credential, process and Runtime authority require an explicit Host profile and allowlist.

Arbitrary untrusted community Parser, Producer and Validator execution is not implemented. The
current in-process registry is suitable only for trusted locked code. Isolation, resource limits,
permission enforcement and loaded-code attestation remain release work.

## Current verification

- the TypeScript check and the package test suites pass; browser, paid-Provider and heavyweight
  local-service acceptance tests remain environment-gated and are skipped when their prerequisites
  are absent;
- the checked-in self-described talking-film Author Source passes `check`, and its mandatory Run
  Source passes `plan` through the dual-graph compiler without invoking a Provider;
- live KIE, local media, local WhisperX and two-worker HyperFrames paths have passed separately;
- generated credentials, media outputs and local databases are ignored by Git.

All workspace packages are currently private development packages that export TypeScript source.
The repository is usable from a checkout, but no npm-ready package distribution exists yet. See
[`open-source-distribution.md`](./open-source-distribution.md).

See [`architecture.md`](./architecture.md) for boundaries and [`roadmap.md`](./roadmap.md) for the
two active workstreams.
