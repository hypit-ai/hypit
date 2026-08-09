---
title: Package Architecture
description: The four layers, dependency boundaries, package anatomy and facets.
---

# Package Architecture

Workspace packages under `packages/` are organized into four architectural layers. Each layer has
strict dependency rules enforced by tests on every commit.

## The four layers

### Layer 1: Domain-neutral foundation

These packages implement the graph language, Build state machine, compiler infrastructure and
Runtime ports. They are reusable by any domain — not just video — and have no dependency on Text,
Script, Seedance, Film or any video concept.

```text
@narratage/protocol              immutable wire contracts
@narratage/artifact              domain-neutral content-addressed byte type
@narratage/core                  Demand compiler and Build state machine
@narratage/source                mandatory Source Header
@narratage/elaborator            author declarations and Fragment expansion
@narratage/run                   syntax-neutral Run Graph
@narratage/validation            semantic admission
@narratage/host                  Host-facing interfaces
@narratage/compiler-node         reference Node compiler Host
@narratage/workspace-fs-node     workspace filesystem abstraction
@narratage/component-kit         Producer/validator registration
@narratage/runtime               Scheduler and Store ports
@narratage/runtime-adapter       deployment-adapter ABI
@narratage/runtime-adapter-node  project-root resolution
@narratage/endpoint-kit          Endpoint registration
@narratage/driver-node           trusted Node command executor
@narratage/package-loader-node   byte-locked package loading
@narratage/store-sqlite          SQLite Build/Operation stores
@narratage/artifact-store-fs     filesystem Artifact store
@narratage/artifact-store-s3     S3 Artifact store
@narratage/credential-store-env  environment credentials
@narratage/transport             invocation seams
@narratage/transport-aws-lambda  Lambda transport
@narratage/local                 SQLite/filesystem developer assembly
```

### Layer 2: Author language

Author-facing vocabulary: the text Frontend, Script Surface, SVS Recipes, Run text Frontend and
reusable compilation libraries.

```text
@narratage/text                  official .svml markup Frontend
@narratage/script                Script Surface
@narratage/svs                   SVS Recipe Frontend
@narratage/run-text              official .svrun Frontend
@narratage/prompt-kit            declarative prompt compilation
@narratage/compiler-text-node    Text Frontend + Surface Host assembly
```

### Layer 3: Video domain

Video-specific types, generation model families, speech/caption/track contracts and composition.
Depends on Layer 1 and 2 but not on any Provider.

```text
@narratage/media                 media types
@narratage/narrative             authored narrative products
@narratage/program-space         exact frame/sample domain
@narratage/generation            image/video product contracts
@narratage/model-kit             model family abstractions
@narratage/seedance              Seedance model family + author Surface
@narratage/seedance-speaker      Seedance Speaker binding
@narratage/minimax-h3            MiniMax H3 model family
@narratage/gemini-omni           Gemini Omni model family
@narratage/grok-imagine          Grok Imagine model family
@narratage/gpt-image             GPT Image model family
@narratage/nano-banana           Nano Banana model family
@narratage/seedream              Seedream model family
@narratage/estimate              duration estimation
@narratage/speech                shared speech products
@narratage/speech-basis          generated speech A/V product
@narratage/speech-evidence       acoustic evidence products
@narratage/semantic-map          authored-token timing map
@narratage/speech-alignment      speech alignment
@narratage/speech-spine          ordered speech-take compilation
@narratage/whisperx              WhisperX component
@narratage/caption               caption planning and Track
@narratage/caption-gemini        Gemini caption planner
@narratage/media-track           unified Media Item/Sequence Track
@narratage/text-track            text overlay Track
@narratage/film                  Film composition
@narratage/composition           peer Track composition
@narratage/visual-ir             renderer-neutral visual vocabulary
@narratage/hyperframes           HyperFrames document compiler
@narratage/render-hyperframes    explicit HyperFrames rendering component
@narratage/image-transform       image processing component
@narratage/media-pipeline        media inspection/normalization
@narratage/media-execution       shared ffmpeg execution body for Providers
```

### Layer 4: Provider (Endpoint) packages

Privileged external capabilities. Depend on Runtime ports and the model families they serve, never
on the CLI.

```text
@narratage/provider-kie                  KIE generation (16 model capabilities)
@narratage/provider-media-local          local ffprobe/ffmpeg
@narratage/provider-whisperx-local       local WhisperX service
@narratage/provider-google-vertex        Vertex Gemini caption planning
@narratage/provider-hyperframes-local    local Chrome rendering
@narratage/provider-hyperframes-aws-lambda recoverable distributed rendering
@narratage/provider-image-opencv-local   local OpenCV image transforms
@narratage/provider-media-aws-lambda     synchronous AWS media execution
```

### Application layer

```text
@narratage/cli           generic command engine (requires explicit Distribution)
@narratage/video-cli     video command application (selects Text compiler, no built-in author packages)
```

## Dependency rules

`tools/package-boundaries.test.mjs` enforces three invariants on every commit:

1. **Acyclic production graph.** No dependency cycle among any `@narratage/*` packages.

2. **Domain-neutral closure.** Every Layer 1 package's transitive closure contains only Layer 1
   packages. `@narratage/core` depends only on `@narratage/protocol`.

3. **CLI independence.** Neither `@narratage/cli` nor `@narratage/video-cli` transitively depends on any
   Provider package. The video CLI also does not depend on any author-level video package
   (`@narratage/script`, `@narratage/seedance-speaker`, `@narratage/media-track`, `@narratage/text-track`, `@narratage/film`).
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
  "name": "@narratage/example",
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
    "@narratage/protocol": "workspace:*"
  }
}
```

- `"exports"` points to TypeScript source directly. The workspace `tsconfig.json` maps
  `@narratage/*` imports to source entry points via `paths`.
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
      "name": "@narratage/seedance",
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
