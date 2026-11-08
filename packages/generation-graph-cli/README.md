# `@hypit/generation-graph-cli`

Thin command adapter for running an explicit Generation Graph target selection through Hypit's
long-running execution path.

```text
hypit generation run <project.graph.json> --target <node> [--target <node> ...]
```

The adapter owns argument parsing and presentation only. Project context, installed package loading,
Runtime/Profile selection and publication stores are supplied as explicit application services.
Generation lowering remains in `@hypit/generation-graph`; Producer evaluation, Endpoint preflight,
Worker startup and durable submission remain in `@hypit/build-cli`'s `submitLongBuild()` seam.

Every invocation creates a fresh Build from the saved recipe and returns its exact Product addresses.
Submission never rewrites the graph or attaches pending Product sidecars. Existing `status`, `inspect`,
`result` and `cancel` commands observe the resulting Build; this package does not duplicate them.
