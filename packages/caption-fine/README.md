# `@narratage/caption-fine`

The official field-free fine-grained Caption Style family. It turns one SVS Recipe into a complete
`CaptionStyle` and lowers timed whole Atoms into one ordinary peer `VisualTrack`.

Fine owns Cue geometry, typography, base/active glyph Paint, Cue box Paint and restrained local
motion. Its optional karaoke is `current | trail` by `step | wipe`; ordinary single-Word Atoms get
per-word timing while a Dual Text Atom remains one honest indivisible activation unit. It declares
no planning fields and has no `important`, random sizing or inferred Word timestamps.

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

One Track handles the default and ordered Style replacements. Common Caption, Media, Composition
and Core know none of Fine's Recipe fields or layout policy. See `spec/caption-fine.md` for the full
parameter surface, defaults, non-goals and remaining visual evidence gates.
