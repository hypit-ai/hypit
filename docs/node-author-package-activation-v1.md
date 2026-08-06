# Node author package activation v1

Status: implemented for trusted installed author facets. Compute, Provider and Runtime facet
activation remain separate work.

## 1. Purpose

Installing or updating an author component must not require a Core or CLI release. The Node author
package loader turns an explicit developer trust decision into a reproducible lock:

```text
installed package bytes
  -> explicit lock-packages command
  -> physical declared-dependency-closure digests
  -> declared Module / Frontend / Text Surface identities
  -> verified activation
  -> ordinary Node Compiler registries
```

The official CLI now names one replaceable `@svml/prelude-video` package. It no longer imports or
registers Script, Film, SVS, Media Pipeline or HyperFrames modules individually.

## 2. Package contract

An installed physical package declares a package-relative activation entry in `package.json`:

```json
{
  "name": "@example/cards",
  "version": "1.0.0",
  "svml": {
    "authorActivation": "./dist/svml-author.js"
  }
}
```

That entry exports one `svml.node-author-package@1` object containing any number of:

- immutable Module Manifests and author import specifiers;
- Author Frontends;
- Text Surface handlers with exact implementation digests.

One physical package may aggregate multiple logical modules. Logical module identity and physical
package identity remain different facts.

## 3. Explicit trust and lock

Create a lock only after installing the selected package:

```bash
svml-v2 lock-packages ./svml.packages.lock \
  --package @example/cards \
  --root .
```

Use it for author compilation:

```bash
svml-v2 check ./main.svml --package-lock ./svml.packages.lock --root .
```

Lock creation is the trust action and may inspect the selected activation export. Normal loading:

1. parses and verifies the lock digest;
2. resolves the complete installed physical declared-dependency closure;
3. hashes every package file except nested `node_modules` and `.git` directories;
4. compares the exact artifact set before importing activation code;
5. imports each activation entry;
6. compares its Module, Frontend and Surface identity digest;
7. installs the verified facets into otherwise domain-neutral registries.

Changing any locked package or dependency file requires creating a new lock. A Source import never
updates this lock and cannot download a package.

## 4. Authority boundary

This lock activates author compiler code only. It contains no:

- Provider binding or credentials;
- Scheduler or concurrency policy;
- Build, Operation or Artifact store selection;
- process, filesystem-write or network permission;
- Candidate selection or Build Target.

Runtime packages remain selected by a separate Runtime Profile/Closure. Source `<import>` merely
selects an already activated logical author module for the Source Closure.

The v1 loader executes trusted code in the CLI process after integrity verification. Node code can
attempt undeclared imports, so this is not a sandbox or proof of confinement: packages must still be
reviewed and trusted. Community execution still requires an isolated Worker and a real permission
boundary; integrity and trust are separate questions.

## 5. Executable proof

The loader and CLI tests create an installed package unknown to the repository, lock it, compile a
new namespaced Surface and then mutate the package bytes. The first build succeeds without changing
the official host; the mutated package is rejected before its activation entry is reused.

This proves the intended update blast radius:

```text
new author package
  -> install package
  -> review and regenerate package lock
  -> restart the CLI process

no Core change
no CLI source change
no database migration
no Provider reconfiguration
```

## 6. Deliberately remaining work

Package Activation is being completed one facet class at a time:

1. **completed:** `@svml/component-kit` provides the host-neutral compute installer and official
   deterministic Producer packages no longer import `@svml/driver-node`;
2. **next:** activate Type-owner validators through exact locked declarations;
3. add isolation before accepting untrusted community Frontend or Surface code.

Those steps must extend the package descriptor without granting author imports Runtime authority.
