# `@svml/credential-store-env`

Minimal local `CredentialStore` backed by explicitly named environment variables.

```ts
credentialRef("env", "KIE_API_KEY")
```

The store resolves only the requested key at Provider invocation time. It never enumerates or
serializes the environment. Secret values are handed only to that Provider call and do not enter
BuildState, Runtime Closure, Operation checkpoints, logs or SQLite through framework code.

`createProjectLocalRuntime()` activates this store by default. Production deployments may replace
it with a keychain, Vault, KMS or tenant-scoped implementation of the same `CredentialStore` port.
