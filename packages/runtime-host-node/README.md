# `@hypit/runtime-host-node`

Node.js Runtime port shared by the generic CLI and an application's chosen Runtime implementation,
plus environment helpers for Endpoint adapters.

The package keeps Node-specific process control out of the host-neutral Runtime contracts. It provides:

- project-root resolution for configured relative executable paths;
- executable availability diagnostics for absolute, relative and `PATH` commands;
- explicit environment-credential diagnostics.

These functions produce `RuntimeDoctorDiagnostic` values only. They do not construct Endpoints,
read secret values, execute commands or choose fallback Providers.

The generic CLI depends only on this port. The official video application selects
`@hypit/runtime-local` directly; Runtime Profiles vary credentials, Endpoints and their services
rather than replacing the Runtime itself or selecting Build history storage. A second application
may supply another `NodeRuntimeHost` at its Distribution assembly boundary; no unused Host plugin
registry or selector is exposed in a local Profile.

The same port lets an authoring application open a disposable transient execution. The caller hands
over a graph state, deterministic Producers, validators and temporary Resources; the Runtime keeps
Endpoint selection, handlers and concurrency for that disposable session private and returns the evaluated
state. This is an execution boundary, not a second Runtime Profile, Build type, cross-Build scheduler or
preview registry.
