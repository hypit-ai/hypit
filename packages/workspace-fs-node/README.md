# `@hypit/workspace-fs-node`

Reference Node filesystem implementation of the host-neutral `Workspace` contract.

Every `open()` call creates one isolated compilation session. It canonicalizes real paths, confines
local SourceUnit and Source Asset reads to the configured root, rejects symlink escapes, locks each
Source edge to the first bytes observed and returns defensive Resource attachments. File attachments
also carry their resolved `file:` URI so Result publication can preserve the external reference.
The Resource's identity and metadata belong to the compilation session; its file remains a live
dependency rather than becoming a persistent snapshot.

A Host may supply an external Source resolver. One explicit non-relative Source locator can then
open a SourceUnit in a separate canonical root; that Source's relative imports and assets remain
inside its own root instead of inheriting project filesystem authority. The resolver returns a
locator and a root—it does not widen either root or grant executable-package authority. This
adapter itself contains no Frontend, package-manager, Core, Runtime, Provider or domain knowledge.
