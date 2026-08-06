# `@svml/component-kit`

The minimal host-neutral SDK for trusted deterministic compute components. A package may register
Producer handlers and Type-owner validators. Producer handlers receive only the Core command,
Producer identity and immutable typed inputs.

They receive no ArtifactStore, credentials, network client, queue or Runtime service. Work that
needs those authorities must emit an explicit Need and be implemented by a separately selected
Provider package. `@svml/driver-node` implements the structural registrar but is not part of this
SDK.

This is dependency inversion, not a sandbox. Until components run in an isolated Worker, selected
JavaScript packages remain trusted code and may still possess ambient authority from their process.
