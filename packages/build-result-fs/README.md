# `@hypit/build-result-fs`

Default project Build Result repository backed by ordinary files. The local Runtime uses
`.hypit/results` when `results` is omitted from its Profile, so a normal checkout needs no account or
external service.

An explicit selection can move the same repository elsewhere:

```json
{
  "results": {
    "use": "@hypit/build-result-fs",
    "config": { "path": ".hypit/results" }
  }
}
```

Relative paths are resolved from the Runtime Profile's directory. Each Build owns one directory with
its `result.json`, public files and structured values. There is no project-wide history database.
