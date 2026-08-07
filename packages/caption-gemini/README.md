# `@narratage/caption-gemini`

Exact Gemini Caption planning, without transcript correction, Style selection or timing authority.

The package consumes an already-resolved `CaptionProgram`. Gemini sees only its immutable left-side
display atoms and the planning requirements for each resolved run. It never receives WhisperX
text, timestamps or the right side of Dual Text, and it cannot return replacement wording.

```xml
<caption-ai:Planner
  id="caption-plan"
  narrative={story}
  program={caption-program}
  model="gemini-2.5-flash"
/>
```

The output is `caption-plan.plan`. Its response has one entry per Program run. Within each run the
model may only:

- choose `after_atom_id` Cue boundaries that partition the run exactly once and in order;
- attach declared field values to atoms inside that Cue.

Fields are generic per-atom attributes, not hard-coded emphasis spans. A Style may declare no
fields, one `important` flag, independent `best` and `medium` flags, enums, bounded numbers, or any
other combination expressible by its declarations. Each atom may receive zero, one or multiple
attributes. The validator enforces ids, value types and per-Cue cardinality before a `CaptionPlan`
enters the graph.

Model choice is author-visible. Network execution is separate: a Runtime explicitly binds the
exact Gemini capability to `@narratage/provider-google-vertex` or another compatible endpoint. The local
Scheduler owns concurrency; credentials and transport never enter `.svml` or BuildState.
