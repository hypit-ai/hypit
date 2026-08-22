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
# from the repository root: it reads the installed packages from the working directory
hypit-reference-video-tools preview_check path/to/build.svrun
```

It takes the Run Source, not the Author SVML — Studio's unit of work is the Run, and it reads the
`.svml` back out of it.

It reports `"sound": false` when the graph itself is wrong, and it names what refused — a target that
is not a Film or Render output of the current SVML, a Film with no traceable composition, a Film with
no `SemanticTake` / Speech Track chain. This is not a guessing problem: the error says what is wrong,
and you repair that. A graph that does not trace is not done, and **every failure it reports must be
repaired until the check passes**, however many attempts that takes.

**One refusal is a pass, and it is the one you will see most.** A Source that declares its generation
rather than performing it leaves the closure waiting on Providers, and Studio requires the whole
closure before it will open. That is the expected state of a Source nobody has built yet, not a defect
in it. When every issue is `the Studio projection closure requires unresolved capabilities: …`, the
graph traced all the way to a Film and a semantic spine, and what remains is work a Provider has to
do — the check stays sound and lists the waiting capabilities:

```json
{
  "sound": true,
  "summary": "the graph is sound, waiting on 6 capabilities.",
  "awaiting": ["@hypit/seedance@1#seedance-2-mini", "@hypit/whisperx@1#whisperx-alignment"]
}
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

Two different pictures come out of this, and they must not collapse into one:

- the **catalogue preview** — one image for Studio and the package README, drawn from sample copy and
  a sample Recipe the package supplies itself, chosen to show the Surface's range. It is the package's
  own, like its README, and `local-author-package.md` says the package owes it;
- the **comparison render** — for `reconstruction-loop.md`, drawn from the Recipe values a Source
  actually passes, the Script text that Source actually feeds the element, and mocks for the layers a
  Build has not made.

The values are what separates them, and it is the whole separation. A Source can pass values that
collide — lines that overlap, type too large for the plate it sits on — while the catalogue preview,
drawn from different values, stays perfect. A route that compares the catalogue picture is answering
a question about the catalogue.

Each has its own command, and both are shared by every package.

**The catalogue preview** is drawn from a Source the package ships — `preview/preview.svml`,
`preview/recipes.svs` and `preview/build.svrun`, holding its own copy, its own Recipe values and its
own Canvas:

```bash
hypit-reference-video-tools render_previews packages/<name>
```

Which element draws which file comes from the Manifest's naming: a Surface tagged `Track` declares
`preview/Track.png`, so that picture is drawn from the element carrying that tag under the package's
own import alias. It **overwrites the picture in place**, so run it when the package's drawing has
changed and look at what came out before committing it. Anything the preview Run satisfies with a
`<file>` of its own is carried through and never mocked over, which is how a preview shows the
component holding a picture rather than a placeholder.

**The comparison render** has one command too:

```bash
hypit-reference-video-tools render_element projects/<name>/build.svrun \
  --element <id> --segment <id>|--selection <id> --out <path>.mp4
```

It reads the Canvas, the Recipes, the Script and the bindings out of the Source; stands in for the
speech the Build has yet to synthesize using the Source's own `estimate:Speech`, so the window
lengths are the ones the Source already ordered its generations with; mocks every declared generation
with `make-placeholder` at the Canvas's size; and drives each package's Producer through the same
Studio projection `preview_check` traces, with no Provider installed. The mocks and the stand-in takes
live in a derived Run under the project's `.hypit/`, never in the Source.

Name the window in words. `--segment` and `--selection` take a Script name rather than a timestamp,
because a shot of the reference is found by the words spoken over it. Write `.mp4` to `--out` for a
clip and `.png` for the middle still; `reconstruction-loop.md` says which to use when.

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
