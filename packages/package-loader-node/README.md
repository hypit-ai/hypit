# `@svml/package-loader-node`

Trusted installed-package activation for the Node author compiler. A package lock binds the bytes
of every selected physical package and declared dependency, plus the public identities of its Module,
Frontend and Text Surface facets. Loading verifies all artifact bytes before executing any
activation entry.

This package is deliberately not an npm client and not a Runtime loader. Source `<import>` can
select only an already activated author module; it cannot activate Providers, credentials, stores,
queues, processes or network access.

```bash
svml-v2 lock-packages ./svml.packages.lock --package @example/cards --root .
svml-v2 check ./main.svml --package-lock ./svml.packages.lock --root .
```

See [`../../docs/node-author-package-activation-v1.md`](../../docs/node-author-package-activation-v1.md)
for the lock, trust and restart laws.
