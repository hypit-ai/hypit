# `@hypit/generation-graph-cli`

Thin command adapter for running an explicit Generation Graph target selection through Hypit's
long-running execution path.

```text
hypit generation check <project.graph.json>
hypit generation plan <project.graph.json> --target <node> [--target <node> ...]
hypit generation run <project.graph.json> --target <node> [--target <node> ...]
hypit generation materialize <build-id> --output <node> --to <asset.media.json>
```

`check` reports package-owned ready, incomplete and invalid node states without requiring a Runtime.
`plan` prepares one strict target selection and projects the same deterministic Producer evaluation,
Endpoint support and Runtime preflight that `run` enforces before submission.

The adapter owns argument parsing and presentation only. Project context, installed package loading,
Runtime/Profile selection and publication stores are supplied as explicit application services.
Generation lowering remains in `@hypit/generation-graph`; Producer evaluation, Endpoint preflight,
Runtime execution startup and durable submission pass through the independent
`@hypit/build-submission` seam.

Every invocation creates a fresh Build from the saved recipe and returns its exact Product addresses.
Submission never rewrites the graph or attaches pending Product sidecars. Existing `status`, `inspect`,
`result` and `cancel` commands observe the resulting Build; this package does not duplicate them.

`generation materialize` is the explicit return seam for one generated media Product. The CLI passes its exact
Product address and destination to an application-provided materializer. The official Toolchain uses
`@hypit/media-product-local`; another Host may provide a different implementation. The command never selects a
latest result, edits the Generation Graph or adds a Canvas node.
