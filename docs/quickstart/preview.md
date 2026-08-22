---
title: Live Preview
description: Read a Run whose material exists as an editable timeline.
---

# Live Preview

**Hypit Studio** opens a Run, traces its Film or Render target back to the projections it can edit,
and draws them — the code on the right, the picture top-left, a timeline bottom-left. It never
writes anything but the Author SVML, and it never calls a Provider.

Studio builds only what it can derive deterministically from Candidates the Run already supplies, so
it needs a Run whose material is satisfied — every generated output either produced by an accepted
Build or standing against a file. That is what you point it at.

```bash
hypit-studio --run examples/all-components-preview/studio.svrun --workspace .
# ➜  http://localhost:5179/
```

::: warning The examples in this repository need material first
`examples/all-components-preview/studio.svrun` is ready to open: it explicitly supplies its
Semantic Takes and the deterministic Script-owned CaptionDocument. Other example Runs may still name shots a Provider has to make, or
footage under `examples/**/assets/` that is not committed. Satisfy those in a Run of your own before
opening them.
:::

| Argument | Meaning |
| --- | --- |
| `--run <build.svrun>` | The Run Source to open. Required. Studio reads the Author SVML back out of it. |
| `--runtime <hypit.runtime.json>` | Where material earlier Builds produced is kept. Only a Run that reuses an accepted shot through `<build-record>` needs one. |
| `--workspace <directory>` | Defaults to the directory holding the Run. |
| `--port <number>` | Defaults to `5179`. |

The unit of work is the Run, not the `.svml`. What a Source is read *with* — which files stand for
which outputs, which Build records are reused — is an authoring decision, and the Run Source is
where that decision is written down. See [Run Source & Builds](./run).

::: tip Stop the previous server before starting another
A second Studio silently takes another port, and you end up reading a stale preview while
describing a new one. Stop the old one first:

```bash
pkill -f "hypit-studio" || true
```

Use `--port` when you genuinely want two Runs side by side.
:::

## What Studio draws

Studio builds the deterministic closure of the Run and nothing else. Opening it never invokes a
Provider and never creates a Build, so every projection it draws was either supplied by the Run as
a Candidate or derived deterministically from one.

**Everything structural is real.** Placement Frames, padding, stacking order, motion and the Track
layout are computed by the same functions a build calls, from your Source and your Recipes. A card
in the wrong part of the frame is wrong here too.

**Every timing is measured.** The timeline comes from the `SemanticTrack` — the aligned Takes
themselves — so a cut point you see is the cut point a build produces.

When something the closure needs is missing, Studio says so and stops:

```
Studio cannot start:
- the Studio projection closure requires unresolved capabilities: seedance.video
```

What it asks for:

| Refusal | What it means |
| --- | --- |
| `the Run Source has no target; Studio requires Film or Render` | Nothing in the Run names a finished programme to trace back from. |
| `the Run target is not a Film or Render output from the current SVML` | The target named does not exist in the Source as it stands now. |
| `Film has no traceable SemanticTake / Speech Track chain` | There is no semantic spine to hang a timeline on. |
| `the Studio projection closure requires unresolved capabilities: …` | A Track needs a Provider to exist. Satisfy it in the Run, or accept a Build. |
| `Render target … is an opaque media Candidate; Studio needs the current Film graph` | The Run points at a finished video file. Studio edits the graph, not the output. |

The fourth is the one you will meet most, and it is all-or-nothing: one unresolved capability
anywhere in the closure refuses the whole Run. A programme becomes openable in one step, when the
last of its generated outputs is satisfied.

## Supplying material you already have

```svml
<file id="take-1" type="@hypit/artifact@1#BlobArtifact"
  from="./assets/take-1.mp4" media-type="video/mp4"/>
<satisfy output="take-opening.video" candidate="take-1"/>
```

A `<build-record>` candidate names something an earlier Build made rather than a path, and needs
`--runtime` to find it.

## Where a Track came from

Selecting a Track names the Candidate that produced it and where it came from — the Run, the Source,
or neither. The header carries the same claim for the programme as a whole: `timing: measured` reads
from the aligned `SemanticTrack`, `picture: measured` that every element shows real material.

## When an agent is doing the work

If you are working through the [Hypit skill](https://github.com/hypit-ai/hypit/blob/main/.agents/skills/hypit/SKILL.md),
the agent starts Studio for you and sends you the link after a step that changes the Source — a
Script edit, a Frame moved, a B-roll placed, a Recipe adjusted.

Reading a diff is not the same as seeing where a cutaway lands, and this is the cheapest moment to
say "that card is too high".

## Moving around it

The timeline, the source and the picture are three views of the same thing, so selecting in any of
them selects in all three. Click a clip and the playhead moves to its first frame, the picture
outlines it, and the source scrolls to the tag that placed it. Click a marked line in the source, or
whatever is drawn under the pointer, and the same happens.

A Segment encloses a Selection, which can enclose another Selection. Each level is drawn in its own
colour — in the source, on the timeline and on the picture — and an enclosing range stays outlined
while an inner one is, because the nesting is what the markers are for. Everything the playhead is
inside is outlined as it passes, whether or not a Track was hung on it.

Drag the ruler to scrub. `Space` plays and pauses, `←` and `→` step one frame with `Shift` for ten,
`Home` and `End` jump to the ends, and `Esc` clears the selection.

## The semantic lane

Above the Tracks is a lane that is not a Track: the `SemanticTrack` itself, drawn as one block per
Segment. It is the skeleton every other row is positioned against.

At the whole-programme view a Segment is the useful unit, so that is all it draws. Zoom in and once
a Segment has enough width its words open into a real sub-lane beneath it, the way a pattern opens
into a piano roll. Double-click a Segment to zoom to it; the toolbar has explicit zoom controls, and
`Ctrl`-wheel pinches.

Clicking a word moves the playhead to the frame that word starts on, which is the fastest way to
answer "does this cutaway land on the right sentence".

## Selection, projection and consumption

A timeline block is not assumed to be the authored Selection. Studio keeps three facts separate:
the named semantic source, the component's projection from that source, and the frame windows the
component finally consumes. Selection ranges and Moment points remain visible on the semantic lane;
an item's projection line connects that source to its realized window. Components with nested
schedules, such as a Ranking Column, expose the total window and their reveal phases separately.

The current projection view is read-only. Its data contract and the remaining write-back questions
are recorded in [Studio Temporal Windows](../guide/studio-temporal-windows.md).

## Sound

HyperFrames renders a silent picture on purpose: programme audio is a separate Track the media
pipeline muxes in at the end. But placing B-roll against speech means hearing the speech, so the
Speech Track's own material is allowed to sound while the transport is running. Cutaways stay
silent, as they are in a build unless they ask otherwise. The speaker button turns it off.
