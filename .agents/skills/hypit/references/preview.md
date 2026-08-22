# See what you authored, without paying

Three ways to look at a Source before a Provider is ever reached: prove the graph traces, render one
element locally, and open the whole Run for a person. They answer different questions, and none of
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

## Render one element locally

One element — a new component, one caption system, one inserted card — can be rendered without a paid
Provider. The repository's own visual test `packages/hyperframes/test/browser-visual.test.ts` shows
the path end to end: build the Track, compile the HyperFrames document, and render it through the
local HyperFrames Runtime.

There is no one command: a package's `test/render-preview.ts` harness is what renders it, and
`local-author-package.md` requires that harness to take its inputs and its output path as arguments.
That requirement exists because two different pictures come out of it, and they must not collapse
into one:

- the **catalogue preview** — one image for Studio and the package README, drawn from sample copy and
  a sample Recipe the harness supplies itself, chosen to show the Surface's range;
- the **comparison render** — for `reconstruction-loop.md`, drawn from the Recipe values a Source
  actually passes, the Script text that Source actually feeds the element, and mocks for the layers a
  Build has not made. One per reference shot the element appears in.

The inputs are what separates them, and it is the whole separation. A Source can pass values that
collide — lines that overlap, type too large for the plate it sits on — while the catalogue preview,
drawn from different values, stays perfect. A harness whose inputs are written into it can only
produce the first picture, and a route that compares that picture is answering a question about the
catalogue.

Two things are mocked rather than left out. **The layers beneath**: a component that draws over a
base take renders over black without one, and black is not neutral — text legible on it can be
illegible on the picture that replaces it. **Media slots the Source declares as generations**: empty
for the whole stretch between being written and being built. Both use the route's fixed
`make-placeholder` tool — `--video --seconds <s>` for a stretch, a PNG for a slot, `--color` so the
mock stays visible against what the element draws — sized from the Source's `space:Canvas` rather
than from the reference video, and the comparison is scoped with `--question` so the observer skips
those regions. `reconstruction-loop.md` gives the sizing rule and says why a reported mock is not a
repair target.

The render can be a clip as well as a still, and a clip is the default. `compare_reconstruction
--video` compares the whole shot, which removes the problem of choosing a frame to represent a shot
that holds several states. A still is for the one case `reconstruction-loop.md` names: the shot's own
visual observation says in words that the element is completely still. That judgement comes from the
reference's observation, never from watching your own render.

This is what to reach for whenever one element has to be looked at rather than the whole program.
Rendering the delivery to inspect a single piece is the waste it exists to prevent.

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

Studio is a browser preview **for a person to look at**. It is not a source of pictures for an
automated comparison — that is what the local render above is for.

`docs/quickstart/preview.md` is authoritative.
