# street-interview-preview

A four-scene street interview with three cutaways and captions, read by the
[SVML Playground](../../docs/guide/svml-playground.md) against **real footage and
real speech timings**.

```bash
pnpm svml:playground -- \
  --source examples/street-interview-preview/main.svml \
  --run examples/street-interview-preview/build.svrun
```

Both badges read `measured`. Nothing here has been built: the footage and the
transcript already exist, and the Run Source says so.

## Where the timings come from

`docs/public/street-interview/transcript.json` is a word-level transcript of the
recording, but a transcript is not a SemanticMap. A map is keyed by *this*
Script's own anchor identities, and pairing loose words with authored tokens is
the aligner's job. `align-transcript.ts` runs the real one — `locateSpeechTiming`
from `@narratage/speech-alignment` — and writes two values:

```bash
node --import tsx examples/street-interview-preview/align-transcript.ts
# Aligned 101 transcript words onto 102 Script tokens.
```

The Run Source then satisfies the two Outputs a timeline needs:

```xml
<value id="aligned-map" type="@narratage/semantic-map@1#CompleteSemanticMap" from="./timing.json"/>
<satisfy output="timing.map" candidate="aligned-map"/>
```

Which timings a Source is read with is an authoring decision, so it is made in
the Run Source rather than guessed by the tool. Drop the two `<satisfy>` lines
and the same Source falls back to the syllable estimate, which lands on 26.0s
against a programme that runs 31.3s — the badge changes to `timing: estimated`
and the cutaways move.

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

**Captions on the same map.** Cue times come from the aligned map, placed by the
Script tokens each Atom corresponds to, so the words appear when they are said.

**Three levels of marker.** `<rainbow>` encloses `@fee`, which encloses
`@amount`. Each level is outlined in its own colour as the playhead passes
through, and `@amount` places nothing at all — a marker means something whether
or not a Track was hung on it.

**Markers that bind nothing.** `@seat` and `@loan` are marked in the Script but
no Media Item uses them, so they are coloured in the source and absent from the
timeline. That is a legitimate state, not an error.

## Files

`timing.json` and `space.json` are generated, and committed so the example runs
without ffprobe. Regenerate them whenever the Script text changes — the map is
keyed by the Script's tokens, so editing a word invalidates it.
