# `@narratage/runtime-adapter-node`

Node.js environment helpers for Runtime Adapter implementations.

The package keeps Node-specific hosting out of the host-neutral `@narratage/runtime-adapter` ABI. It
defines the Node Runtime Host port loaded by the CLI and also provides:

- project-root resolution for configured relative executable paths;
- executable availability diagnostics for absolute, relative and `PATH` commands;
- explicit environment-credential diagnostics.

These functions produce `RuntimeDoctorDiagnostic` values only. They do not construct Endpoints,
read secret values, execute commands or choose fallback Providers.

`loadNodeRuntimeHost()` reads only the Runtime Profile header, verifies the separately locked package
selected by `runtime.use`, and opens its Host facet. The selected package then owns Runtime assembly,
lifecycle and storage. The generic CLI never imports `@narratage/local` or assumes a local Worker.
