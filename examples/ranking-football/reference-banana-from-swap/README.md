# Banana-from-swap variant

An independent ranking variant using the banana presenter. Its SVML, SVS, and project Runtime
Profile describe the full generation and composition. The neighboring `swap-effect-banana` variant
demonstrates reuse of existing performances.

From this directory, install the selected 0.4 dependencies, review and commit the generated lockfile,
then check the Author Source:

```sh
npm install
npx hypit check reference-banana-from-swap.svml
```

The project installs `@hypit/ranking` from npm. Review its Runtime Profile and
`npx hypit plan reference-banana-from-swap.svml --target final.video --runtime ./hypit.runtime.json` before paid execution.
