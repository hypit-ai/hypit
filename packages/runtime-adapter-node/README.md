# `@narratage/runtime-adapter-node`

Node.js environment helpers for Runtime Adapter implementations.

The package keeps Node-specific filesystem, `PATH` and environment checks out of the host-neutral
`@narratage/runtime-adapter` ABI. It currently provides:

- project-root resolution for configured relative executable paths;
- executable availability diagnostics for absolute, relative and `PATH` commands;
- explicit environment-credential diagnostics.

These functions produce `RuntimeDoctorDiagnostic` values only. They do not construct Endpoints,
read secret values, execute commands or choose fallback Providers.
