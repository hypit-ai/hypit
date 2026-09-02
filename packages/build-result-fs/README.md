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
in their ordered Build ids, and each Build then owns one intact directory with its `result.json`, public
Resource files and Composite Value Documents:

```text
.hypit/results/2026-09-03/<build-id>/
```

A Value Document keeps domain data separate from its nested Resource-path bindings. There is no
project-wide history database. Browsing sorts the shallow date buckets and enumerates Build directories
only inside the dates reached while filling the requested cursor page; only those Result manifests are
opened. File reads support byte ranges. Active diagnosis checks the selected directory (or its nearest
existing parent) for read/write access without creating a probe file.

Development checkouts that still contain the former flat `<result-root>/<build-id>` layout can move
those Results explicitly:

```bash
hypit-migrate-flat-results /absolute/path/to/.hypit/results
```

Normal repository reads never invoke this migration and never fall back to the flat layout.
