# `@svml/component-kit`

The minimal host-neutral SDK for trusted deterministic compute components. A package exports
enumerable Producer and Type-owner Validator facets. Both identities are data: an exact nominal
reference plus implementation digest and handler. Package locks and Hosts can inspect and compare
the identities without running an opaque `install()` callback. Producer handlers receive only the
Core command, Producer identity and immutable typed inputs.

They receive no ArtifactStore, credentials, network client, queue or Runtime service. Work that
needs those authorities must emit an explicit Need and be implemented by a separately selected
Provider package. `@svml/driver-node` implements the structural registrar but is not part of this
SDK.

This is dependency inversion, not a sandbox. Until components run in an isolated Worker, selected
JavaScript packages remain trusted code and may still possess ambient authority from their process.
