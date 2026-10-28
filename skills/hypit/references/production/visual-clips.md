# Place pictures through Visual Track

Read this when an image, prepared video or compositable Surface should appear in the finished
picture. [Media preparation](media.md) owns source facts, [spatial layout](spatial.md) owns destination
Frames, and [timing](timing.md) owns absolute and projected time.

## Place one ordinary Clip occurrence

```text
Visual Clip = picture source + absolute Window + Frame
            + spatial mapping + optional temporal Map/Curve + optional treatment + optional Motion
Visual Track = a set of Visual Clips
```

```svml
<visual:Motion id="photo-push">
  <visual:Pose at="start" scale="1.08" easing="ease-out"/>
  <visual:Pose at="end" scale="1"/>
</visual:Motion>

<visual:Track id="picture" timeline={program.timeline}>
  <visual:Clip id="speaker" media={speaker-media.media}
    during={program.speaker} frame={layout.full} fit="cover"/>
  <visual:Clip id="photo" image={product} extent={product-extent}
    during={example} frame={layout.detail} fit="contain"
    treatment={look.visual.still} motion={photo-push}/>
</visual:Track>
```

An A-roll picture, B-roll insert, generated shot and imported graphic use the same occurrence model.
The Clip explicitly chooses what becomes visible, even when the source earlier supplied Timeline
extent or semantic evidence.

A Clip takes one source form:

- `image` with its pixel `extent` for a still;
- prepared `media` for timed picture;
- a typed `surface` for compositable pixels.

`during` accepts a resolved Window, including the complete `timeline.window`. Declare any direct
clock range as a named Timeline child or standalone `time:Window` before using it here.

Ordinary fit and alignment attributes derive the source-to-picture SpatialMap2D. Supply an authored
`space:Map` through `mapping` when the production already owns the exact relation. The Clip Frame
remains the treatment and clipping boundary. [Spatial layout](spatial.md#map-a-source-plane-and-treat-its-frame)
explains the relation.

## Keep destination time and source sampling distinct

The Window states when the occurrence contributes. For moving media, omission uses bounded native
playback from source start; source that ends before the Window leaves the remaining picture empty.

Use `visual:Map` children for another relation. Target bounds select Clip-local time; source bounds
select positions in the prepared-media local domain; paired anchors and an exact rate relate the two clocks. `wrap-from` and
`wrap-until` make a source interval periodic. Multiple non-overlapping Maps form one piecewise
relation and retain transparent gaps.

Use rate zero to hold a frame and a negative rate for reverse traversal. A Map with source and
target bounds but no rate, anchors or wrap fits the selected source interval across its target.

```svml
<visual:Clip media={shot.media} during={story.outro} frame={layout.full}>
  <visual:Map target-at="end" source-at="end" rate="1"/>
</visual:Clip>
```

Use `visual:Curve` when source position changes nonlinearly over target time. Its four source
positions must be monotone inside the prepared-media domain; adjacent pieces express a stop or
direction change. This is a sampling relation, not a visual effect or a reconstruction-quality mode.
Durations written with `f` use the Film Clock; they do not name native source-frame ordinals. Use
source-local time or edge-relative positions unless a media operation has explicitly resolved a
native frame to its presentation position.

```svml
<visual:Clip media={shot.media} during={story.ramp} frame={layout.full}>
  <visual:Curve source-at-start="start" source-control-1="start+250ms"
    source-control-2="end-250ms" source-at-end="end"/>
</visual:Clip>
```

Stills have no source clock and therefore use no temporal Map. `space:Map` and `visual:Map`/`visual:Curve` answer
different questions.

Clip declaration order becomes the Track-local item sequence. Whole-film ordering is separate: the parent
`film:Track` occurrence supplies its own `id`, and its sibling position supplies paint order. Sampling changes which source pixels appear;
Pose or `motion` moves the complete framed occurrence.

## Relate one ordinary handoff explicitly

When two adjacent Clips overlap and the outgoing Clip starts and ends first, declare a
`visual:Transition` and supply an effect such as `transition:CrossDissolve`, `transition:Push`,
`transition:LinearWipe` or `transition:BlurDissolve`. The complete overlap is
the interval; do not repeat it as another Window. Each Clip keeps its own source sampling.

## Put shared behavior in a component

A continuing presenter, slideshow, shared mask, cross-Track handoff, coordinated reveal or visual/audio
transition owns behavior beyond one adjacent two-Clip picture relation. Implement that relationship as
a project or reusable component, using Visual Track builders where useful and publishing a VisualTrack
and, when needed, an AudioTrack for Film.

Components can define local author vocabularies that fit their shared content. Caption, for example,
uses a persistent document and timed Uses; a presenter component may similarly expose its own roles
and treatments. These are component relationships, not requirements for an ordinary Clip.

Visual Track publishes `.visual` for Film and `.program` for declared tooling. It emits picture only;
place desired sound independently through [Audio Track](audio-clips.md). [Track authoring](track-authoring.md)
explains how a component publishes a visual contribution.
