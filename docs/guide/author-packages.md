---
title: Adding an Author Package
description: Step-by-step guide for adding a new author-level component.
---

# Adding an Author Package

An author package extends the video vocabulary with a new component. Authors use it through
`<import>` and XML elements in their `.svml` source. No change to Core, the CLI or any aggregate
package is needed.

## Public ids for Style-like Surfaces

When a Surface publishes a Style-like value, its public record is the bare authored id (`${id}`),
not `${id}.style` or `${id}.value`. Author Source then references it with the bare id, for example
`style={board-style}`. Suffixes such as `.track` remain appropriate for separate Track outputs; they
must not be added to the Style record merely to describe its role.

## 1. Create the package

```bash
mkdir -p packages/my-component/src
```

Create it inside the video project. Use the owner's package scope; `@hypit/*` belongs to the active
Distribution.

## 2. Write package.json

```json
{
  "name": "@your-studio/my-component",
  "version": "0.0.0-dev",
  "private": true,
  "type": "module",
  "files": ["dist", "preview", "README.md"],
  "exports": { ".": "./dist/index.js" },
  "hypit": {
    "activation": "./dist/activation.js"
  },
  "devDependencies": {
    "hypit": "^0.1.0",
    "typescript": "^5.9.0"
  }
}
```

The package uses public `hypit/*` subpaths while it is developed and publishes only its own compiled
files. See [Package architecture](./packages.md) for layer rules.

## 3. Define the Module Manifest

In `src/index.ts`, declare your Module's identity, Types and Producers:

```typescript
import type { ModuleManifest, ModuleRef } from "hypit/author-kit";

export const myComponentModuleRef: ModuleRef = {
  name: "@your-studio/my-component",
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
import type { StructuredSurfaceHandler } from "hypit/author-kit";

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

Declare a `preview` for every Surface a reader should recognise at a glance in Studio's timeline or
in a catalogue: the poster. A poster is a designed picture, not a frame of output. It says what the
component *is* in the most abstract, most recognisable form the small space allows, the way a film
poster is not a screenshot of the film: `@hypit/ranking`'s Column poster is a column of rank badges
beside a column of icons; its Tier board is lettered rows with icons. Draw it as an SVG committed
beside the package, rasterise it to the PNG the manifest names under `preview/`, and keep it stable
while the component's look evolves. Skip it for a Surface with nothing to show, such as one that only
assembles a request.

`appearance` and `preview` answer different questions and neither replaces the other. `appearance`
says what the element draws in every case; the poster says what the element is for.

The fixture's manifest is the canonical small vocabulary example. For a close sibling, read that
package's own README and vocabulary first, then only the role files needed for the changed behavior.
`hypit vocabulary <package>` prints the installed declarations; author from that output rather than
from another package's source.

## 6. Write the activation descriptor

```typescript
// src/activation.ts
import { createMarkupSurfaceHostFacet } from "hypit/author-kit";
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
`@your-studio/my-component@1` without a duplicate alias declaration. Use optional `specifiers` only
when the package intentionally owns a genuinely different logical alias. The Surface declaration
determines the accepted tag (`<mine:Widget>` when imported as `mine`). It is a Markup Host facet,
not part of the semantic Module Manifest or Core.

## 7. Build the package

```bash
pnpm build
```

Use `hypit/author-kit` for the framework-facing declarations and the relevant public domain subpaths,
such as `hypit/composition`, for the values the component consumes or produces. The active
Distribution supplies those same APIs while loading the compiled activation; the component tarball
does not bundle a second copy of Hypit.

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
  <import as="mine" from="@your-studio/my-component@1"/>

  <mine:Widget id="demo" during={story.selection.example}/>
</svml>
```

The `<import>` activates only author vocabulary. It never grants network, filesystem or credential
authority.

The fixture deliberately uses explicit role filenames so a new author does not need to infer the
architecture from a large production package.

## 10. Keep or share the same package

Creating this package is ordinary production work. While it belongs only to the current video, keep
it private under that project's `packages/`. When its owner wants another project to use it, compile
the same package and either send a versioned `npm pack` tarball or publish it under the owner's npm
scope or private registry. The consumer installs the chosen release with its package manager and
commits the resulting lockfile; the logical Module import remains unchanged while that interface is
compatible.

For a public release, remove `private: true` and add ordinary npm discovery and ownership metadata:

```json
{
  "description": "A speech-timed score strip for Hypit videos.",
  "keywords": ["hypit", "hypit-author-package", "scoreboard"],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/studio/score-strip.git"
  },
  "license": "MIT"
}
```

Its README should include a copyable Source example, public outputs, visual evidence of the component,
and the Hypit release used to check it. After installation, `hypit vocabulary <package>` reads the
selected release's own Surface declarations. Package discovery, publication, versions and integrity
remain with npm or the selected private registry; Hypit loads the package only when Source imports
one of its logical offers.

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
the returned `records`, `components` and `fragments` to the same `SurfaceDecodeOutput`. Because those
projections publish records that other Surface code may reference, the declaration's `outputs` must
include every generated public type (`TemporalInstantSpec`, `TemporalWindowSpec`, `TemporalInstant`
and `TemporalWindow`) in addition to the component's own records and terminal Track. The minimal
fixture's temporal helper shows the two packages and the attribute vocabulary without requiring a
business package source read.

Producer ports are exact, not variadic: the keys supplied by a Fragment operation must match the
Manifest's `inputs`, `outputs` and `needs` exactly. For a variable number of child items, emit one
operation per item and feed those operations into an append/merge Producer with fixed named ports;
do not invent an `items[]` port that the Manifest did not declare.

### Less-common literal shapes

These details are part of the public vocabulary metadata and are easy to miss:

```typescript
children: [{ tag: "Row", cardinality: "many", summary: "Rows in display order." }];
attributes: [{ name: "appearance", kind: "reference", required: true, summary: "Recipe sheet.",
  recipe: [{ name: "accent", required: true, summary: "Colour for the active row.", values: ["red", "blue"] }] }];
```

`cardinality` and recipe-property `required` are mandatory. A validator receives the stored wrapper,
so unwrap an inline value before inspecting it:

```typescript
handler: ({ value }) => {
  if (value.kind !== "inline") throw new Error("Widget must be inline");
  if (typeof value.value !== "object" || value.value === null) throw new Error("Widget is empty");
}
```

When a component input refers to an authored Record, use `{ kind: "record", id: "record.id" }`;
`space.ref` is a resolved reference, not the literal input shape. A temporal projection stores its
resolved frame range at `window.span` (`startFrame` and `endFrameExclusive`), not beside the window.
Media slots are Fragment inputs carrying a Blob Artifact; child elements and recipe properties belong
in the Surface vocabulary, while deterministic rendering belongs in the Producer. Keep parent nesting
and animation in the sealed `VisualElement` (`parent`, `order`, `animation.keyframes`) rather than
inventing package-specific fields.

```typescript
// A child can be nested under a parent and animate an admitted local style.
const panel = { id: "panel", kind: "box", order: 0, style: [] };
const label = {
  id: "label", parent: "panel", kind: "text", order: 1, style: [],
  text: "A", fonts: [fontArtifact],
  animation: { keyframes: [
    { atFrame: 0, style: [{ name: "opacity", value: 0 }] },
    { atFrame: 12, style: [{ name: "opacity", value: 1 }] },
  ] },
};
```

The exact `fontArtifact` fields are shown by `inspect_visual_schema`; use a real Blob Artifact in
`sources`, with an explicit weight and style. The important boundary is that parent links, child
cardinality, recipe properties, slot inputs and animation are declared explicitly and validated by
their owning layer.
