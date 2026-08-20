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
node --import tsx .agents/skills/hypit/scripts/preview-check.mjs path/to/main.svml path/to/build.svrun
```

It reports every track that failed to build, and every track waiting on a Provider it cannot reach,
and exits non-zero when either exists. The failures it reports are the Producer's own messages — the
track name, the Producer, and why it failed, down to the offending value (a schedule frame outside a
window, a media edge whose artifact is not an image). This is not a guessing problem: the error says
what is wrong, and you repair that. A track that cannot be built is not done, and this is not the
loop: the two-attempt ceiling governs how *well* a buildable element is tuned to the reference; it
does not govern whether the element builds at all. Every failure this check reports must be repaired
until the check passes — the author should never open Studio and find that something they
were delivered cannot be seen. Repair as many times as the failure needs, then re-run the check.

One failure is not a defect, and it is worth knowing before spending repairs on it. The preview has
to draw outputs nothing has produced yet, so it substitutes a stand-in — a black video frame as long
as the shot. **A stand-in is not the kind of thing the real output will be**, so a Producer that
validates the kind of media it receives can refuse it and be entirely correct at build time. A still
Media Item is the case that bites: it requires image bytes, the stand-in for an unbuilt `gpt:Image`
is `video/mp4`, and the preview reports a media edge whose artifact is not an image — the same
sentence it would use for a genuine wiring mistake.

Tell them apart before repairing. It is a stand-in artifact when the edge points at an output this
Source generates rather than at supplied material, and the message is about the media *kind* rather
than a value. Pinning does not settle it either: preview-check reads a Run Source but cannot open
pinned Records without a Runtime, and the script does not offer one. Everything else it reports is
still a real failure and still has no attempt ceiling.

Two ways out, in order. In a component you own, decide the element kind from the Artifact's own
`mediaType` instead of hard-coding it — the component then draws the stand-in as video and the real
picture as an image, and the preview passes honestly. Against an installed Producer that legitimately
demands one kind, the check cannot pass until the output exists: say so plainly, and verify that
track on the real Build instead. Do not report the check as passed, and do not let it stand in for
the delivery measurements in `../playbooks/craft/production-gates.md`.

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
