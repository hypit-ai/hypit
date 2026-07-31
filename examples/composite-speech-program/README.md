# Composite Speech Program draft fixture

This directory demonstrates the proposed, unimplemented `composite-v1` SVK
profile.

- `minimal.svml` is the author-facing source.
- `speech-program.svk` defines a callable Component that statically expands
  `speech-assemble` and `speech-locator`.
- `house.svs` configures only the Composite's public join shorthand.

For `<speech-program id="voice">`, canonical expansion creates the internal
instances `voice::basis` and `voice::locator`. Their implementations, digests,
Evidence and Artifacts remain independently visible in Plan and lock. The outer
ports are aliases:

```text
voice.program.production = voice::basis.production
voice.program.semantic   = voice::locator.map
voice.production         = voice::basis.production
voice.map                = voice::locator.map
voice.facets.visual      = voice::basis.facets.visual
```

`voice.program` is a typed port bundle whose fields alias the two internal
outputs. It does not copy audio, facets, Evidence or Artifacts, and it does not
replace the compiler's basis/map affinity check. The imported Film facade accepts
the bundle as author-facing shorthand; after Composite expansion the Plan still
contains the selected Basis and ExactSemanticMap separately.

The default join and each `<join after="...">` are author data. They normalize to
per-boundary `JoinSpec` values consumed by one `speech-assemble` instance; they do
not select a language-level family or mode. `after` names a stable Segment id, and
the following Segment comes from source order. A join cannot declare both `gap`
and `overlap`.

The v1 stdlib publishes `speech-program` as its chosen author surface. It remains
an ordinary imported Composite, never a compiler keyword or a required singleton.
Alternative Locators use explicit low-level wiring or another Composite instead
of extending a closed `locator="..."` enum.

The bracket expression in `ports.script.segment[item.id]` is a stable id-keyed
lookup, not a positional array lookup. The `for` iterates only over finite children
declared at the call site.

The Composite receives its Script through an explicit typed input. Reading
`document.script` or any other ambient caller state is forbidden.

The current compiler must reject or clearly report unsupported `composite-v1`;
these files are architecture fixtures, not executable regression inputs.
