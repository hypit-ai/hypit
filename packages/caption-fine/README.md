# `@narratage/caption-fine`

The first official fine-grained Caption Style family. It turns an SVS Recipe into one complete
`CaptionStyle` and lowers timed Cues into one ordinary `VisualTrack`.

The accepted target is deliberately plain: semantic Cue bounds plus one deterministic static
appearance shared by every word in the Cue. Fine will declare no planning fields. `important`,
random word sizing, karaoke state and per-word motion are not part of this family. The current
executable baseline still contains the temporary optional `important` experiment; that is a known
implementation delta, not a compatibility promise.

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
colors or placement rules.
