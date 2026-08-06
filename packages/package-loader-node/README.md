# `@svml/package-loader-node`

Trusted installed-package activation for the Node Compiler and deterministic compute Host. One
package lock binds every selected physical package and declared dependency byte plus Module,
Frontend, Text Surface, Producer and Type Validator identities. Loading verifies all artifacts and
checks compute facets against their static Manifests before granting a Host registry.

This package is deliberately not an npm client and does not activate Provider or privileged Runtime
services. Source `<import>` can select only an already activated author module; trusted deployment
configuration independently chooses whether to grant author or deterministic compute registries.
Executable plans bind the package-lock digest as `BuildRequest.implementationClosure`.

```bash
svml-v2 lock-packages ./svml.packages.lock --package @example/cards --root .
svml-v2 check ./main.svml --package-lock ./svml.packages.lock --root .
```

See [`../../docs/node-package-activation-v1.md`](../../docs/node-package-activation-v1.md)
for the lock, trust and restart laws.
