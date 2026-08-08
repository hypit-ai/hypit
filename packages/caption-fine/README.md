# `@narratage/caption-fine`

The first official fine-grained Caption Style family. It turns an SVS Recipe into one complete
`CaptionStyle`: common Cue bounds, this family's `important` planning field, and the exact rendering
parameters that understand that field.

```xml
<fine:Style id="primary" recipe={studio.caption.primary}/>

<caption:Program id="captions" words={story.caption.words} default={primary}>
  <caption:Use words={story.caption.selection.callout} style={callout}/>
</caption:Program>

<fine:Track id="captions-track" narrative={story} words={story.caption.words} map={timing.map}
  program={captions} plan={caption-plan.plan} space={speech.space}/>
```

One `fine:Track` handles the default and all ordered overrides and emits one ordinary
`VisualTrack`. The common `@narratage/caption` package does not know this package's fonts, boxes,
colors or the meaning of `important`.
