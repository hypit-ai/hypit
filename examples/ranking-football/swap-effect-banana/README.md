# Banana effect variant

An independent effect-swap variant built from the banana presenter. The SVML source owns its material
and durable realization choices; `reuse.svrun` is only a saved final-video target.

Run `npm ci` here to install the locked Hypit, `@hypit/ranking` and font dependencies.

From this directory, download the two existing performances before using `reuse.svrun`:

```sh
node ../download-reused-media.mjs
npx hypit check reuse.svrun
```

This writes the public example clips to `reused/`, where ordinary `asset:Video` declarations and
`realization:Select` use them instead of generating the same performances again. Downloaded videos stay outside Git.
Keep the parent `ranking-football` directory when copying this example so the downloader remains
available. Review `npx hypit plan reuse.svrun --runtime ./hypit.runtime.json` before executing the
remaining work; reusing these clips does not mean every other operation is already satisfied.
