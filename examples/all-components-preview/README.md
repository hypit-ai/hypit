# All components

One Source that writes every kind of Track at once: speech, a ranking board, a
media card, a screen treatment, typography and captions.

It exists to exercise the vocabulary: every Track kind declared once, in one
Source, so a change that breaks one of them breaks something a reader can see.
`hypit check` proves it is legal, and the graph-shape tests read it.

`studio.svrun` supplies two materialized Semantic Takes and the deterministic Script-owned caption
document, so
every Studio projection is explicit and opening it invokes no Provider:

```bash
pnpm studio -- --run examples/all-components-preview/studio.svrun --workspace .
```

Every Track, the Film composition and the HyperFrames picture use the same
deterministic package code as a Build. `build.svrun` remains the real generation
Run; `studio.svrun` is its explicit authoring view.
