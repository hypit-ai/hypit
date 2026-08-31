# Develop an author package for the project

Use this workflow only after proving that no legal composition of installed packages expresses the
required behavior. A similar-looking tag is insufficient when its declared Types, timing or output
behavior differs. Never write an unknown tag before its package exists.

## Know what the element has to look like before deciding the package's shape

Whatever settles that is the contract, and it is read before the first line of the package — not
assumed, not remembered, not rediscovered halfway. Which document settles it depends on where the
package came from:

- **From a reference video**, the evidence for the element this package owns lives in the shot
  observations (`type:` and `visual:` for its text and picture, `persistent_systems` for its
  whole-reference life) and the word-level transcript. Read them.
- **From a description**, nothing external settles it, so it is settled by decision: the answers the
  author froze and the appearance values written down before the sources were. `original-authoring/route.md`
  requires both. A value nobody wrote down is one this package will be asked for later and will not
  have.

Then write out, one line each, every appearance property that contract states — the typeface
character, the weights, the mix of faces, the colours, the stroke, the shadow, the motion, the
timing. A package whose declared vocabulary cannot express one of those lines is wrong before it is
written: widen the package until it carries every one of them. There is no acceptable shortfall —
a stated property is either expressed by the package or the package is not done. A
stated property silently dropped is how a title that runs two typefaces ends up as a
package that draws one font, and the round cannot repair what the package cannot express.

## Write `package.json` and the activation first

Write those two before any implementation. If the package has third-party npm dependencies, use the
project's package manager once; otherwise no install step is needed. Leaving activation until the end
means discovering at the end that nothing is selected — a failure that looks like broken code and is
not. Everything after them is specific to this component and cannot be copied from anywhere.

If the package exposes a Style-like Surface, publish the Style record under the bare authored id
(`id`) and have Source refer to that bare id. Do not invent `${id}.style` or `${id}.value` for the
Style record; reserve suffixed ids for genuinely separate outputs such as Tracks.

## Required reading

**Read this whole file first.** The rules that decide what the package is — read the observation
before shaping it, a media slot is an input port, the package draws its own chrome, the Types are
frozen before parallel writing — are in this file, and they apply before any other reading.

Then read:

1. `../../../../docs/guide/component-anatomy.md` — the roles every component package fills. Read this
   first; it is what the rest is measured against.
2. `../../../../docs/guide/author-packages.md`
3. `../../../../docs/guide/packages.md` and `../../../../docs/guide/conventions.md`
4. the installed `@hypit/component-kit` README

**Write the package from those docs.** They state each role, what it declares and what it hands the
next one, and that is what a new package is built out of. Author every file yourself against them:
the Manifest, the Types, the Surface and decoder, the Producers, the Fragment.

**What a Producer that draws may return is a command, not a package to read.**

```
hypit-reference-video-tools inspect_visual_contract
```

It answers the questions a component is written against — which element kinds exist, which style
names are admitted on them, which of those take an enum, how few keyframes an animation carries, and
the rules the seal enforces about parents, `order` and interpolation. Add
`--producers-of @hypit/temporal` for the Producers a Fragment calls to turn a Script name into a
window. `@hypit/temporal-markup` is different: it owns the Surface-side
`createTemporalWindowProjection`, `createTemporalInstantProjection`, and the corresponding
attribute vocabularies. Every line is generated from the Composition schema and the Modules
themselves, so it says what will be accepted rather than what one package happened to do.
`inspect_svml_vocabulary` answers the other half: what a Source may write.

When `inspect_svml_vocabulary` finds no close structural sibling, write from these documents and the
minimal fixture at `examples/minimal-author-package/packages/example-component/`. Do not read an
unrelated business package to discover generic API shapes. If the public contract still leaves a
required shape undefined, record the missing shape and its effect in route state, then continue with
the closest bounded interpretation supported by the visible contract. Do not invent an undeclared
binding or silently treat the gap as resolved. After the route has finished, report the
Skill/documentation gap with the package/module and version, exact command and checkout commit,
missing Type/Surface/Producer field, complete inspection output, expected authoring shape, and the
smallest Source demonstrating the gap. A binding such as `<id>.audio` absent from both the README and
inspection output is reported this way.

