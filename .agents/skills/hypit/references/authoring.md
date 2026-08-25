# Hypit source authoring

Read `quickstart.md`, then the authoritative published page it selects.
Keep Author Source, Recipe Source and Run Source complete and internally consistent rather than
assembling independent per-shot source fragments.

Before writing an element, read the owning package README and inspect what its Surface actually
declares — `vocabulary.md` names the command and decides which package owns an element in the first
place. For `@hypit/<name>@1`, inspect its installed declaration and README with the vocabulary tool.
Never invent a
component, attribute, child, port, Recipe property or literal value. Do not infer one package's
syntax from a neighboring package.

Install dependencies after package selections change. Validate with the existing commands:

```bash
hypit check path/to/main.svml
hypit check path/to/recipes.svs
hypit check path/to/build.svrun
```

Check all of them, not only the Author Source: a Recipe the Author Source references and a Target the
Run Source demands are just as able to be wrong. Do not create a check wrapper.

**A check that passes is not a graph that traces.** `hypit check` proves a Source is legal — its
syntax, its references, its graph structure — and proves nothing about whether the tracks it declares
can actually be built, nor that an uncertain requirement was understood correctly. `preview.md`
proves the Run traces, before any Provider is reached.

## Reuse an accepted Record

Hypit holds no implicit cache. Connect a Record an earlier Build accepted to a later Build by naming
it in the Run Source:

```svml
<target output="final.video"/>
<build-record id="accepted-take" build="build-001"
  output="opening-take.video"/>
<satisfy output="opening-take.video" candidate="accepted-take"/>
```

The selected Candidate must supply the Logical Output's exact nominal Type. Core does not infer
creative equivalence or propagate a substitute-quality label downstream. Changing the Target list
alone does not select a Record.

Pin as soon as a Build accepts something. **A Build that fails still accepted everything upstream of
the failure** — every picture and every take that ran before the step that broke — and resubmitting
without pinning them buys the same bytes again. Run `--pin` against the failed Build before touching
the cause. `hypit history --source <author.svml> --pin` emits the pairs for the newest accepted
Record of each output; do not transcribe Build ids by hand.

**Pin what a Provider was paid to make, and nothing the Source computes.** `--pin` emits a line for
every accepted output, including the ones the Script's own structure produced: `speech.semantic`,
`speech.visual`, `speech.audio`, and the Caption Track's deterministic projection. Those are
projections of the Takes — free to rebuild, and measured against the Script as it was. Paste them
back after editing a Segment — renaming one, merging two — and the Build pins a skeleton whose
anchors describe a program that no longer exists. It does not fail: every Track times itself against
those stale anchors and the delivery is quietly wrong.

**A `SemanticTake` is both.** Alignment is a served capability, so `<take>-semantic.take` is work
something was paid for and is worth pinning, and its tokens and anchors are keyed to the Script
Segment it aligned, so it goes stale on a Segment edit exactly as the projections above do. Pin it
while the Script is untouched; drop it for the Takes whose Segment you edited, and let those
re-align. This is the one line where "keep what was paid for" and "drop what the Script invalidated"
disagree, and the Script wins.

This file is about writing an element correctly, which is a narrower question than making the video
right. What a Track should contain, when a picture may be generated at all, how long a thing stays on
screen and what shows through when it does not — those are decided in `playbooks/index.md`, whose
required load order names the craft every program needs regardless of format. A whole video is
`original-authoring/route.md`, not this file: a Source can pass every check above with every one of
those decisions still unmade.
