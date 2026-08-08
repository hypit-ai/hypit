# Component playground

Look at a visual component without running a Build.

```bash
pnpm playground
```

Pick a component, fill in its parameters, and it renders on a canvas of the size
you choose. Or browse to a `.svs` stylesheet: every Recipe in it becomes its own
preview, and the `film` Recipe fills in the frame size.

## What it actually renders

The real thing. Each adapter converts form values into its package's own Program
type and calls that package's renderer — `renderCaptionTrack`,
`renderTextTrack`, `compileBrollProduct`, `projectSpeechVisual` — then
`compileHyperframesDocument` produces the same document a Build would render.
Those functions are pure and import nothing from `node:`, which is what lets
them run in a browser at all.

Nothing here validates. The packages' own `seal*` and `assert*` functions are
the judge, because they are what a real Build runs. A rejected value shows the
compiler's own message beside the form and leaves the last good frame up.

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

## Adding a component

One file in `src/registry/`, one entry in `src/registry/index.ts`. Declare the
parameters as a `ValueSchema` and the form is generated; return `Track[]` from
`build` and the shell owns the canvas, the ProgramSpace and the seal.

If the component reads an SVS Recipe, copy its key set from the Surface handler
and add the pair to `tools/playground-registry.test.mjs`, which reads the
literal back out of the source and fails if the two drift. Recipes are matched
by exact property key set, never by path prefix — `caption.dialogue` and
`caption.short-cues` share a prefix and describe unrelated things.

## Known divergences from a real render

- Fonts lower to a plain CSS `font-family` string. The production
  `FontArtifactRef` path with hashed `@font-face` families is not exercised,
  because `renderCaptionTrack` and `renderTextTrack` do not attach one.
- Audio tracks are not played.
- `speech.full` in the golden stylesheet has no preview because no Surface in
  the compiler reads it; `projectSpeechVisual` takes no appearance at all.
