# `@svml/host`

Domain-neutral contracts for concrete environments surrounding Core. This package currently owns
only the definition-time `Workspace` session and generic `ArtifactAttachment` transfer envelope.
It contains no filesystem, parser, scheduler, store, Provider or domain implementation.

A `Workspace` opens one isolated compilation session. The session supplies one entry SourceUnit,
relative Source/Asset resolution and the exact content-addressed bytes requested while decoding.
Filesystem, browser, Git, memory and remote workspaces implement the same interface. Compiler and
Runtime never infer environment selection from author imports.
