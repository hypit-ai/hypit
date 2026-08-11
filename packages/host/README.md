# `@narratage/host`

Domain-neutral contracts for concrete environments surrounding Core. This package currently owns
only the definition-time `Workspace` session and generic `ArtifactAttachment` transfer envelope.
It contains no filesystem, parser, scheduler, store, Provider or domain implementation.

A `Workspace` opens one isolated compilation session. The session supplies one entry SourceUnit,
relative Source/Asset resolution and reopenable streams for exact content-addressed assets requested
while decoding. The Host fixes identity during compilation; the Runtime verifies the streamed size
and digest while admitting bytes to its selected ArtifactStore, so source mutation cannot silently
change a Build and large media is not copied through compiler memory.
Filesystem, browser, Git, memory and remote workspaces implement the same interface. Compiler and
Runtime never infer environment selection from author imports.
