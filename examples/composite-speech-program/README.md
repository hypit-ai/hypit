# Composite Speech Program draft fixture

This directory demonstrates the proposed, unimplemented `composite-v1` SVK
profile.

- `minimal.svml` is the author-facing source.
- `speech-program.svk` defines a callable Component that statically expands
  `crossfade-speech` and `speech-locator`.
- `house.svs` configures only the Composite's public `overlap` parameter.

For `<speech-program id="voice">`, canonical expansion creates the internal
instances `voice::basis` and `voice::locator`. Their implementations, digests,
Evidence and Artifacts remain independently visible in Plan and lock. The outer
ports are aliases:

```text
voice.production    = voice::basis.production
voice.map           = voice::locator.map
voice.facets.visual = voice::basis.facets.visual
```

The bracket expression in `ports.script.segment[item.id]` is a stable id-keyed
lookup, not a positional array lookup. The `for` iterates only over finite children
declared at the call site.

The current compiler must reject or clearly report unsupported `composite-v1`;
these files are architecture fixtures, not executable regression inputs.
