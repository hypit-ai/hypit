---
title: Adding an Author Package
description: Step-by-step guide for adding a new author-level component.
---

# Adding an Author Package

An author package extends the video vocabulary with a new component. Authors use it through
`<import>` and XML elements in their `.svml` source. No change to Core, the CLI or any aggregate
package is needed.

## 1. Create the package

```bash
mkdir -p packages/my-component/src packages/my-component/test
```

## 2. Write package.json

```json
{
  "name": "@narratage/my-component",
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
    "@narratage/protocol": "workspace:*",
    "@narratage/elaborator": "workspace:*",
    "@narratage/markup": "workspace:*"
  }
}
```

Add only the dependencies your package actually imports. See
[Package architecture](./packages.md) for layer rules.

## 3. Define the Module Manifest

In `src/index.ts`, declare your Module's identity, Types and Producers:

```typescript
import type { ModuleManifest, ModuleRef } from "@narratage/protocol";

export const myComponentModuleRef: ModuleRef = {
  name: "@narratage/my-component",
  version: 1,
};

export const myComponentManifest: ModuleManifest = {
  module: myComponentModuleRef,
  types: [ /* your nominal Types */ ],
  producers: [ /* your deterministic Producers */ ],
};
```

Types are nominally owned by Modules. Core does not maintain a central union of every domain
type — installing a new package can add a new Type without a Core release.

## 4. Implement the Surface handler

The Surface handler decodes the Markup Frontend's XML elements into typed author declarations.

```typescript
// src/surface.ts
import type { MarkupSurfaceDecoder } from "@narratage/markup";

export const decodeMyComponentSurface: MarkupSurfaceDecoder = (element, context) => {
  // Read attributes and children from the XML element
  // Validate inputs
  // Emit typed Records and Operations into context
  // Return authored graph declarations
};
```

Look at existing Surface implementations for reference:
- `packages/seedance/src/surface.ts` — Prompt, Speech and Video Surfaces
- `packages/caption/src/surface.ts` — the common Program Surface; concrete Style/Track Surfaces live in Style-family packages
- `packages/media-track/src/surface.ts` — Track, Item and Sequence Surfaces

## 5. Write the activation descriptor

```typescript
// src/activation.ts
import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  myComponentManifest,
  myComponentModuleRef,
  decodeMyComponentSurface,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/my-component",
  modules: [{
    manifest: myComponentManifest,
    specifiers: ["@narratage/my-component", "@narratage/my-component@1"],
  }],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: myComponentModuleRef,
      surface: "my-widget",
      mode: "structured",
      implementationDigest: "sha256:...",
      handler: decodeMyComponentSurface,
    }),
  ],
};

export default svmlPackage;
```

The `specifiers` array lists the strings that an `<import from="..."/>` will match against. The
`surface` string determines the XML element prefix (`<mine:my-widget>` when imported as `mine`).

## 6. Register in tsconfig.json

Add the path mapping so TypeScript resolves `@narratage/my-component` to source:

```json
"@narratage/my-component": ["packages/my-component/src/index.ts"]
```

## 7. Install and lock

```bash
pnpm install --frozen-lockfile

node --run narratage -- lock-packages <lock-file> \
  --package @narratage/my-component \
  [--package @narratage/other-direct-package ...] \
  --package-root .
```

Only name direct packages you chose. Exact logical Module dependencies declared by their Manifests
are added from the installed physical dependency closure automatically; missing or ambiguous
providers make lock creation fail.

For an existing lock, add only this direct package without repeating the other selections:

```bash
node --run narratage -- lock-packages <lock-file> \
  --add @narratage/my-component \
  --package-root .
```

Use `--remove` for an explicit revocation, `--refresh` to accept changed bytes for the unchanged
selection, and `--verify` for a read-only closure check. Repeated `--package` always means the exact
complete direct selection.

## 8. Use in Author Source

```xml
<?svml using="@narratage/markup@1"?>
<svml>
  <import as="mine" from="@narratage/my-component@1"/>

  <mine:Widget id="demo" during={story.selection.example}/>
</svml>
```

The `<import>` activates only author vocabulary. It never grants network, filesystem or credential
authority.

## Existing examples to study

| Package | What it demonstrates |
|---|---|
| `packages/seedance/` | Model family with multiple Surfaces (Prompt, Speech, Video) |
| `packages/seedance-speaker/` | Higher-level binding that composes Script, a Text Template and Seedance |
| `packages/caption/` | common Program, Cue/field contracts and whole-Atom timing |
| `packages/caption-fine/` | one field-free Style and Track Surface family |
| `packages/media-track/` | Track with Item/Sequence, layer, motion and handoff behavior |
| `packages/typography-track/` | Typography overlay Track |
| `packages/film/` | Composition target that consumes peer Tracks |
