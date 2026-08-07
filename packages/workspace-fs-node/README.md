# `@narratage/workspace-fs-node`

Default Node filesystem implementation of the host-neutral `Workspace` contract.

Every `open()` call creates one isolated compilation session. It canonicalizes real paths, confines
SourceUnit and Source Asset reads to the configured root, rejects symlink escapes, locks each edge
to the first bytes observed and returns defensive content-addressed attachments. It contains no
Frontend, package, Core, Runtime, Provider or domain knowledge.
