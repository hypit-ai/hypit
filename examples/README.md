# Examples

## Current v2 examples

- [`talking-film-graph-check`](./talking-film-graph-check/README.md) compiles the complete
  provider-free author graph through Speech, WhisperX, Caption, B-roll, Text, Film and final render
  requirements.
- [`talking-film-live`](./talking-film-live/README.md) executes the real paid two-take path with KIE,
  local media processing, local WhisperX, Vertex Caption planning and local HyperFrames rendering.
- [`echo-pro-aroll`](./echo-pro-aroll/README.md) is the current four-take acceptance witness and
  demonstrates a second Run that explicitly reuses historical shot Records as zero-input
  Candidates without another KIE submission.
- [`talking-film-golden`](./talking-film-golden/README.md) is the larger authoring and visual design
  fixture used while video packages remain pre-freeze.
- [`v2-bootstrap`](./v2-bootstrap/README.md) is the smallest official Text/Script/SVS source-closure
  check.

Generated assets, local Runtime databases and output media are ignored by Git.

## Retained v1 regression fixtures

- `flat-track-launch`
- `regen-ranking`
- `composite-speech-program`

These fixtures are still consumed by the root v1 test suite. They preserve behavior that the v2
rewrite can attack and re-prove, but they are not public v2 syntax or recommended starting points.
