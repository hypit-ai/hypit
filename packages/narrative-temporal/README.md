# Narrative Temporal

`@hypit/narrative-temporal` owns the public relation between Narrative boundary identities, finite
source-local domains and one absolute Timeline. It contains no speech, media, Caption or rendering
policy.

Its `Projection`, `Instant` and `Window` author declarations are package-owned and syntax-neutral.
They receive only typed references, construct the projection graph, and publish ordinary Temporal
values. SVML supplies tag spelling through Markup; the package compiler—not the Markup parser—owns
Selection/Segment/Moment dispatch and the meaning of each `Map` child.

`NarrativeAlignment` locates Narrative boundaries as exact values on one `LocalTemporalDomain`; it
does not quantize them onto a Timeline frame grid.
`NarrativeProjection` maps one or more explicit `NarrativeAlignment + LocalTemporalDomain + Window`
relations onto one
Timeline. Narrative Selections, Moments and Segments can then project to ordinary absolute
`TemporalInstant` and `TemporalWindow` values before a general component consumes them.

```svml
<import as="semantic" from="@hypit/narrative-temporal@1"/>
<semantic:Projection id="story-time" narrative={story} timeline={program.timeline}>
  <semantic:Map alignment={opening.alignment} domain={opening.domain} window={program.opening}/>
</semantic:Projection>
<semantic:Window id="proof" projection={story-time} during={story.selection.proof}/>
<semantic:Instant id="claim" projection={story-time} at={story.moment.claim}/>
```

The Projection owns only its Maps and publishes one reusable interpretation context. Independent
declarations explicitly choose that Projection when revealing a semantic object. `proof` is an
ordinary `TemporalWindow`; `claim` is an ordinary `TemporalInstant`. General visual, audio, caption and typography components consume those
values without receiving the Projection or learning Narrative source kinds. Selection/Segment/Moment
dispatch remain owned here. The completed Projection stores the once-resolved absolute boundaries and no reusable
local-to-absolute mapping identity.

Projection reveals the exact semantic boundary. Author offsets remain ordinary absolute-time
composition: reveal the boundary first, then use a standalone `time:Instant` with
`at={claim} offset="+5f"` when that separate relationship is needed.

Speech Alignment is one producer of `NarrativeAlignment`; reviewed, manually authored or imported
relations use the same Type without pretending to be speech. Timeline and common Temporal packages
do not enumerate Narrative event kinds.
