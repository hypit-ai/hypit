# SVML

SVML is a graph language and runtime for building expensive, recoverable creative workflows from
human-readable intent.

Its reference video distribution lets an author address a video with words rather than timecodes:
Script defines the semantic truth, generated speech supplies acoustic evidence, and independent
packages lower captions, B-roll, text and speech into peer Tracks.

SVML is currently a pre-release v2 rewrite. It has completed a real paid talking-video acceptance
sequence, but the repository is currently a source-checkout workspace rather than a published npm
distribution; its public package names and video authoring ABI are not frozen yet.

## Why a graph language

AIGC operations are slow, costly, fallible and non-deterministic. Their results frequently become
inputs to later compilation. A usable system must therefore distinguish:

- what the author requested;
- which implementation is used for this Run;
- which results are actually demanded;
- what has already been materialized;
- where an external capability executes;
- which facts and code produced every accepted result.

SVML compiles those decisions before execution:

```text
Author Graph + Run Graph + Satisfaction edges + Targets
                              │
                              ▼
                       frozen BuildPlan
                              │
                              ▼
                 recoverable verified execution
```

There is no privileged final-video root. Any public Logical Output can be a Target.

## Core model

- A **Logical Output** is an author-visible typed result promise.
- A **Candidate** is an independent typed supply backed by a Provided Value or Operation result.
- A **Satisfaction** explicitly connects a Candidate to a Logical Output as `exact` or
  `substitute`.
- A **Target** says which outputs this Build requires.
- An **Operation** is one atomic execution instance. Shared identity means one execution; separate
  instances execute separately even when their parameters match.
- Core resolves the selected reverse closure and freezes a finite BuildPlan before any external
  command runs.

Product actions such as pinning a previous video, using a black preview or selecting an alternate
fragment are ordinary Run Graph authoring. Core contains no Pin, preview mode, automatic cache or
Provider fallback branch.

See [the architecture](docs/architecture.md) and
[Core Kernel specification](spec/core-kernel-v1.md).

## What works today

The repository implements:

- domain-neutral Protocol, Core, graph elaboration and Node compiler Host;
- mandatory self-described Author/Run sources with no suffix-selected or default parser;
- official `.svml` markup, Script Surface, `.svs` Recipes and `.svrun` execution intent;
- locked trusted package activation without package-specific Core registration;
- recoverable Runtime scheduling with concurrency lanes, retries and cancellation;
- SQLite Build/Operation stores and filesystem/S3 Artifact stores;
- exact Endpoint binding and scoped credentials;
- seven explicit image/video model families through the KIE Provider;
- local ffprobe/ffmpeg media processing;
- local pinned WhisperX service;
- Vertex Gemini display-only Caption planning;
- local frame-parallel HyperFrames rendering;
- Speech, Caption, Text, B-roll, Film, audio and final mux vertical slices.

The complete live path is:

```text
Script → Estimate → Seedance × 2 → media normalization → WhisperX → SemanticMap
       → Gemini CaptionPlan → peer Tracks → Film → HyperFrames → audio mix → MP4
```

Details and current gaps are maintained in
[implementation status](docs/implementation-status.md).

## Quick start

Requirements:

- Node.js 22+
- pnpm
- Python 3.10–3.13 only when running the local WhisperX service

```bash
pnpm install
pnpm check
pnpm test

# Compile a complete provider-free v2 author graph.
pnpm svml:v2 check examples/talking-film-graph-check/main.svml

# Compile the self-described Run Graph and inspect its finite plan.
pnpm svml:v2 plan examples/talking-film-graph-check/build.svrun
```

The live example uses an explicit Run Graph, declarative local Runtime Profile and external
credentials:

```bash
pnpm svml:v2 build examples/talking-film-live/build.svrun \
  --runtime examples/talking-film-live/svml.runtime.json \
  --build-id talking-film-live \
  --follow

pnpm svml:v2 get talking-film-live \
  --name final.video \
  --runtime examples/talking-film-live/svml.runtime.json \
  --to examples/talking-film-live/output/final.mp4
```

The Build archives every accepted intermediate Record and Artifact before `get` makes an optional
human-readable copy. `builds`, `inspect` and `get --name` use a Host-only catalog of source aliases;
the selected Record is still verified against the authoritative BuildState.

Read its [deployment requirements](examples/talking-film-live/README.md) before running it. Paid
credentials, presenter assets, local databases and generated outputs are not committed.

## Author source versus execution environment

These inputs are separate by design:

| Input | Owns |
|---|---|
| `.svml` | author meaning, explicit model/component choices and graph references |
| `.svs` | reusable package-defined Recipe values |
| `.svrun` | Targets, Candidates and explicit Satisfaction edges for one reusable Run |
| `svml.runtime.json` / `svml.runtime.ts` | Scheduler, Stores, credential references, Endpoints and concurrency |

Source imports activate author vocabulary only. They never authorize network, filesystem, process,
credential or queue access.

## Packages and extension

A physical package may expose separately locked facets:

```text
author    Frontend, Surface, Graph Fragment
compute   deterministic Producer or Type Validator
endpoint  privileged local/remote capability implementation
runtime   Scheduler or Store implementation
```

Packages communicate through nominal Types published by their owners. Core does not contain a
central union of Narrative, Track, Seedance or any other domain type. Installing a trusted package
can add a new component or Endpoint without republishing Core.

Current package execution is for explicitly installed, byte-locked trusted code. Arbitrary
community Parser/Producer/Validator execution still needs a real isolation and permission boundary.

## Repository map

```text
packages/protocol        immutable wire contracts
packages/artifact        domain-neutral content-addressed byte Type
packages/core            domain-neutral Demand compiler and Build state machine
packages/source          mandatory Source Header; no syntax default
packages/elaborator      author declarations and hygienic Fragment expansion
packages/compiler-node   reference Node compiler Host
packages/compiler-text-node  optional official Text compiler assembly
packages/package-loader-node syntax-neutral trusted physical-package loading
packages/cli             generic commands requiring an explicit Distribution
packages/video-cli       official Text/video command Distribution
packages/run             syntax-neutral Run Source closure and complete Run Graph compiler
packages/run-text        optional official human-readable Run Frontend
packages/runtime         environment-neutral scheduling and Store ports
packages/driver-node     trusted Node command execution
packages/local           zero-service SQLite/filesystem developer assembly
packages/*               optional Frontend, domain, Endpoint and adapter packages
services/whisperx        pinned local WhisperX sidecar
spec                     current normative contracts
docs                     architecture, status, roadmap and focused implementation records
examples                 v2 checks/live witness plus retained v1 regression fixtures
```

Start with the [documentation map](docs/README.md) and [roadmap](docs/roadmap.md).
The [open-source distribution plan](docs/open-source-distribution.md) records what can ship
independently and what remains before the first public package release.

## Development

```bash
pnpm check       # v1 research oracle + v2 TypeScript
pnpm test        # v1 regression tests + v2 package tests
pnpm build       # build the retained root v1 CLI during migration

pnpm test:whisperx-service
pnpm smoke:kie   # opt-in paid Provider smoke test; requires credentials
```

The root `src/`, `stdlib/` and legacy examples remain executable regression evidence while v2 is
rewritten under `packages/`. They are not the public v2 package taxonomy or source contract.

## Current priorities

Work is intentionally focused on two layers:

1. Run/Runtime diagnostics, package lifecycle and developer inspection;
2. repeatable live acceptance and replaceable local/cloud Endpoint environments.

Broader Text, Caption, B-roll and Ranking visual behavior is deferred until those foundations are
clean. See the [roadmap](docs/roadmap.md).
