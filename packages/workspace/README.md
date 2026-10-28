# `@hypit/workspace`

Replaceable Author/Run source and asset sessions. Filesystem, browser, Git, memory and remote
implementations can provide the same port without entering Core or the generic Host-facet package.

Asset resolution returns a `BlobRef`. The matching `BlobAttachment` carries that same `blob` plus
repeatable byte readers and, when available, a stable external location; it is transfer authority,
not a media-domain Artifact.

An Author package that must interpret an explicitly addressed auxiliary file can call `readAsset`.
It receives copied bytes, never a filesystem path, package-manager handle or attachment registry.
The Workspace applies the same locator resolution and containment rules as `resolveAsset`; reading
does not by itself publish the file as a build attachment. This capability is for exact authored
inputs such as an installed font package's metadata, not for scanning a directory or discovering a
catalog.
