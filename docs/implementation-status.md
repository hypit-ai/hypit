# Implementation status

Repository reality as of 2026-08-09. Specifications define laws; this page says what currently
executes. Narratage is pre-release and no author-facing video ABI is frozen.

## End-to-end status

On 2026-08-07 the repository completed a real paid four-take vertical-video acceptance sequence
covering the combined path:

```text
Script → Estimate → four KIE Seedance Mini generations
       → media inspection and normalization → Speech Spine
       → local WhisperX → SemanticMap
       → Vertex Gemini CaptionPlan → Fine Caption Track
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
the four ordered speech visuals and measured Caption Track in the final Composition. That paid run
used a private delivery source. The checked-in brand-neutral
[`examples/talking-head-aroll`](../examples/talking-head-aroll/README.md) fixture preserves its graph
topology and explicit fresh/reuse Run shapes; it is not represented as the byte-identical historical
input. Credentials, presenter assets, Build databases and generated outputs are intentionally
ignored. Its `build.svrun` is the complete fresh `exact` execution choice, while
`reuse-generated.svrun` is the separate explicit reuse choice. Running either is an ordinary CLI
Build; no example-specific harness or hidden third workflow graph is required.

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
- `@narratage/run-markup`: optional official `.svrun` Markup Frontend;
- official compilation binds both Author Graph and Run Graph identities before deriving a finite
  BuildPlan; `plan` and `build` accept no hidden Target/Pin CLI intent;
- Run-only Fragment Producer Modules extend a separately bound execution Program Closure without
  changing Author imports or Author Graph identity;
- `@narratage/validation`: package-owned semantic validators and common Record admission;
- `@narratage/component-kit`: host-neutral deterministic Producer/validator registration;
- `@narratage/text`: domain-neutral `TextTemplate`, explicit graph `TextBindings` and deterministic
  render Operations producing ordinary targetable/replaceable `Text`; its optional self-described
  SVS Frontend lowers the fixed/axis/variant/slot Recipe convention into the same expression algebra;
- `@narratage/host`, `@narratage/workspace-fs-node`, `@narratage/compiler-node`: replaceable Workspace and the
  reference Node compiler Host;
- `@narratage/package-loader-node`: syntax-neutral installed-package byte locking and trusted facet
  loading;
- `@narratage/compiler-markup-node`: the explicit official Markup Frontend and Markup Surface Host assembly;
- `@narratage/cli`: a generic command engine requiring one explicit `CliDistribution`;
- `@narratage/video-cli`: the current video command application selecting the Markup compiler, with no
  built-in author-package aggregate or Provider registry;
- `@narratage/markup`, `@narratage/script`, `@narratage/svs`: official markup, Script and Recipe Frontends without
  Core parser branches; `.svml` and `.svs` remain human suffix conventions only;
- `@narratage/runtime`: Scheduler/Store ports, Profile/Closure locking, concurrency lanes and
  recoverable Endpoint lifecycle;
- `@narratage/runtime-adapter`, `@narratage/runtime-adapter-node`: locked deployment-adapter ABI, physical
  package-byte identity, project-root executable resolution and diagnostic hooks;
- `@narratage/driver-node`: trusted Node Producer/Endpoint execution and exact command regeneration;
- `@narratage/store-sqlite`: durable CAS BuildStore and OperationStore;
- `@narratage/artifact-store-fs`, `@narratage/artifact-store-s3`: interchangeable content-addressed bytes;
- `@narratage/credential-store-env`, `@narratage/credential-store-keychain`: explicit credential
  slots without secrets in BuildState, each answering only for its own `CredentialRef.store` name;
- `@narratage/local`: zero-service developer assembly over SQLite and filesystem defaults;
- declarative `svml.runtime.json` loading through a separate locked Runtime Adapter package closure,
  with TypeScript Runtime assembly retained as the advanced embedding API;
- domain-neutral Build archive inspection and Record egress: accepted intermediate Records remain
  durable independently of optional `inspect` / `get --to` Host reads;
- Host-only Build Catalog history and source output aliases through `builds`, `inspect` and
  `get --name`, without changing Core Build identity or Runtime Closure;
- Runtime Adapter Host ABI `@1`: a required pure configuration validator is separate from
  construction; `doctor` never calls adapter factories and suppresses dependent diagnostics after
  one invalid configuration or failed prerequisite;
- `doctor` read-only environment diagnostics for the current trusted adapters, filesystem streaming
  Artifact transfer and explicit dry-run/apply reachability GC over every retained BuildState and
  Operation;
- `@narratage/transport`, `@narratage/transport-aws-lambda`: capability-neutral
  invocation seams.

The removed CLI `--pin`, `--target` and `--accept-substitute` path cannot synthesize hidden execution
intent. Reusable run choices live in a self-described Run Source; Core still has no Pin primitive.

Repository-level dependency tests now enforce an acyclic production graph and prove that the
declared domain-neutral distribution—including `@narratage/local` and `@narratage/package-loader-node`—closes
without Text, AIGC or video packages. A non-video Greeting Build exercises persistent scheduling,
an external Need, recovery and final Record assembly through that distribution.

## Environment and Provider packages

Implemented:

- provider-neutral generated image/video/audio Product contracts and exact-model shell;
- model-owned Request Draft, media Binding and finalize Producers generated from every exact Port
  Table, so runtime-produced image/video/audio references remain explicit graph edges and only a
  complete request can reach a Provider;
- independently activatable exact-model packages for Seedance, MiniMax H3, Gemini Omni,
  Grok Imagine, GPT Image, Nano Banana and Seedream;
- `@narratage/mimo-tts`: three separate exact MiMo V2.5 TTS contracts and author Surfaces for
  preset voice, voice design and voice clone, all consuming Script speech truth without text rewrite;
- `@narratage/provider-xiaomi-mimo`: official immediate API translation, environment credential,
  bounded request/response handling, voice-sample Artifact ingestion and persisted WAV output,
  without a production dependency on the MiMo model package;
- `@narratage/provider-kie`: upload, recoverable paid submission, checkpointed polling, bounded download
  and immediate ArtifactStore persistence for eleven exact models, mapped from their declared input
  ports without importing any model package;
- `@narratage/provider-google-vertex`: display-only Gemini Caption planning;
- provider-neutral all-stream media inspection, attached-picture-safe selection, synchronized A/V
  normalization, audio-program rendering and final mux contracts;
- `@narratage/provider-media-local`: bounded shell-free ffprobe/ffmpeg realization, with a shared
  compatibility probe for the encoders and filters actually consumed by media execution;
- canonical 48 kHz speech master to content-addressed 16 kHz mono evidence-audio projection;
- `@narratage/provider-whisperx-local` and `services/whisperx`: pinned warm local WhisperX execution,
  while an explicit lifecycle override or an already-running service remains deployment-owned;
- `@narratage/provider-hyperframes-local`: finite-frame parallel Chrome rendering with output probe
  validation and profile-scoped HyperFrames browser preparation;
- `@narratage/artifact-store-s3`: conditional content-addressed writes, multipart streaming,
  streamed digest verification and explicit retention facets;
- `@narratage/provider-media-aws-lambda`: the same five media operations as the local Provider,
  executed through one Lambda function and the shared `@narratage/media-execution` body; the exact
  FFmpeg Layer and ZIP service passed their complete live AWS canary;
- `@narratage/provider-hyperframes-aws-lambda`: recoverable plan-v2 rendering through the locked
  HyperFrames 0.7.101 SDK, deterministic Step Functions execution identity, checkpointed polling and
  streamed S3 output persistence; the deployed stack passed a complete distributed render,
  ArtifactStore ingestion, ffprobe verification and remote cleanup canary;
- `@narratage/image-transform`: explicit image-plus-Program to image graph component, including the
  extracted Twinit GPT Image YCrCb denoise preset;
- `@narratage/gpt-image/clean`: an optional logical module from the GPT Image physical package that
  expands generation plus the shared denoise transform as two visible graph operations and exports
  one clean image; a high-level Prompt Surface remains intentionally deferred;
- `@narratage/image-compose`: explicit Canvas plus ordered image Layers to one reusable PNG Artifact,
  with no privileged base/sticker roles or hidden layout metadata;
- `@narratage/raster`: one closed deterministic execution waist shared by Transform and Compose;
- `@narratage/background-removal`: provider-neutral image-in/image-out Need; KIE realizes it through
  Recraft without changing the author graph;
- `@narratage/provider-image-opencv-local` and `services/image-opencv`: bounded OpenCV/NumPy execution
  with a locked Python 3.13 environment, one Raster capability, one Handler and one shared pixel
  interpreter, returning only a new content-addressed image Blob; an explicitly configured Python
  transfers lifecycle ownership to the deployment instead of preparing the managed uv project;
- one Scheduler with global and named lane concurrency shared across Builds.

Not implemented:

- a redistribution-ready managed FFmpeg bundle; local execution currently accepts any explicitly
  configured or system toolchain that passes the required capability probe;
- a persistent remote WhisperX service Provider; AWS Lambda is explicitly not its target;
- publication-ready redistributable Media/HyperFrames AWS deployment bundles; the current team
  resources are live deployments, not public release artifacts;
- Secrets Manager, Vault or multi-store credential adapters; environment and Keychain stores exist,
  and a current Runtime selects one store;
- deployment-specific Build release policy;
- hosted Scheduler, distributed leases, CommandDispatcher and multi-tenant product services;
- arbitrary Volcengine, Fal, API-key Gemini or Hypit Endpoint packages.

These are environment adapters. They must implement existing Capabilities and Types rather than
define alternate Core or video semantics.

## Video-domain slice

Implemented and executable:

- independently digested Narrative, Media, ProgramSpace, Speech, SpeechEvidence, SemanticMap,
  VisualIR and Composition logical modules; the former `video-contracts` umbrella is gone;
- Script Segments, optional Role Cues, Dual Text, anchor-only public Selection/Moment values,
  display/speech projections, an ordered Caption word universe and explicit Selection word subsets;
- deterministic speech estimate, atomic SpeechBasis and peer VisualTrack/AudioTrack
  projections;
- authored image/audio Blob references and reusable SVS-backed speech-estimate policies;
- `@narratage/seedance-speaker`: a thin official UGC binding from Script dialogue, explicit image/audio
  references, an inert project SVS Recipe and one explicitly imported TextTemplate; the
  self-described `official-ugc-v1.svs` Source Module contains defaults, ordering,
  parameter-to-text mappings and finite reference-count branches; Script dialogue is already an
  ordinary Text value and feeds the visible Text render and exact Seedance request path through its
  ordinary `prompt` port, while optional action/extra content also
  enters through Text edges rather than Recipe fields;
- graph-native Seedance reference assembly for both generic video and speech paths, including a
  tested person/product → holding → walking/interview → three-image montage topology and selective
  zero-input Candidate pruning;
- one-pass WhisperX evidence and direct Script-to-evidence many-to-many alignment;
- planner-neutral CaptionPlan: ordered Cue cuts plus zero or more declared attributes per display
  word, with no text rewrite or timing authority;
- total explicit default Caption Style plus ordered Role/word-subset whole-style overrides;
- `@narratage/caption-fine`: the first executable field-free Style family, owning its complete SVS
  schema, anchors/layout, solid/gradient base and active glyph Paint, outline, shadow, bounded long
  shadow, glow, underline, Cue/Pill Paint and layered local motion in one shared VisualTrack
  lowering; glyph, underline and Pill activation are independent, including isolated/current and
  real joined-trail line geometry; all four glyph karaoke combinations and joined wrapped Pill have
  unit plus real HyperFrames/browser pixel evidence, alongside CJK and emoji/symbols;
- explicit `<media:Font>` custom source declarations and the private, version-pinned
  `@narratage/fonts-open` 109-family installed catalog produces exact `FontArtifactRef` and reusable
  `FontStackRef` values; one logical face may carry several Unicode-range sources, the pinned
  COLRv1 Emoji path has real Chromium pixel evidence, Fine accepts the generic ordered stack as an
  ordinary author reference, and HyperFrames materializes those exact bytes;
- Caption, Media, Text and Speech lowering to self-contained peer Tracks;
- `@narratage/temporal`: strict Selection/Moment `one` and `each`, stable occurrence identity,
  exact rational point expressions, ProgramSpace clipping, deterministic frame quantization,
  relation validation and cumulative/exclusive/settled trigger schedules;
- `@narratage/spatial`: explicit CanvasSpace, Frame/Point/Path geometry, parent-relative and anchored
  Frames, intrinsic extents and deterministic two-frame ContentFit with independent focal points;
  its complete aspect/sizing/alignment matrix and final Chromium pixels are covered, including
  bounded/free focal displacement and off-Canvas Frames;
- `@narratage/typography-track`: complete pre-release Point/Area/Path Markup authoring over explicit
  Temporal and Spatial edges, bounded rich documents, exact font stacks, ordered repeated Paint,
  all seven Box targets, deterministic clip/ellipsis/shrink, horizontal/vertical/bidi layout,
  item/path motion and forward/reverse/seeded Unicode unit sequences; real Chromium witnesses cover
  the declared layout, Paint, mask and partition laws, including fail-closed minimum shrink;
- graph-produced ordinary `Text` enters Typography Point/Area/Path content, Ranking
  Column/TopThree/Typewriter copy, Comment Sticker fields and Deck labels through explicit Fragment
  inputs; each consumer retains its own style/layout/timing contract and no Text metadata is copied
  through intermediate payloads;
- separately imported `<text:Mask>` consumes an authored Text Program plus one owned still Surface;
  unsupported rich/path/timed cases explicitly materialize rather than sampling another Track;
- `@narratage/media-track` implements independently timed Item and ordered Sequence Surfaces over
  explicit ProgramSpace, CanvasSpace, SpatialFrame and optional SemanticMap edges: durationless
  images, normalized video, compositable Surfaces, ordered Paint/sample layers, every ContentFit,
  trim/occupancy, frame presentation, lifecycle/sampling motion, pairwise handoffs and separate
  source-audio/SFX projection all lower to ordinary peer Tracks;
- `@narratage/deck-track` implements the independent `DepthStack` collection model: explicit ordered
  Cards and semantic triggers, finite/wrapped neighborhoods, relative-depth pose and tone,
  frame-local whole-collection reflow, still/timed inactive playback, exact-font labels and
  whole-group lifecycle motion lower to ordinary VisualTrack Presents; real HyperFrames frames are
  byte-identical under one-worker and partitioned/out-of-order evaluation, and another Deck family
  can install through the existing VisualTrack waist without changing Core or renderer packages;
- `@narratage/ranking` implements four independent author components over one private triggered
  schedule: TierBoard, Column, TopThree and TypewriterList lower exact-font/content-addressed media
  into ordinary independently stacked VisualTrack Presents; optional appear/move sounds lower from
  the same event frames into a peer AudioTrack, and all four author Surfaces plus real partitioned
  browser progression are executable without a Core, Composition or HyperFrames family registry;
- animated GIF and WebP sources retain their authored frame timing before fixed-rate media
  normalization; animated WebP blend/dispose composition is performed by the shared media-execution
  implementation rather than delegated to environment-dependent browser playback;
- `@narratage/audio-track`: a self-described arbitrary-item author package over explicit normalized
  audio; Program/Selection/Moment `one`/`each`, exact trim, once/loop/start/end, bounded
  pitch-preserving stretch, gain and fades lower to one peer sample-domain AudioTrack and the same
  AudioProgramPlan under local or Lambda execution;
- `@narratage/screen-overlay`: eleven self-described, seeded where stochastic, full-canvas components
  lower only their owned pixels to ordinary Visual IR Presents; one-worker and parallel real
  HyperFrames renders are pixel-identical and lower-composite effects fail closed;
- Film receives CanvasSpace, ProgramSpace and peer Tracks through separate graph edges: dimensions,
  frame rate and Film appearance no longer compete as duplicate truths;
- arbitrary Track folding into Composition and an explicitly imported HyperFrames render route;
- Media-owned entry/sustain/exit motion, source sampling, cut/crossfade/push/wipe/cover/page-turn
  handoffs and local SFX behavior; the old `@narratage/broll` package is retired;
- renderer-neutral, frame-addressable Visual IR, exact Artifact references and compositable Surface
  path; HyperFrames is its current reference compiler/renderer route rather than the IR owner.

The repository-internal `svml.visual-track@1` and `svml.visual-ir@1` compatibility waist is now
frozen for subsequent package work. Exact text fonts, locked renderer identity, generic
Surface-byte verification and the no-family/no-cross-Track boundary audit all execute. This is not
npm publication and does not freeze each package-owned author Surface.

Deliberately deferred:

- Remotion or API-backed final render packages; these can be added beside `render-hyperframes`
  without changing Composition or Core;
- public distribution hardening and untrusted community-code isolation.

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
- the deployed AWS media function has passed all five real operations through its exact FFmpeg
  Layer, and the deployed HyperFrames stack has passed the Narratage Provider's real distributed
  rendering, ingestion, frame verification and cleanup canary;
- generated credentials, media outputs and local databases are ignored by Git.

All workspace packages are currently private development packages that export TypeScript source.
The repository is usable from a checkout, but no npm-ready package distribution exists yet. See
[`open-source-distribution.md`](./open-source-distribution.md).

See [`architecture.md`](./architecture.md) for boundaries and [`roadmap.md`](./roadmap.md) for the
two active workstreams.
