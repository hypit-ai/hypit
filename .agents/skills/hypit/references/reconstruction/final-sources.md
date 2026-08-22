# Reference-video final sources

After every required package exists and its vocabulary has been read, read
`../authoring.md` completely, then read `../playbooks/index.md` and the craft files it names for the
systems this reference actually contains, and write one complete project:

- `main.svml` describes the whole video in original time order, keeps continuing base/sound intact,
  and represents one continuing overlay as one visual track.
- `recipes.svs` contains every Recipe actually referenced by `main.svml`, using only declared
  properties and admitted values.
- `build.svrun` references the Author Source and declares the required Targets with resolvable
  dependencies.
- `hypit.runtime.json` binds an Endpoint to every capability those sources demand.

The Runtime Profile is part of the deliverable even though this route runs nothing: without it the
first thing the author meets is `RUNTIME_CAPABILITY_UNBOUND`, and the work of binding a Provider to
each model falls on them — work you already did when you chose the packages. `../runtime.md` says how
to author one.

Do not author one source fragment per shot. Do not let check success substitute for unresolved
semantic evidence; return to a narrow `observe_reference` question when necessary.

## A Segment is a stretch the reference actually plays as one

Cut the Script into Segments the way the reference is *spoken*, not the way its shots are numbered:
consecutive Segments carrying one unbroken voiceover are one Segment with Selections inside it.
`../playbooks/craft/generated-dependencies.md` says why — a Segment is a generation boundary, and
splitting a stretch the reference delivers unbroken invents a seam it does not have.

## A take's duration is measured, not estimated

`estimate:Speech` predicts how long a line will take to say. In this route that prediction is the
wrong input, because the reference already contains the answer: `prepare_reference` measured every
word of it, so each Segment's real duration is the span from its first word's start to its last
word's end in `transcript_ref`. Write that number on the take.

An estimate is not close enough to skip this. A reconstruction whose Segments are each estimated a
second long finishes several seconds longer than the reference, and every reveal, cut and overlay
lands late against a program that no longer matches the thing it reconstructs. The estimate is for
original authoring, where nobody has said the words yet.

Keep the estimate only where the reference cannot answer: a line the reconstruction adds, or a
Segment whose speech the reference never contains.

Then check and wire, in that order. `../authoring.md` holds the check set — all four commands, not
only the Author Source — and `../preview.md` holds the graph check that comes after it. A Source that
passes every check can still declare a Run that does not trace, and neither gate is bounded by the
loop's two-attempt ceiling: a graph that does not trace is not a difference to weigh, it is work that
is not done.

One thing to expect here rather than to debug: a route that declares its generation instead of
performing it leaves the closure waiting on Providers, so `preview-check` reporting only
`unresolved capabilities` and exiting zero **is the pass**, and is the state every reconstruction is
in when its sources are first written.

Fix package resolution and package implementation before repairing source use. Continue until all
three files are accepted. Do not create `check_svml_project` or another wrapper.

Accepted checks end the structural work, not the reconstruction. Every element you authored still has
to be rendered and compared against the reference under `reconstruction-loop.md`, and that work ends
on `reconstruction-check` (`index.md` holds the command), which refuses to pass while any
locally-drawn element has never been compared. It needs a prepared reference; when several are
prepared it takes `--reference-id <id>`.
