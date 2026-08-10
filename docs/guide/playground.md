---
title: Component Playground
description: Previewing a visual component without running a Build.
---

# Component Playground

Seeing what a caption or an overlay looks like normally costs a whole Build:
Author Source, Run Source, a Runtime Profile, generation, alignment, render. The
playground renders one component on its own, in a browser, in milliseconds.

```bash
pnpm playground
```

Then open `http://localhost:5178`. Nothing else is needed — no Runtime Profile,
no credentials, no local services.

## What you see

| Control | What it does |
|---|---|
| Component list | Every module that can put pixels on a frame |
| W / H / fps / sec / bg | The canvas, the frame domain and the clear colour |
| Input forms | One per input the component takes |
| Scrubber | Frame-exact; the counter shows `frame / last` |

The preview runs the installed modules' real Producer handlers and compiles the
same document a Build would render.

The list and the structural forms are read from public manifests, so a module
that declares a Producer emitting a `VisualTrack` appears on its own.

## Hard boundary

Two rules are permanent:

1. The Playground is a consumer of the system, never an author of system
   semantics. Production Protocol, Core and domain packages contain no
   Playground defaults, UI hints, fixtures, facets or preview helpers.
2. The Playground maintains no component, Recipe, Story, Scenario or example
   registry and defines no parallel source format. A startup command may select
   packages and ordinary SVML/SVS/Run sources for that session; selection is not
   a central catalog.

The generic form uses only facts the production contract already needs:
schema kinds, enums and numeric bounds. Canvas size, duration, frame rate,
background and blank form values are local session state owned by this tool.
If the Playground later needs richer controls or fixtures, they must be added
inside `tools/playground`; a production package must not change for that reason.
Likewise, examples remain normal project sources rather than entries in a
Playground-owned registry.

## Media

Content-addressed media is currently entered as an existing digest. The generic
form deliberately does not reinterpret an arbitrary production string as a file
picker.

## When something is wrong

A rejected value shows the compiler's own message under the canvas and leaves
the last good frame on screen, so you can read the error and the picture
together.

## Known divergences from a real render

- Fonts lower to a plain CSS `font-family` string. The production
  `FontArtifactRef` path with hashed `@font-face` families is not exercised.
- Audio tracks are not played.
- A `ProgramSpace` input is filled from the canvas controls rather than offered
  in a form.

See [`tools/playground/README.md`](https://github.com/cashdiffusion/svml/blob/main/tools/playground/README.md)
for how the timeline shim works and what a module must declare to be
previewable.
