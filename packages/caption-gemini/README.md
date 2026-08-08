# `@narratage/caption-gemini`

Exact Gemini Caption planning, without transcript correction, Style selection or timing authority.

```xml
<caption-ai:Planner
  id="caption-plan"
  words={story.caption.words}
  program={caption-program}
  model="gemini-2.5-flash"
/>
```

Gemini receives the immutable ordered display words and the planning requirements of each resolved
Program run. It never receives WhisperX text, timestamps or the pronunciation side of Dual Text,
and it cannot return replacement wording.

Within each run the response may only:

- choose `after_word_id` boundaries that partition the run exactly once and in order;
- attach declared field values to `word_id` values inside that Cue.

Fields are generic per-word attributes. A Style family may declare no fields, one `important`
boolean, several independent booleans, enums or bounded numbers. A word may receive zero, one or
multiple fields. The model package validates word identities, Cue coverage, Cue word bounds, field
types and per-Cue cardinality before a `CaptionPlan` enters the graph.

Model choice remains author-visible. Network execution is separate: a Runtime explicitly binds the
exact Gemini capability to `@narratage/provider-google-vertex` or another compatible Endpoint.
Credentials, queues and transport never enter `.svml` or BuildState.
