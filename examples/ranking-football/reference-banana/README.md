# Banana reference variant

An independent ranking variant with a banana presenter. Read `reference-banana.svml`, its SVS
recipes, and `build.svrun` together; the saved Invocation targets the authored generation route.

From this directory, install the selected 0.4 dependencies, review and commit the generated lockfile,
then check the Invocation:

```sh
npm install
npx hypit check build.svrun
```

The project installs `@hypit/ranking` from npm. Review its Runtime Profile and
`npx hypit plan build.svrun --runtime ./hypit.runtime.json` before paid execution.
