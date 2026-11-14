# `@hypit/module`

Host-neutral semantic Module declarations and identities. This package is the public owner of
`ModuleRef`, `TypeRef`, `CapabilityRef` and `ProducerRef`; their small storage helpers are
implemented here without depending on a universal graph protocol. Consumers do not pass through the
Value representation to name semantic owners.

A Module names Types and the Modules whose Types it may reference. Capability and Producer references
reuse the same owner/name identity mechanics, but their declarations belong to Generation. Packages
publish one `hypit.module` Facet containing only the Module definition; a package used by Generation
publishes its Capability and Producer declarations separately through `hypit.generation-module`.

The Facet kind and a `ModuleRef` are unversioned identities. A `ModuleRef` is only the owner name, such
as `@studio/score-strip`; Type, Capability and Producer identities add their local name with `#`. npm
semver and the consumer lockfile select the installed implementation, so semantic references do not
copy a decorative `version` field or `@1` suffix.

Generation Build owns its resolved closure, Generation declarations, Author Graph, Build Plan,
commands, facts and state machine. This package contains no closure, Build, Runtime, Provider,
filesystem or media behavior.
