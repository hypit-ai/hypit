# `@hypit/caption-fine`

The fine-grained Caption Style family. It renders a timed `CaptionDocument` as a VisualTrack.

```xml
<caption-fine:Style id="primary" recipe={recipes.caption.primary} font={caption-font}/>
<caption:Program id="captions" document={story.caption} narrative={story} default={primary}/>
<caption-fine:Track id="captions-track" document={story.caption}
  semantic={speech.semantic} program={captions}/>
```

The family owns geometry, typography and active-word painting. Cue grouping is authored by Script
segments, turns, Style changes and `||`; it is not delegated to an LLM.
