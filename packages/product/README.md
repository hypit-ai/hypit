# `@hypit/product`

The common publication identity for typed products that outlive one long-running Run.

Producing packages independently decide which outputs are products by attaching
`productPublication` to their Author binding. Model generation, transcription and future analysis
use the same publication path. This package does not classify models, inspect value shapes or keep a
Type registry. Each Type owner continues to validate its value and provide any structured author
export format.

`hypit.product@1` names product lifecycle only. It is not a Provider, Endpoint, storage location or
permission to execute package code.
