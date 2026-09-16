# `@hypit/credential-store-file`

Writable Runtime `CredentialStore` backed by one owner-private document per credential key. A Runtime
Profile selects it and its Endpoint entries reference it with one stable `{ store, key }` pair, so
Sources and project files never contain the secret:

```json
"credentials": { "file": { "use": "@hypit/credential-store-file" } }
```

It needs no platform credential service, so it behaves the same on Linux, macOS and Windows; the
official Distribution's starter Runtime Profile selects it. `@hypit/credential-store-os` remains the
choice for a macOS Keychain or Windows Credential Locker account, and cannot be opened on Linux.

The adapter accepts one optional `path` naming the directory that holds the store's documents,
resolved against the Host state root and defaulting to `credentials` beside the Host's other state.
`hypit paths` prints that root. Only the exact `{ store, key }` requested is resolved or replaced; the
store cannot enumerate an environment, a Keychain or a second directory. The file name is the digest
of the key and the document repeats the key, so a hash collision or a document moved by hand is
reported instead of being read as another credential.

Every write replaces one key's document through a temporary file created owner-only (`0600`) in the
same directory and renamed into place, so a reader observes either the previous document or the new
one and never a partial one, and a symbolic link at the destination is replaced rather than followed.
Because a write touches exactly one key, processes writing different credentials cannot erase each
other's work; writers of the same key are last-write-wins. The mode is honored on POSIX systems; on
Windows the documents inherit the user profile's ACL.

A document that is damaged, unreadable or not in the place its name selects affects only its own key:
resolving it fails with the exact path, while `hypit auth logout` still removes it and the next
`hypit auth login` replaces it. `hypit doctor` reports those documents and any document another local
user can read.

Use `hypit auth login <endpoint> --runtime <profile>` to write the selected credential and
`hypit auth logout` to remove it.