There is one deliberate exception. If vocabulary inspection proves that an installed package has the
same input/output Types, timing contract, terminal Track and Surface ports, and only the Style,
layout, Recipe or renderer policy differs, use the **close-sibling path**: read that package's README
and only the role files needed for the change, copy the structure into the project package, and
replace its Module identity, nominal Types, Producer names, activation and README. Never edit or
reuse the sibling's identity. A new Caption family may follow this path from the closest Caption
family while reusing the common `@hypit/caption` contract. Similar names or similar screenshots do
not qualify.

These four public signatures are a quick index. The complete object shapes, including literal
Fragment and Manifest ports and the full Surface return value, are in the minimal fixture:

| From | Signature |
|---|---|
| `@hypit/elaborator` | `sealGraphFragment(fragment: Omit<GraphFragment, "format" \| "id">): GraphFragment` |
| `@hypit/composition` | `sealVisualTrack(value: Omit<VisualTrack, "kind">): VisualTrack` |
| `@hypit/component-kit` | `ProducerHandlerContext` — `{ command: InvokeProducerCommand; producer: ProducerRef; inputs: Readonly<Record<string, TypedRecord>> }` |
| `@hypit/markup` | `SurfaceDecodeOutput` — `{ records, components, fragments, exports? }`; `SurfaceResolvedReference` carries `path`, `ref`, `type` and an optional `record` |

A filled media slot arrives in `inputs` as the `BlobRef` itself, not wrapped inline the way an
authored value is, so read its `mediaType` off the Artifact rather than assuming what the slot's name
suggests.

## Decoder and runtime value shapes

The Style decoder receives a decoded recipe as `{ path, properties }`: `path` is the authored recipe
id and `properties` is the canonical property map. A resolved authored reference may expose its
record; only read an inline value after checking `record.value.kind === "inline"`, then use
`record.value.value`. Never infer a value from the reference path.

The temporal-markup helpers take one object `{ id, subjectId?, element, semantic, resolveReference }`
and return `records`, `components`, `fragments` and a component-output `ref`. The resulting
`TemporalInstant` has `{ id, subjectId, source, projection, authority, frame }`; a
`TemporalWindow` has `{ id, subjectId, start, end, span }`, where each endpoint is a
`TemporalInstant` and `span` has `startFrame` and `endFrameExclusive`.

`SpatialFrame` uses `xPx`, `yPx`, `widthPx` and `heightPx`; `ProgramSpace` provides `id`,
`narrativeId`, `durationSec` and `frameRate` (`numerator` and `denominator`). A `fonts:Stack` Surface publishes a
`FontStackRef`; pass that same record to a Visual IR text element's `fonts` field.

## Package boundary

Place the package at `<project>/packages/<slug>/`, named in the project's own scope such as
`@my-project/<slug>`, with physical
version `0.0.0-dev` and logical Module version `1`. Only create a new package: do not
edit, extend, delete or overwrite an existing Hypit package to fill the gap.

The directory and package name may use any valid, descriptive slug; do not add a `local-` prefix
just to identify where the package was created. The package README documents its public contract,
syntax, inputs, outputs and preview. It does not need to say that the package is temporary,
project-level or otherwise describe its provenance.

The package it stands beside is untouched. A Style family that differs from `caption-fine` in its
timing model, or a board that differs from `ranking` in its rows, installs as a sibling: its own
Module ref, its own name for every nominal Type it declares, since a Type belongs to the Module that
declares it, and its own Producer names. The official packages are built for exactly this —
`caption-fine` states that Common Caption, Composition and Core know none of its Recipe fields or
layout policy, and `deck-track` that another Deck family can install independently and lower to the
same terminal `VisualTrack` without changing it. A sibling family is the designed extension point,
not a workaround.

Read "modelled on the installed packages" that way wherever it appears: the same role in the same
place in the graph, written for this component from the anatomy the guide states.

The project is never the Hypit Distribution. Do not move a local package into an official package
automatically. After the result is accepted, offer promotion as a separate contribution.

