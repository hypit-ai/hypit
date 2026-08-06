# SVML documentation map

SVML separates normative contracts, implementation status, architecture decisions and historical
evidence. A document's directory and the table below determine its authority; a newer-looking date
inside a historical design record does not make that record normative.

## Read this first

1. [`../README.md`](../README.md) — project purpose, supported commands and repository entrypoint.
2. [`implementation-status.md`](./implementation-status.md) — what the v2 rewrite actually
   implements now and what remains planned.
3. [`../spec/core-kernel-v1.md`](../spec/core-kernel-v1.md) — current domain-free Kernel laws.
4. [`implementation-status.md#domain-neutral-package-boundary`](./implementation-status.md#domain-neutral-package-boundary)
   — the minimal package stack for video and non-video domains.
5. [`../spec/script-surface-v1.md`](../spec/script-surface-v1.md) — current official Script Surface
   target.
6. [`../spec/track-composition-v1.md`](../spec/track-composition-v1.md) — implemented flat Track and
   Composition law and the generic HyperFrames lowering boundary.
7. [`../spec/track-expressiveness-v1.md`](../spec/track-expressiveness-v1.md) — executable freeze gate
   for old-system Text, Caption, media-box, stacking and materialization behavior. It explains why
   the current Track is a contract candidate rather than a public compatibility promise.
8. [`../spec/hyperframes-visual-ir-v1.md`](../spec/hyperframes-visual-ir-v1.md) — the one versioned,
   closed terminal visual language shared by video components; not a Core or author-component API.
9. [`../examples/talking-film-golden/README.md`](../examples/talking-film-golden/README.md) — the
   canonical v2 authoring target: implemented Script syntax surrounded by the Film, Seedance,
   WhisperX, Caption, B-roll, Text, SVS and render Surfaces that must be built next.
10. [`package-vocabulary-and-ownership-v1.md`](./package-vocabulary-and-ownership-v1.md) — target
   naming and ownership for framework, video, Provider, Runtime, queues, stores and distributions.
11. [`../spec/author-surface-binding-v1.md`](../spec/author-surface-binding-v1.md) — implemented
    package-owned binding from generic imported Records such as SVS Recipes into typed Programs,
    AuthorComponents and Graph Fragments.
12. [`local-developer-runtime-v1.md`](./local-developer-runtime-v1.md) — implemented local
    SQLite/filesystem Runtime assembly, trusted configuration, recovery law and environment swaps.
13. [`kie-generation-modules-v1.md`](./kie-generation-modules-v1.md) — implemented seven exact
    generation model modules, shared generated-media Products and the recoverable KIE Provider.
14. [`kie-live-smoke-2026-08-06.md`](./kie-live-smoke-2026-08-06.md) — credential-free deployment
    evidence from seven representative live model calls and one synthetic-reference upload.
15. [`media-inspection-and-normalization-v1.md`](./media-inspection-and-normalization-v1.md) —
    implemented all-stream inspection, attached-picture-safe selection, shared-origin A/V
    normalization and the boundary that prevents embedded AAC from becoming speech by inference.
16. [`media-execution-boundary-v1.md`](./media-execution-boundary-v1.md) — the implemented rule that
    planning is ordinary code while probe/decode/mix/render/mux are explicit Provider Needs, plus
    the visual/audio/mux split for final HyperFrames output, canonical WhisperX evidence-audio path
    and implemented local Providers.
17. [`../services/whisperx/README.md`](../services/whisperx/README.md) — installation, runtime
    identity, path confinement and queue boundary for the implemented warm local WhisperX service.
18. [`node-package-activation-v1.md`](./node-package-activation-v1.md) — implemented trusted author
    and deterministic compute facet locking, with the exact boundary that keeps source imports away
    from Provider and Runtime authority.

The executable v2 Node entrypoints are documented in
[`../packages/compiler-node/README.md`](../packages/compiler-node/README.md),
[`../packages/package-loader-node/README.md`](../packages/package-loader-node/README.md) and
[`../packages/cli/README.md`](../packages/cli/README.md). The former is domain-neutral compiler-host
infrastructure; the loader is the trusted installed-package boundary; the latter is the official
application assembly.

## Current architecture records

- [`logical-output-realization-fragment-draft.md`](./logical-output-realization-fragment-draft.md)
  records why the `LogicalOutput / Candidate / Operation / BuildRequest` model replaced the earlier
  Node/Pin model. It also contains the current implementation ledger. It is not a substitute for the
  compact normative Kernel specification.
- [`runtime-package-topology-v2.md`](./runtime-package-topology-v2.md) defines the target separation
  among Runtime Profile, one authoritative Build Scheduler, Provider Endpoints, queues, credentials
  and stores. The environment-neutral executor, sealed Runtime Profile/Closure, in-memory
  BuildStore/OperationStore CAS, queue-free local Scheduler and recoverable Endpoint lifecycle are
  implemented. SQLite Build/Operation stores, filesystem/S3 artifacts and the `@svml/local`
  developer assembly are now implemented together with the generic Runtime service-package ABI,
  Endpoint Kit, environment credential
  injection, bounded Lambda/process transports, wake/follow, retry, status and cancellation, plus
  local KIE/media/HyperFrames/WhisperX execution packages; distributed leases and production hosted
  endpoints are not. Its older example package
  names are superseded by
  [`package-vocabulary-and-ownership-v1.md`](./package-vocabulary-and-ownership-v1.md).
- [`intent-first-modular-compilation.md`](./intent-first-modular-compilation.md) records the language,
  Frontend, Bootstrap, Surface and module-boundary reasoning. Its older Kernel terminology is
  historical.

## Executable v1 research oracle

These files explain the root compiler and standard library that remain executable while v2 is
rebuilt. They are not the v2 Kernel contract:

- [`../spec/source-architecture-draft.md`](../spec/source-architecture-draft.md)
- [`compiler-prototype.md`](./compiler-prototype.md)
- [`speech-program-caption-v1.md`](./speech-program-caption-v1.md)
- [`../spec/core-kernel-v0.md`](../spec/core-kernel-v0.md)

## Superseded design records

- [`kernel-graph-build-intent-v2.md`](./kernel-graph-build-intent-v2.md) — historical `@0`
  Graph/Alternative/Pin construction.
- [`runtime-host-architecture-draft.md`](./runtime-host-architecture-draft.md) — historical
  ExecutionBundle/EffectRequest host design.

Historical documents stay in the repository because they explain rejected designs and migration
decisions. New implementation work must not copy an interface from them unless a current
specification explicitly adopts it.

## Documentation rule

- `spec/` states stable laws and public data contracts.
- `docs/implementation-status.md` states what exists now.
- current architecture records explain decisions and future boundaries.
- superseded records are evidence only.

Do not append a new design generation to an old document. Change a current specification when the
law changes, add a focused architecture decision when the reason matters, and update the status
page when implementation moves.
