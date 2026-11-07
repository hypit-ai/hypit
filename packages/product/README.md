# `@hypit/product`

The common publication identity for typed products that outlive one long-running Run.

Producing packages independently decide which outputs are products by attaching
`productPublication` to their Author binding. Model generation, transcription and future analysis
use the same publication path. This package does not classify models, inspect value shapes or keep a
Type registry. Each Type owner continues to validate its value and provide any structured author
export format.

`hypit.product@1` names product lifecycle only. It is not a Provider, Endpoint, storage location or
permission to execute package code.

One durable Product is addressed by `{ publication, name }`. The publication identity currently
comes from the Run that closed it, while the name is the exact declared publication name. This
address contains no filesystem path or content hash and can be resolved without opening Run history.

Product also owns the neutral materialization of typed values. Scalars remain inline, Blob resources
become `product-file` references, and arrays or objects use `hypit.product-value@1` documents whose
resource leaves point to Product-owned files. The materializer receives an abstract write target and
resource opener; it contains no filesystem, Runtime, model or Result implementation.
The corresponding decoders live here as well, so repositories may contain Product documents without
acquiring a second interpretation of their format.

Structured Type owners may contribute a `hypit.product-exporter@1` facet that projects one Product
into an author-facing file. Product resolves that decentralized capability by exact Type; it does not
maintain an exporter registry or a switch over known media and evidence kinds.
