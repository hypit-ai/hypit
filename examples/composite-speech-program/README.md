# Composite Speech Program executable fixture

This directory proves the implemented `composite-v1` profile.

- `minimal.svml` is the author-facing source.
- `speech-program.svk` statically expands `speech-assemble` and
  `speech-locator`.
- `house.svs` configures only public Composite parameters.
- `alignment.json` is explicit typed Evidence.

For `<speech-program id="voice">`, expansion creates:

```text
voice::basis    → TemporalBasisProduction + ProgramBoundVideoSequence
       │
       └──────────────> voice::locator → CompleteSemanticMap

voice.production   = voice::basis.production
voice.map          = voice::locator.map
voice.facets.visual = voice::basis.facets.visual
```

The two internal instances, implementation digests, Evidence dependencies and
outputs remain visible in Plan and lock. The outer ports are aliases; the
Composite does not copy Artifacts or merge execution boundaries.

`join` and `joinDuration` are author shorthand forwarded to one assembler. Each
explicit `<join after="...">` may override the corresponding boundary. They do
not select a compiler family or language-level mode.

The bracket expression in `ports.script.segment[item.id]` is a stable id-keyed
lookup over finite declared children, not positional indexing. The Composite
receives Script and Evidence through explicit typed inputs and cannot read
ambient document state.

```sh
pnpm svml check examples/composite-speech-program/minimal.svml
pnpm svml compile examples/composite-speech-program/minimal.svml \
  --out /tmp/svml-composite/index.html
```
