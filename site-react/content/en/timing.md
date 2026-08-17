---
title: Timing & Assembly
description: Speech Spine assembly and WhisperX alignment — connecting generated takes to a unified timeline.
---

# Timing & Assembly

After generation, individual takes must be concatenated into one continuous A/V coordinate space,
and the spoken words must be measured against the actual audio to create a timing map. These two
steps produce the **ProgramSpace** and **SemanticMap** that every downstream component depends on.

```svml
<import as="speech" from="@narratage/speech-spine@1"/>
<import as="whisperx" from="@narratage/whisperx@1"/>
<import as="space" from="@narratage/spatial@1"/>
<import as="studio" source="./studio.svs"/>
```

## speech:Spine

Concatenates multiple takes into one ordered audio/visual coordinate space. The Spine defines the
program order — the final sequence of Segments in the finished video.

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="speech-frame" within={vertical} left="0%" top="0%" right="100%" bottom="100%"/>
<speech:Spine id="speech" frame-rate="30"
  visual-frame={speech-frame} visual-appearance={studio.speech.visual} visual-z="0">
  <speech:Take video={hook-take.video} segment={story.segment.hook}/>
  <speech:Take video={meeting-take.video} segment={story.segment.meeting}/>
  <speech:Take video={evidence-take.video} segment={story.segment.evidence}/>
  <speech:Take video={payoff-take.video} segment={story.segment.payoff}/>
</speech:Spine>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `frame-rate` | yes | Program rate as an integer or rational, such as `30` or `30000/1001` |
| `visual-frame` | yes | Explicit base SpatialFrame for same-source Take visuals |
| `visual-appearance` | yes | SVS Recipe containing only spatial fit properties |
| `visual-z` | yes | Base absolute stacking order for same-source Take visuals |

### speech:Take

Each `<speech:Take>` child binds one speech-bearing source to a Script Segment:

| Attribute | Required | Description |
|---|---|---|
| `video` | exactly one | Generated/raw A/V Blob — for example `{take.video}` from Seedance |
| `audio` | exactly one | Voice-only Blob; contributes time and master speech audio, but no visual |
| `media` | exactly one | Already prepared `SynchronizedMedia`; bypasses automatic normalization |
| `segment` | yes | Script Segment this take corresponds to — e.g. `{story.segment.hook}` |
| `frame` | visual only | Override the Spine's `visual-frame` for this Take |
| `appearance` | visual only | Override the Spine's `visual-appearance` for this Take |
| `z` | visual only | Override the Spine's `visual-z` for this Take |

`video`, `audio` and `media` are mutually exclusive. The normal AIGC path is `video={take.video}`. The
Speech Surface expands that readable declaration into ordinary Media Pipeline Operations:
inspect the container, select its primary moving video and default audio stream, then normalize
both to the Spine's declared frame rate. A 30 fps source connected to a 60 fps Spine keeps its
duration and is deterministically resampled to a 60 fps frame sequence; it is not played twice as
fast. Use `media=` only when another graph branch has already produced the exact synchronized value
you intend to assemble.

The base is deliberately explicit rather than a hidden full-screen default. A visual Take inherits
all three values unless it overrides them. An audio Take cannot declare visual overrides: while it
is playing, `speech.visual` simply has no Present, so the Film background or peer Tracks remain
visible.

For voiceover timing, use an audio Take and supply the visuals through peer Media Tracks:

```svml
<speech:Spine id="speech" frame-rate="30"
  visual-frame={speech-frame} visual-appearance={studio.speech.visual} visual-z="0">
  <speech:Take audio={narration.audio} segment={story.segment.narration}/>
</speech:Spine>
```

The fit Recipe is ordinary compile-time SVS data, for example:

```svs
speech.visual { fit: cover; }
```

The order of `<speech:Take>` children **determines the program order**. The first take starts at
time zero; each subsequent take follows immediately.

### Outputs

The Spine produces four outputs used by downstream components:

| Output | Type | Used by |
|---|---|---|
| `{speech.visual}` | VisualTrack | `film:Film` — sparse same-source Take visuals |
| `{speech.audio}` | Audio | `whisperx:Alignment` — raw audio for word timing |
| `{speech.audioTrack}` | AudioTrack | `film:Film` — the synchronized audio |
| `{speech.space}` | ProgramSpace | Everything — the unified duration and frame domain |

## whisperx:Alignment

