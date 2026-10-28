# Choose and compose picture and sound

Read this to decide how content enters the finished picture or mix. [System](system.md) explains the
whole model; [media preparation](media.md), [timing](timing.md) and [spatial layout](spatial.md) own
shared inputs.

## Choose by relationship

| Relationship | Starting point | Output |
| --- | --- | --- |
| Place an image, prepared video or surface | [Visual Clip](visual-clips.md) | VisualTrack |
| Place speech, music, narration, ambience or effects | [Audio Clip](audio-clips.md) | AudioTrack |
| Present Script display words at resolved Cue times | [Caption](caption-presentation.md) | package-owned VisualTrack |
| Supply independent writing | [Typography/Text](fonts-and-text.md) | package-owned VisualTrack |
| Apply color, blur, opacity or affine treatment to an accumulated picture | Visual Adjustment with a package-owned treatment inside the intended Film Stack | VisualTrack |
| Hand off between two adjacent overlapping Visual Clips | Visual Transition with a package-owned effect | VisualTrack |
| Close several sound contributions with explicit gain | [Audio Clip](audio-clips.md#combine-closed-audio-contributions) | AudioTrack |
| Coordinate continuing sources, cross-Track or visual/audio transitions, ducking, layout or state | [Project component](track-authoring.md) | declared VisualTrack and/or AudioTrack |

These are starting points, not a catalogue of visual roles. Images, text and video can share a scene
when they share behavior.

## Use prepared media through independent occurrences

Preparation can establish picture and sound streams on one local domain. Timeline may use its
Extent, while Visual and Audio Clips independently pair the media with an absolute Window:

```text
prepared media + Window + visual sampling -> Visual Clip -> VisualTrack
prepared media + Window + audio sampling  -> Audio Clip  -> AudioTrack
```

This supports A-roll without coupling picture and sound. The picture can be covered or reframed
while speech continues; audio-only and picture-only material need only their real contribution.

## Let shared behavior determine scope

A picture can occupy a projected Selection, a sound can follow a Moment, and a board can retain its
answer after a reveal. Components receive the resolved absolute values they need. Shared motion or
state can justify one component; independent contributions can remain peers while using the same
event.

## Assemble the intended film

Film receives Canvas, Timeline and each selected visual/audio output. Components establish their
local picture programmes; the parent Film scope establishes order between complete visual
contributions through named `id`/`z` memberships. Film Stack closes a local group of VisualTracks
when that composite needs one shared treatment. Audio remains outside visual Stacks; combine it into
a closed AudioTrack before Film when shared gain or routing is required. Include picture and sound
explicitly, and select one intended route for each audible source.

[Rendering](rendering.md#assemble-the-picture-and-sound) shows Film assembly and delivery.
[Review](review.md) judges the resulting picture, performance and complete mix.
