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
```

## speech:Spine

Concatenates multiple takes into one ordered audio/visual coordinate space. The Spine defines the
program order — the final sequence of Segments in the finished video.

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<speech:Spine id="speech" canvas={vertical}>
  <speech:Take source={hook-take.video} segment={story.segment.hook}/>
  <speech:Take source={meeting-take.video} segment={story.segment.meeting}/>
  <speech:Take source={evidence-take.video} segment={story.segment.evidence}/>
  <speech:Take source={payoff-take.video} segment={story.segment.payoff}/>
</speech:Spine>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `canvas` | yes | Explicit CanvasSpace used by the restricted Media visual projection |

### speech:Take

Each `<speech:Take>` child binds a generated video to a Script Segment:

| Attribute | Required | Description |
|---|---|---|
| `source` | yes | Generated video — for example, from `seedance:ReferenceVideo` |
| `segment` | yes | Script Segment this take corresponds to — e.g. `{story.segment.hook}` |

The order of `<speech:Take>` children **determines the program order**. The first take starts at
time zero; each subsequent take follows immediately.

### Outputs

The Spine produces four outputs used by downstream components:

| Output | Type | Used by |
|---|---|---|
| `{speech.visual}` | VisualTrack | `film:Film` — the full-screen talking-head video |
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

ProgramSpace is not a component you declare — it is produced by `speech:Spine` and flows to every
component that needs to know the total program duration and frame domain.

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

## SemanticMap

The SemanticMap is the typed bridge between Script text and physical time. When you write
`during={story.selection.demo}` on a Media Item, the component uses the SemanticMap to look up the
exact frame range that Selection covers. Without a SemanticMap, Selections and Moments have no
physical meaning.

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

<!-- Assemble takes in program order -->
<space:Canvas id="vertical" width="1080" height="1920"/>
<speech:Spine id="speech" canvas={vertical}>
  <speech:Take source={opening-take.video} segment={story.segment.opening}/>
  <speech:Take source={answer-take.video} segment={story.segment.answer}/>
</speech:Spine>

<!-- Measure word timing -->
<whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>

<!-- Downstream components now reference: -->
<!-- {speech.space}  — ProgramSpace for duration/frame domain -->
<!-- {speech.visual} — VisualTrack for the talking-head video -->
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
