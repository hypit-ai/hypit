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
  "name": "@hypit/my-component",
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
    "@hypit/protocol": "workspace:*",
    "@hypit/elaborator": "workspace:*",
    "@hypit/markup": "workspace:*"
  }
}
```

Add only the dependencies your package actually imports. See
[Package architecture](./packages.md) for layer rules.

## 3. Define the Module Manifest

In `src/index.ts`, declare your Module's identity, Types and Producers:

```typescript
import type { ModuleManifest, ModuleRef } from "@hypit/protocol";

export const myComponentModuleRef: ModuleRef = {
  name: "@hypit/my-component",
  version: "1",
};

export const myComponentManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: myComponentModuleRef.name,
  version: myComponentModuleRef.version,
  dependencies: [],
  types: [ /* your nominal Types */ ],
  capabilities: [],
  producers: [ /* your deterministic Producers */ ],
};

export const myComponentMarkupSurfaces = [{
  name: "widget",
  tag: "Widget",
  mode: "structured",
  outputs: [ /* Types this syntax may author */ ],
  implementation: { digest: "sha256:..." },
}] as const;
```

Types are nominally owned by Modules. Core does not maintain a central union of every domain
type — installing a new package can add a new Type without a Core release.

## 4. Implement the Surface handler

The Surface handler decodes the Markup Frontend's XML elements into typed author declarations.

```typescript
// src/surface.ts
import type { StructuredSurfaceHandler } from "@hypit/markup";

export const decodeMyComponentSurface: StructuredSurfaceHandler = ({ element }) => {
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
import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import {
  myComponentManifest,
  myComponentMarkupSurfaces,
  myComponentModuleRef,
  decodeMyComponentSurface,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{
    manifest: myComponentManifest,
  }],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: myComponentModuleRef,
      declaration: myComponentMarkupSurfaces[0],
      handler: decodeMyComponentSurface,
    }),
  ],
};

export default hypitPackage;
```

The Module automatically offers its exact `manifest.name@manifest.version`, so authors import
`@hypit/my-component@1` without a duplicate alias declaration. Use optional `specifiers` only
when the package intentionally owns a genuinely different logical alias. The Surface declaration
determines the accepted tag (`<mine:Widget>` when imported as `mine`). It is a Markup Host facet,
not part of the semantic Module Manifest or Core.

## 6. Declare package dependencies

```json
"dependencies": {
  "@hypit/protocol": "workspace:*"
}
```

pnpm workspace links resolve the package. No root path registry is involved.

## 7. Install

```bash
pnpm install --frozen-lockfile
```

The package manager owns installation, versions and integrity. Hypit loads the package when an
Author or Run Source imports one of its logical offers. Exact Module dependencies declared by its
Manifest are loaded from its installed dependencies.

## 8. Use in Author Source

```xml
<?svml using="@hypit/markup@1"?>
<svml>
  <import as="mine" from="@hypit/my-component@1"/>

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
