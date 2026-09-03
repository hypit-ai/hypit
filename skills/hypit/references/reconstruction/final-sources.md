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

## Where the Segments fall, and how long each take runs

`../script-time.md` decides both, and it decides them the same way for any program: a Segment is a
stretch that is spoken as one, the seam goes at a sentence end, and each take's duration comes from
`estimate:Speech` rather than from any clock.

The reference adds one thing to that, and it is a warning rather than a rule. The generated speech
plays at its own pace, not the reference's: its measured word timings describe how the original
speaker delivered the line, the reconstruction re-speaks it, and the generated take will not match
that recording second for second. Reading the reference's span onto the take fixes a length that has
nothing to do with how the generator speaks.

The estimate is also what lets a reconstruction survive the author changing the lines at the end of the route,
where a literal read off the old reference would not.

Then check and wire, in that order. `../authoring.md` holds the check set — all four commands, not
only the Author Source — and `../preview.md` holds the graph check that comes after it. A Source that
passes every check can still declare a Run that does not trace, and neither check is bounded by the
round's two-attempt ceiling: a graph that does not trace is not a difference to weigh, it is work that
is not done.

One thing to expect here rather than to debug: a route that declares its generation instead of
performing it leaves the closure waiting on Providers, so `preview_check` reporting only
`unresolved capabilities` and staying sound **is the pass**, and is the state every reconstruction is
in when its sources are first written.

Fix package resolution and package implementation before repairing source use. Continue until all
three files are accepted. Do not create `check_svml_project` or another wrapper.

Accepted checks end the structural work, not the reconstruction. Every element you authored still has
to be rendered and compared against the reference under `comparison-round.md`, and that work ends
on `reconstruction_check` (`route.md` holds the command), which refuses to pass while any drawing
element has never been compared. It needs a prepared reference; when several are prepared it takes
`--reference-id <id>`.
