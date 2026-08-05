# SVML examples

The repository deliberately separates the executable v2 bootstrap, executable research fixtures
and the complete v2 authoring target.

## Executable v2 bootstrap

- [`v2-bootstrap/main.svml`](./v2-bootstrap/main.svml) is accepted by `pnpm svml:v2 check`. It
  exercises the real Node Source Host, official Text/Script prelude and recursive SVS Frontend. It
  deliberately stops before package-owned Recipe consumption and component Graph construction.

## v2 authoring target

- [`talking-film-golden/main.svml`](./talking-film-golden/main.svml) is the canonical visual and
  semantic target for the next author-facing Surfaces. Its Script syntax is implemented; its outer
  package Surfaces are tracked line by line in the adjacent README and are not executable yet.

## Executable v1 research fixtures

- `flat-track-launch` is the broad language/capability regression fixture.
- `regen-ranking` reconstructs a real pinned production edit.
- `composite-speech-program` proves that an author component can hide repeated internal wiring.

The v1 examples are evidence, not syntax that new v2 packages must preserve. The golden fixture is
a design target, not evidence that its missing Provider and Surface packages already exist.
