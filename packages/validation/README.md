# `@narratage/validation`

Host side semantic validation for package owned types.

Core checks nominal type connections. A component package may additionally register one pure
validator for an exact `TypeRef`. The compiler applies that validator to authored and provided
values; `NodeDriver` applies it to component and endpoint results before offering them to Core.

Validators only accept or reject. They cannot rewrite a value, create graph edges, select an
endpoint, read credentials or add author intent. The registry executes trusted installed handlers
in process.
