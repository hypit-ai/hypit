# `@hypit/runtime-local-cli`

CLI adapter for `@hypit/runtime-local`.

The package contributes the `runtime`, `programs`, `paths` and private Worker commands to an
explicit `@hypit/cli` application. It owns command parsing and presentation, but not the Local
Runtime, generic CLI engine or executable distribution. The executable supplies one bound
`LocalRuntimeCliDistribution`; project packages are never discovered as Local Runtime commands.
