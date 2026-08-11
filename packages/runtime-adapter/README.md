# `@narratage/runtime-adapter`

Host ABI for turning locked Runtime Profile data into explicitly selected Endpoint and Runtime
service packages.

One adapter has a unique `use` name and exactly one kind:

- `endpoint` constructs an external capability Endpoint;
- `runtime-service` constructs a Scheduler, Store or credential service package.

An Endpoint adapter has one pure `activate()` declaration. It parses the selected configuration once
and returns the Endpoint package, optional diagnostics and an optional warm external service. The
Endpoint package is the only source of credentials, permissions, capabilities and scheduling facts.
Activation must not resolve credentials or environment-sourced deployment values, access the network,
start a process or mutate durable state. Environment references are resolved only when the Endpoint
actually handles a Need; `doctor` may diagnose them explicitly.

Runtime-service adapters retain a separate pure `validate()` gate because constructing SQLite or a
Store can itself mutate deployment state; `doctor()` may diagnose them without calling `create()`.

The registry binds adapter implementations to the actual locked package and dependency-closure
digests. Source imports cannot select these facets or grant their permissions; only the Runtime
Profile and Host allowlist can do so.
