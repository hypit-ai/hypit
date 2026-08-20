---
title: Package Architecture
description: The seven layers, dependency boundaries, package anatomy and facets.
---

# Package Architecture

Workspace packages under `packages/` are organized into seven architectural layers. Dependencies are
declared by each package itself. The root installs the complete source checkout so the Package
Loader can resolve any explicitly selected package, but TypeScript has no central path alias that can
hide a package's undeclared import.

## The seven layers

### Layer 1: Hypit Core

The immutable graph protocol, demand compiler and Build state machine. This closure is domain
neutral and knows nothing about source syntax, files, networks, models or video.

```text
@hypit/protocol              immutable wire contracts
@hypit/core                  Demand compiler and Build state machine
```

### Layer 2: Compiler

Source discovery, Frontends, imports, graph elaboration and the reference Node Host. A source
selects its own Frontend in its mandatory header; no central parser knows every language feature.

```text
@hypit/source                mandatory Source Header
@hypit/elaborator            author declarations and Fragment expansion
@hypit/run                   syntax-neutral Run Graph
@hypit/validation            semantic admission
@hypit/host                  opaque Host-facet envelope
@hypit/workspace             replaceable Source/Asset session
@hypit/compiler-node         reference Node compiler Host
@hypit/workspace-fs-node     workspace filesystem abstraction
@hypit/package-loader-node   installed package selection
@hypit/markup                official .svml Markup Frontend
@hypit/svs                   SVS Recipe Frontend
@hypit/run-markup            official .svrun Markup Frontend
@hypit/compiler-markup-node  Markup Frontend + Surface Host assembly
```

### Layer 3: Foundations

Reusable values and deterministic building blocks. They support video authoring but do not decide a
film's creative structure or call an external service.

```text
@hypit/artifact              content-addressed bytes
@hypit/component-kit         Producer and validator registration
@hypit/text                  graph-native text templates
@hypit/media                 media values
@hypit/temporal              Selection and Moment projection
@hypit/spatial               layout geometry
@hypit/visual-ir             renderer-neutral visual vocabulary
@hypit/fonts-open            redistributable font assets
@hypit/media-pipeline        media inspection and normalization
@hypit/media-execution       shared ffmpeg execution body
@hypit/transport             invocation seams
@hypit/transport-aws-lambda  Lambda transport
```

### Layer 4: Video authoring

The packages that give SVML its video vocabulary: narrative, exact model requests, speech,
captions, peer Tracks, Film and render declarations. They depend on shared contracts, never on a
specific Provider deployment.

```text
@hypit/narrative             authored narrative products
@hypit/script                Script Surface
@hypit/program-space         exact frame/sample domain
@hypit/generation            image/video/audio generation contracts
@hypit/model-kit             model family abstractions
@hypit/seedance              Seedance model family + author Surface
@hypit/seedance-kits         data-only Seedance semantic Text Templates
@hypit/minimax-h3            MiniMax H3 model family
@hypit/gemini-omni           Gemini Omni model family
@hypit/grok-imagine          Grok Imagine model family
@hypit/gpt-image             GPT Image model family
@hypit/nano-banana           Nano Banana model family
@hypit/seedream              Seedream model family
@hypit/mimo-tts              three exact Xiaomi MiMo TTS models + author Surfaces
@hypit/estimate              duration estimation
@hypit/speech                shared speech products
@hypit/speech-evidence       acoustic evidence products
@hypit/speech-alignment      speech alignment
@hypit/semantic-track        continuous semantic program skeleton
@hypit/speech-track          ordered speech-take compilation
@hypit/whisperx              WhisperX component
@hypit/caption               caption planning and timing
@hypit/caption-gemini        Gemini caption planner
@hypit/caption-fine          field-free fine caption Track family
@hypit/media-track           unified Media Item/Sequence Track
@hypit/typography-track      typography overlay Track
@hypit/audio-track           arbitrary sample-domain Audio Track
@hypit/deck-track            depth-stack collection Track
@hypit/ranking               three ranking component families
@hypit/screen-overlay        self-contained full-canvas overlays
@hypit/film                  Film composition
@hypit/composition           peer Track composition
@hypit/hyperframes           HyperFrames document compiler
@hypit/render-hyperframes    explicit HyperFrames rendering component
@hypit/image-transform       image processing component
@hypit/image-compose         ordered still-image composition
@hypit/raster                shared deterministic raster execution contract
@hypit/background-removal    external image cutout capability
```

### Layer 5: Providers

Privileged external capabilities. Depend on Runtime ports and shared capability vocabularies,
never on exact-model packages or the CLI.

```text
@hypit/provider-kie                  KIE generation plus background removal
@hypit/provider-media-local          local ffprobe/ffmpeg
@hypit/provider-whisperx-local       local WhisperX service
@hypit/provider-google-vertex        Vertex Gemini caption planning
@hypit/provider-hyperframes-local    local Chrome rendering
@hypit/provider-hyperframes-aws-lambda asynchronous distributed rendering
@hypit/provider-image-opencv-local   local OpenCV Raster execution
@hypit/provider-media-aws-lambda     synchronous AWS media execution
@hypit/provider-xiaomi-mimo           official Xiaomi MiMo TTS API
```

### Layer 6: Runtime

Domain-neutral execution ports plus replaceable deployment implementations. Runtime packages own
queues, stores, credentials and process lifecycle; they never define author syntax.

