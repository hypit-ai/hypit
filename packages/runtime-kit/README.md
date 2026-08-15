# `@narratage/runtime-kit`

Host ABI for turning a Runtime Profile into explicitly selected Endpoints and Runtime infrastructure.

One adapter is addressed by `(kind, use)`:

- `endpoint` constructs an external capability Endpoint;
- `infrastructure` constructs a package instance exposing Scheduler, Worker, Store or Credential parts.

The two kinds have separate Host ABIs, so an Endpoint and Runtime infrastructure may intentionally share
one `use` spelling. A physical package advertises the logical name through its Host-facet `offers`,
and the Runtime Profile selects that package by name.

An Endpoint adapter has one pure `activate()` declaration. It parses the selected configuration once
and returns the Endpoint package, optional diagnostics and an optional Managed Program. The
Endpoint package is the only source of credentials, capabilities and scheduling facts.
Activation must not resolve credentials or environment-sourced deployment values, access the network,
start a process or mutate durable state. Environment references are resolved only when the Endpoint
actually handles a Need; `doctor` may diagnose them explicitly.

Runtime infrastructure adapters retain a separate pure `validate()` gate because constructing SQLite or a
Store can itself mutate deployment state; `doctor()` may diagnose them without calling `create()`.

The registry binds adapter implementations to the selected package contribution. Source imports cannot
select these facets; only the Runtime Profile may do so.
