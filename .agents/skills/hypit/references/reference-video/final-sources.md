# Reference-video final sources

After every required package exists and its vocabulary has been read, read
`../authoring.md` completely, then read `../playbooks/index.md` and the craft files it names for the
systems this reference actually contains, and write one complete project:

- `main.svml` describes the whole video in original time order, keeps continuing base/sound intact,
  and represents one continuing overlay as one visual track.
- `studio.svs` contains every Recipe actually referenced by `main.svml`, using only declared
  properties and admitted values.
- `build.svrun` references the Author Source and declares the required Targets with resolvable
  dependencies.
- `hypit.runtime.json` binds an Endpoint to every capability those sources demand.

The Runtime Profile is part of the deliverable even though this route runs nothing. Without it the
first thing the author meets is `RUNTIME_CAPABILITY_UNBOUND`, and the work of discovering which
Provider serves each model falls on them — work you have already done, since you chose every package
in the Source. Copy the nearest existing `examples/*/hypit.runtime.json` and bind one Endpoint per
capability your Sources actually reach: the picture and video models, speech, alignment, the media
Provider and the local renderer. Read each Provider's README for the shape of its `config`, and
reference credentials through the store rather than writing any secret into the file.

A capability whose credential this machine does not hold is still declared. Preflight names it before
any Build is submitted, which is the correct place for the author to find out.

Do not author one source fragment per shot. Do not let check success substitute for unresolved
semantic evidence; return to a narrow `observe_reference` question when necessary.

Use existing checks only:

```bash
pnpm check
pnpm hypit check path/to/main.svml
pnpm hypit check path/to/studio.svs
pnpm hypit check path/to/build.svrun
```

`hypit check` proves a Source is legal; it proves nothing about whether the tracks it declares can
actually be built. A track that fails the local preview fails the same way the moment the author
opens the Playground — a new package with a bad schedule, a media edge whose artifact is not an
image, a reference that does not resolve. Find that now, not on the author's screen:

```bash
# from the repository root: tsx is the repository's dependency
node --import tsx .agents/skills/hypit/scripts/preview-check.mjs path/to/main.svml path/to/build.svrun
```

It reports every track that failed to build, and every track waiting on a Provider it cannot reach,
and exits non-zero when either exists. The failures it reports are the Producer's own messages — the
track name, the Producer, and why it failed, down to the offending value (a schedule frame outside a
window, a media edge whose artifact is not an image). This is not a guessing problem: the error says
what is wrong, and you repair that. A track that cannot be built is not done, and this is not the
loop: the two-attempt ceiling governs how *well* a buildable element is tuned to the reference; it
does not govern whether the element builds at all. Every failure this check reports must be repaired
until the check passes — the author should never open the Playground and find that something they
were delivered cannot be seen. Repair as many times as the failure needs, then re-run the check.

What this check cannot see is equally important: a track that *builds* but looks wrong — a typeface
that does not match, a colour that is off, a shape that is misplaced — reports no error here, because
nothing failed. That is the loop's work, under `reconstruction-loop.md`, where Gemini compares the
rendered element against the reference and names the visible differences. Build failures are
repaired here until they pass; appearance differences are resolved there, bounded by the two-attempt
ceiling.

Fix package resolution and package implementation before repairing source use. Continue until all
three files are accepted. Do not create `check_svml_project` or another wrapper.

Accepted checks end the structural work, not the reconstruction. Every element you authored still has
to be rendered and compared against the reference under `reconstruction-loop.md`.
