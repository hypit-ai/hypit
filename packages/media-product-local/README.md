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
the Canvas or NLE project.

`materializeLocalMediaProductAsGenerationNode()` closes the Generation Canvas adoption seam without moving that
coordination into media code. It performs the same one-way import and returns an ordinary Media Asset value node.
The caller explicitly selects `resource` for a Blob-consuming model port or `media` for a PreparedMedia-consuming
analysis port; the chosen downstream type, not the Product's origin, determines that projection.
