# Narratage

Narratage is a compiler and runtime for building expensive, recoverable creative workflows from
human-readable intent. Its sources are written in SVML, its graph markup language.

The name is a 1930s film-industry term — narration plus montage: narration-driven storytelling
with montage in a supporting role. The reference video distribution follows that technique. An
author addresses a video with words rather than timecodes: Script defines the semantic truth,
generated speech supplies acoustic evidence, and independent packages lower captions, B-roll,
text and speech into peer Tracks.

Narratage is pre-release. It has completed a real paid talking-video acceptance sequence, but the
repository is currently a source-checkout workspace rather than a published npm distribution; its
public package names and video authoring ABI are not frozen yet.

## Why a graph language

AIGC operations are slow, costly, fallible and non-deterministic. Their results frequently become
inputs to later compilation. A usable system must therefore distinguish:

- what the author requested;
- which implementation is used for this Run;
- which results are actually demanded;
- what has already been materialized;
- where an external capability executes;
- which facts and code produced every accepted result.

Narratage compiles those decisions before execution:

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
[Core Kernel specification](spec/core-kernel.md).

## What works today

The repository implements:

- domain-neutral Protocol, Core, graph elaboration and Node compiler Host;
- mandatory self-described Author/Run sources with no suffix-selected or default parser;
- official `.svml` markup, Script Surface, `.svs` Recipes and `.svrun` execution intent;
- locked trusted package activation without package-specific Core registration;
- recoverable Runtime scheduling with concurrency lanes, retries and cancellation;
- SQLite Build/Operation stores and filesystem/S3 Artifact stores;
- exact Endpoint binding and scoped credentials;
- eleven exact image/video models declaring their own input ports, reached through the KIE Provider;
- local ffprobe/ffmpeg media processing;
- S3 multipart Artifact streaming and AWS Lambda media processing;
- local pinned WhisperX service;
- Vertex Gemini display-only Caption planning;
- local frame-parallel HyperFrames rendering;
- recoverable Step Functions/Lambda HyperFrames rendering;
- Speech, Caption, Text, B-roll, Film, audio and final mux vertical slices.

The complete live path is:

```text
Script → Estimate → Seedance × N → media normalization → WhisperX → SemanticMap
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

# Compile a complete provider-free author graph.
pnpm narratage check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .

# Compile the self-described Run Graph and inspect its finite plan.
pnpm narratage plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .
```

The live example uses an explicit Run Graph, declarative local Runtime Profile and external
credentials:

```bash
pnpm narratage build examples/talking-film-live/build.svrun \
  --runtime examples/talking-film-live/svml.runtime.json \
  --package-lock examples/talking-film-live/svml.packages.lock \
  --root . \
  --build-id talking-film-live \
  --follow

pnpm narratage get talking-film-live \
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
| `svml.packages.lock` | physical author/compute implementation closure |
| `svml.runtime-packages.lock` | physical Provider/Store adapter closure and privileged code identity |

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
packages/video-cli       official video command application; no author-package aggregate
packages/run             syntax-neutral Run Source closure and complete Run Graph compiler
packages/run-text        optional official human-readable Run Frontend
packages/runtime         environment-neutral scheduling and Store ports
packages/driver-node     trusted Node command execution
packages/local           zero-service SQLite/filesystem developer assembly
packages/*               optional Frontend, domain, Endpoint and adapter packages
services/whisperx        pinned local WhisperX sidecar
spec                     current normative contracts
docs                     architecture, status, roadmap and focused implementation records
examples                 source-closure checks and the live acceptance witness
```

Start with the [documentation map](docs/README.md) and [roadmap](docs/roadmap.md).
The [open-source distribution plan](docs/open-source-distribution.md) records what can ship
independently and what remains before the first public package release.

## Development

```bash
pnpm check       # TypeScript across every workspace package
pnpm test        # package test suites and repository boundary tests

pnpm test:whisperx-service
pnpm smoke:kie   # opt-in paid Provider smoke test; requires credentials
```

## Current priorities

The domain-neutral Run/Runtime foundation, developer inspection path and the first replaceable local
Endpoint environments are implemented. Current work is split between making that foundation ready
for trusted-developer distribution and turning the real talking-film acceptance path into a
repeatable harness. Text, Caption and B-roll already execute as vertical slices; their full visual
breadth, Ranking and the final video compatibility freeze remain deferred. See the
[implementation status](docs/implementation-status.md) and [roadmap](docs/roadmap.md).
