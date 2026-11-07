# Resource Store

Public Distribution entry points are `@hypit/hypit/resource-store` and
`@hypit/hypit/resource-store/node`; workspace packages depend on the owning
`@hypit/resource-store` package directly.

Domain-neutral byte storage keyed by opaque Resource identity.

`ResourceStore` and its optional streaming extension know nothing about Build, Runtime, Endpoint,
media, NLE or filesystem policy. Equal bytes stored twice retain independent identities. Callers own
retention and lifecycle.

The package exports `MemoryResourceStore` for request-private work. `@hypit/resource-store/node`
exports `FileResourceStore`, an explicit directory-backed implementation with atomic publication of
completed resources. Runtime execution, local NLE export and direct media tools may each supply their
own store without acquiring one another's lifecycle.
