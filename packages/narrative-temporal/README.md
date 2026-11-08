# `@hypit/narrative-temporal`

Exact source-local timing for Narrative identities.

`NarrativeAlignment` locates one Segment and its Tokens in a `LocalTemporalDomain`.
`createNarrativeLocalTiming()` combines Alignments that already share a Narrative and domain.
Selection, Moment, Segment and Token queries return exact rational local values without a global
Timeline or frame grid.

The package contains no media, Caption presentation, NLE placement, matcher, AuthorGraph Producer,
Markup declaration or Hypit activation. Concrete project programs decide when to project these
transient facts into Caption timing or direct NLE values.
