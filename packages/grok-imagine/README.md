# `@svml/grok-imagine`

Exact author/compute contracts for Grok Imagine video generation.

It exposes distinct text, image and 1.5-preview endpoints. Each request is nominally typed and
validated before yielding a provider-neutral `GeneratedVideoSet`. The package declares the model
choice; it does not route to another model or access a Provider. `@svml/provider-kie` is one
optional Runtime implementation.
