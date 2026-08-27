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
  types: [{ name: "Widget" }, { name: "WidgetProgram" }],
  capabilities: [],
  producers: [{
    name: "render-widget",
    inputs: [{ name: "space", type: { module: { name: "@hypit/program-space", version: "1" }, name: "ProgramSpace" } }],
    outputs: [{ name: "track", type: { module: myComponentModuleRef, name: "WidgetTrack" } }],
    needs: [],
  }],
};

export const myComponentMarkupSurfaces = [{
  name: "widget",
  tag: "Widget",
  mode: "structured",
  outputs: [{ module: myComponentModuleRef, name: "Widget" }],
  vocabulary: { /* see step 5 */ },
}] as const;
```

Types are nominally owned by Modules. Core does not maintain a central union of every domain
type — installing a new package can add a new Type without a Core release.

## 4. Implement the Surface handler

The Surface handler decodes the Markup Frontend's XML elements into typed author declarations.

```typescript
// src/surface.ts
import type { StructuredSurfaceHandler } from "@hypit/markup";

export const decodeMyComponentSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const id = textAttribute(element, "id");
  const space = resolveReference(referenceAttribute(element, "space"));
  if (space === undefined) throw new Error("Widget.space cannot be resolved");
  const record: SurfaceRecordDraft = {
    id: `${id}.value`, type: widgetTypes.widget,
    value: { kind: "inline", value: { id } }, range: element.range,
  };
  const fragment = sealGraphFragment({
    inputs: [{ name: "space", type: programSpaceTypes.programSpace }],
    operations: [{ id: "render-widget", producer: widgetProducers.render,
      inputs: { space: { kind: "fragment-input", name: "space" } },
      result: { kind: "output", name: "track" } }],
    exports: [{ name: "track", type: compositionTypes.visualTrack,
      root: { kind: "fragment-operation", operation: "render-widget" } }],
  });
  const component: SurfaceComponentDraft = {
    id, fragment: fragment.id, inputs: { space: space.ref },
    outputs: { track: `${id}.track` }, range: element.range,
  };
  return { records: [record], components: [component], fragments: [fragment], exports: [`${id}.value`, `${id}.track`] };
};
```

[Component Anatomy](./component-anatomy.md) names every role a component package fills and points to
the minimal fixture's corresponding role, so a new package does not need to inspect a business package.

For a generic package, use the complete fixture at
`examples/minimal-author-package/packages/example-component/` rather than copying an unrelated
business package. A package whose vocabulary is structurally the same as an installed sibling may
use that sibling's README and only the necessary role files as an implementation skeleton; create a
new Module identity and do not edit the sibling.

## 5. Declare the Surface vocabulary and its preview

`vocabulary` is how the element explains itself. Authors read it, and so does every tool that
inspects installed packages instead of reading source. A Surface without it is legal and invisible:
whoever meets your element next has only the tag name to go on.

```typescript
// src/manifest.ts
import { readFile } from "node:fs/promises";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

vocabulary: {
  summary: "One sentence naming what this element produces and what it is placed on.",
  appearance: "What a viewer actually sees, including how it enters, holds and leaves.",
  preview: previewImage("Widget.png"),
  attributes: [
    { name: "id", kind: "identifier", required: true, summary: "Names this Widget." },
  ],
  children: [ /* accepted child elements */ ],
  ports: [ /* declared edges */ ],
  example: "<mine:Widget id=\"first\"/>",
  notes: [ /* rules a reader would otherwise have to discover by failing */ ],
}
```

Declare a `preview` for every Surface whose result a reader needs to see to understand it. That is
not only Surfaces producing a `VisualTrack`: `@hypit/speech-track` declares one for its SemanticTrack
because its shape is easier to see than to describe. Skip it for a Surface with nothing to show, such as one
that only assembles a request.

`appearance` and `preview` answer different questions and neither replaces the other. `appearance`
says what the element draws in every case; the preview shows one honest instance of it.

The fixture's manifest is the canonical small vocabulary example. For a close sibling, read that
package's own README and vocabulary first, then only the role files needed for the changed behavior.

### Producing the preview image

The preview is a real frame of your own component, rendered locally. Nothing generates it for you,
and a mock-up drawn by hand is worse than no preview at all, because it claims to be output.

Render the fixture's preview Source with `hypit-reference-video-tools render_previews`. For a new
package, use the same package-owned preview Source and keep one representative rendered frame. The
sequence is:

1. build the Track value with your package's own render function, over a sealed ProgramSpace;
2. `sealComposition({ id, canvas, tracks })`, then `compileHyperframesDocument(composition, space)`
   from `@hypit/hyperframes`;
3. `materializeHyperframesHtml(document, resolve)` into a temporary directory, where `resolve` maps
   each declared Artifact — fonts, images — to a local file;
4. run the pinned HyperFrames CLI's `render` on that directory with a PNG-sequence output, resolved
   through `@hypit/provider-hyperframes-local`;
5. keep one frame that shows the component in a representative state, and commit it under
   `preview/`.

The alternative is a narrow `.svrun` Target rendered by the local HyperFrames Provider, then one
frame taken with `ffmpeg`. That is a Build; it needs a Runtime Profile, and it is the heavier route.

Choose a frame mid-behaviour rather than at rest. A preview of an element that has not entered yet,
or has already settled into a static end state, shows the least useful thing about it.

## 6. Write the activation descriptor

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

## 7. Declare package dependencies

```json
"dependencies": {
  "@hypit/protocol": "workspace:*"
}
```

pnpm workspace links resolve the package. No root path registry is involved.

## 8. Install

```bash
pnpm install --frozen-lockfile
```

The package manager owns installation, versions and integrity. Hypit loads the package when an
Author or Run Source imports one of its logical offers. Exact Module dependencies declared by its
Manifest are loaded from its installed dependencies.

## 9. Use in Author Source

```xml
<?svml using="@hypit/markup@1"?>
<svml>
  <import as="mine" from="@hypit/my-component@1"/>

  <mine:Widget id="demo" during={story.selection.example}/>
</svml>
```

The `<import>` activates only author vocabulary. It never grants network, filesystem or credential
authority.

The fixture deliberately uses explicit role filenames so a new author does not need to infer the
architecture from a large production package.

## The complete literal shapes

The fixture is the authoritative small example. These are the same object shapes in abbreviated
form; there is no need to inspect a business package to discover them.

```typescript
const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

const fragment = sealGraphFragment({
  inputs: [{ name: "space", type: programSpaceTypes.programSpace }],
  operations: [{
    id: "render-widget", producer: widgetProducers.render,
    inputs: { space: input("space") },
    result: { kind: "output", name: "track" },
  }],
  exports: [{ name: "track", type: compositionTypes.visualTrack, root: operation("render-widget") }],
});

// A structured Surface always returns these four collections. `exports` is optional.
const decoded: SurfaceDecodeOutput = {
  records: [{ id: "widget.value", type: widgetTypes.widget,
    value: { kind: "inline", value: { id: "widget" } }, range: element.range }],
  components: [{ id: "widget", fragment: fragment.id, inputs: { space: space.ref },
    outputs: { track: "widget.track" }, range: element.range }],
  fragments: [fragment],
  exports: ["widget.value", "widget.track"],
};
```

For temporal elements, the Surface side is `@hypit/temporal-markup`, not the graph-side
`@hypit/temporal` module. Use `createTemporalWindowProjection` or
`createTemporalInstantProjection` with the element, semantic reference and resolver, then append
the returned `records`, `components` and `fragments` to the same `SurfaceDecodeOutput`.
