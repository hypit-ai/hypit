# `@hypit/artifact-store-fs`

Filesystem implementation of the Runtime's transient byte port. The local Runtime gives each Build
its own working directory and removes it after the project Build Result has accepted the public
Outputs.

The Runtime Profile does not select this package or its path. It stores no Build Result, credentials
or author source. Code embedding the Runtime directly may still construct `FileArtifactStore`.
