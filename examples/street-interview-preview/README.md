# street-interview-preview

A four-scene street interview with three cutaways and captions, opened in Hypit Studio against
**real footage and real speech timings**.

```bash
pnpm studio -- --run examples/street-interview-preview/build.svrun
```

The checked-in Run selects the real footage. Its normalized A-roll passes through one
`whisperx:SemanticTake` per Segment, and Speech Track assembles those products into the continuous
`speech.semantic` track used by every timed component.

## Where the timings come from

Each normalized A-roll video produces acoustic evidence. WhisperX aligns that evidence against the
corresponding authored Segment and emits a self-contained `SemanticTake`: media, local word windows
and all local anchors travel together. Speech Track preserves their authored order and adds only
the prefix offsets needed to form one global `SemanticTrack`.

## Where the picture comes from

Each `<file>` candidate names footage the documentation site already ships, and
each `<satisfy>` binds it to the Output that Take or Item was authored against.
The footage is 24 fps, which is the frame rate this Source declares, so the
preview shows it as authored. Material of another frame rate is refused with a
reason rather than resampled — normalizing is a real transcode and belongs to
the media pipeline.

## What it demonstrates

**Three cutaways, one Track.** `@bags`, `@fee` and `@receipt` are disjoint
Selections, so all three share a single timeline row.

**Full-frame cutaways.** All three are shot 9:16 like the scenes, so they cut
away from the whole frame rather than sitting inside it. `motion.cut` fades them
in over two frames, which is what a cut looks like; `@receipt` uses `motion.drop`
instead, so one of the three is visibly doing something else.

**Captions on the same track.** Cue times come from the SemanticTrack, placed by the
Script tokens each Atom corresponds to, so the words appear when they are said.

**Three levels of marker.** `<rainbow>` encloses `@fee`, which encloses
`@amount`. Each level is outlined in its own colour as the playhead passes
through, and `@amount` places nothing at all — a marker means something whether
or not a Track was hung on it.

**Markers that bind nothing.** `@seat` and `@loan` are marked in the Script but
no Media Item uses them, so they are coloured in the source and absent from the
timeline. That is a legitimate state, not an error.
