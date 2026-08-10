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
| W / H / fps / sec | The canvas and the frame domain |
| Appearance from a stylesheet | Adopt a `.svs` Film Recipe's background |
| Input forms | One per input the component takes |
| Scrubber | Frame-exact; the counter shows `frame / last` |

The preview uses the installed modules' real Producer handlers. For example,
Fine Caption, Media Track, Screen Overlay, Speech Basis and Typography Track
all lower to `VisualTrack`, then `compileHyperframesDocument` produces the same
document a Build would render.

## It lists nothing

The playground has no list of components. It reads the manifests and offers
every module that declares a Producer whose output type is `VisualTrack`. Add a
module that emits one and it appears; stop emitting one and it disappears.

Everything else is read the same way:

| Question | Answered by |
|---|---|
| What a component needs | that Producer's `inputs` |
| What shape each input has | the declaring module's `TypeDeclaration.schema` |
| What to start from | that type's `TypeDeclaration.default` |
| What a control looks like | `ValueSchema.format` |

So a caption's `mode` is a dropdown because its schema declares an `enum`, and
its `display` is a text area because the field is `format: "multiline"`. Neither
is configured here.

## Formats

`format` is how a module says what a value means when its type alone is
ambiguous — a colour and a font family are both strings.

| Format | Control |
|---|---|
| `color` | Swatch beside a text box. The text is authoritative, because `#RRGGBBAA` carries alpha a swatch cannot. |
| `unit-fraction` | Slider plus a number box |
| `multiline` | Text area |
| `digest` | File picker |
| `duration` | Number box, in seconds |

`color` and `digest` have an exact shape, so `validateStoredValue` enforces
them. The others describe without narrowing.

## Media

A `format: "digest"` field takes a file. The playground hashes it with SHA-256
and registers a real content-addressed identity, because a compiled document
cross-checks every Artifact reference and would reject a stub.

Modules that draw supplied footage — B-roll, speaker footage — therefore have no
default: a module has no bytes to point at, so it says nothing rather than
inventing a digest. Until you choose a file those components draw nothing, which
is a state to pass through and not an error.

## Stylesheets

Choosing a `.svs` file reads **only its Film Recipe**, and only for Film
appearance. Point it at `examples/talking-film-golden/studio.svs` and the
preview adopts that Recipe's background. Canvas dimensions and time remain
explicit preview-environment controls.

Nothing else in the sheet is read. What a component looks like comes from the
module that owns it, not from a stylesheet the playground happened to open.

## When something is wrong

Nothing in the playground validates. The modules' own `seal` and `assert`
functions are the judge, because they are what a real Build runs. A rejected
value shows the compiler's own message under the canvas and leaves the last good
frame on screen, so you can read the error and the picture together.

## Known divergences from a real render

- Fonts lower to a plain CSS `font-family` string. The production
  `FontArtifactRef` path with hashed `@font-face` families is not exercised.
- Audio tracks are not played.
- A `ProgramSpace` input is filled from the canvas controls rather than offered
  in a form, so there is only one place to change the frame domain.

See [`tools/playground/README.md`](https://github.com/cashdiffusion/svml/blob/main/tools/playground/README.md)
for how the timeline shim works and what a module must declare to be
previewable.
