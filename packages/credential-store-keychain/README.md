# `@hypit/credential-store-keychain`

macOS Keychain-backed implementation of the domain-neutral Runtime `CredentialStore` port, including
its optional writable facet.

It resolves only explicit `{ store: "keychain", key }` references and cannot enumerate credentials.
Secrets never enter Runtime Profile or BuildState. The package invokes the bounded
`/usr/bin/security find-generic-password` command without a shell and returns no command output on
failure.

The Runtime Profile adapter accepts one optional `service` name. Selecting this package requires the
explicit `process:keychain` permission. Merely installing it grants no credential authority.

`hypit auth login <endpoint> --runtime <profile>` writes only when an Endpoint's configured
`CredentialRef.store` is `keychain` and this exact Store instance was selected. `auth status` is
read-only; `auth logout` removes only that exact account. The CLI contains no Provider-name switch.

Add a value under the service/account pair selected by the Runtime Profile with:

```bash
security add-generic-password -s hypit -a KIE_API_KEY -w
```

The account name is the `CredentialRef.key`; the secret is prompted by the `security` command and
must not be committed to source or Profile data.
