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

### Layer 1: Narratage Core

The immutable graph protocol, demand compiler and Build state machine. This closure is domain
neutral and knows nothing about source syntax, files, networks, models or video.

```text
@narratage/protocol              immutable wire contracts
@narratage/core                  Demand compiler and Build state machine
```

### Layer 2: Compiler

Source discovery, Frontends, imports, graph elaboration and the reference Node Host. A source
selects its own Frontend in its mandatory header; no central parser knows every language feature.

```text
@narratage/source                mandatory Source Header
@narratage/elaborator            author declarations and Fragment expansion
@narratage/run                   syntax-neutral Run Graph
@narratage/validation            semantic admission
@narratage/host                  opaque Host-facet envelope
@narratage/workspace             replaceable Source/Asset session
@narratage/compiler-node         reference Node compiler Host
@narratage/workspace-fs-node     workspace filesystem abstraction
@narratage/package-loader-node   installed package selection
@narratage/markup                official .svml Markup Frontend
@narratage/svs                   SVS Recipe Frontend
@narratage/run-markup            official .svrun Markup Frontend
@narratage/compiler-markup-node  Markup Frontend + Surface Host assembly
```

### Layer 3: Foundations

Reusable values and deterministic building blocks. They support video authoring but do not decide a
film's creative structure or call an external service.

```text
@narratage/artifact              content-addressed bytes
@narratage/component-kit         Producer and validator registration
@narratage/text                  graph-native text templates
@narratage/media                 media values
@narratage/temporal              Selection and Moment projection
@narratage/spatial               layout geometry
@narratage/visual-ir             renderer-neutral visual vocabulary
@narratage/fonts-open            redistributable font assets
@narratage/media-pipeline        media inspection and normalization
@narratage/media-execution       shared ffmpeg execution body
@narratage/transport             invocation seams
@narratage/transport-aws-lambda  Lambda transport
```

### Layer 4: Video authoring

The packages that give SVML its video vocabulary: narrative, exact model requests, speech,
captions, peer Tracks, Film and render declarations. They depend on shared contracts, never on a
specific Provider deployment.

```text
@narratage/narrative             authored narrative products
@narratage/script                Script Surface
@narratage/program-space         exact frame/sample domain
@narratage/generation            image/video/audio generation contracts
@narratage/model-kit             model family abstractions
@narratage/seedance              Seedance model family + author Surface
@narratage/seedance-kits         data-only Seedance semantic Text Templates
@narratage/minimax-h3            MiniMax H3 model family
@narratage/gemini-omni           Gemini Omni model family
@narratage/grok-imagine          Grok Imagine model family
@narratage/gpt-image             GPT Image model family
@narratage/nano-banana           Nano Banana model family
@narratage/seedream              Seedream model family
@narratage/mimo-tts              three exact Xiaomi MiMo TTS models + author Surfaces
@narratage/estimate              duration estimation
@narratage/speech                shared speech products
@narratage/speech-basis          generated speech A/V product
@narratage/speech-evidence       acoustic evidence products
@narratage/semantic-map          authored-token timing map
@narratage/speech-alignment      speech alignment
@narratage/speech-spine          ordered speech-take compilation
@narratage/whisperx              WhisperX component
@narratage/caption               caption planning and timing
@narratage/caption-gemini        Gemini caption planner
@narratage/caption-fine          field-free fine caption Track family
@narratage/media-track           unified Media Item/Sequence Track
@narratage/typography-track      typography overlay Track
@narratage/audio-track           arbitrary sample-domain Audio Track
@narratage/deck-track            depth-stack collection Track
@narratage/ranking               four ranking component families
@narratage/screen-overlay        self-contained full-canvas overlays
@narratage/film                  Film composition
@narratage/composition           peer Track composition
@narratage/hyperframes           HyperFrames document compiler
@narratage/render-hyperframes    explicit HyperFrames rendering component
@narratage/image-transform       image processing component
@narratage/image-compose         ordered still-image composition
@narratage/raster                shared deterministic raster execution contract
@narratage/background-removal    external image cutout capability
```

