# Component playground

Look at a visual component without running a Build.

```bash
pnpm playground
```

Pick a producer, fill in its inputs, and it renders on a canvas of the size you
choose. Browse to a `.svs` stylesheet and its Film Recipe fills in the frame.

## It lists nothing

There is no registry here, and no per-component code. Everything comes from
what the compiler already declares about itself:

| Question | Answered by |
|---|---|
| Which modules can be previewed | manifests declaring a Producer whose output type is `@narratage/composition.VisualTrack` |
| What each needs | that Producer's `inputs`, each a `TypeRef` |
| What shape each input has | the declaring module's `TypeDeclaration.schema` |
| What a control should look like | `ValueSchema.format` — `color`, `unit-fraction`, `multiline`, `digest`, `duration` |
| What to start from | `TypeDeclaration.default`, given by the module that owns the type |
| How to run it | the module's `component.producers[].handler` |

A module that gains a visual Producer appears here on its own. One that loses
it disappears. Neither requires editing anything in this directory.

Nothing here validates, either: `validateStoredValue` and the modules' own
`seal*` and `assert*` functions are the judge, because they are what a real
Build runs. A rejected value shows the compiler's own message beside the form
and leaves the last good frame up.

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

## Making a module previewable

Nothing to add here. In the module: declare a Producer that outputs a
`VisualTrack`, give each input type a `schema`, and give it a `default` where
you honestly can. A type carrying content-addressed media has no default — say
nothing rather than inventing a digest, and the playground will ask the operator
for a file instead.

Annotate a field with `format` where its type alone is ambiguous: a colour and
a font family are both strings, and only the module knows which is which.

## Known divergences from a real render

- Fonts lower to a plain CSS `font-family` string. The production
  `FontArtifactRef` path with hashed `@font-face` families is not exercised,
  because `renderCaptionTrack` and `renderTextTrack` do not attach one.
- Audio tracks are not played.
- The frame domain is the shell's, not the form's: a `ProgramSpace` input is
  filled from the canvas controls, so there is only one place to change it.
