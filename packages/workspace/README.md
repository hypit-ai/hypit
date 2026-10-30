# `@hypit/workspace`

Replaceable Author source and asset sessions. Filesystem, browser, Git, memory and remote
implementations can provide the same port without entering Core or the generic Host-facet package.
Each session assigns closure-local Source identities while retaining any filesystem or remote locator
inside the Host. `sourceLocation` is an optional editing/diagnostic projection, not part of author semantics.

Asset resolution returns a `BlobRef`. The matching `BlobAttachment` carries that same `blob` plus
repeatable byte readers; it is transfer authority, not a media-domain Artifact or a Host location.

An Author package that must interpret an explicitly addressed auxiliary file can call `readAsset`.
It receives copied bytes, never a filesystem path, package-manager handle or attachment registry.
The Workspace applies the same locator resolution and containment rules as `resolveAsset`; reading
does not by itself publish the file as a build attachment. This capability is for exact authored
inputs such as an installed font package's metadata, not for scanning a directory or discovering a
catalog.
