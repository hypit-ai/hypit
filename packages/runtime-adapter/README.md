# `@narratage/runtime-adapter`

Host ABI for turning locked Runtime Profile data into explicitly selected Endpoint and Runtime
service packages.

One adapter is addressed by `(kind, use)`:

- `endpoint` constructs an external capability Endpoint;
- `runtime-service` constructs a Scheduler, Store or credential service package.

The two kinds have separate Host ABIs, so an Endpoint and Runtime service may intentionally share
one `use` spelling. A physical package advertises the logical name through its Host-facet `offers`;
the Runtime Profile never has to name that package once the inventory binds the offer.

An Endpoint adapter has one pure `activate()` declaration. It parses the selected configuration once
and returns the Endpoint package, optional diagnostics and an optional warm external service. The
Endpoint package is the only source of credentials, capabilities and scheduling facts.
Activation must not resolve credentials or environment-sourced deployment values, access the network,
start a process or mutate durable state. Environment references are resolved only when the Endpoint
actually handles a Need; `doctor` may diagnose them explicitly.

Runtime-service adapters retain a separate pure `validate()` gate because constructing SQLite or a
Store can itself mutate deployment state; `doctor()` may diagnose them without calling `create()`.

The registry binds adapter implementations to the actual locked package and dependency-closure
digests. Source imports cannot select these facets; only the Runtime
Profile and Host allowlist can do so.