```text
@hypit/runtime               Scheduler, Worker and Store ports
@hypit/endpoint-kit          Endpoint declarations
@hypit/driver-node           trusted Node command executor
@hypit/runtime-kit           deployment package ABI
@hypit/runtime-host-node     Node Runtime Host ABI
@hypit/runtime-local         local Worker and assembly
@hypit/store-sqlite          SQLite state
@hypit/artifact-store-fs     filesystem Artifacts
@hypit/artifact-store-s3     S3 Artifacts
@hypit/credential-store-env  environment credentials
@hypit/credential-store-keychain macOS Keychain credentials
```

### Layer 7: Applications

```text
@hypit/cli                 generic command engine (requires explicit Distribution)
@hypit/video-cli           video command application (selects Markup compiler, no built-in author packages)
@hypit/studio              development preview for a Run, never runs a Provider
```

## Dependency rules

The package layout follows three dependency rules:

1. **Acyclic production graph.** No dependency cycle among any `@hypit/*` packages.

2. **Domain-neutral Core closure.** Layer 1 contains only `protocol` and `core`; `core` depends only
   on `protocol`. Compiler and Runtime may also be domain neutral, but they remain outside Core.

3. **CLI independence.** Neither `@hypit/cli` nor `@hypit/video-cli` transitively depends on any
   Provider package. The video CLI also does not depend on any author-level video package
   (`@hypit/script`, `@hypit/seedance`, `@hypit/media-track`, `@hypit/typography-track`, `@hypit/film`).
   Author packages are activated through Source imports, not compile-time CLI
   dependencies. These rules are kept visible in package manifests and reviewed as architecture,
   rather than approximated by source-text regex tests.

## Package anatomy

Every package lives under `packages/<name>/` with this structure:

```text
packages/example/
├── package.json
├── src/
│   ├── index.ts          public API entry point
│   └── activation.ts     package contribution descriptor (if installable)
└── test/
    └── example.test.ts
```

### package.json

```json
{
  "name": "@hypit/example",
  "version": "0.0.0-dev",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "hypit": {
    "activation": "./src/activation.ts"
  },
  "dependencies": {
    "@hypit/protocol": "workspace:*"
  }
}
```

- `"exports"` points to TypeScript source directly during development. pnpm's workspace links resolve
  `@hypit/*` imports through the dependency declared by the importing package.
- `"hypit.activation"` is the entry point that the Package Loader reads when this package is
  selected. It must default-export a `NodePackageContribution`.
- The physical package version remains `0.0.0-dev` until publication. Module and Frontend manifests
  use the independent logical protocol version `1`.

### activation.ts

Every installable package exports a passive contribution descriptor — an inventory of what it
offers, not an authority grant. See [Adding an author package](./author-packages.md) and
[Adding a Provider](./providers.md) for concrete examples.

## Five package facets

A physical package may expose independently activated facets:

| Facet | ABI | Authority | Selected by |
|---|---|---|---|
| `static` | Manifest and identity | none | always available after loading |
| `author` | Frontend, Surface, Graph Fragment | author vocabulary only | source `<import>` through the compiler Host |
| `compute` | deterministic Producer, Type Validator | pure computation | compiler Host |
| `endpoint` | privileged external capability | network, filesystem, process, credentials | Runtime Profile |
| `infrastructure` | Scheduler, Worker and Store implementation | persistence, scheduling | Runtime Profile |

A source `<import>` activates only author facets. It never grants network, filesystem, process,
credential or queue authority.

## Package selection

Hypit does not maintain a package registry or a second package-resolution layer. npm or pnpm
installs packages and owns their versions and integrity. Hypit has two explicit selection paths:

| Selection | Packages activated |
|---|---|
| Source imports | Frontends, Surfaces, Producers and Validators |
| Runtime Profile `use` | Runtime Hosts, infrastructure and Provider Endpoints |

A Source import never grants network, filesystem, process, credential or queue authority. Those
remain available only to packages explicitly selected by the Runtime Profile.

### Logical package addresses and Source discovery

Source code names logical language capabilities. By convention the logical name maps directly to
the installed npm package name. A Module and a Run Fragment may share a spelling because their Host
ABIs remain different, and one physical package may offer several logical names.

Compilation reads only the mandatory Source Header first. It resolves that Frontend from installed
packages, calls the Frontend's own `discover()` method, resolves the reported Modules,
Run Fragments and child Sources, and repeats until the exact package subset stops growing. Only
then does semantic decoding begin. Markup is the video Distribution's bootstrap Frontend; Script,
SVS, Run Markup and third-party Frontends otherwise follow the same discovery protocol. The package
selector contains no parser-specific branch.

Frontend implementations are not privileged fields in the physical package format. They advertise
the ordinary `hypit.source-frontend@1` Host facet, exactly as Run Fragments, Markup Surfaces and
Runtime Adapters advertise their own Host ABIs. Only the Source Host interprets that facet.

Runtime Profiles follow the same rule. Each `use` selects a Runtime Host, Endpoint Adapter or
Runtime Infrastructure ABI plus a logical name. A physical npm package advertises that logical
offer. The generic CLI therefore
does not contain a Provider registry, and different Adapter kinds may share
a logical spelling without colliding.

The loader never downloads packages and never scans unrelated installed dependencies for plugins.
It loads only packages selected by Source discovery or the Runtime Profile, plus exact Module
dependencies declared by those packages.
