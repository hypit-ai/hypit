# Banana reference variant

An independent ranking variant with a banana presenter. Read `reference-banana.svml` and its SVS
recipes together; select `final.video` for the authored generation route.

From this directory, install the selected 0.4 dependencies, review and commit the generated lockfile,
then check the Author Source:

```sh
npm install
npx hypit check reference-banana.svml
```

The project installs `@hypit/ranking` from npm. Review its Runtime Profile and
`npx hypit plan reference-banana.svml --target final.video --runtime ./hypit.runtime.json` before paid execution.
