# `@hypit/producer`

The minimal host-neutral SDK for trusted deterministic Producers. A package exports enumerable
Producer facets; Type-owner validation is independently owned by `@hypit/refinement`. Both identities
are data: an exact nominal reference plus handler. Hosts enumerate them without running an opaque
`install()` callback.
Producer handlers receive only the
Core command, Producer identity and immutable typed inputs.

They receive no ResourceStore, credentials, network client, queue or Runtime infrastructure. Work that
needs those authorities must emit an explicit Need and be implemented by a separately selected
Provider package's Endpoint instance. `@hypit/executor` implements the structural registrar but is not part of this
SDK.

This is dependency inversion, not a sandbox. Until components run in an isolated Worker, selected
JavaScript packages remain trusted code and may still possess ambient authority from their process.

## Wiring a project Author Package

A component normally lives in the video's `packages/` and is installed through that project's
ordinary package manager. Use the owner's scope, such as `@studio/score-strip`; the active
Hypit project publishes under `@hypit/*`. A Source imports the package's logical Module ABI, for example
`<import as="score" from="@studio/score-strip@1"/>`. That `1` is not its npm release version.

External Author Packages use the released Distribution's narrow public subpaths. There is no central
Author Kit; import only the owner of each responsibility:

| Owner | Interface |
| --- | --- |
| `@hypit/hypit/protocol` | Module manifests and serializable graph identities |
| `@hypit/hypit/producer` | deterministic Producer handlers and Producer package facets |
| `@hypit/hypit/refinement` | package-owned Type refinements and Refinement package facets |
| `@hypit/hypit/author` | syntax-neutral Author Declarations, compilers and sealed Graph Fragments |
| `@hypit/hypit/markup` | Markup spelling for package-owned Author Declarations |
| `@hypit/temporal` | exact duration, rate and relation values and literal parsing |
| `@hypit/timeline-author` | authored absolute Clock, Timeline, Window and Instant construction |
| `@hypit/composition` | peer Track values and renderer-independent visual representation |
| `@hypit/studio-companion` (optional, in Companion code) | editor Item projection, Inspector bindings and executed temporal lineage |

The Author Package keeps `@hypit/hypit` as its framework development dependency. A package that
contributes a Companion also declares `@hypit/studio-companion` as a development dependency. It
compiles its activation to JavaScript and publishes only its own files. The active Distribution
supplies these APIs at execution, so a component does not carry a second Core or choose its own
framework version. This
package remains the deterministic-handler owner; the public subpaths do not create a second package
format or a facade that claims to own every kind of author extension.

An ESM package names its activation entry in `package.json`, for example
`"hypit": { "activation": "./dist/activation.js" }`. The built files, preview assets and package
dependencies must actually be included. A TypeScript entry can be used when the selected development
Host supports it; a compiled JavaScript entry avoids depending on a TypeScript loader.

The activation module connects the implementation pieces; this is a wiring excerpt, assuming the
local Manifest, Producer/Refinement packages, declaration compilers and Markup spellings already exist:

```ts
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { authorDeclarations } from "./declaration.js";
import { manifest, moduleRef } from "./manifest.js";
import { markupDeclarations } from "./declaration.js";
import { component } from "./component.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest }],
  facets: [
    createProducerPackageFacet(component.producers ?? []),
    createRefinementPackageFacet(component.refinements ?? []),
    ...authorDeclarations.map(createAuthorDeclarationFacet),
    ...markupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: moduleRef, declaration,
    })),
  ],
};
export default hypitPackage;
```

The Author compiler owns fields, children, accepted reference Types, bindings and graph lowering.
Markup owns only the tag and syntax projection into that declaration. A direct API or another Frontend
can construct the same declaration without importing Markup.

Structured handlers return `records`, `components` and optionally explicit `exports`; each component
directly carries the Graph Fragment it instantiates.
A resolved input contains its nominal `type` and graph `ref`; only authored values necessarily carry
an inline `record`. A future generated image has a reference, not image bytes available during
Source compilation. Decode Recipes or Styles from inline authored values, and retain produced
inputs as graph edges.

Component output mappings use **Fragment export name → public Source name**. If a Fragment exports
`track`, the mapping is ``outputs: { track: `${id}.track` }``; choosing another public name does not
rename the Fragment port. The Manifest's Producer ports, Fragment wiring and handler output names
must agree for that operation.

Read the closest installed implementation for the behavior being authored: Emoji Reveal for a
persistent event-driven strip, Visual Track for sampling and transitions, Caption Fine for a
schedule/render split. Their package-local files supply concrete patterns without requiring a
monorepo checkout. A new component owns its own mechanics, not a fork of the framework loader or
Runtime.

## Optional Studio presentation

A component can render through the ordinary Track protocol without custom editor behavior. When it
needs meaningful timeline Items or Inspector fields, put a Companion in a separate file and
merge `createStudioTrackCompanionFacet(companions)` into the same activation's `facets`.
Retain the existing Module, Producer, Author Declaration and Markup spelling contributions. The selected project's package
supplies the extension; do not edit Studio's registry or add editor metadata to the domain Manifest.

The [Studio Companion README](../studio-companion/README.md) owns the working declaration and activation
example. Expose any required deterministic schedule/program values through actual declaration outputs,
and retain the real temporal input edges. The Companion describes those facts and writable Source
parameters; it neither renders the video nor performs Source filesystem writes.
