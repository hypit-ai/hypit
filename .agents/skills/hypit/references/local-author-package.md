# Develop a project-local author package

Use this workflow only after proving that no legal composition of installed packages expresses the
required behavior. A similar-looking tag is insufficient when its declared Types, timing or output
behavior differs. Never write an unknown tag before its package exists.

## Required reading

Read all of these completely before editing:

1. `docs/guide/author-packages.md`
2. `docs/guide/packages.md`
3. `docs/guide/conventions.md`
4. `packages/component-kit/README.md`
5. The closest existing package's README, `manifest.ts`, `surface.ts`, `component.ts`, and
   `activation.ts`
6. `docs/guide/component-anatomy.md`, which names the roles every component package fills and where
   each one lives. The implementation section below requires a renderer, a Fragment and the lowering
   between them, and none of those are in the five files above — reading only those five means
   discovering the shapes by failing.
7. In the closest existing package, the files filling the roles that anatomy names. Their filenames
   differ per package — `ranking` calls them `schedule.ts` and `render.ts`, `media-track` calls them
   `program.ts` and `lower.ts`, `comment-sticker` calls them `program.ts` and `author.ts` — so find
   them by what they export, not by name.

Read item 5's files in full. Read item 7's for their shapes: how a Program becomes elements, where
timing is resolved, what the Fragment declares. They are long, and copying one package's specifics is
a worse outcome than understanding its structure.

## Package boundary

Create a new package at `<project>/packages/local-<slug>/` named `@hypit/local-<slug>`. Use physical
version `0.0.0-dev` and logical Module version `1`. Only create a new package: do not edit, extend,
delete or overwrite an existing Hypit package to fill the gap.

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
- Produce that file outside the graph. Call the image provider's HTTP API directly with the
  credentials already in the environment, or use any equivalent tool, and save the bytes into the
  package. A package asset is authoring input, not the output of anybody's video: it is never a
  Target, never a Record, and never a reason to write a Run Source. Writing one to obtain it is the
  mistake this section exists to prevent.
- Only pictures that differ between videos are input ports: photographs, screenshots, thumbnails,
  product shots, character images.
- Never require an input the installing project has no reason to choose. If a Run Source exists only
  to produce the component's own texture, the texture is in the wrong place.
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

Use existing `--workspace` or `--package-root` options only when the project layout requires them.
Do not continue to final authoring until the package and sources pass the existing checks.
