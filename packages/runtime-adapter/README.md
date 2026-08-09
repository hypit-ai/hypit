# `@narratage/runtime-adapter`

Host ABI for turning locked Runtime Profile data into explicitly selected Endpoint and Runtime
service packages.

One adapter has a unique `use` name and exactly one kind:

- `endpoint` constructs an external capability Endpoint;
- `runtime-service` constructs a Scheduler, Store or credential service package.

Every adapter separates pure closed-data `validate()` from environment-touching `create()`.
`doctor()` may report diagnostics without constructing the selected service, and an Endpoint adapter
may describe one warm external service with bounded prepare/start commands and a health probe.

The registry binds adapter implementations to the actual locked package and dependency-closure
digests. Source imports cannot select these facets or grant their permissions; only the Runtime
Profile and Host allowlist can do so.
