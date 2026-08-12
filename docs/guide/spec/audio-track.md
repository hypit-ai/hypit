---
title: SVML Audio Track Authoring
description: implemented pre-release contract for the generic official Audio Track package, including.
---

# SVML Audio Track Authoring

Status: implemented pre-release contract for the generic official Audio Track package, including
its self-described author Surface, exact sample-domain lowering and local/remote execution witness.
It is not yet a frozen public ABI.

## Purpose

`@narratage/audio-track` lets an author place already selected and normalized audio material into
ProgramSpace. Music, sound effects, additional voice-over and source audio are ordinary peers. The
package owns no privileged base lane and Composition mixes its result through the existing
[`AudioTrack`](./track-composition.md) terminal contract.

This is a video-domain author package, not a Core primitive, Runtime service or Provider. The
separation is:

```text
explicit media source ─> inspect/select/normalize ─> SynchronizedMedia
                                                        │
Narrative points / ProgramSpace ─> temporal window ─────┼─> Audio Track Program
source trim ─> occupancy ─> level/fades ────────────────┘          │
                                                                   ▼
                                                              AudioTrack
                                                                   │
                                                                   ▼
                                                       audio plan -> Provider
```

Core sees fixed graph inputs and one output Record. It does not know clips, buses, music, speech,
looping, fading or mixing.

## 1. Input truth

Every audio item receives its material through an explicit graph edge. A first implementation
should consume `SynchronizedMedia` from `@narratage/media` and require its normalized audio member:

- 48 kHz;
- stereo;
- signed 16-bit PCM WAV;
- exact sample-frame count;
- preserved source level.

An MP4 merely containing AAC is not an audio item. The author graph must explicitly inspect the
container, select an audio stream and normalize it. Likewise, a generated speech file does not
become `SpeechAudioBasis` merely because it contains a voice.

The Audio Track lowerer may derive the terminal Artifact duration from the normalized sample-frame
count. It must not copy source identities, Narrative digests, provider names or other lineage into
the clip. Those relations remain graph edges and Derivations.

Do not introduce a new public `AudioMaterial` Type merely to shorten one edge. If several unrelated
packages later need a first-class canonical-audio value, that focused intrinsic Type belongs in
`@narratage/media`; it still does not belong in Core or an umbrella contracts package.

## 2. Author Program

The package owns an arbitrary-length collection of independent items. Conceptually each item has:

```ts
type AudioItemProgram = {
  readonly id: string;
  readonly source: SynchronizedMediaInput;
  readonly temporal: TemporalBinding;
  readonly trim?: AudioSourceTrim;
  readonly occupancy: AudioOccupancy;
  readonly mix: AudioItemMix;
};
```

These are package-level concerns. They are not new fields on Core Operations or the terminal
`AudioTrack` contract.

An illustrative author Surface may remain compact:

```xml
<audio:Track id="mix" space={speech.space}>
  <audio:Clip
    source={music.media}
    during={program}
    playback="loop"
    gain={0.28}
    fade-in="800ms"
    fade-out="1200ms"
  />

  <audio:Clip
    source={impact.media}
    at={story.moment.reveal}
    for="420ms"
    playback="once"
  />
</audio:Track>
```

This spelling is illustrative rather than a frozen Surface. `during`, `at` and `for` must lower to
the shared point-expression and window-projection algebra; they cannot create a second timing
engine.

## 3. Temporal placement

Audio uses the same rules as [`track-authoring.md`](./track-authoring.md):

1. locate Selection, Moment or Program points;
2. expand `one` or `each` occurrences;
3. project a directed candidate window;
4. intersect and validate it against ProgramSpace;
5. apply audio source trim and occupancy;
6. lower both target placement and source sampling into the exact 48 kHz sample domain.

Audio items are independent. Overlapping projected windows mix; they are never clipped according
to authoring order, auto-stitched, deduplicated or treated as competing alternatives. Several Audio
Track values behave the same as several overlapping items in one Audio Track.

ProgramSpace frame boundaries are converted to 48 kHz sample boundaries by the one deterministic
rule already owned by the media pipeline. The author package must not implement another seconds-to-
samples rounding path.

## 4. Source trim

Source trim defines the effective intrinsic interval before occupancy. It is an explicit head and
optional tail within the exact normalized sample domain. Author-facing seconds or frames are
quantized once into sample boundaries.

The lowerer rejects:

- a negative or out-of-source boundary;
- an end not greater than the start;
- an empty effective interval;
- an unavailable audio member;
- a second, package-private interpretation of source duration.

Source trim is not target timing. Moving a target window never silently changes which source region
was authored, except where the selected occupancy policy explicitly aligns or retimes it.

## 5. Audio occupancy

Audio has its own truthful occupancy vocabulary. It must not reuse the visual fiction of holding one
sample forever.