The component reaches Studio's generic Track fallback until its project adds a companion package,
for example `@my-project/<slug>-studio`, to the project's `hypit.studio.json`. That companion owns
only Studio interpretation and operations through `hypit.studio-adapter@1`; it never edits
`packages/studio`, and the author package never imports Studio. A generic block is valid while no
special interpretation is needed.

Know what that fallback gives it, because it is enough for a lot of packages. A project-local Track
producing a `VisualTrack` lands in the generic `role: "track"` lane when no companion claims the
Module. Studio draws it in a flat media lane and exposes five timing
parameters — `start`, `end` and `for` writable, `during` and `at` read-only — over a read-only
interaction: the block can be selected and seeked, not dragged or trimmed. A companion package is
what buys anything past that: parameters named for what the component actually has, child entities,
and a lane laid out the way it is shaped.

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

Choose raw versus structured Surface, timing dependencies, ProgramSpace, Frame, SemanticTrack,
Artifact, Recipe and output Types from the observed behavior and the anatomy the guide states. A
declaration-only or Surface-only package is incomplete.

For variable child counts, emit one child operation per child and chain those fixed-port results
through an append Producer (`previous`, `item` → `set`). Do not add an undeclared `items[]` input or
let a handler consume arbitrary children; every child must be represented by a sealed operation.

The fixture's `exampleAppendFragment` and `append-example-items` Producer are the runnable reference:
each operation has exactly `previous` and `item` inputs and returns `set`, so the returned set can be
fed into the next operation. The empty set is an ordinary typed Record. The handler never accepts
undeclared variadic input.

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
  hypit image --prompt "the surface this component draws on" \
    --to <project>/packages/<slug>/assets/paper.png
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
- **The element kind follows the Artifact, not the slot.** A picture slot holds an image when the
  document built one and a video when a Run satisfied it with footage, and which of those arrives is
  not something the slot's name settles. Hard-code `kind: "image"` and the component builds for
  whichever half of that the author did not choose. Decide from the Artifact's `mediaType` and the
  same code serves both.
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
- Produce that image with `hypit-reference-video-tools render_previews <package-dir>`. It keeps the
  package-owned preview SVML, SVS and SVRun on the standard preview-mock/Producer path, then seeks the
  middle frame of the target Present's longest stable interval in the fixed local browser. It does
  not render a complete PNG sequence; when no interval is stable for two frames, it uses the middle
  frame of the longest Present.

