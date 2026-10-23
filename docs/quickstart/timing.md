---
title: Timing & Assembly
description: Construct absolute program time, then present media and project optional semantic time explicitly.
---

Hypit has one program-time axis: `Timeline`. It is only `{ id, frameRate, frameCount }`.
It contains no clips, words, Tracks or central event registry.

For spoken work, independent facts meet around that axis:

1. Normalize accepted media into `SynchronizedMedia` plus a finite local temporal domain.
2. Construct Timeline from a DAG of named Instants, Windows and Extents with one required `end`.
3. When a consumer needs positions inside performed speech, align its Script Segment on the local domain.
4. Project requested semantic values through the equal-length Window; present ordinary media through independent Visual and Audio sources.

This separation is useful: moving a passage changes absolute relationships without changing its media or local
word evidence; reframing picture does not change audio; a pure animation needs Timeline but no media
or Script.

```svml
<import as="mediaop" from="@hypit/media-operations@1"/>
<import as="whisperx" from="@hypit/whisperx@1"/>
<import as="speechalign" from="@hypit/narrative-speech-alignment@1"/>
<import as="semantic" from="@hypit/narrative-temporal@1"/>
<import as="time" from="@hypit/timeline-author@1"/>
<import as="media" from="@hypit/media@1"/>
<import as="visual" from="@hypit/visual-track@1"/>
<import as="audio" from="@hypit/audio-track@1"/>
```

## Normalize local media

The Clock fixes the frame rate shared by the final Timeline and every local domain placed on it:

```svml
<time:Clock id="clock" frame-rate="30"/>
<mediaop:Normalize id="opening-media" source={opening-video.video}
  video="primary-moving" audio="default" span-authority="video" clock={clock}/>
<mediaop:Normalize id="answer-media" source={answer-video.video}
  video="primary-moving" audio="default" span-authority="video" clock={clock}/>
```

Normalization establishes media facts. It contains no Script meaning or program placement.

## Align meaning when the composition consumes it

Timeline construction needs the media Extent, not semantic alignment. Add Alignment when Caption,
semantic picture changes, sound events or another consumer needs Script positions inside the
accepted performance:

```svml
<whisperx:Transcription id="opening-transcription"
  media={opening-media.media} language="en"/>
<speechalign:Alignment id="opening-alignment" narrative={story}
  segment={story.segment.opening} domain={opening-media.domain}
  evidence={opening-transcription.transcript}/>
<whisperx:Transcription id="answer-transcription"
  media={answer-media.media} language="en"/>
<speechalign:Alignment id="answer-alignment" narrative={story}
  segment={story.segment.answer} domain={answer-media.domain}
  evidence={answer-transcription.transcript}/>
```

Each Transcription publishes only `SpeechTranscriptEvidence`. Each Alignment publishes only a
`NarrativeAlignment`: Segment and word boundaries measured on that local domain. Neither result
contains media or chooses a Timeline position. A Segment with no Tokens uses
`<speechalign:Alignment>` without `evidence`; its boundaries are the local domain boundaries and no
acoustic request is needed.

To retain and edit the observation, materialize it before the Build and import that Source:

```bash
hypit transcribe opening.mp4 --language en --to opening.transcript.svml
```

```svml
<import as="accepted-speech" source="./opening.transcript.svml"/>
<speechalign:Alignment id="opening-alignment" narrative={story}
  segment={story.segment.opening} domain={opening-media.domain}
  evidence={accepted-speech.transcript}/>
```

The file stores exact 16 kHz sample boundaries. Correcting those boundaries changes the derived
semantic and Caption timing on the next Build; it does not require changing Script meaning, media
placement or the Alignment operation.

## Construct the absolute Timeline

Timeline authoring is an acyclic construction graph. `end` is required; every named Instant or
Window is naturally published as an ordinary graph value:

```svml
<time:Timeline id="speech" clock={clock} end="answer.end">
  <time:Window id="opening" from="start" for={opening-media.extent}/>
  <time:Window id="answer" from="opening.end" for={answer-media.extent}/>
</time:Timeline>
```

Each `for={...extent}` uses a resolved unpositioned duration. Generated speech may therefore
determine Timeline length during ordinary graph evaluation. Use `from="opening.end+2s"` for a gap,
`from="opening.end-12f"` for overlap, or `latest(a.end,b.end)` for parallel branches. A pure animation
can simply declare `<time:Timeline id="animation" clock={clock} end="8s"/>`. The Timeline retains no
media or source-domain identity.

## Project meaning independently

Project semantic evidence by pairing each Alignment with its complete local domain and equal-length
absolute Window:

```svml
<semantic:Projection id="story-time" narrative={story} timeline={speech.timeline}>
  <semantic:Map alignment={opening-alignment.alignment}
    domain={opening-media.domain} window={speech.opening}/>
  <semantic:Map alignment={answer-alignment.alignment}
    domain={answer-media.domain} window={speech.answer}/>
</semantic:Projection>
<semantic:Window id="proof" projection={story-time} during={story.selection.proof}/>
<semantic:Instant id="claim" projection={story-time} at={story.moment.claim}/>
```

The requested outputs `proof` and `claim` are ordinary absolute Window and
Instant values. Semantic time is one
optional projection source; direct seconds, frames and named Timeline values remain equally valid.
Projection reads the exact semantic boundary. Declare a separate absolute relationship such as
`<time:Instant id="after-claim" timeline={speech.timeline} at={claim} offset="+5f"/>` when an authored
offset is needed.

## Present picture and audio

```svml
<visual:Track id="picture" timeline={speech.timeline}>
  <visual:Clip id="opening" media={opening-media.media} during={speech.opening}
    frame={speech-frame} fit="cover"/>
  <visual:Clip id="answer" media={answer-media.media} during={speech.answer}
    frame={speech-frame} fit="cover"/>
</visual:Track>

<audio:Track id="mix" timeline={speech.timeline}>
  <audio:Clip id="opening" source={opening-media.media} during={speech.opening}/>
  <audio:Clip id="answer" source={answer-media.media} during={speech.answer}/>
</audio:Track>
```

Visual and Audio Clips are peer occurrences. The same normalized media can feed both, but selecting its picture never makes its audio
audible automatically.

```text
SynchronizedMedia + Window ──────────────────────────────→ Visual / Audio occurrence

NarrativeAlignment + LocalDomain + Window ──────────────→ absolute Instants / Windows

Instant / Window / TemporalExtent DAG ───────────────────→ Timeline
```

Components ultimately consume Timeline plus absolute Instants or Windows. A domain projection
publishes those values upstream; general component Surfaces do not accept Script objects or carry
the projector.
