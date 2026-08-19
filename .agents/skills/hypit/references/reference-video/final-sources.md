# Reference-video final sources

After every required package exists and its vocabulary has been read, read
`../authoring.md` completely and write one complete project:

- `main.svml` describes the whole video in original time order, keeps continuing base/sound intact,
  and represents one continuing overlay as one visual track.
- `studio.svs` contains every Recipe actually referenced by `main.svml`, using only declared
  properties and admitted values.
- `build.svrun` references the Author Source and declares the required Targets with resolvable
  dependencies.

Do not author one source fragment per shot. Do not let check success substitute for unresolved
semantic evidence; return to a narrow `observe_reference` question when necessary.

Use existing checks only:

```bash
pnpm check
pnpm hypit check path/to/main.svml
pnpm hypit check path/to/studio.svs
pnpm hypit check path/to/build.svrun
```

Fix package resolution and package implementation before repairing source use. Continue until all
three files are accepted. Do not create `check_svml_project` or another wrapper.
