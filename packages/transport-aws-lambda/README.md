# `@svml/transport-aws-lambda`

Low-level synchronous JSON invocation for Provider packages that execute work through AWS Lambda.
It is deliberately not a Provider and declares no SVML capability.

Provider-specific code owns:

- the request/response schema;
- whether one call completes work or returns a remote checkpoint;
- conversion into `ProviderEndpointResult`;
- artifact locations and affinity validation;
- the function name, version/alias and retry semantics included in Provider configuration identity.

The transport always uses `RequestResponse`. Lambda `Event` invocation has its own at-least-once
queue and no immediate result/checkpoint, so treating it as a recoverable SVML Endpoint would be
misleading. A Provider may invoke a coordinator Lambda synchronously; that coordinator can submit
long work and return a checkpoint which the Provider later polls through another synchronous call.

AWS authentication uses the SDK credential chain or an injected trusted client. Large media belongs
in ArtifactStore; JSON payloads are bounded by Lambda's synchronous payload limit.
