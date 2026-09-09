# `@hypit/component-kit`

The minimal host-neutral SDK for trusted deterministic compute components. A package exports
enumerable Producer and Type-owner Validator facets. Both identities are data: an exact nominal
reference plus handler. Hosts enumerate them without running an opaque `install()` callback.
Producer handlers receive only the
Core command, Producer identity and immutable typed inputs.

They receive no ResourceStore, credentials, network client, queue or Runtime infrastructure. Work that
needs those authorities must emit an explicit Need and be implemented by a separately selected
Endpoint package. `@hypit/driver-node` implements the structural registrar but is not part of this
SDK.

This is dependency inversion, not a sandbox. Until components run in an isolated Worker, selected
JavaScript packages remain trusted code and may still possess ambient authority from their process.

## Wiring a project Author Package

A component normally lives in the video's `packages/` and is installed through that project's
ordinary package manager. Use the owner's scope, such as `@studio/score-strip`; the active
Distribution reserves `@hypit/*`. A Source imports the package's logical Module ABI, for example
`<import as="score" from="@studio/score-strip@1"/>`. That `1` is not its npm release version.

External Author Packages use the released Distribution's public subpaths. The small framework-facing
surface is `@hypit/hypit/author-kit`; domain values continue to come from their own owners:

| Owner | Interface |
| --- | --- |
| `@hypit/hypit/author-kit` | Module declarations, deterministic handlers, sealed Fragments and Markup Surface handlers |
| `@hypit/hypit/temporal-markup` | author-time semantic Window/Instant projection helpers |
| `@hypit/hypit/composition`, `@hypit/hypit/visual-ir` | peer Track values and renderer-independent visual representation |
| `@hypit/hypit/studio-adapter` (optional, in Companion code) | editor entity projection, Inspector bindings and executed temporal lineage |

The Author Package keeps one development dependency on `@hypit/hypit`, compiles its activation to
JavaScript, and publishes only its own files. The active Distribution supplies these subpaths at
execution, so a component does not carry a second Core or choose its own framework version. This
package remains the internal deterministic-handler owner; `@hypit/hypit/author-kit` is the deliberately
small public composition boundary, not a facade for every video domain.

An ESM package names its activation entry in `package.json`, for example
`"hypit": { "activation": "./dist/activation.js" }`. The built files, preview assets and package
dependencies must actually be included. A TypeScript entry can be used when the selected development
Host supports it; a compiled JavaScript entry avoids depending on a TypeScript loader.

The activation module connects the implementation pieces; this is a wiring excerpt, assuming the
local Manifest, ComponentPackage and Surface declarations/handlers already exist:

```ts
import { createMarkupSurfaceHostFacet } from "@hypit/hypit/author-kit";
import { manifest, moduleRef, surfaces } from "./manifest.js";
import { component } from "./component.js";
import { decodeTrack } from "./surface.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest }],
  components: [component],
  hostFacets: surfaces.map((declaration) => createMarkupSurfaceHostFacet({
    module: moduleRef, declaration, handler: decodeTrack,
  })),
};
export default hypitPackage;
```

If several Surfaces have different handlers, bind each declaration to its actual handler instead of
mapping them all to `decodeTrack`. Surface metadata is registered through the Markup Host facet;
it does not make Markup syntax part of the semantic Module Manifest.

Structured handlers return `records`, `components`, `fragments` and optionally explicit `exports`.
A resolved input contains its nominal `type` and graph `ref`; only authored values necessarily carry
an inline `record`. A future generated image has a reference, not image bytes available during
Source compilation. Decode Recipes or Styles from inline authored values, and retain produced
inputs as graph edges.

Component output mappings use **Fragment export name → public Source name**. If a Fragment exports
`track`, the mapping is ``outputs: { track: `${id}.track` }``; choosing another public name does not
rename the Fragment port. The Manifest's Producer ports, Fragment wiring and handler output names
must agree for that operation.

Read the closest installed implementation for the behavior being authored: Emoji Reveal for a
persistent event-driven strip, Media Track for sampling and transitions, Caption Fine for a
schedule/render split. Their package-local files supply concrete patterns without requiring a
monorepo checkout. A new component owns its own mechanics, not a fork of the framework loader or
Runtime.

## Optional Studio presentation

A component can render through the ordinary Track protocol without custom editor behavior. When it
needs meaningful timeline entities or Inspector fields, put a Companion in a separate file and
merge `createStudioTrackCompanionHostFacet(companions)` into the same activation's `hostFacets`.
Retain the existing Module, Producer and Surface contributions. The selected project's package
supplies the extension; do not edit Studio's registry or add editor metadata to the domain Manifest.

The [Studio Adapter README](../studio-adapter/README.md) owns the working declaration and activation
example. Expose any required deterministic schedule/program values through actual Surface outputs,
and retain the real temporal input edges. The Companion describes those facts and writable Source
parameters; it neither renders the video nor performs Source filesystem writes.
