# `@svml/package-loader-node`

Trusted installed-package locking and loading for Node Hosts. One package lock binds every selected
physical package and declared dependency byte plus Module, Frontend, Host-facet, Producer and Type
Validator identities. Loading verifies all artifacts and checks deterministic compute facets
against their static Manifests before returning verified `NodePackageContribution` values.

This package does not select an author syntax. Syntax-specific executable facets remain inert until
an exact Host ABI installs them. `@svml/compiler-text-node` selects the official Text Surface ABI;
`@svml/local` can load the same package's deterministic compute facets without depending on Text.

This package is deliberately not an npm client and does not activate Provider or privileged Runtime
services. Source `<import>` can select only an already installed author contribution; trusted
deployment configuration independently chooses whether to grant author or deterministic compute registries.
Executable plans bind the package-lock digest as `BuildRequest.implementationClosure`.

```bash
svml-v2 lock-packages ./svml.packages.lock --package @example/cards --root .
svml-v2 check ./main.svml --package-lock ./svml.packages.lock --root .
```

See [`../../docs/node-package-activation-v1.md`](../../docs/node-package-activation-v1.md)
for the lock, trust and restart laws.
