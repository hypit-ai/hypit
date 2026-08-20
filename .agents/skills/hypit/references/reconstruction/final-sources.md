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

## A Segment is a stretch the reference actually plays as one

Cut the Script into Segments the way the reference is spoken, not the way its shots are numbered. A
Segment is what the Spine binds one Take to, so each one is a separate generation and a separate
seam; splitting a stretch the reference delivers unbroken invents a seam it does not have, and
inviting a generator to re-establish the room at that seam is how continuity is lost for nothing.

Consecutive Segments carrying one unbroken voiceover are one Segment with Selections inside it. The
pictures over that stretch are placed by those Selections — `../playbooks/craft/frame-coverage.md`
governs what that costs and what has to cover the silence between them — and the speech stays one
measured Take.

Name Segments for what they hold. Names are handles: the Script's meaning lives in the words, and no
part of the pipeline reads a Segment name back for anything a reader would see.

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

Use existing checks only:

```bash
pnpm check
pnpm hypit check path/to/main.svml
pnpm hypit check path/to/recipes.svs
pnpm hypit check path/to/build.svrun
```

`hypit check` proves a Source is legal; it proves nothing about whether the tracks it declares can
actually be built. A track that fails the local preview fails the same way the moment the author
opens Studio — a new package with a bad schedule, a media edge whose artifact is not an
image, a reference that does not resolve. Find that now, not on the author's screen:

```bash
# from the repository root: tsx is the repository's dependency
node --import tsx .agents/skills/hypit/scripts/preview-check.mjs path/to/build.svrun
```

It takes the Run Source, not the Author SVML — Studio's unit of work is the Run, and it reads the
`.svml` back out of it.

It exits non-zero when the graph itself is wrong, and it names what refused — a target that is not a
Film or Render output of the current SVML, a Film with no traceable composition, a Film with no
`SemanticTake` / Speech Track chain. This is not a guessing problem: the error says what is wrong,
and you repair that.

A graph that does not trace is not done, and this is not the loop: the two-attempt ceiling governs
how *well* a wired element is tuned to the reference; it does not govern whether the element is
wired at all. Every failure this check reports must be repaired until the check passes. Repair as
many times as the failure needs, then re-run the check.

**One refusal is a pass, and it is the one you will see most.** Studio does not degrade: it has no
stand-ins, no black frames and no estimated timing, so a Source that still declares generation
cannot be opened at all. That is the ordinary state of a reconstruction nobody has paid a Build for,
and treating it as a failure would make this gate unsatisfiable.

So the check separates the two. When every issue is `the Studio projection closure requires
unresolved capabilities: …`, the graph traced all the way to a Film and a semantic spine and what
remains is work a Provider has to do — the script prints the waiting capabilities and exits zero:

```
preview-check: the graph is sound, waiting on 6 capabilities.
  - @hypit/seedance@1#seedance-2-mini
  - @hypit/whisperx@1#whisperx-alignment
  ...
```

Any other refusal means the graph is wrong and no amount of generation will fix it — no Film or
Render target, a target that is not an output of the current SVML, no traceable Film composition, no
`SemanticTake` / Speech Track chain. Those exit non-zero and have no attempt ceiling.

What this gate therefore proves is narrower than it used to be: that the graph is **wired**, not that
every track **draws**. A Producer that refuses the media kind it is handed will not be caught here,
because it is never handed anything until the Build runs. Verify those on the real Build, say so
plainly rather than reporting the check as more than it is, and do not let it stand in for the
delivery measurements in `../playbooks/craft/production-gates.md`.

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
