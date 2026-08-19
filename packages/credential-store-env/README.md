# `@hypit/credential-store-env`

Read-only `CredentialStore` backed by explicitly named environment variables.

```ts
credentialRef("env", "KIE_API_KEY")
```

It resolves only the requested key when an Endpoint needs it. It never enumerates or serializes the
environment, and declines references owned by another store. The Runtime Profile must select this package;
installing it grants nothing.
