# Banana effect reference-sync variant

An independent reference-synchronized effect variant. Its SVML/SVS/SVRun files describe the
composition and its explicitly reused performances.

From this directory, download the two existing performances before using `build.svrun`:

```sh
node ../download-reused-media.mjs
```

This writes the public example clips to `reused/`, where the Run selects them instead of generating
the same performances again. Downloaded videos stay outside Git.
