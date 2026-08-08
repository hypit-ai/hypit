# `@narratage/caption-fine`

The first official fine-grained Caption Style family. It turns an SVS Recipe into one complete
`CaptionStyle` and lowers timed Cues into one ordinary `VisualTrack`.

Fine means short semantic Cues with deterministic geometry, typography and paint. Every Word in a
Cue has one uniform static appearance. This family declares no planning fields and has no
`important`, karaoke, random sizing or per-Word motion semantics.

```xml
<fine:Style id="primary" recipe={studio.caption.primary}/>

<caption:Program id="captions" display={story.caption} default={primary}/>

<fine:Track
  id="captions-track"
  display={story.caption}
  correspondence={story.caption.correspondence}
  map={timing.map}
  program={captions}
  plan={caption-plan.plan}
  space={speech.space}
/>
```

One Track handles the default and ordered Style replacements and emits one peer `VisualTrack`.
Common Caption, Media, Composition and Core know none of Fine's Recipe fields or layout policy.
