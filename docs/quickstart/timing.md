---
title: Timing & Assembly
description: Per-take normalization and alignment, followed by Timeline assembly.
---

For spoken video, a `Timeline` connects the authored Script to the actual performance. This is
the natural time source for captions, word-triggered graphics and coverage. Build it in segment-sized pieces:

1. normalize each accepted A/V take into one exact frame domain;
2. align that normalized media with its authored Script Segment to create a self-contained `SemanticTake`;
3. assemble the Semantic Takes in program order with `time:Timeline`.

Every Take is already semantic before it enters the Timeline assembly. Pictures can be presented by
Media Track or a project component independently of this semantic and audio assembly.

A purely visual animation uses the same Timeline with an explicit end and zero Takes.
See [an authored film clock](./composition.md#a-film-drawn-entirely-by-components). It can use seconds
or frames for events; spoken work can use Script Selections and Moments for the same visual behavior.

```svml
<import as="program" from="@hypit/program-space@1"/>
<import as="pipeline" from="@hypit/media-pipeline@1"/>
<import as="whisperx" from="@hypit/whisperx@1"/>
<import as="time" from="@hypit/timeline-author@1"/>
<import as="media-track" from="@hypit/media-track@1"/>
  <import as="performance" from="@hypit/performance@1"/>
<import as="space" from="@hypit/spatial@1"/>
<import as="recipes" source="./recipes.svs"/>
```

## Normalize each take

Normalization makes video, audio, duration and frame rate one explicit `SynchronizedMedia` fact.
The Clock is authored once and shared by every Take that will enter the same Timeline.

```svml
<program:Clock id="clock" frame-rate="30"/>

<pipeline:Normalize id="opening-media" source={opening-video.video}
  video="primary-moving" audio="default" span-authority="video" clock={clock}/>
<pipeline:Normalize id="answer-media" source={answer-video.video}
  video="primary-moving" audio="default" span-authority="video" clock={clock}/>
```

Normalization contains no Script meaning and performs no transcription. It only establishes the
media facts that later semantic alignment can trust.

## Create one SemanticTake per Segment

`whisperx:SemanticTake` measures one normalized Take and aligns the evidence with exactly one
authored Segment:

```svml
<whisperx:SemanticTake id="opening-semantic" narrative={story}
  segment={story.segment.opening} media={opening-media.media} language="en"/>
<whisperx:SemanticTake id="answer-semantic" narrative={story}
  segment={story.segment.answer} media={answer-media.media} language="en"/>
```

`language` is required on every alignment call and accepts any code WhisperX ships an alignment
model for on both the local and the hosted Endpoint: `ar`, `ca`, `cs`, `da`, `de`, `el`, `en`, `es`,
`eu`, `fa`, `fi`, `fr`, `gl`, `he`, `hi`, `hr`, `hu`, `it`, `ja`, `ka`, `ko`, `lv`, `ml`, `nl`, `nn`,
`no`, `pl`, `pt`, `ro`, `ru`, `sk`, `sl`, `sv`, `te`, `tl`, `tr`, `uk`, `ur`, `vi` and `zh`. It is
passed unchanged to WhisperX; Hypit does not detect or route languages from Script text or audio.

Each output contains the normalized media, the Segment identity, every authored word's local frame
window, and all of that Segment's structural anchors. There are two anchors for the Segment and two
for each word. Acoustic evidence is an implementation input to this step; downstream components see
the completed `SemanticTake`, not a second evidence-shaped timing structure.

## Assemble the Timeline

`time:Timeline` places prepared Takes sequentially by default, or at authored `at` positions,
and provides the complete Timeline. Performance and Sound present its pictures and audio separately:

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="speech-frame" within={vertical}
  left="0%" top="0%" right="100%" bottom="100%"/>

<time:Timeline id="speech" clock={clock}>
  <time:Take source={opening-semantic.take}/>
  <time:Take source={answer-semantic.take}/>
</time:Timeline>
<import as="sound" from="@hypit/sound@1"/>
<sound:Style id="voice-style"/>
<sound:Track id="voice" timeline={speech.timeline}>
  <sound:Use style={voice-style}/>
</sound:Track>
<performance:Style id="performance-style" frame={speech-frame} appearance={recipes.media.performance}/>
  <performance:Track id="performance" timeline={speech.timeline} canvas={vertical}>
    <performance:Use style={performance-style} during="program"/>
  </performance:Track>
```

| Output | Type | Meaning |
|---|---|---|
| `{speech.timeline}` | Timeline | Global semantic and frame-domain authority |
| `{voice.audio}` | AudioTrack | Sound presentation of the placed Takes |

Performance and Sound use the same prepared Takes and source positions.
Each Take's global frames are its placement start plus its local frames. The first omitted `at` is
zero; later omitted `at` follows the preceding Take's end. Use `at="previous.end+2s"` for a gap,
`at="previous.end-12f"` for overlap, or an absolute position. Timeline `end` defaults to the latest
content end; `end="content.end+2s"` reserves a tail and `end="30s"` declares a fixed extent.
All positions resolve to exact frames and the extent contains all Takes. Empty Timelines require
an authored positive end. No placeholder media fills uncovered time.

## Consume semantic time

Selections, Moments and whole Segments remain authored Script identities. A downstream component
receives the Timeline once and projects those identities into frames only when it builds its
deterministic Track:

```svml
<media-track:Track id="cards" timeline={speech.timeline} canvas={vertical}>
  <media-track:Item image={card.image} extent={card-extent}
    during={story.selection.demo} frame={card-frame}
    appearance={recipes.media.card} motion={recipes.motion.card}/>
</media-track:Track>

<caption-fine:Track id="captions"
  document={story.caption}
  timeline={speech.timeline}
>
  <caption-fine:Use style={primary-caption}/>
</caption-fine:Track>

<film:Film id="main" canvas={vertical}
  timeline={speech.timeline} appearance={recipes.film.vertical}>
  <film:Track source={performance.visual}/>
  <film:Track source={voice.audio}/>
  <film:Track source={cards.visual}/>
  <film:Track source={captions.track}/>
</film:Film>

<render:Video id="final"
  composition={main.composition} timeline={speech.timeline}/>
```

Use `during={story.segment.answer}` for a whole Segment, a Selection for an authored range, a Moment
for a point event, and `during="program"` for the complete Timeline domain. Components consume
`timeline={speech.timeline}`.

```text
prepared Takes → Timeline → Performance / project scene → visual ─┐
                         ├→ Caption / semantic graphics → visual ┤
                         └→ Sound → audio ───────────────────────┤
                                                                Film
```
