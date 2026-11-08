# `@hypit/caption-nle`

Rendering-neutral one-way materialization from complete Caption content and local timing into ordinary
NLE Component Items.

The package owns Cue selection, role/Cue presentation overrides, exact projection through a selected
Media Item and construction of complete `CaptionCuePayload` values. A Caption family supplies only its
logical component symbol and the parameters it wants persisted for one Cue. The materialized NLE keeps
no Script, Narrative, transcript, media-origin or named timing dependency.

This is an authoring adapter rather than a runtime Caption registry. Packages such as
`@hypit/caption-basic`, `@hypit/caption-fine`, or a project's own Caption family independently own
their NLE and terminal resolvers.