### Layer 5: Providers

Privileged external capabilities. Depend on Runtime ports and shared capability vocabularies,
never on exact-model packages or the CLI.

```text
@narratage/provider-kie                  KIE generation plus background removal
@narratage/provider-media-local          local ffprobe/ffmpeg
@narratage/provider-whisperx-local       local WhisperX service
@narratage/provider-google-vertex        Vertex Gemini caption planning
@narratage/provider-hyperframes-local    local Chrome rendering
@narratage/provider-hyperframes-aws-lambda asynchronous distributed rendering
@narratage/provider-image-opencv-local   local OpenCV Raster execution
@narratage/provider-media-aws-lambda     synchronous AWS media execution
@narratage/provider-xiaomi-mimo           official Xiaomi MiMo TTS API
```

### Layer 6: Runtime

Domain-neutral execution ports plus replaceable deployment implementations. Runtime packages own
queues, stores, credentials and process lifecycle; they never define author syntax.

```text
@narratage/runtime               Scheduler, Worker and Store ports
@narratage/endpoint-kit          Endpoint declarations
@narratage/driver-node           trusted Node command executor
@narratage/runtime-kit           deployment package ABI
@narratage/runtime-host-node     Node Runtime Host ABI
@narratage/runtime-local         local Worker and assembly
@narratage/store-sqlite          SQLite state
@narratage/artifact-store-fs     filesystem Artifacts
@narratage/artifact-store-s3     S3 Artifacts
@narratage/credential-store-env  environment credentials
@narratage/credential-store-keychain macOS Keychain credentials
```

### Layer 7: Applications

```text
@narratage/cli           generic command engine (requires explicit Distribution)
@narratage/video-cli     video command application (selects Markup compiler, no built-in author packages)
```

## Dependency rules

The package layout follows three dependency rules:

1. **Acyclic production graph.** No dependency cycle among any `@narratage/*` packages.

2. **Domain-neutral Core closure.** Layer 1 contains only `protocol` and `core`; `core` depends only
   on `protocol`. Compiler and Runtime may also be domain neutral, but they remain outside Core.

3. **CLI independence.** Neither `@narratage/cli` nor `@narratage/video-cli` transitively depends on any
   Provider package. The video CLI also does not depend on any author-level video package
   (`@narratage/script`, `@narratage/seedance`, `@narratage/media-track`, `@narratage/typography-track`, `@narratage/film`).
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
  "name": "@narratage/example",
  "version": "0.0.0-dev",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "narratage": {
    "activation": "./src/activation.ts"
  },
  "dependencies": {
    "@narratage/protocol": "workspace:*"
  }
}
```

- `"exports"` points to TypeScript source directly during development. pnpm's workspace links resolve
  `@narratage/*` imports through the dependency declared by the importing package.
- `"narratage.activation"` is the entry point that the Package Loader reads when this package is
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

Narratage does not maintain a package registry or a second package-resolution layer. npm or pnpm
installs packages and owns their versions and integrity. Narratage has two explicit selection paths:

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
the ordinary `narratage.source-frontend@1` Host facet, exactly as Run Fragments, Markup Surfaces and
Runtime Adapters advertise their own Host ABIs. Only the Source Host interprets that facet.

Runtime Profiles follow the same rule. Each `use` selects a Runtime Host, Endpoint Adapter or
Runtime Infrastructure ABI plus a logical name. A physical npm package advertises that logical
offer. The generic CLI therefore
does not contain a Provider registry, and different Adapter kinds may share
a logical spelling without colliding.

The loader never downloads packages and never scans unrelated installed dependencies for plugins.
It loads only packages selected by Source discovery or the Runtime Profile, plus exact Module
dependencies declared by those packages.
