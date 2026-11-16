# Package architecture and intermediate representations

> Status: current package-boundary proposal. A package is created only when its release, ownership, consumer,
> selection, platform-weight or deployment boundary is real.

## Representation boundaries

Hypit has four representations with distinct authorities and lifetimes.

```text
Author Program
  TypeScript/TSX modules and component calls

NLE Project
  durable structured author document (SVML) and edit Service state

AVIR Programme
  closed invocation-local audiovisual semantics

Executor plan
  private renderer/process/cache/encoding implementation
```

Only the NLE Project is the durable authority for the current edit. The Author Program is source/module input to an
explicit materialization operation. AVIR is disposable execution state. An Executor plan is private and must never
become a Project or AVIR fact.

## Proposed release shape

The first package graph should remain small:

```text
@hypit/temporal
  ├── @hypit/media
  ├── @hypit/media-asset
  ├── @hypit/audiovisual
  └── @hypit/nle

@hypit/authoring  -> @hypit/nle
project component packages -> @hypit/authoring
@hypit/project    -> @hypit/media-asset
@hypit/nle       -> @hypit/audiovisual
@hypit/nle-studio -> @hypit/project + @hypit/nle
@hypit/hypit     -> selected owner packages
```

The arrows describe source dependencies, not authority. `@hypit/temporal` supplies exact values and mappings. Media
packages interpret accepted media. `@hypit/nle` owns the Project document, transactions, materialization target and
deterministic AVIR lowering. `@hypit/audiovisual` owns AVIR facts and validation. A future `@hypit/authoring` package
would own the TSX authoring vocabulary and materialization adapter, but its first implementation may remain a source
module inside the NLE release until a second consumer proves an independent release boundary.

The NLE release contains the SVML Reader, serializer and current schema. A separate serialization release becomes
justified when an independent owner consumes the same format with its own release lifecycle.

## Core package responsibilities

### `@hypit/temporal`

Owns exact temporal values, finite local domains, target-to-source maps, controls, composition and preimage
operations. It does not own NLE placement, media selection, frame grids or renderer policy.

### `@hypit/media` and `@hypit/media-asset`

`@hypit/media` owns execution-independent stream observations and interpretations. `@hypit/media-asset` owns
portable accepted-media documents and adoption. Neither owns NLE placement or authoring components.

### `@hypit/authoring` (planned boundary)

Owns the TypeScript/TSX authoring vocabulary and materialization of a finite author program into NLE commands or a
Project value. It may provide `Timeline`, `Track`, `Media`, `Component`, `TimeMap`, `Control`, Present-local `Process`,
`Transition`, `Matte` and spatial authoring elements.

It does not own durable edits, AVIR graphs, AIGC recipes, semantic evidence, renderer selection or executor state.

The package must distinguish author-time materialization from live AVIR evaluation. A component can be materialized to
an editable NLE Composition or remain an opaque Component Present with a package symbol and closed parameters.

### `@hypit/nle`

Owns the durable NLE Project document and SVML schema, Reader and serializer, Project Service, edit transactions,
Composition and Track facts, Present occurrences, source-time relations, Present-local Processes and timed Adjusts,
Transitions, Mattes, shared values and deterministic AVIR lowering.

NLE Project serialization is the SVML representation of the edit. It contains no TSX source text, View
selection, Service revision, AVIR Programme or Executor plan.

### `@hypit/audiovisual`

Owns AVIR Programme types, validation, exact point/range evaluation contracts, Source and Operator symbols,
Picture and Audio relations, spatial maps and signal reconstruction selections. It accepts a closed NLE lowering
result and does not parse TSX, NLE files or AIGC graphs.

### Executors and product adapters

Preview, review and delivery executors own output clocks, decoding, browser or native processes, GPU plans, caches,
encoding, progress, cancellation and recovery. Hosts select installed component packages and executor capabilities;
they do not add those facts to NLE or AVIR.

`@hypit/nle-studio` is the standalone loopback NLE product adapter. Its independent browser artifact, Node entry and
deployment lifecycle justify a release boundary outside headless `@hypit/nle`. It composes Project and View Services
through the NLE Editing Surface, and accepts Project Media Service and preview Executor ports without absorbing their
facts or execution state.

`@hypit/project` owns the Project manifest Reader, explicit installed-package activation, package contribution and
catalog provenance, open owner-Service leases and the ProjectHost lifecycle. Its `node` subpath supplies local path,
file and npm-resolution adapters. It does not depend on NLE, Canvas or another optional owner. The full boundary,
manifest and Host API are defined in [Project Boundary and Project Host](project-host.md).

## Component package contract

A project component package is an ordinary npm package selected by the Project Boundary and lockfile. It may export:

- an authoring component or materializer;
- stable parameter declarations and editable slots;
- explicit Media input names and output names;
- finite authoring projections for Timeline or Inspector surfaces;
- a Source implementation, an Operator implementation or a complete lowering to core AVIR relations.

The package owns parameter meaning and validation. NLE owns the occurrence, placement and binding. AVIR carries only
the closed values and selected package symbols needed for one invocation. Package presentation metadata is projected,
not persisted as NLE facts.

An implementation that needs mutable sequential execution, an implicit global clock or a private renderer program
does not satisfy the live AVIR Source/Operator contract merely because it can eventually export a file. It must either
materialize an NLE-compatible author result or publish an implementation that obeys the AVIR ABI.

## Dependency and ownership rules

1. A package boundary follows an independent release and lifecycle, not a type namespace.
2. A source module remains inside its owner package while its consumers and release lifetime are shared.
3. Authoring depends on NLE facts; NLE does not depend on a project component's source language.
4. NLE lowering may resolve installed component packages through an explicit Host seam, but NLE does not import their
   implementation internals into the Project document.
5. AVIR does not know whether a Source came from Media, a component, a Scene Published Surface or a generated file.
6. AIGC and semantic owners enter through Publications, References and materialization; they never become renderer
   nodes by implication.
7. Executor-private plans, caches and process handles never enter any durable owner document.

## First implementation order

The redesign should proceed as one vertical slice rather than by creating every proposed package immediately:

1. keep the current exact temporal foundation and AVIR/NLE owner schemas;
2. define a small authoring source module with `Timeline`, `Track`, `Present`, `TimeMap`, Present-local `Process`,
   `Transition` and `Matte` materialization;
3. materialize a TSX-like program into one NLE Project value with stable ids;
4. edit and serialize that Project without re-running the author program;
5. lower the edited snapshot to AVIR and reach one preview or delivery Executor;
6. extract `@hypit/authoring` only when a second project component or product consumes it independently;
7. split renderer or platform executors only when their deployment and process lifecycles justify it.

This order prevents the package graph from becoming another speculative architecture. The durable seams are proved by
the production path first.
