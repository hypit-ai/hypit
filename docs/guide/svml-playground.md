# SVML Playground

A read-only preview of one Source: the code on the right, the picture top-left,
and a timeline bottom-left rendered from the SVML itself.

```bash
pnpm svml:playground -- --source examples/talking-film-broll-preview/main.svml
# ➜  http://localhost:5179/
```

| Argument | Meaning |
| --- | --- |
| `--source <main.svml>` | The Author Source to read. Required. |
| `--run <build.svrun>` | A Run Source, read for material and timings it already names. |
| `--runtime <svml.runtime.json>` | Where material earlier Builds produced is kept. Only a Source that reuses an accepted shot needs one. |
| `--port <number>` | Defaults to `5179`. |

The Playground never writes. There is no route that can change what you wrote,
and no form that edits a Recipe — that is the
[Caption Playground](./caption-playground)'s job.

## What it is for

Reading a Source as a timeline **before** anything has been generated. It
answers "where does this B-roll land, how long is it, and is the card in the
right part of the frame" without a Seedance generation, a WhisperX alignment, an
FFmpeg render or a headless browser.

It runs on a directory holding nothing but `main.svml` and its `.svs` style
sheet. No package lock, no Runtime Profile, no build.

## Three ways into one selection

The timeline, the source and the picture are three views of the same thing, so
selecting in any of them selects in all three.

- **Click a timeline clip** and the playhead moves to its first frame, the
  picture draws a box around it, and the source scrolls to the
  `<media-track:Item>` that placed it.
- **Click a marked line in the source** and the same happens. Lines that bind a
  clip carry a coloured bar in the gutter, so what is clickable is visible
  standing still. A Script marker pair and the clip it binds share a colour.
- **Click the picture** and whatever is drawn under the pointer is selected.

Clicking marked prose lands **inside the marker you clicked**, not at the start
of whatever encloses it — a marker that places nothing still means something.

Scrub by dragging the ruler or an empty part of a track. `Space` plays and
pauses, `←` and `→` step one frame with `Shift` ten, `Home` and `End` jump to the
ends, and `Esc` clears the selection.

## Levels

A Segment encloses a Selection, which can enclose another Selection. Each level
is drawn in its own colour, in the source, on the timeline and on the picture,
and **an enclosing range stays outlined while an inner one is** — the nesting is
what the markers are for. Two ranges at the same level are the same kind of
thing and read the same.

Everything the playhead is inside is outlined as it passes, whether or not a
Track was hung on it.

## Sound

HyperFrames renders a silent picture on purpose: programme audio is a separate
Track the media pipeline muxes in at the end. A preview is not a render, and
placing B-roll against speech means hearing the speech, so the Speech Spine's own
material is allowed to sound while the transport is running. Cutaways stay
silent, as they are in a build unless they ask otherwise. The speaker button
turns it off.

## What is real and what is estimated

Everything structural is real. Placement Frames, padding, stacking order, motion
and the Track layout are computed by the same functions a build calls, from your
Source and your style sheet.

Timings are another matter, and the header says which you are looking at:

| Badge | Meaning |
| --- | --- |
| `timing: measured` | Read from a completed build's aligned transcript. |
| `timing: estimated` | Derived from the Script text at normal delivery pace. |
| `picture: measured` | Every element shows real material. |
| `picture: estimated` | Some shots have not been made, and stand in. |
| `picture: estimated` | Nothing has been shot or generated yet. |

The two are separate claims. A Source can have all its footage and still have an
estimated timeline, because where a cut lands is a question about speech, not
about files.

The Playground prefers real things, in this order:

1. **A Run Source.** Which material and which timings a Source is read with is
   an authoring decision, so `<satisfy>` is where it is made:

   | Candidate | Supplies |
   | --- | --- |
   | `<file from="./shot.mp4" media-type="video/mp4"/>` | Material you already have. |
   | `<value type="…" from="./timing.json"/>` | A value on disk, such as an alignment produced elsewhere. |
   | `<build-record build="…" output="take.video"/>` | Something an earlier Build made. Needs `--runtime`. |

   Timings are called measured only when both `timing.map` and the Program Space
   were supplied. One without the other is still an estimate, and says so.

2. **An earlier Build.** A shot that has been generated and accepted is named by
   the Build it came from, not by a path — a produced Artifact has an identity
   rather than a location. Given `--runtime`, the Playground reads that Build's
   Record and the Artifact bytes behind it, so a take generated yesterday is the
   take on screen today. Without it, the Run Source is still read and only the
   Build Record is refused, with the Build named.

3. **The Script text.** Word durations come from `@narratage/estimate`, the same
   syllable model the pipeline uses before generation.

An estimated timeline is a proportion, not a prediction: real cut points move
once WhisperX has aligned real audio.

## What stands in for what has not been made

A Track cannot be built without the material it places, and refusing to draw
anything until every shot exists would make the preview useless for the part of
the work it is meant for. So three things stand in, each announced rather than
presented as fact:

| Missing | Shown instead |
| --- | --- |
| A generated shot that names a picture | That picture, held for the length the shot declares |
| A generated shot that names nothing | A black frame of the programme's shape |
| Caption phrasing nobody has planned | The words cut every few Atoms, in the Program's own runs |

The first is why a preview is worth looking at before anything is generated: a
reference frame is not the take, but it is the right subject in the right shape.
Both stand-ins are marked on the clip itself — hatched for a picture, dimmed for
a black frame — and named in full when the clip is selected. Drawing them needs
`ffmpeg`; without it the shots stay unmade and the Tracks say so.

## What it draws

Every Track the Source produces, whichever package made it. The Playground asks
the compiled Source for its exports and builds the ones typed `VisualTrack` or
`AudioTrack` — so a package that grows a new kind of Track appears here without
the Playground being taught about it.

Each Track is built on its own. A Track waiting on a Provider this machine has
no key for costs only itself; the rest of the programme still plays, and the
Track says what it was waiting for rather than disappearing.

This is the compiler, not a reading of it. The Source is compiled by
`compileSourceClosure` and executed by the same Producers a build runs, so a
Source that will not build does not silently preview. Two thin decorators keep
the source positions the compiler discards — nothing else is re-implemented.

## A note on `<space:Frame>`

`right` and `bottom` are **absolute edge positions**, not insets. A Frame
spanning the middle 80% of its parent is `left="8%" right="92%"`, not
`left="8%" right="8%"` — the latter resolves to zero width and is rejected. The
Playground reports that with the offending element highlighted.
