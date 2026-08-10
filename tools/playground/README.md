# Component playground

Look at a visual component without running a Build.

```bash
pnpm playground
```

Pick a producer, fill in its inputs, and it renders on a canvas whose size,
frame rate, duration and background you choose.

[The guide page](../../docs/guide/playground.md) covers using it. This file
covers how it works.

## Where everything comes from

There is no registry here and no per-component code. Each answer is read at run
time:

| Question | Answered by |
|---|---|
| Which modules can be previewed | manifests declaring a Producer whose output type is `@narratage/composition.VisualTrack` |
| What each needs | that Producer's `inputs`, each a `TypeRef` |
| What shape each input has | the declaring module's `TypeDeclaration.schema` |
| How to run it | the module's `component.producers[].handler` |

A module that gains a visual Producer appears here on its own; one that loses it
disappears. Neither requires editing anything in this directory.

Nothing here validates. `validateStoredValue` and the modules' own `seal*` and
`assert*` functions are the judge, since they are what a real Build runs. A
rejected value shows the compiler's own message beside the form and leaves the
last good frame up.

## Two things a Build supplies that the document does not

`compileHyperframesDocument` emits a page that is self-contained but not
self-sufficient — a real render supplies a producer for the rest. The shim in
`src/preview/runtime-shim.ts` stands in for it:

- **Size.** The composition root carries `data-width` / `data-height` as data,
  not as layout. Unsized it computes to zero height, and `overflow: hidden`
  clips every Present away.
- **Timeline.** Every clip is marked visible and every animation starts at load.
  The shim gates each Present to its span and seeks its animations with
  `getAnimations()` plus an explicit `currentTime` — the same technique the
  production renderer uses.

## Dependency boundary

The dependency is one-way: the Playground may consume public production
contracts, but production contracts and packages contain no Playground
defaults, form hints, fixtures or preview helpers.

To become discoverable, a module only declares its real Producer, ports and
structural input schemas. The Playground creates blank form state and its own
canvas, duration, frame rate and background locally. Those values are UI session
state, not SVML semantics.

The generic form uses only schema kinds, enums and numeric bounds. A richer
editor or fixture system must be implemented inside this tool; it must not make
a production package change merely to improve a preview.

## Known divergences from a real render

- Fonts lower to a plain CSS `font-family` string. The production
  `FontArtifactRef` path with hashed `@font-face` families is not exercised.
- Content-addressed media must currently be entered as an existing digest; the
  generic form does not infer that a string should be a file picker.
- Audio tracks are not played.
- A `ProgramSpace` input is filled from the canvas controls rather than offered
  in a form.
