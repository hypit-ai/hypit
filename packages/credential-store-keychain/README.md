# `@narratage/credential-store-keychain`

macOS Keychain-backed implementation of the domain-neutral Runtime `CredentialStore` port.

It resolves only explicit `{ store: "keychain", key }` references and cannot enumerate credentials.
Secrets never enter Runtime Profile, Runtime Closure or BuildState. The package invokes the bounded
`/usr/bin/security find-generic-password` command without a shell and returns no command output on
failure.

The Runtime Profile adapter accepts one optional `service` name. Selecting this package requires the
explicit `process:keychain` permission. Merely installing it grants no credential authority.

Add a value where the default store will find it with:

```bash
security add-generic-password -s narratage -a KIE_API_KEY -w
```

The account name is the `CredentialRef.key`; the secret is prompted by the `security` command and
must not be committed to source or Profile data.
