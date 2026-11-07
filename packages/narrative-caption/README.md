# Narrative Caption

`@hypit/narrative-caption` is the explicit adapter between source-neutral Caption content and
source-local Narrative timing.

`NarrativeCaptionBinding` relates each Caption Unit to one or more Narrative Token identities.
Combining that binding with a `CaptionDocument` and `NarrativeLocalTiming` produces ordinary
`LocalCaptionTiming` in the same exact `LocalTemporalDomain`:

```svml
<narrative-caption:Timing id="story-captions"
  document={story.caption}
  binding={story.caption-binding}
  timing={story-time}/>
```

The adapter does not know about a Timeline, NLE Track, frame rate, style, renderer or speech matcher.
It preserves rational source-local boundaries as sided regions. A Caption component may consume the
result directly, while an NLE materializer may map it through a chosen clip and bake direct editable
items. Neither path creates a live named dependency inside the NLE project.
