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
hypit-preview-check /path/to/project/build.svrun
```

It takes the Run Source, not the Author SVML — Studio's unit of work is the Run, and it reads the
`.svml` back out of it.

It exits non-zero when the graph itself is wrong, and it names what refused — a target that is not a
Film or Render output of the current SVML, a Film with no traceable composition, a Film with no
`SemanticTake` / Speech Track chain. This is not a guessing problem: the error says what is wrong, and
you repair that. A graph that does not trace is not done, and **every failure it reports must be
repaired until the check passes**, however many attempts that takes.

**One refusal is a pass, and it is the one you will see most.** A Source that declares its generation
rather than performing it leaves the closure waiting on Providers, and Studio requires the whole
closure before it will open. That is the expected state of a Source nobody has built yet, not a defect
in it. When every issue is `the Studio projection closure requires unresolved capabilities: …`, the
graph traced all the way to a Film and a semantic spine, and what remains is work a Provider has to
do — the script prints the waiting capabilities and exits zero:

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

## Render one element to a still, locally

One element — a new component, one caption system, one inserted card — can be rendered to an image
without a paid Provider. A new package's visual Surface needs a preview image anyway. The repository's
own visual test `packages/hyperframes/test/browser-visual.test.ts` shows the path end to end: build
the Track, compile the HyperFrames document, and render it through the local HyperFrames Runtime.

This is the image to reach for whenever one element has to be looked at rather than the whole
program. Rendering the delivery to inspect a single piece is the waste it exists to prevent.

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
