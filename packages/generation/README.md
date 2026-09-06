# `hypit/generation`

Provider-neutral generated-media contracts shared by exact image, video and audio model packages.

External Model and Provider packages import this public subpath from the `hypit` Distribution.
It gives both sides the same request and result vocabulary without a dependency between their
implementations. `sealGenerationPortTable` describes a model's inputs; `GenerationWireMapping` and
`compileWireRequest` can translate those inputs to one Provider's documented wire fields.

The package owns `GenerationRequest`, `GeneratedImageSet` and `GeneratedVideoSet` identities,
schemas, validators and graph facets. Generated sets are atomic Products: a Provider persists the
returned bytes in an ResourceStore and returns typed Blob references rather than transient URLs.

This package does not choose a model, Provider, credential, queue or retry policy. Model packages
declare exact request Capabilities; Endpoint packages such as `@hypit/provider-kie` implement those
Capabilities in a selected Runtime Profile.
