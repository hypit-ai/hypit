# Mediabunny runtime

This directory carries the browser runtime used privately by the Electron
renderer. It is Mediabunny 1.62.1 under MPL-2.0.

- The exact `mediabunny@1.62.1` package dependency supplies the browser bundle loaded into the renderer.
- `mediabunny-1.62.1-source.tar.gz` contains the corresponding upstream `src/`
  source tree.
- `LICENSE` is the upstream license and `package.json` records the exact
  upstream package identity.

The implementation resolves the runtime bundle without importing Mediabunny's
TypeScript declarations into Hypit's public types. This directory retains the
matching license and source required for the bundled browser runtime.
