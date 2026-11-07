# Narrative Temporal

`@hypit/narrative-temporal` owns exact source-local timing for Narrative identities. It contains no
media, Caption presentation, NLE placement, global Timeline, frame grid or rendering policy.

`NarrativeAlignment` locates one Segment and its Tokens on a named `LocalTemporalDomain`. Alignment
may come from speech evidence, a subtitle-file adapter or another package; this package does not know
which matcher or provider produced it.

`NarrativeLocalTiming` combines one or more Alignments that already share the same Narrative and local
domain. It keeps exact rational boundary values. Selection, Moment, Segment and Token queries therefore
return source-local values and ranges without quantizing them to frames.

```svml
<import as="semantic" from="@hypit/narrative-temporal@1"/>

<semantic:Timing id="story-time" narrative={story} domain={speech.domain}>
  <semantic:Alignment value={opening.alignment}/>
  <semantic:Alignment value={closing.alignment}/>
</semantic:Timing>
```

The declaration only aggregates already measured local facts. It does not place them in a programme.
A concrete consumer chooses the next operation:

- `@hypit/narrative-caption` turns bound Tokens into `LocalCaptionTiming` in the same domain;
- an NLE materializer maps that local timing through a chosen clip and stores direct project times;
- a programme adapter may map the same facts through an explicit `TemporalMap` for one occurrence.

Those adapters may yield zero, one or many occurrence-local regions. This package deliberately does
not recreate a global Narrative Timeline or serialize a named dependency into an NLE project.
