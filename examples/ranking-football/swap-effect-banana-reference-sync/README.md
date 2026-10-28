# Banana effect reference-sync variant

An independent reference-synchronized effect variant. Its SVML owns the composition and explicitly
reused performances; `build.svrun` is only a saved final-video target.

Run `npm ci` here to install the locked Hypit, `@hypit/ranking` and font dependencies.

From this directory, download the two existing performances before using `build.svrun`:

```sh
node ../download-reused-media.mjs
npx hypit check build.svrun
```

This writes the public example clips to `reused/`, where ordinary `asset:Video` declarations and
`realization:Select` use them instead of generating the same performances again. Downloaded videos stay outside Git.
Keep the parent `ranking-football` directory when copying this example so the downloader remains
available. Review `npx hypit plan build.svrun --runtime ./hypit.runtime.json` before executing the
remaining work; reusing these clips does not mean every other operation is already satisfied.
