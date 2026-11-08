# `@hypit/narrative`

Provider-neutral values for authored language structure and semantic references.

A `Narrative` owns speech Tokens, Segments, structured Role Turns, semantic Anchors, Selections and
Moments. It owns no Script source syntax, Caption document, media, time, prompt or NLE placement.
Standalone Script is one possible producer; another authoring tool can create the same typed value.

The package validates identities and queries Selection content through existing Anchors and Tokens.
It is a pure TypeScript domain library and registers no Hypit Module, Record refinement, Producer,
SVML declaration or Runtime capability.