For a media slot, declare an Artifact Fragment input. Producer inputs are `TypedRecord`s: inspect
`inputs.media.value`; a filled slot is a BlobRef (`kind === "blob"`), while an authored structured
value is under `kind === "inline"`. Branch on BlobRef `mediaType` (`image/*` or `video/*`) when
choosing the Visual IR element, and still draw the empty frame/cell when no material is supplied.
`hypit image` is a direct, billed HypiHub image-model call (default `@hypit/gpt-image`, credential
`HYPIHUB_API_KEY`; get a key at [hypit.ai](https://hypit.ai)); it does not use a project Runtime Profile, Build or Run Source. Obtain approval
before using it and reserve it for package-owned chrome.

```typescript
handler: ({ inputs }) => {
  const media = inputs.media?.value.kind === "blob" ? inputs.media.value : undefined;
  const kind = media?.mediaType.startsWith("video/") ? "video" : "image";
  return { outputs: { track: output(renderSlot(kind, media)) }, needs: {} };
}
```

## Freeze the Types before writing in parallel

The nominal Types and the Manifest are what every other file agrees with, so write them first and
stop changing them. Once they are frozen, the value layer, the Style decoder and the renderer depend
on the Types rather than on each other and can be written in any order or at the same time. The
Surface, the Producer handlers and the Fragment follow, because they wire what those three produce.

Do not start that parallel stretch while a Type is still in question. Interface drift mid-flight
costs more than the ordering saves, and the symptom — a Producer rejecting a value that looks right —
is expensive to read.

## Install and validate

### Mechanical completion gate

Before Source can be considered authored, run:

```bash
hypit-reference-video-tools validate_local_author_packages --run <path/to/build.svrun> [--runtime <hypit.runtime.json>]
```

When the Run contains `build-record` pins, pass the same Runtime Profile used by the Build. The
validator opens that profile read-only so it can resolve accepted Records while compiling the Run;
otherwise a valid project package may be reported as imported but unused.

Every project-owned author package under `<project>/packages/` must expose a non-empty Manifest, at least one
Markup Surface and at least one Producer. Its Surface decoder must expand to a real Graph Fragment with
operations and exports, and every Fragment operation Producer must belong to the package's own Module.
Run-fragment host facets are required only by packages that explicitly provide Run-side replacements such
as preview mocks; an author package is not required to expose one. The Run's compiled Graph must contain
an operation from that package, and the Author Source must import and use its Surface. An import without
use, a marker-only package, or a package replaced by a similar official component fails with a
machine-readable diagnostic. If no gap exists, do not leave an unused package in the project.
`validate_local_author_packages` discovers these package directories from
their manifests; the directory name is not a validation signal.

The Host resolves the explicitly selected physical package name directly at
`<project>/packages/<package-basename>/` and supplies official `@hypit/*` imports from the read-only
tool Distribution. The `@hypit/*` namespace is reserved for that active Distribution; a project uses
its own npm scope and cannot shadow official ABI packages with a same-named dependency. A project
does not join Hypit's workspace and needs no npm link merely to expose
one of its own packages. Use the project's own package manager only when its package genuinely adds
third-party npm dependencies. Do not modify the Hypit Distribution, hide packages under `.hypit/` or
invent another loader.

Repair in this order:

1. package/workspace resolution;
2. activation contribution;
3. Manifest, Producer, Type and Validator agreement;
4. Surface vocabulary and decoding;
5. implementation behavior;
6. source usage.

A package that cannot be *wired* is not done. `hypit check` proves the Source is legal, and nothing
more; it will not tell you that the track a package produces cannot be traced to a Film at all. Run
the preview check — it checks every Source the Run reaches, then proves the graph traces — and repair
until it passes. A graph failure is not a difference to weigh, it is work that is not finished, and it
is not bounded by the round's attempt ceiling:

```bash
hypit-reference-video-tools preview_check path/to/build.svrun
```

If a mandatory gate itself appears defective, do not read or modify Distribution source and do not
silently continue. Record the exact command, complete error, project/package/run digest and the
reason the failure is attributable to the gate in a durable waiver evidence file:

```json
{
  "waived": true,
  "gate": "package_ready",
  "diagnosis": "validator selected a transitive package instead of the project package",
  "command": "validate_local_author_packages --run build.svrun",
  "error": "<complete error>",
  "package_digest": "<sha256>",
  "run_digest": "<sha256>"
}
```

Checkpoint that evidence as a controlled waiver (or use `blocked` when no maintainer decision is
available):

```bash
hypit-reference-video-tools route_state --action checkpoint --project-root <project> --route <route> \
  --state package-ready --status complete --artifacts '{"package_ready":".hypit/evidence/gate-waiver.json"}' \
  --error "<exact gate error>" --decision "gate waiver recorded with reproducible diagnosis"
```

The waiver is visible in route state and remains subject to maintainer review; it preserves the
evidence without weakening package boundaries. Use `--status blocked` instead when continuation is
not explicitly authorized, and resume only after the gate is fixed or a decision is recorded.

It takes the Run Source, not the `.svml`. `preview.md` says why this spelling rather than the
`hypit-preview-check` bin: the subcommand honours `--package-root`, which is what a project-local
package needs when the Run is not at the project root. A pass here means the graph reaches a Film and
a semantic spine; it passes while the Providers are still unrun, and says which capabilities it is
waiting on. See `preview.md` for what that does and does not prove — notably, a
Producer that refuses the media kind it is handed is not caught here, because nothing is handed to
it until the Build runs.

Do not continue to final authoring until the package and sources pass the existing checks and the
graph traces.

When the result is accepted, `package-promotion.md` says how to judge whether the package should
outlive this one video and what promoting it costs.
