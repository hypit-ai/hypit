---
title: Component Anatomy
description: The roles a component package fills, and how to find them in an existing package.
---

# Component Anatomy

Every component package fills the same set of roles. The filenames differ from package to package, so
find a role by what it exports, not by what its file is called. This page describes the roles;
[Adding an Author Package](./author-packages.md) is the step-by-step.

Read this instead of reading a neighbouring package end to end. One package's specifics are a worse
thing to copy than its structure.

## The roles

| Role | What it owns | Called |
|---|---|---|
| Manifest | Module identity, nominal Types, Producers, Surface declarations and their vocabulary | `manifest.ts`, sometimes `index.ts` |
| Types | The TypeScript shapes those nominal Types carry | `types.ts` |
| Value layer | `assert…`, `seal…` and `create…` for every authored value | `program.ts`, `schedule.ts` |
| Style decoder | One SVS Recipe plus exact fonts into a Style value | `author.ts`, `style.ts` |
| Renderer | A Program into the elements a Track presents | `lower.ts`, `render.ts`, `presentation.ts` |
| Surface | XML element into typed records and inputs | `surface.ts` |
| Producers | The deterministic handlers the Manifest declared, and Validators | `component.ts` |
| Fragment | The graph a Surface expands into: inputs, operations, outputs | `fragment.ts` |
| Activation | The host facets a Host installs | `activation.ts` |

Use `examples/minimal-author-package/packages/example-component/` for the canonical role layout.
Only when vocabulary inspection proves a close structural sibling should you inspect that sibling's
README and the specific role files you must adapt; do not compare unrelated business packages to
infer generic architecture.

## What each role must get right

**Types and Manifest are the contract.** Everything else agrees with them, so write them first and
stop changing them. A nominal Type belongs to your Module; Core keeps no central union, so adding one
needs no Core release.

**The value layer is where authored data becomes trustworthy.** Every value that crosses a boundary
gets an `assert…` that states what is wrong in the author's terms, and a `seal…` that canonicalises
it. A Producer that receives an unsealed value has no way to tell a mistake from a shape it has not
met. The fixture's value layer is the minimal pattern; a close sibling may be used as a bounded
implementation skeleton only after vocabulary inspection.

**The Style decoder reads a Recipe, not a stylesheet.** It takes one `SvsRecipe` and the exact fonts,
validates the keys it admits, and produces a Style value. Unknown keys fail; defaults are declared,
not implied. Use the fixture's decoder for the generic boundary, or the selected close sibling when
the new package intentionally extends that sibling's domain contract.

**The renderer turns a Program into elements and nothing else.** It resolves no timing of its own and
reaches into no other Track. Timing arrives already projected; placement arrives as a Frame.

**The Surface decodes one element.** It reads attributes and children, resolves references, pushes
typed records, and returns the graph declarations. It is the only place that knows the markup exists.

**The Fragment is the shape, not the work.** It declares which inputs the Surface supplies, which
operations run, and which outputs the element publishes. Producers do the work; the Fragment says how
they are wired.

## Assets a package ships

A component's own chrome — its paper, board, panel, texture or default backdrop — is a file inside
the package, read with `readFile(new URL("../assets/…", import.meta.url))`. So is the preview image
its Surface declares. Neither is an input the installing project supplies, and neither is produced by
a Build: use `hypit image` while authoring the package and commit the result.

A component that cannot draw itself without a Source supplying its background is the wrong shape.
The symptom is unmistakable — it imports cleanly and renders nothing.

## What does not belong in a component package

- Credentials, HTTP, queues or Provider selection. A model package owns request semantics only.
- Timing resolved from anything other than the ProgramSpace and SemanticMap it was given.
- Access to another Track's values.
- A field added to Core, Composition or Visual IR to make one component work.