```ts
type AudioOccupancy =
  | { readonly mode: "once"; readonly align: "start" | "end" }
  | { readonly mode: "loop"; readonly align: "start" | "end" }
  | {
      readonly mode: "stretch";
      readonly minRate: number;
      readonly maxRate: number;
      readonly pitch: "preserve";
    };
```

The laws are:

| Policy | Effective source shorter than window | Effective source longer than window |
|---|---|---|
| `once/start` | play at the start, then silence | play the source head and truncate at the window end |
| `once/end` | silence first, then play to the end | play the source tail and end at the window end |
| `loop/start` | repeat from the source-head phase | play the source head and truncate |
| `loop/end` | choose phase so the source tail meets the window end | play the source tail |
| `stretch` | slow into the complete window | accelerate into the complete window |

`once` replaces the old ambiguous `native` / `finish` behavior. End alignment is not reverse
playback. `loop/end` changes loop phase; it does not reverse samples. `stretch` is pitch-preserving,
must stay inside the authored rate bounds and fails rather than silently applying a faster rate and
then truncating. The old `fit_base` rule—speed up by at most 1.1x and silently cut the rest—is
retired.

Explicit silence is represented by the absence of a clip over that interval. Padding a file with
silence is a separate media transformation when the padded bytes themselves matter.

## 6. Level and fades

The first author contract needs only three orthogonal controls:

- non-negative linear `gain`;
- `fadeIn` over the audible rendered interval;
- `fadeOut` over the audible rendered interval.

Zero gain is explicit silence. A UI or recipe may expose decibels, but conversion to terminal linear
gain is deterministic and package-owned. Fade durations must be non-negative, cannot exceed the
audible interval and cannot secretly expand the target window.

There is no implicit loudness normalization, limiter, compressor, sidechain ducking, crossfade or
automatic music-bed behavior. Those are legitimate future audio-processing or mix Programs, but
they must consume explicit inputs and make their behavior author-visible. A runtime or Provider may
not add them as an environment preference.

The former terminal `bus: speech | music | sfx | source` label has been removed. It had no rendering
effect and therefore carried no honest meaning. A future mix-routing contract must have an explicit
consumer and graph behavior; merely naming a clip `music` cannot cause ducking.

## 7. Lowering and execution

The deterministic author package lowers every realized item to an ordinary terminal `AudioClip`:

- exact target `{ startSample, endSampleExclusive }` from temporal projection;
- canonical WAV Artifact from the normalized input;
- exact source sample interval, loop phase and playback rate from trim/occupancy;
- pitch-preservation intent, linear gain and exact sample fades from presentation.

Composition validates the Audio Track against an explicitly connected ProgramSpace. The media
pipeline then compiles all peer Audio Tracks into one content-addressed `AudioProgramPlan`. Local
FFmpeg, Lambda or another Provider executes that same plan; Provider placement cannot reinterpret
the mix.

The package emits one `AudioTrack` even when it owns many clips. That is an author-component output,
not a privileged lane. A package that naturally owns one visual hit and one sound hit may emit peer
`VisualTrack` and `AudioTrack` outputs from one Fragment, while Film receives both through ordinary
edges.

## 8. Legacy migration audit

Retain:

- arbitrary audio inputs;
- Program-full, Selection, Moment and absolute placement;
- overlapping music/SFX/voice contributions;
- per-item gain and fades;
- one-shot, loop and bounded pitch-preserving stretch;
- explicit source trim and start/end alignment.

Retire:

- dynamic numbered ports as the saved author truth;
- `z_index` on audio;
- implicit full timing hidden in a node executor;
- config-row priority clipping;
- `fit_base` and its silent speed-then-truncate behavior;
- `fill: freeze` for audio;
- automatic extraction of whatever audio happens to be inside a video;
- inert bus labels and hidden mastering.

## 9. Implementation and acceptance

The shared Temporal package and the pre-freeze terminal Audio candidate have now been completed
without a Core branch, Provider-family branch or privileged Film lane:

1. **Implemented:** add the `@narratage/audio-track` author package and self-described Surface;
2. **Implemented:** consume explicit normalized `SynchronizedMedia` inputs;
3. **Implemented:** sample-exact trim and every occupancy law;
4. **Implemented:** lower to the peer terminal `AudioTrack`;
5. **Implemented:** graph tests for arbitrary item counts and Selection/Moment `one` / `each`;
6. **Implemented:** sample-level tests for shorter/equal/longer sources, both alignments, loops, stretch bounds
   and fades;
7. **Implemented:** two overlapping items and two peer Audio Tracks produce the same planned mix facts;
8. **Implemented:** local FFmpeg and remote Lambda Providers receive the identical
   content-addressed `AudioProgramPlan`; the real FFmpeg witness additionally checks exact loop
   phase sample by sample.

The migration is incomplete if adding this package requires a Core branch, a Film audio family, a
new queue, a Provider name in SVML or a hidden Base-audio rule.
