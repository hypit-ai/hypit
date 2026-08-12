# Examples

Choose an example by what you want to learn:

| Example | Use it for | External work |
|---|---|---|
| [`bootstrap`](./bootstrap/README.md) | The smallest self-described `.svml` and imported `.svs` source | none |
| [`talking-film-graph-check`](./talking-film-graph-check/README.md) | A complete video graph and frozen plan | none |
| [`talking-film-live`](./talking-film-live/README.md) | A complete Runtime Profile and real two-take Build | KIE, WhisperX, Vertex and local HyperFrames |
| [`talking-head-aroll`](./talking-head-aroll/README.md) | Multiple generated takes and explicit reuse in a second `.svrun` | paid generation on the first Run |
| [`talking-film-golden`](./talking-film-golden/README.md) | A larger authoring reference with multiple speakers and B-roll | source reference only |

Start with `talking-film-graph-check`: both commands below are provider-free.

```bash
node --run narratage -- check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .

node --run narratage -- plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .
```

Generated assets, local Runtime databases and output media stay outside version control.
