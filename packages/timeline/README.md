# `@hypit/timeline`

Domain contract for one finite absolute program-time axis.

A completed `Timeline` contains only:

- `id`;
- exact rational `frameRate`; and
- positive finite `frameCount`.

It contains no media, semantic anchors, Tracks, Canvas, author declarations or central event registry.
Every consumer that shares program time receives the same Timeline value explicitly.

[`@hypit/timeline-author`](../timeline-author/README.md) constructs this value from an acyclic graph
of named Instants, Windows and typed Extents with one required exclusive `end`. Each named declaration
naturally publishes an absolute sibling value after finalization. Local domains and media are never
fields stored inside Timeline.

Semantic time is an optional projection onto this absolute axis. A `NarrativeAlignment` locates Script
anchors in a local temporal domain; the Narrative projector maps that domain through an equal-length
Window to resolve absolute Instants and Windows. Other domains such as musical beats
can provide peer adapters without extending Timeline.

Media presentation is independent as well. Visual and Audio Clips consume ordinary PreparedMedia
with explicit absolute Windows, without asking Timeline to discover material or retaining whether
that media's Extent helped construct it.

This package validates and seals the completed value. It performs no media I/O, transcription,
generation, rendering, projection policy or Studio behavior.

`FrameSpan` is the common half-open interval on a finite frame domain. Rendering, Caption and Studio
packages compose it into their richer values instead of publishing parallel interval identities; the
interval is not media metadata or renderer state.
