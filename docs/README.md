# Documentation

Narratage documentation is intentionally split by authority. Git history preserves discarded designs;
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
6. [`../spec/core-kernel.md`](../spec/core-kernel.md) — compact normative Kernel laws for the
   current `@1` wire data.

## Domain-neutral implementation records

- [`graph-first-value-boundary.md`](./graph-first-value-boundary.md) — graph edges own
  dependency truth; values contain only intrinsic meaning.
- [`model-input-ports.md`](./model-input-ports.md) — models declare the inputs they accept;
  Providers only map those ports onto their own wire.
- [`node-package-activation.md`](./node-package-activation.md) — trusted installed package
  locking, contributions and Host-selected facet activation.
- [`local-developer-runtime.md`](./local-developer-runtime.md) — local SQLite/filesystem
  Runtime, recovery and environment replacement.
- [`runtime-adapter-loading.md`](./runtime-adapter-loading.md) — separately locked Provider
  and Store activation, physical-code identity, diagnostics and explicit Artifact maintenance.
- [`build-archive-and-egress.md`](./build-archive-and-egress.md) — Targets, durable Records,
  Artifact retention and optional Host materialization as four separate concerns.
- [`speech-alignment.md`](./speech-alignment.md) — the Script and the recording as two
  independent observations, and what locating guarantees.
- [`source-and-run-compilation.md`](./source-and-run-compilation.md) — mandatory Source Header,
  peer Author/Run graphs, deterministic composition and compilation data gates.
- package READMEs under [`../packages`](../packages) — executable APIs and ownership.

## Video-domain specifications

- [`../spec/script-surface.md`](../spec/script-surface.md)
- [`../spec/author-surface-binding.md`](../spec/author-surface-binding.md)
- [`../spec/caption-program.md`](../spec/caption-program.md)
- [`../spec/track-composition.md`](../spec/track-composition.md)
- [`../spec/track-expressiveness.md`](../spec/track-expressiveness.md)
- [`../spec/visual-ir.md`](../spec/visual-ir.md)

These video contracts are executable candidates, not yet an open-source compatibility freeze.

## Video execution records

- [`kie-generation-modules.md`](./kie-generation-modules.md)
- [`media-inspection-and-normalization.md`](./media-inspection-and-normalization.md)
- [`media-execution-boundary.md`](./media-execution-boundary.md)
- [`hyperframes-aws-runtime.md`](./hyperframes-aws-runtime.md) — recoverable Endpoint semantics and
  the resource review required before the first stack deployment.
- [`image-transform.md`](./image-transform.md)
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

Do not preserve a superseded design in the current tree merely as a discussion log. Keep durable
decisions in the current architecture/specification, and rely on Git history for rejected drafts.
