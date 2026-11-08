# `@hypit/toolchain`

Distribution assembly shared by Hypit's long-running Generation system and direct media tools. It
selects the starter Runtime Profile and exposes three explicit service ports:

- `buildOperations` for accepted Build history, logs, cancellation and Product export;
- `generation` for Generation Graph submission and media Product materialization;
- `localRuntime` for Local Runtime lifecycle commands.

The package is not a domain owner. Models, Providers, Endpoints, Product exporters, NLE terminals and
media tools remain independently owned packages selected by ordinary npm dependencies. The root
executable is the composition root and explicitly binds their CLI modules.

SVML parsing, Author compilation, Source discovery, the old Source Build CLI and `vocabulary` are not
part of this assembly. The optional `@hypit/svml-toolchain` application adds them over these shared
services. A Generation Graph file or an NLE project therefore does not acquire a Source language just
because it uses the official Distribution.

The starter Runtime Profile selects ordinary independently distributed Providers and Credential
Stores by package name. Local Runtime and project publication-store adapters remain Host concerns and
do not enter Generation Graph, NLE or Product values.

## Boundary

Toolchain may depend on Runtime, loader, Product and official capability packages needed by the
Distribution. It must not own Source syntax, visual components, models, Providers, renderers or
filesystem formats merely because the executable ships them.
