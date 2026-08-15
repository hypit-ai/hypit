# `@narratage/credential-store-env`

Minimal local `CredentialStore` backed by explicitly named environment variables.

```ts
credentialRef("env", "KIE_API_KEY")
```

The store resolves only the requested key at Endpoint invocation time. It never enumerates or
serializes the environment. Secret values are handed only to that Endpoint call and do not enter
BuildState, Runtime Closure, Operation checkpoints, logs or SQLite through framework code.

`createEnvironmentCredentialStorePackage()` exposes it through the same generic Runtime infrastructure
package ABI as every other CredentialStore. A Runtime Profile must activate and select it
explicitly; `@narratage/runtime-local` supplies no credential default. Several selected Stores may coexist,
and this one declines every reference whose `store` is not `env`.

The environment facet is intentionally read-only. Interactive `auth login/logout` requires a
selected Store with the optional bounded writable facet, such as the macOS Keychain adapter.
