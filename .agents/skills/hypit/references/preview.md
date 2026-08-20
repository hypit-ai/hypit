# Preview current source

After a meaningful Author Source change, start Hypit Studio and give the author the actual URL.
Kill the previous server first so the user does not inspect a stale composition.

```bash
pkill -f "@hypit/studio" || true
pnpm studio -- --run path/to/build.svrun \
  --runtime path/to/hypit.runtime.json &
```

Read the startup output for the chosen port. `--run` is required: Studio's unit of work is the Run
Source, and it reads the Author SVML back out of it. Pass `--runtime` only when the Author Source
reuses accepted Build records.

Studio does not degrade. It has no stand-ins and no estimated timing — when a projection is missing
it refuses to open and names the issue, so a Run that opens is a Run whose Tracks all resolved.

`docs/quickstart/preview.md` is authoritative.
