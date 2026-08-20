# Develop a project-local author package

Use this workflow only after proving that no legal composition of installed packages expresses the
required behavior. A similar-looking tag is insufficient when its declared Types, timing or output
behavior differs. Never write an unknown tag before its package exists.

## Read the observation before deciding the package's shape

The observation is the contract, and it is read before the first line of the package — not assumed,
not remembered, not rediscovered halfway. In the reference-video route the evidence for the element
this package owns lives in the shot observations (`type:` and `visual:` for its text and picture,
`persistent_systems` for its whole-reference life) and the word-level transcript. Read them.

Then write out, one line each, every appearance property the observation states — the typeface
character, the weights, the mix of faces, the colours, the stroke, the shadow, the motion, the
timing. A package whose declared vocabulary cannot express one of those lines is wrong before it is
written: widen the package until it carries every one of them. There is no acceptable shortfall —
a property the observation states is either expressed by the package or the package is not done. A
stated property silently dropped is how a reference whose title runs two typefaces ends up as a
package that draws one font, and the loop cannot repair what the package cannot express.

## Write `package.json` and the activation first

Write those two before any implementation, run `pnpm install` once, and only then start on the
vocabulary. They are short and almost the same in every package, and leaving them until the end means
discovering at the end that nothing is linked — a failure that looks like broken code and is not.
Everything after them is specific to this component and cannot be copied from anywhere.

## Required reading

**Read this whole file first.** The rules that decide what the package is — read the observation
before shaping it, a media slot is an input port, the package draws its own chrome, the Types are
frozen before parallel writing — are in this file, and they apply before any other reading. Do not
jump to the closest package and start copying roles before these rules are in front of you; the
rules here are the contract, the closest package is only a shape to learn from.

Then read:

1. `docs/guide/component-anatomy.md` — the roles every component package fills, and how to find each
   one in an existing package. Read this first; it is what the rest is measured against.
2. `docs/guide/author-packages.md`
3. `docs/guide/packages.md` and `docs/guide/conventions.md`
4. `packages/component-kit/README.md`

Then open the closest existing package and read **the roles you are about to write**, not the package
end to end. Anatomy names them; find them by what they export, since the filenames differ — `ranking`
calls two of them `schedule.ts` and `render.ts`, `media-track` calls them `program.ts` and `lower.ts`,
`comment-sticker` calls them `program.ts` and `author.ts`.

Read for shape: how a Program becomes elements, where timing is resolved, what the Fragment declares.
Those files run to a couple of thousand lines between them, and copying one package's specifics is a
worse outcome than understanding its structure — which is what anatomy is for.

## Package boundary

Place the package at `<project>/packages/local-<slug>/`, named `@hypit/local-<slug>`, with physical
version `0.0.0-dev` and logical Module version `1`. Only create a new package: do not
edit, extend, delete or overwrite an existing Hypit package to fill the gap.

The package is project-local even when the project is the Hypit checkout. Do not move it into an
official package automatically. After the result is accepted, offer promotion as a separate
contribution.

## Complete implementation

The main agent writes all code. Gemini must not receive or produce TypeScript, `package.json`,
Manifest, Surface, Producer, Validator or activation syntax.

Implement the parts required by the behavior, including:

- `package.json`, exports, dependencies and `hypit.activation`;
- Module Manifest, nominal Types and Producers;
- required Validators and deterministic Component handlers;
- Markup Surface vocabulary and decoder;
- activation contribution;
- lowering, Fragment or renderer implementation needed to produce the declared output;
- README and a preview for each visual Surface.

Choose raw versus structured Surface, timing dependencies, ProgramSpace, Frame, SemanticMap,
Artifact, Recipe and output Types from the observed behavior and closest package architecture. A
declaration-only or Surface-only package is incomplete.

## The package draws itself

A package is installed vocabulary. `.svml`, `.svs` and `.svrun` are documents that use it. A package
that needs one of those documents in order to draw its own appearance has inverted that
relationship, and the symptom is unmistakable: the component imports cleanly and still shows
nothing.

- Chrome the component always shows — its paper, board, panel, ruled lines, texture, default
  backdrop — belongs to the package. Commit it as an ordinary file under the package and read it
  with `readFile(new URL("../assets/…", import.meta.url))`, the same way the Surface preview image
  is read. Generate it once while authoring the package if it does not exist.
- Produce that file with `hypit image`:

  ```bash
  hypit image --prompt "the surface this component draws on" --to packages/local-<slug>/assets/paper.png
  ```

  It writes a picture and nothing else — no Source, no Build, no Record, no Runtime Profile. A
  package asset is authoring input, not the output of anybody's video, so it is never a Target and
  never a reason to write a Run Source. Writing one to obtain it is the mistake this section exists
  to prevent.
