# SVML examples

The repository deliberately separates the executable v2 bootstrap, executable research fixtures
and the complete v2 authoring target.

## Executable v2 bootstrap

- [`v2-bootstrap/main.svml`](./v2-bootstrap/main.svml) is accepted by `pnpm svml:v2 check`. It
  exercises the real Node Source Host, official Text/Script prelude and recursive SVS Frontend. It
  deliberately stops before package-owned Recipe consumption and component Graph construction.
- [`talking-film-graph-check/main.svml`](./talking-film-graph-check/main.svml) is the complete
  provider-free author graph through Speech, WhisperX, B-roll, Caption, Text, Film and Render.

## v2 authoring target

- [`talking-film-golden/main.svml`](./talking-film-golden/main.svml) is the canonical visual and
  semantic target for two-speaker Gemini captions. Its author and paid Caption packages are
  implemented; the adjacent README tracks real assets and deployment bindings.

## Executable v1 research fixtures

- `flat-track-launch` is the broad language/capability regression fixture.
- `regen-ranking` reconstructs a real pinned production edit.
- `composite-speech-program` proves that an author component can hide repeated internal wiring.

The v1 examples are evidence, not syntax that new v2 packages must preserve. The golden fixture is
a design target, not evidence that its missing Provider and Surface packages already exist.
