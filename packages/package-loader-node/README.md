# `@narratage/package-loader-node`

Trusted installed-package locking and loading for Node Hosts. One package lock binds every directly selected
physical package and declared dependency byte plus Module, Author/Run Frontend, Host-facet, Producer and Type
Validator identities. Loading verifies all artifacts and checks deterministic compute facets
against their static Manifests before returning verified `NodePackageContribution` values.

The caller selects only package roots. During the explicit lock action, the Loader follows exact
Module Manifest dependencies (`ModuleRef + digest`) and adds the unique installed contribution that
provides each one. This is a local dependency closure, not a built-in package map or registry.

This package does not select an author syntax. Syntax-specific executable facets remain inert until
an exact Host ABI installs them. `@narratage/compiler-markup-node` selects the official Markup Surface ABI;
`@narratage/local` can load the same package's deterministic compute facets without depending on Markup.
Run Fragment libraries use the ordinary `svml.run-fragment-host@1` Host facet; the Loader has no
Run-specific fragment field or interpretation branch.

This package is deliberately not an npm client and does not activate Provider or privileged Runtime
services. Source `<import>` can select only an already installed author contribution; trusted
deployment configuration independently chooses whether to grant author or deterministic compute registries.
Executable plans bind the package-lock digest as `BuildRequest.implementationClosure`.

```bash
narratage lock-packages ./svml.packages.lock --package @example/cards --package-root .
narratage check ./main.svml --package-lock ./svml.packages.lock --root .
```

If `@example/cards` requires a Module exported by an installed dependency, that dependency does not
need another `--package`. Missing, digest-mismatched or ambiguous providers fail while creating the
lock, before compilation.

See [`../../docs/node-package-activation.md`](../../docs/node-package-activation.md)
for the lock, trust and restart laws.
