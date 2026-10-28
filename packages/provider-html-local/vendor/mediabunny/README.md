# Mediabunny runtime

This directory carries the browser runtime used privately by the Electron
renderer. It is Mediabunny 1.62.1 under MPL-2.0.

- `dist/bundles/mediabunny.min.mjs` is the runtime loaded into the renderer.
- `mediabunny-1.62.1-source.tar.gz` contains the corresponding upstream `src/`
  source tree.
- `LICENSE` is the upstream license and `package.json` records the exact
  upstream package identity.

The runtime is carried here instead of installed as a consumer dependency so
its legacy ambient WebCodecs declarations do not modify the author's
TypeScript environment.
