# Documentation

SVML documentation is intentionally split by authority. Git history preserves discarded designs;
the working tree contains only documents that should inform current implementation or public use.

## Start here

1. [`../README.md`](../README.md) — project overview and development entrypoint.
2. [`architecture.md`](./architecture.md) — current Author Graph, Run Graph, Satisfaction, Runtime
   and package boundaries.
3. [`implementation-status.md`](./implementation-status.md) — what actually executes today.
4. [`roadmap.md`](./roadmap.md) — active domain-neutral and environment/Provider work; deferred video
   work is separated explicitly.
5. [`open-source-distribution.md`](./open-source-distribution.md) — what can ship independently,
   current packaging truth and public-release gates.
6. [`../spec/core-kernel-v1.md`](../spec/core-kernel-v1.md) — compact normative Kernel laws for the
   current `@2` wire data.

## Domain-neutral implementation records

- [`graph-first-value-boundary-v1.md`](./graph-first-value-boundary-v1.md) — graph edges own
  dependency truth; values contain only intrinsic meaning.
- [`node-package-activation-v1.md`](./node-package-activation-v1.md) — trusted installed package
  locking, contributions and Host-selected facet activation.
- [`local-developer-runtime-v1.md`](./local-developer-runtime-v1.md) — local SQLite/filesystem
  Runtime, recovery and environment replacement.
- [`build-archive-and-egress-v1.md`](./build-archive-and-egress-v1.md) — Targets, durable Records,
  Artifact retention and optional Host materialization as four separate concerns.
- package READMEs under [`../packages`](../packages) — executable APIs and ownership.

## Video-domain specifications

- [`../spec/script-surface-v1.md`](../spec/script-surface-v1.md)
- [`../spec/author-surface-binding-v1.md`](../spec/author-surface-binding-v1.md)
- [`../spec/caption-program-v1.md`](../spec/caption-program-v1.md)
- [`../spec/track-composition-v1.md`](../spec/track-composition-v1.md)
- [`../spec/track-expressiveness-v1.md`](../spec/track-expressiveness-v1.md)
- [`../spec/hyperframes-visual-ir-v1.md`](../spec/hyperframes-visual-ir-v1.md)

These video contracts are executable candidates, not yet an open-source compatibility freeze.

## Video execution records

- [`kie-generation-modules-v1.md`](./kie-generation-modules-v1.md)
- [`media-inspection-and-normalization-v1.md`](./media-inspection-and-normalization-v1.md)
- [`media-execution-boundary-v1.md`](./media-execution-boundary-v1.md)
- [`caption-gemini-provider-contract.md`](./caption-gemini-provider-contract.md)
- [`../services/whisperx/README.md`](../services/whisperx/README.md)
- [`../examples/talking-film-live/README.md`](../examples/talking-film-live/README.md)

## Documentation rules

- `spec/` states normative laws and versioned contracts.
- `docs/architecture.md` states current ownership and boundaries.
- `docs/implementation-status.md` states repository reality.
- `docs/roadmap.md` states planned work and non-goals.
- package and example READMEs explain one executable unit.

Do not preserve a superseded design in the current tree merely as a discussion log. Keep durable
decisions in the current architecture/specification, and rely on Git history for rejected drafts.
