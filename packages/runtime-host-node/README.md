# `@narratage/runtime-host-node`

Node.js Runtime port shared by the generic CLI and an application's chosen Runtime implementation,
plus environment helpers for Endpoint adapters.

The package keeps Node-specific process control out of the host-neutral Runtime contracts. It provides:

- project-root resolution for configured relative executable paths;
- executable availability diagnostics for absolute, relative and `PATH` commands;
- explicit environment-credential diagnostics.

These functions produce `RuntimeDoctorDiagnostic` values only. They do not construct Endpoints,
read secret values, execute commands or choose fallback Providers.

The generic CLI depends only on this port. The official video application selects
`@narratage/runtime-local` directly; Runtime Profiles vary stores and Endpoints rather than replacing
the Runtime itself.
