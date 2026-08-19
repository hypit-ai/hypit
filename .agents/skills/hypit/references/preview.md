# Preview current source

After a meaningful Author Source change, start the SVML Playground and give the author the actual
URL. Kill the previous server first so the user does not inspect a stale composition.

```bash
pkill -f svml-playground || true
pnpm svml:playground -- --source path/to/main.svml \
  --run path/to/build.svrun \
  --runtime path/to/hypit.runtime.json &
```

Read the startup output for the chosen port. Pass `--run` only when the preview needs Run Source
material or timing, and `--runtime` only when the Author Source reuses accepted Build records.
`docs/quickstart/preview.md` is authoritative.
