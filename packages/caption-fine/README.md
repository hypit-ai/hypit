# `@narratage/caption-fine`

The official field-free fine-grained Caption Style family. It turns one SVS Recipe into a complete
`CaptionStyle` and lowers timed whole Atoms into one ordinary peer `VisualTrack`.

Fine owns Cue geometry, typography, base/active glyph Paint, Cue box Paint and restrained local
motion. Its optional karaoke is `current | trail` by `step | wipe`; ordinary single-Word Atoms get
per-word timing while a Dual Text Atom remains one honest indivisible activation unit. It declares
no planning fields and has no `important`, random sizing or inferred Word timestamps.

```xml
<media:Font id="caption-font" src="./Inter-SemiBold.woff2" weight="600" style="normal"/>
<media:Font id="caption-cjk" src="./NotoSansCJK-SemiBold.otf" weight="600" style="normal"/>
<fine:Style id="primary" recipe={studio.caption.primary} font={caption-font}>
  <fine:Fallback font={caption-cjk}/>
</fine:Style>

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

One Track handles the default and ordered Style replacements. `font=` plus ordered `Fallback`
children form an exact font stack for reproducible builds; all faces reference existing Media
`FontArtifactRef` values and must match the Recipe's weight/style. Omitting the stack is the explicit
environment-font prototype path. Fine never clips author text and intentionally has no `max-lines`.
Common Caption, Composition and Core know none of Fine's Recipe fields or layout policy. See
`spec/caption-fine.md` for the full parameter surface, defaults and non-goals.
