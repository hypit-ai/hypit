# `@hypit/caption-nle`

Rendering-neutral one-way materialization from complete Caption content and local timing into ordinary
NLE Component Items.

The package owns Cue selection, role/Cue presentation overrides, exact projection through a selected
Media Item and construction of complete `CaptionCuePayload` values. A Caption family supplies only its
logical component symbol and the parameters it wants persisted for one Cue. The materialized NLE keeps
no Script, Narrative, transcript, media-origin or named timing dependency.

A Style may also author an exact visibility envelope: `lead`, `tail` and same-Role `cut` or `overlap`
handoff. The adapter resolves that policy once, shifts Unit time into the widened Item-local interval,
and writes only direct Item start and duration values. The renderer never looks back up the Style or
the source timing. Exact durations are used rather than frame counts, so changing an NLE sampling rate
does not change the authored envelope.

This is an authoring adapter rather than a runtime Caption registry. `@hypit/caption-fine` and a
project's own Caption components independently own their NLE and terminal resolvers. A simpler look is
an ordinary Style passed to the same component, not a second rendering family.
