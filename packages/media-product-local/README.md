# `@hypit/media-product-local`

One-way local handoff from an exact file Product to an ordinary Media Asset.

`materializeLocalMediaProduct()` accepts a concrete `{ publication, name }` Product address, stages only that
Product's media bytes, then reuses `@hypit/media-local` inspection and `@hypit/media-asset` publication. The final
manifest contains the copied media file and its interpretation; it contains no Build id, Product address, Result
path or Provider identity.

Only a Product whose public representation is one `audio/*`, `image/*` or `video/*` file is accepted. Structured
outputs such as `TimedTranscript` continue through their Type owner's Product exporter instead of pretending to
be media. The destination Media Asset and media filename are explicit and existing files are never overwritten.

The function owns no queue or Canvas mutation. A CLI may await it directly; a desktop Host may show its transient
progress and, after success, apply a separate author transaction that adds the returned Media Asset reference to
the Generation Graph, Canvas or NLE project. That application-level edit chooses the projection required by its
downstream port; Product materialization itself does not depend on any of those authoring systems.
