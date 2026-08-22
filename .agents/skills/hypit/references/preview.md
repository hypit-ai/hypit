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
# from the repository root: tsx is the repository's dependency
node --import tsx .agents/skills/hypit/scripts/preview-check.mjs path/to/build.svrun
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

There is no one command for the still: a package's `test/render-preview.ts` harness is what renders
it, and `local-author-package.md` requires that harness to take its state, frame and output path as
arguments. That requirement exists because the still has two distinct jobs that must not collapse
into one picture:

- the **Surface preview** — one catalogue image, every feature on, whatever moment shows the
  component best, for Studio and the package README;
- the **comparison still** — for `reconstruction-loop.md`, one picture per reference shot, showing
  the element in the state that shot happens to show at a matching moment.

A harness whose state is written into it produces the first and nothing else; the route then reuses
that catalogue picture for a comparison it does not fit. So the still render is one invocation of a
parameterised harness, not the whole of it.

One case to handle rather than avoid: an element whose appearance depends on a media slot a Build
has not filled. The slot is mocked with the route's fixed `make-placeholder` tool (a PNG, or `--video`
for a slot that only accepts video), the comparison is scoped with `--question` to bypass the slot
as an intentional placeholder, and `reconstruction-loop.md` says the empty-slot difference is not a
repair target — so the still renders what the component draws itself with the mock in the slot, and
the round is spent on the differences that can actually be repaired.

This is the image to reach for whenever one element has to be looked at rather than the whole
program. Rendering the delivery to inspect a single piece is the waste it exists to prevent.

## Open the whole Run for a person

After a meaningful Author Source change, start Hypit Studio and give the author the actual URL.
Kill the previous server first so the user does not inspect a stale composition.

```bash
pkill -f "@hypit/studio" || true
pnpm studio -- --run path/to/build.svrun \
  --runtime path/to/hypit.runtime.json &
```

Read the startup output for the chosen port. `--run` is required: Studio's unit of work is the Run
Source, and it reads the Author SVML back out of it. Pass `--runtime` only when the Author Source
reuses accepted Build records. `--workspace` selects the Source Workspace and defaults to the Run's
own directory, so pass it when the Run's relative Sources resolve against a different root.

Studio opens a Run whose material is satisfied. When a projection is missing it names the issue and
stops, so a Run that opens is a Run whose Tracks all resolved.

One Run in the repository is satisfied already, so Studio can be seen without spending anything:

```bash
pnpm studio -- --run examples/all-components-preview/studio.svrun --workspace .
```

It supplies its own Semantic Takes and caption plan from committed fixtures. Every other Run under
`examples/` still names shots a Provider has to make, or footage that is not committed.

## A timeline block is not the authored Selection

Studio keeps three stages of an item's time apart, and reading one for another misreads the program:

- the **semantic source** the author named — a Selection, Segment, Moment or Program, with its
  occurrence identity and its anchors on the Semantic Track;
- the **projection** of that source into frame space, after occurrence expansion, offset evaluation,
  clipping and frame quantization. One authored binding can project to zero, one or several windows;
- the **consumption** window the realized Track actually uses, which the projection does not have to
  equal — a source-audio trim reads different samples than its target window, and a Ranking exposes
  one outer window alongside its reveal phases.

A projection line connects a source to its realized window, and the projection view is read-only.
`docs/guide/studio-temporal-windows.md` is authoritative for what each stage carries.

Studio is a browser preview **for a person to look at**. It is not a source of images for an
automated comparison — that is what the local still render above is for.

`docs/quickstart/preview.md` is authoritative.
