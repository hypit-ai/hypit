# `@hypit/build-result-fs`

Default project Build Result repository backed by ordinary files. The local Runtime uses
`.hypit/results` when the project has no `hypit.results.json`, so a normal checkout needs no account or
external service.

An explicit selection can move the same repository elsewhere:

```json
{
  "format": "hypit.build-results@1",
  "use": "@hypit/build-result-fs",
  "config": { "path": ".hypit/results" }
}
```

Relative paths are resolved from the project root. Results are grouped by the UTC date already encoded
in their ordered Build ids. Each Build has a directory containing its `result.json`, new public
Resource files and Composite Value Documents:

```text
.hypit/results/2026-09-03/<build-id>/
```

A Value Document keeps domain data separate from its nested Resource-path bindings. There is no
project-wide history database. Browsing sorts the shallow date buckets and enumerates Build directories
only inside the dates reached while filling the requested cursor page; only those Result manifests are
opened. File reads support byte ranges. Active diagnosis checks the selected directory (or its nearest
existing parent) for read/write access without creating a probe file.

Existing resources keep their addresses, including inside nested Composite values. External Workspace
files remain live references; reused Result files retain their original owning Build. See the shared
[Result value and reference model](../build-result/README.md) for ownership and export behavior.

## Publication

Runtime execution state stays in the Runtime's store. Result synchronization publishes newly accepted
public Outputs: it saves new Resource files and Value Documents, then replaces `result.json`.
Internal graph progress and already published Outputs cause no Result writes. A private `.writer.json`
holds the file assignments needed while publishing and is removed at completion. The Runtime saves
all accepted public Outputs and the final outcome before removing active execution state, including
when the Build fails or is cancelled.

Files are written completely beside their destination before publication. POSIX systems use `rename`;
Windows uses `SetFileInformationByHandle(FileRenameInfoEx)` with replacement and POSIX semantics through
Koffi. Existing readers keep their old file, while subsequent opens see the new one. This platform code
belongs to the filesystem implementation; the Result model and other repository adapters do not
depend on it. A filesystem that rejects this operation reports the Windows error without timed retries.

The Windows behavior is defined by Microsoft's
[FileRenameInformationEx documentation](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-fscc/4217551b-d2c0-42cb-9dc1-69a716cf6d0c).
