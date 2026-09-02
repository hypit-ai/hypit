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

Relative paths are resolved from the project root. Each Build owns one directory with
its `result.json`, public Resource files and Composite Value Documents. A Value Document keeps
domain data separate from its nested Resource-path bindings. There is no project-wide history database.
Directories use the ordered public Build id, so browsing sorts names newest first and continues with
an explicit `before` cursor; only the requested Result manifests are opened. File reads support byte
ranges. Active diagnosis checks the selected directory (or its nearest
existing parent) for read/write access without creating a probe file.
