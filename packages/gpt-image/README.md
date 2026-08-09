# `@narratage/gpt-image`

Exact model/compute contracts for GPT Image 2 requests.

One closed Port Table accepts the supported scalar settings and optional reference images. Runtime-
produced references remain explicit Blob edges: the model-owned Draft is bound one edge at a time,
then finalized into the only `GenerationRequest` a Provider can receive. The package owns model
semantics but no API key, Provider selection, queue or network code. `@narratage/provider-kie` is
one optional Runtime implementation.

The one physical package exposes two independently importable logical modules:

- `@narratage/gpt-image@1`: the raw exact model;
- `@narratage/gpt-image/clean@1`: generation followed by the existing explicit image-transform
  Program, exporting one cleaned image while retaining both operations in the graph.

It currently exposes low-level Draft/Fragment factories rather than a high-level Prompt Surface.
Prompt authoring and assembly are intentionally deferred to the separate Prompt redesign; that work
will not change the media edges, exact request or Provider contract described here.
