# `@hypit/transport-aws-lambda`

Low-level synchronous JSON invocation for Endpoint packages that execute work through AWS Lambda.
It is deliberately not an Endpoint and declares no SVML capability.

Endpoint-specific code owns:

- the request/response schema;
- whether one call completes work or returns a remote checkpoint;
- conversion into `EndpointOutcome`;
- artifact locations and intrinsic result validation;
- the function name, version/alias and retry semantics included in Endpoint configuration identity.

The transport always uses `RequestResponse`. Lambda `Event` invocation has its own at-least-once
queue and no immediate result/checkpoint, so treating it as an asynchronous Hypit Endpoint would be
misleading. An Endpoint may invoke a coordinator Lambda synchronously; that coordinator can submit
long work and return a checkpoint which the Endpoint later polls through another synchronous call.

AWS authentication uses the SDK credential chain or an injected trusted client. Large media belongs
in ResourceStore; JSON payloads are bounded by Lambda's synchronous payload limit.
