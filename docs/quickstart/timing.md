---
title: Timing & Assembly
description: Per-take normalization and alignment, followed by SemanticTrack assembly.
---

# Timing & Assembly

Hypit's timing authority is a `SemanticTrack`. Build it in segment-sized pieces:

1. normalize each accepted A/V take into one exact frame domain;
2. align that normalized media with its authored Script Segment to create a self-contained `SemanticTake`;
3. assemble the Semantic Takes in program order with `speech:Track`.

There is no whole-program transcription pass after concatenation. Every Take is already semantic
before it enters the Track.

```svml
<import as="program" from="@hypit/program-space@1"/>
<import as="pipeline" from="@hypit/media-pipeline@1"/>
<import as="whisperx" from="@hypit/whisperx@1"/>
<import as="speech" from="@hypit/speech-track@1"/>
<import as="space" from="@hypit/spatial@1"/>
<import as="recipes" source="./recipes.svs"/>
```

## Normalize each take

Normalization makes video, audio, duration and frame rate one explicit `SynchronizedMedia` fact.
The Clock is authored once and shared by every Take that will enter the same SemanticTrack.

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
  segment={story.segment.opening} media={opening-media.media}/>
<whisperx:SemanticTake id="answer-semantic" narrative={story}
  segment={story.segment.answer} media={answer-media.media}/>
```

Each output contains the normalized media, the Segment identity, every authored word's local frame
window, and all of that Segment's structural anchors. There are two anchors for the Segment and two
for each word. Acoustic evidence is an implementation input to this step; downstream components see
the completed `SemanticTake`, not a second evidence-shaped timing structure.

## Assemble the SemanticTrack

`speech:Track` concatenates already-semantic Takes in document order and projects three aligned
facets from the same items:

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="speech-frame" within={vertical}
  left="0%" top="0%" right="100%" bottom="100%"/>

<speech:Track id="speech"
  visual-frame={speech-frame}
  visual-appearance={recipes.speech.visual}
  visual-z="0">
  <speech:Take source={opening-semantic.take}/>
  <speech:Take source={answer-semantic.take}/>
</speech:Track>
```

| Output | Type | Meaning |
|---|---|---|
| `{speech.semantic}` | SemanticTrack | Global semantic and frame-domain authority |
| `{speech.visual}` | VisualTrack | Same-source pictures, aligned to the semantic items |
| `{speech.audio}` | AudioTrack | Same-source sound, aligned to the semantic items |

The three facets are projections of the same ordered Takes. They cannot drift independently.
`SemanticTrack` derives global frames by prefix-summing the local Take lengths, and also supplies the
program duration and frame domain required by Film and Render.

## Consume semantic time

Selections, Moments and whole Segments remain authored Script identities. A downstream component
receives the SemanticTrack once and projects those identities into frames only when it builds its
deterministic Track:

```svml
<media-track:Track id="cards" semantic={speech.semantic} canvas={vertical}>
  <media-track:Item image={card.image} extent={card-extent}
    during={story.selection.demo} frame={card-frame}
    appearance={recipes.media.card} motion={recipes.motion.card}/>
</media-track:Track>

<caption-fine:Track id="captions"
  display={story.caption}
  correspondence={story.caption.correspondence}
  semantic={speech.semantic}
  program={caption-program}
  plan={caption-plan.plan}/>

<film:Film id="main" canvas={vertical}
  semantic={speech.semantic} appearance={recipes.film.vertical}>
  <film:Track source={speech.visual}/>
  <film:Track source={speech.audio}/>
  <film:Track source={cards.visual}/>
  <film:Track source={captions.track}/>
</film:Film>

<render:Video id="final"
  composition={main.composition} semantic={speech.semantic}/>
```

Use `during={story.segment.answer}` for a whole Segment, a Selection for an authored range, a Moment
for a point event, and `during="program"` for the complete SemanticTrack domain. Components consume
`semantic={speech.semantic}`; they do not receive separate `map` and `space` values.

```text
raw take ─► Normalize ─► SynchronizedMedia ─► SemanticTake ─┐
raw take ─► Normalize ─► SynchronizedMedia ─► SemanticTake ─┤
                                                            ▼
                                                       speech:Track
                                                ┌───────────┼───────────┐
                                                ▼           ▼           ▼
                                           .semantic     .visual      .audio
                                                │           │           │
                                                └──────► Film / Tracks ◄─┘
```
