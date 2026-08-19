# SVML Playground

A read-only official preview application for one `.svml` Author Source.

```bash
pnpm svml:playground -- --source examples/talking-film-broll-preview/main.svml
# ➜  http://localhost:5179/
```

Optional arguments:

- `--run <build.svrun>` reads material and timings explicitly selected by a Run Source.
- `--runtime <hypit.runtime.json>` opens earlier Build records and Artifacts read-only.
- `--port <number>` changes the listening port from `5179`.

The Playground never writes a Source, Recipe, Build or Artifact and never calls
a paid Provider. Missing generation results are shown as declared stand-ins;
missing speech timings are visibly estimated.

## Package boundary

The Playground is an application, not a registry required by Hypit. It
explicitly depends on the official video packages it can preview and loads the
same activation, Frontends, Surfaces, Producers and Validators that a normal
Host loads. No compiler, Runtime or video package imports the Playground, and
normal production works identically when it is not installed.

The compiled Source remains the authority. The application asks it for every
`VisualTrack` and `AudioTrack`, builds each independently, and renders the
result with HyperFrames. A new Track from an already bundled package therefore
needs no Playground-specific implementation. A newly published official video
package is added to this application's dependency list in its next release.

See [the complete guide](../../docs/guide/svml-playground.md) for selection,
timeline, stand-in and measured-timing behavior.
