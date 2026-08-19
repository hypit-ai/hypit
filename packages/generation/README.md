# `@hypit/generation`

Provider-neutral generated-media contracts shared by exact image, video and audio model packages.

The package owns `GenerationRequest`, `GeneratedImageSet` and `GeneratedVideoSet` identities,
schemas, validators and graph facets. Generated sets are atomic Products: a Provider persists the
returned bytes in an ArtifactStore and returns typed Blob references rather than transient URLs.

This package does not choose a model, Provider, credential, queue or retry policy. Model packages
declare exact request Capabilities; Endpoint packages such as `@hypit/provider-kie` implement those
Capabilities in a selected Runtime Profile.
