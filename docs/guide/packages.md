---
title: Package Architecture
description: The four layers, dependency boundaries, package anatomy and facets.
---

# Package Architecture

The 64+ workspace packages under `packages/` are organized into four architectural layers. Each
layer has strict dependency rules enforced by tests on every commit.

## The four layers

### Layer 1: Domain-neutral foundation

These packages implement the graph language, Build state machine, compiler infrastructure and
Runtime ports. They are reusable by any domain — not just video — and have no dependency on Text,
Script, Seedance, Film or any video concept.

```text
@svml/protocol              immutable wire contracts
@svml/artifact              domain-neutral content-addressed byte type
@svml/core                  Demand compiler and Build state machine
@svml/source                mandatory Source Header
@svml/elaborator            author declarations and Fragment expansion
@svml/realization           typed realization overlays
@svml/run                   syntax-neutral Run Graph
@svml/validation            semantic admission
@svml/host                  Host-facing interfaces
@svml/compiler-node         reference Node compiler Host
@svml/workspace-fs-node     workspace filesystem abstraction
@svml/component-kit         Producer/validator registration
@svml/runtime               Scheduler and Store ports
@svml/runtime-adapter       deployment-adapter ABI
@svml/runtime-adapter-node  project-root resolution
@svml/endpoint-kit          Endpoint registration
@svml/driver-node           trusted Node command executor
@svml/package-loader-node   byte-locked package loading
@svml/store-sqlite          SQLite Build/Operation stores
@svml/artifact-store-fs     filesystem Artifact store
@svml/artifact-store-s3     S3 Artifact store
@svml/credential-store-env  environment credentials
@svml/transport             invocation seams
@svml/transport-process     local process transport
@svml/transport-aws-lambda  Lambda transport
@svml/local                 SQLite/filesystem developer assembly
```

### Layer 2: Author language

Author-facing vocabulary: the text Frontend, Script Surface, SVS Recipes, Run text Frontend and
reusable compilation libraries.

```text
@svml/text                  official .svml markup Frontend
@svml/script                Script Surface
@svml/svs                   SVS Recipe Frontend
@svml/run-text              official .svrun Frontend
@svml/prompt-kit            declarative prompt compilation
@svml/compiler-text-node    Text Frontend + Surface Host assembly
```

### Layer 3: Video domain

Video-specific types, generation model families, speech/caption/track contracts and composition.
Depends on Layer 1 and 2 but not on any Provider.

```text
@svml/contracts             Narrative, Track, Composition contracts
@svml/media                 media types
@svml/generation            image/video product contracts
@svml/model-kit             model family abstractions
@svml/seedance              Seedance model family + author Surface
@svml/seedance-speaker      Seedance Speaker binding
@svml/minimax-h3            MiniMax H3 model family
@svml/gemini-omni           Gemini Omni model family
@svml/grok-imagine          Grok Imagine model family
@svml/gpt-image             GPT Image model family
@svml/nano-banana           Nano Banana model family
@svml/seedream              Seedream model family
@svml/estimate              duration estimation
@svml/speech-program        speech program compilation
@svml/speech-take           atomic speech take
@svml/speech-align          speech alignment
@svml/whisperx              WhisperX component
@svml/caption               caption planning and Track
@svml/caption-gemini        Gemini caption planner
@svml/broll                 B-roll Track
@svml/text-track            text overlay Track
@svml/film                  Film composition
@svml/hyperframes           HyperFrames Visual IR
@svml/hyperframes-render    HyperFrames rendering component
@svml/image-transform       image processing component
@svml/media-pipeline        media inspection/normalization
```

### Layer 4: Provider (Endpoint) packages

Privileged external capabilities. Depend on Runtime ports and the model families they serve, never
on the CLI.

```text
@svml/provider-kie                  KIE generation (16 model capabilities)
@svml/provider-media-local          local ffprobe/ffmpeg
@svml/provider-whisperx-local       local WhisperX sidecar
@svml/provider-google-vertex        Vertex Gemini caption planning
@svml/provider-hyperframes-local    local Chrome rendering
@svml/provider-image-opencv-local   local OpenCV image transforms
```

### Application layer

```text
@svml/cli           generic command engine (requires explicit Distribution)
@svml/video-cli     video command application (selects Text compiler, no built-in author packages)
```

## Dependency rules

`tools/package-boundaries.test.mjs` enforces three invariants on every commit:

1. **Acyclic production graph.** No dependency cycle among any `@svml/*` packages.

2. **Domain-neutral closure.** Every Layer 1 package's transitive closure contains only Layer 1
   packages. `@svml/core` depends only on `@svml/protocol`.

3. **CLI independence.** Neither `@svml/cli` nor `@svml/video-cli` transitively depends on any
   Provider package. The video CLI also does not depend on any author-level video package
   (`@svml/script`, `@svml/seedance-speaker`, `@svml/broll`, `@svml/text-track`, `@svml/film`).
   Author packages are activated through the explicit package lock, not compile-time CLI
   dependencies.

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
  "name": "@svml/example",
  "version": "0.0.0-dev",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "svml": {
    "activation": "./src/activation.ts"
  },
  "dependencies": {
    "@svml/protocol": "workspace:*"
  }
}
```

- `"exports"` points to TypeScript source directly. The workspace `tsconfig.v2.json` maps
  `@svml/*` imports to source entry points via `paths`.
- `"svml.activation"` is the entry point that the Package Loader reads when this package is
  byte-locked. It must default-export a `NodePackageContribution`.

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
| `runtime` | Scheduler, Store implementation | persistence, scheduling | Runtime Profile |

A source `<import>` activates only author facets. It never grants network, filesystem, process,
credential or queue authority.

## Package locking

SVML uses byte-locked trusted code execution. The loader records each package's name, version and
SHA-256 digest:

```json
{
  "format": "svml.node-package-lock@1",
  "artifacts": [
    {
      "name": "@svml/seedance",
      "version": "0.0.0-dev",
      "digest": "sha256:abc123..."
    }
  ]
}
```

Two independent lock closures serve different authority scopes:

| Lock file | Contains | Identity scope |
|---|---|---|
| `svml.packages.lock` | Frontends, Surfaces, Producers, Validators | Author Graph + Run Graph + execution Program Closure |
| `svml.runtime-packages.lock` | Providers, Stores, transports | Runtime Closure |

Changing a package requires regenerating the lock. The Build state machine verifies every digest
before issuing a Command.
