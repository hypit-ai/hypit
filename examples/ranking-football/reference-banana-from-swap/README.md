# Banana-from-swap variant

An independent ranking variant using the banana presenter. Its SVML, SVS, SVRun, and project Runtime
Profile describe the full generation and composition. `build.svrun` uses the authored generation
route; the neighboring `swap-effect-banana` variant demonstrates reuse of existing performances.

From this directory, install the selected 0.4 dependencies, review and commit the generated lockfile,
then check the Invocation:

```sh
npm install
npx hypit check build.svrun
```

The project installs `@hypit/ranking` from npm. Review its Runtime Profile and
`npx hypit plan build.svrun --runtime ./hypit.runtime.json` before paid execution.