Measures word-level timing by running WhisperX speech-to-text alignment on the Spine's audio output.
This produces the **SemanticMap** — the bridge between Script text and physical time.

```svml
<whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `narrative` | yes | The Script component — e.g. `{story}` |
| `audio` | yes | Audio from the Speech Spine — `{speech.audio}` |

### Output

| Output | Type | Used by |
|---|---|---|
| `{timing.map}` | CompleteSemanticMap | Caption Style-family Tracks, `media-track:Track`, `text:Track` — timed placement |

The SemanticMap maps every authored Script anchor to a time point. It covers all `2M + 2N` identities
(where M = total speech tokens, N = number of Segments). This is how Selections and Moments declared
in the Script become real time ranges and points for downstream visual components.

## ProgramSpace

ProgramSpace is not guessed from a global default. It is produced by `speech:Spine` from the
explicit `frame-rate` and the exact normalized Take durations, then flows to every component that
needs the total program duration and frame domain.

```svml
<film:Film id="main" canvas={vertical} space={speech.space} ...>
<caption-fine:Track id="captions" ... space={speech.space} .../>
<text:Track id="titles" space={speech.space}>
<render:Video id="final" composition={main.composition} space={speech.space}/>
```

ProgramSpace owns:

- **Duration** — the total program length
- **Frame rate** — rational frame rate (e.g. 30fps)
- **Frame domain** — exact frame numbers for the entire program

Every component that operates in the time domain takes a `space` attribute pointing to
`{speech.space}`.

### Speech-free programs

A speech-free film still needs an explicit, verified ProgramSpace. Select a previously accepted
ProgramSpace Record in the Run Source with `build-record` and `satisfy`, then connect that named
logical output to Tracks and Film. Use `during="program"` or explicit `start`/`end` windows. Without
speech there is no measured SemanticMap, so omit WhisperX and Caption components and do not use
Selection/Moment timing. See [Reusing results](./run.md#reusing-results) for Run Source syntax.

## SemanticMap

The SemanticMap is the typed bridge between Script text and physical time. When you write
`during={story.selection.demo}` on a Media Item, the component uses the SemanticMap to look up the
exact frame range that Selection covers. Without a SemanticMap, Selections and Moments have no
physical meaning.

A whole Segment needs no synthetic Selection. `during={story.segment.answer}` addresses the
Segment's existing structural start/end anchors directly.

Components that use the map take it via the `map` attribute:

```svml
<media-track:Track id="cards" map={timing.map} ...>
<caption-fine:Track id="captions" ... map={timing.map} .../>
```

The map contains final token windows and semantic anchor points only. It does not propagate
`measured`, `derived` or `estimated` labels. WhisperX evidence and the deterministic M:N aligner are
responsible for using the available recording evidence; downstream Tracks receive one complete map
and do not reinterpret how each point was obtained.

## Combination example

The complete timing stage, from generated takes to map and space:

```svml
<import as="speech" from="@narratage/speech-spine@1"/>
<import as="whisperx" from="@narratage/whisperx@1"/>
<import as="space" from="@narratage/spatial@1"/>
<import as="studio" source="./studio.svs"/>

<!-- Assemble takes in program order -->
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="speech-frame" within={vertical} left="0%" top="0%" right="100%" bottom="100%"/>
<speech:Spine id="speech" frame-rate="30"
  visual-frame={speech-frame} visual-appearance={studio.speech.visual} visual-z="0">
  <speech:Take video={opening-take.video} segment={story.segment.opening}/>
  <speech:Take video={answer-take.video} segment={story.segment.answer}/>
</speech:Spine>

<!-- Measure word timing -->
<whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>

<!-- Downstream components now reference: -->
<!-- {speech.space}  — ProgramSpace for duration/frame domain -->
<!-- {speech.visual} — sparse same-source speech VisualTrack -->
<!-- {speech.audioTrack} — AudioTrack for synchronized audio -->
<!-- {timing.map}    — SemanticMap for Selection/Moment timing -->
```

The data flow:

```text
generated video(s) ─────► speech:Spine ──► whisperx:Alignment
                              │                    │
                         .visual              .map (SemanticMap)
                         .audio                    │
                         .audioTrack               ▼
                         .space ──────────► caption-fine:Track
                              │            media-track:Track
                              │            text:Track
                              ▼            film:Film
                         film:Film         render:Video
```
