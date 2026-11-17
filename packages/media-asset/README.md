# `@hypit/media-asset`

Portable, file-first author documents for media explicitly accepted into a Project Boundary. A document stores
one manifest-relative primary file, its durable `MediaInterpretation`, and independently owned Representations.
It contains no execution resource handles, hashes, freshness state, Provider facts or NLE placement.

The `service` entry opens the shared Media Asset collection lifetime used by one `ProjectHost`. Its catalog is a
finite projection of current manifests and current file availability. `service/node` supplies the ordinary local
directory adapter; refresh rereads the collection and does not maintain byte identity or freshness truth.
