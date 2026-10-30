# Banana effect variant

An independent effect-swap variant built from the banana presenter. The SVML Source owns its material
and direct consumer references. Select `final.video` for the final composition.

Run `npm install` once here to install the selected Hypit 0.4, `@hypit/ranking` and font dependencies;
review and commit the generated lockfile, then use `npm ci` for repeatable installs.

From this directory, download the two existing performances before checking the Source:

```sh
node ../download-reused-media.mjs
npx hypit check swap-effect-banana.svml
```

This writes the public example clips to `reused/`, where ordinary `asset:Video` declarations feed the
media preparation used by the composition. Downloaded videos stay outside Git.
Keep the parent `ranking-football` directory when copying this example so the downloader remains
available. Review `npx hypit plan swap-effect-banana.svml --target final.video --runtime ./hypit.runtime.json` before executing the
remaining work; reusing these clips does not mean every other operation is already satisfied.
