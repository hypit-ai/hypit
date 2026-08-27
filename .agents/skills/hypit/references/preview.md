# See what you authored, without paying

Three ways to look at a Source before a Provider is ever reached: prove the graph traces, render one
element to a still, and open the whole Run for a person. They answer different questions, and none of
them costs a generation.

## The graph traces before anybody opens it

`hypit check` proves a Source is legal; it proves nothing about whether the tracks it declares can
actually be built. A Run that does not trace fails the same way the moment the author opens Studio —
a new package with a bad schedule, a target that is not an output, a Film with no traceable
composition. Find that now, not on the author's screen:

```bash
hypit-reference-video-tools preview_check /path/to/project/build.svrun
```

It takes the Run Source, not the Author SVML — Studio's unit of work is the Run, and it reads the
`.svml` back out of it.

The same check is also a bin of its own:

```bash
hypit-preview-check /path/to/project/build.svrun
```

Prefer the subcommand. It takes `--package-root <dir>`, which is where the packages the Source
imports are resolved from — a project's own `packages/local-<slug>/` are installed against the
project root, so name it there and the check reaches them from wherever you are standing. Without
the flag the working directory is used. The bare bin fixes the package root to the Run file's own
directory and takes no flags, so reach for it when the Run sits at the project root and you want the
prose summary rather than a JSON result.

Either one refuses when the graph itself is wrong, and names what refused — a target that is not a
Film or Render output of the current SVML, a Film with no traceable composition, a Film with no
`SemanticTake` / Speech Track chain. This is not a guessing problem: the error says what is wrong, and
you repair that. A graph that does not trace is not done, and **every failure it reports must be
repaired until the check passes**, however many attempts that takes.

**One refusal is a pass, and it is the one you will see most.** A Source that declares its generation
rather than performing it leaves the closure waiting on Providers, and Studio requires the whole
closure before it will open. That is the expected state of a Source nobody has built yet, not a defect
in it. When every issue is `the Studio projection closure requires unresolved capabilities: …`, the
graph traced all the way to a Film and a semantic spine, and what remains is work a Provider has to
do. The subcommand returns `"sound": true` with the capabilities under `awaiting`; the bin prints
them and exits zero:

```
preview-check: the graph is sound, waiting on 6 capabilities.
  - @hypit/seedance@1#seedance-2-mini
  - @hypit/whisperx@1#whisperx-alignment
  ...
```

Any other refusal means the graph is wrong and no amount of generation will fix it.

What this proves is that the graph is **wired**, not that every track **draws**. A Producer that
refuses the media kind it is handed is not caught here, because nothing is handed to it until the
Build runs.

## Render one element, locally

One element — a new component, one caption system, one inserted card — is drawn without a paid
Provider by `render_element`. This is the picture to reach for whenever one element has to be looked
at rather than the whole program, and rendering the delivery to inspect a single piece is the waste it
exists to prevent. `element-review.md` says how many of these to draw and what to do with them; this
section owns the command.

```bash
hypit-reference-video-tools render_element /path/to/project/build.svrun \
  --element <id> --segment <id>|--selection <id> --out <path>.mp4
```

It compiles the Author/Run Graph once, delegates preview substitutions to `@hypit/preview-mock`,
materializes ordinary mock Artifacts through `@hypit/mock-media`, and drives the package's deterministic
Producers. No mock file or SemanticTake is hand-authored in the project.

`--element` takes the element's bare id — `captions`, the `id=` the Source wrote on the element. The
command appends the output suffix itself when it looks for the track, so `--element captions.track`
matches nothing: it refuses with `the Source places no element named captions.track` and lists the
bare ids that are placed.

`--segment` and `--selection` take a Script name, never a timestamp. `--tokens from:to` takes a
half-open range of the Script's own words, which is what a stretch nobody named is written as — a
caption Cue ends at a speaker change, so it has a range and no id. Without any of the three, the whole
program is drawn. An `--out` ending `.mp4`, `.mov` or `.webm` writes the stretch as a clip; any other
extension writes one still from the middle of it.

A whole round is one call: `--batch <renders.json>`, an array of `{element, segment|selection|tokens,
out}` inheriting the Run, and the `renders` array `reconstruction_check` returns is exactly that.
**The program is drawn once for the whole round** and each entry is cut out of those frames, so asking
for eight windows costs one render and eight cuts. The picture does not depend on `--element` — it is
everything the Source places over those words — so two elements over one stretch share the render as
well.

Each Segment's length comes from the Source's own `estimate:Speech`; `--reference-id` selects reference
evidence and comparison windows only. The sidecar records `"timing_basis": "estimate"`.

Before reading the picture, run the route's `reconstruction_check` or `authoring_check` and keep its
`layout_geometry` object with the render. It is the mechanical Canvas/Frame report used to check centre
offsets, frame capacity, and Canvas containment; the observer still confirms rendered text bounds and
whether any bleed is intentional.

## Open the whole Run for a person

After a meaningful Author Source change, start Hypit Studio and give the author the actual URL.
Kill the previous server first so the user does not inspect a stale composition.

```bash
pkill -f "hypit-studio" || true
cd /path/to/project
hypit-studio --run build.svrun --runtime hypit.runtime.json &
```

Read the startup output for the chosen port. `--run` is required: Studio's unit of work is the Run
Source, and it reads the Author SVML back out of it. Pass `--runtime` only when the Author Source
reuses accepted Build records. `--workspace` selects the Source Workspace and defaults to the Run's
own directory, so pass it when the Run's relative Sources resolve against a different root.

Studio opens a Run whose material is satisfied. When a projection is missing it names the issue and
stops, so a Run that opens is a Run whose Tracks all resolved.

Contributor fixtures may provide a satisfied demonstration Run, but an ordinary installed
Distribution does not use its package directory as an author workspace.

## A timeline block retains its authored Selection

Studio keeps three stages of an item's time apart, and reading one for another misreads the program:

- the **semantic source** the author named — a Selection, Segment, Moment or Program, with its
  identity and anchors on the Semantic Track;
- the **projection** of that source into frame space, after offset evaluation, clipping and frame
  quantization. One resolved authored binding projects to one window;
- the **consumption** window the realized Track actually uses, which the projection does not have to
  equal — a source-audio trim reads different samples than its target window, and a Ranking exposes
  one outer window alongside its reveal phases.

A projection line connects a source to its realized window, and the projection view is read-only.
`../../../../docs/guide/studio-temporal-windows.md` is authoritative for what each stage carries.

When the executed lineage names a Selection or Moment, dragging the realized block may issue
`timeline.adjust` against that shared semantic identity. Script owns the inverse from semantic Anchor
identity back to markers, so every consumer follows the edit. This does not turn the block into a
Selection or infer a source from matching frames. Derived schedule phases and missing lineage remain
read-only.

Studio is a browser preview **for a person to look at**. It is not a source of images for an
automated comparison — that is what the local still render above is for.

`../../../../docs/quickstart/preview.md` is authoritative.
