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

The list and the forms are read from the manifests, so a module that declares a
Producer emitting a `VisualTrack` appears on its own.

## Controls

A module annotates a field with `format` to say what the value means:

| Format | Control |
|---|---|
| `color` | Swatch beside a text box. Type the value to set alpha: `#RRGGBBAA`. |
| `unit-fraction` | Slider plus a number box |
| `multiline` | Text area |
| `digest` | File picker |
| `duration` | Number box, in seconds |

## Media

A `format: "digest"` field takes a file, hashed as you pick it. Components that
draw supplied footage — B-roll, speaker footage — draw nothing until you choose
one.

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
