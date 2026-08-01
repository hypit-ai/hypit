# Flat Track Launch executable fixture

This is the end-to-end v1 architecture fixture. It compiles without generation
providers and exercises the contracts together:

- independent Script Segment endpoints (`2M + 2N`);
- replaceable Basis Producer and Locator Components;
- one explicit `ProgramBasis` plus `CompleteSemanticMap`;
- flat Tracks and absolute `z`, with Film as the only `Track[]` consumer;
- one continuous A-roll mapping with overlapping Present windows;
- manual `ProgramSpan`, a `Moment`, B-roll audio and a visual crossfade;
- a disconnected SelectionSet driving one caption style rule;
- top-level and nested Component fields configured by `.svs`.

It reuses the checked-in local artifacts and measured speech timing evidence from the
adjacent `regen-ranking` example. No provider is called.

```sh
pnpm svml compile examples/flat-track-launch/flat-track-launch.svml \
  --out /tmp/svml-flat-track-launch/index.html
pnpm svml render examples/flat-track-launch/flat-track-launch.svml \
  --out /tmp/svml-flat-track-launch.mp4
```
