# `@hypit/credential-store-os`

Writable Runtime `CredentialStore` backed by the current user's operating-system credential locker:
macOS Keychain or Windows Credential Locker. Runtime Profiles use one stable `{ store: "os", key }`
reference on both systems; Source and project files never contain the secret.

The adapter accepts one optional `service` name. It reads, writes or deletes only the exact
service/account pair requested by the selected Endpoint and cannot enumerate credentials. Windows
passes the request over a private child-process pipe to the packaged PowerShell bridge, so secret
bytes do not appear in command arguments or temporary files.

Use `hypit auth login <endpoint> --runtime <profile>` to write the selected credential and
`hypit auth logout` to remove it.
