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
| `--run <build.svrun>` | A Run Source, read for material it already names. |
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
| `picture: partial` | Some elements have their footage; the rest are placeholders. |
| `picture: estimated` | Nothing has been shot or generated yet. |

The two are separate claims. A Source can have all its footage and still have an
estimated timeline, because where a cut lands is a question about speech, not
about files.

The Playground prefers real things, in this order:

1. **A completed build.** If `.svml/state.sqlite` holds a build that finished, its
   `timing.map` and `speech.space` replace the estimate outright, and its
   `final.video` becomes the picture.
2. **A Run Source.** Which timings a Source is read with is an authoring
   decision, so `<satisfy>` is where it is made:

   | Candidate | Supplies |
   | --- | --- |
   | `<file from="./shot.mp4" media-type="video/mp4"/>` | Material you already have. |
   | `<value type="…" from="./timing.json"/>` | A value on disk, such as an alignment produced elsewhere. |
   | `<build-record build="…" output="timing.map"/>` | A value an earlier build accepted. |

   Material degrades one element at a time: a Take or an Item shows real frames
   when its source exists and already lives in the program's frame domain, and a
   placeholder when it does not. Reading a file's frame rate needs `ffprobe` on
   the path; without it every Item keeps its placeholder and says so. Footage of another frame rate is refused with a
   reason rather than resampled, because normalizing is a real transcode and
   belongs to the media pipeline.
3. **The Script text.** Token durations come from `@narratage/estimate`, the same
   syllable model the pipeline uses before generation.

An estimated timeline is a proportion, not a prediction: real cut points move
once WhisperX has aligned real audio. If a store is from a newer schema, or its
build never completed, the Playground falls back to estimates rather than
showing you a measured timeline it cannot vouch for.

## Placeholders

A Take's video and a Media Item's video are produced by Providers, so until one
has run each Item contributes a painted rectangle instead. That keeps the
preview free of Artifacts entirely, which is both honest and scrubbable: a
`<video>` with an unresolvable source would render nothing and seek nowhere.

The placeholder fills the whole Placement Frame, because that is what a frame
paint does. Where a Recipe declares padding, a dashed guide shows where real
material will land.

## What it interprets

`<script>`, `<space:Canvas>`, `<space:Frame>`, `<space:AnchoredFrame>`,
`<space:AspectFrame>`, `<speech:Spine>` and its Takes, `<media-track:Track>` and
its Items, `<fonts:Stack>`, `<caption-fine:Style>` and `<caption-fine:Track>`,
`<film:Film>` for the clear colour, and `.svs` source imports.

Captions are drawn with the exact face the Source names. Cue times come from the
same map the Tracks read, placed by the Script tokens each Atom corresponds to —
so captions land on the same timeline as the B-roll rather than on a second,
unrelated guess. An Atom with no spoken token divides its Cue evenly, and the
header says how many did.

Everything else — every generation Surface, `<whisperx:Alignment>`, the
Typography Tracks, `<render:Video>` — is read, counted under "not projected"
in the strip, and skipped. A Source is worth previewing even when most of it is
produced by Providers, and clicking an entry there points the code pane at it.

This is a shallow interpreter, not the compiler. It walks the authored markup
with `@narratage/markup`'s own parser and calls each package's own pure
projection functions. It never elaborates the graph and never constructs a Host.

## A note on `<space:Frame>`

`right` and `bottom` are **absolute edge positions**, not insets. A Frame
spanning the middle 80% of its parent is `left="8%" right="92%"`, not
`left="8%" right="8%"` — the latter resolves to zero width and is rejected. The
Playground reports that with the offending element highlighted.