- Only pictures that differ between videos are input ports: photographs, screenshots, thumbnails,
  product shots, character images.
- A media **slot** — a card, a board, a phone screen, a monitor, any box whose content varies — is
  an input port, not package content. It is declared as an attribute accepting the media type
  (`image`, `video`, `media`, `surface`), and the content that fills it comes from the document, not
  from the package. The frame is the component's; the content is not. A slot is a reusable input
  even though this one reference happens to show a particular picture in it: the same component
  serves a phone holding a screenshot or a video, a board holding two different inserts, because the
  slots are inputs and each document fills them. Writing the observed content into the package is
  the same failure as a missing inner picture, inverted: the frame was seen but the slot was closed.
  `media-track:Item` and the `icon` port on `@hypit/ranking` are the shape this takes.
- **A slot is a graph edge, not a value the Surface can read.** The package's own texture resolves at
  author time because it is a file the package ships; a slot holds whatever the document generated,
  which does not exist until the Build runs. A Surface that reaches for it the way it reaches for its
  own asset fails with the slot's value refusing to resolve during author compilation. Declare the
  slot as a Fragment input carrying the Artifact type, give the Producer that consumes it a second
  form for the case where the slot is filled, and read it from `inputs` as the Artifact it is —
  a blob input arrives as the `BlobRef` itself rather than wrapped inline like every authored value.
- **The element kind follows the Artifact, not the slot.** A picture slot holds an image once the
  document has built one and a stand-in *video* frame before it has, because that is what the
  Playground substitutes for an output nothing has produced yet. Hard-code `kind: "image"` and the
  component builds for nobody until the whole graph has run, which is the opposite of what a preview
  is for. Decide from the Artifact's `mediaType` and the same code serves both.
- Never require an input the installing project has no reason to choose. If a Run Source exists only
  to produce the component's own texture, the texture is in the wrong place.
- **A slot that is not filled yet costs its own cell and nothing more.** The component's structure —
  its rows, bars, frames, labels, the geometry it computes — is drawn whatever the slots turn out to
  hold. Draw the elements whose material is there, leave the ones whose material is not, and measure
  every cell either way so nothing moves when the rest arrive. A component that refuses to draw
  anything because one slot holds material it cannot use has made the whole composition depend on
  its most incomplete input, and the symptom reads as a dead Track rather than as a missing picture:
  the Producer refuses, the Track never builds, and the rows nobody was waiting for vanish with it.
  This is what a Source looks like for the whole stretch between being written and being built, which
  is most of its life.
- A component that cannot render on its own cannot produce the preview image its Surface owes. Treat
  a missing preview as evidence of this mistake rather than a step to skip.

## Freeze the Types before writing in parallel

The nominal Types and the Manifest are what every other file agrees with, so write them first and
stop changing them. Once they are frozen, the value layer, the Style decoder and the renderer depend
on the Types rather than on each other and can be written in any order or at the same time. The
Surface, the Producer handlers and the Fragment follow, because they wire what those three produce.

Do not start that parallel stretch while a Type is still in question. Interface drift mid-flight
costs more than the ordering saves, and the symptom — a Producer rejecting a value that looks right —
is expensive to read.

## Install and validate

Reuse an existing workspace when it already includes `packages/*`; otherwise make only the minimal
workspace/package changes required. Add the package as a normal `workspace:*` dependency and run
`pnpm install`. Do not hide it under `.hypit/`, modify the package loader or invent a registry.

Repair in this order:

1. package/workspace resolution;
2. activation contribution;
3. Manifest, Producer, Type and Validator agreement;
4. Surface vocabulary and decoding;
5. implementation behavior;
6. source usage.

Use only existing checks:

```bash
pnpm check
pnpm hypit check path/to/main.svml
pnpm hypit check path/to/studio.svs
pnpm hypit check path/to/build.svrun
```

A package that cannot be *seen* is not done. `hypit check` proves the Source is legal, and nothing
more; it will not tell you that the track a package produces fails to build when the Playground
renders it. Run the preview check and repair until it passes with no failures — a build failure is
not a difference to weigh, it is work that is not finished, and it is not bounded by the loop's
attempt ceiling:

```bash
# from the repository root: tsx is the repository's dependency
node --import tsx .agents/skills/hypit/scripts/preview-check.mjs path/to/main.svml path/to/build.svrun
```

Use existing `--workspace` or `--package-root` options only when the project layout requires them.
Do not continue to final authoring until the package and sources pass the existing checks and the
preview builds every track.
