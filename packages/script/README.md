# `@svml/script`

Official raw Script Surface for the v2 text Frontend. It parses prose-first named Segment blocks,
newline-independent Role Cues, Dual Text, Selection, Moment and Slot syntax, and lowers them to a
canonical authored Narrative value with exactly `2M + 2N` semantic anchor identities.

The package is an ordinary statically declared Surface module. Core does not import it and does not
know that Script, Segment or Narrative exist.

```svml
<script id="story">
  @answer

  <opening>
    <ALICE> 我先说第一句话。
    <BOB> 然后我来回答。
  </opening>

  <pause/>
  @/answer
</script>
```

`<opening>` opens a Segment named `opening`; `</opening>` closes that exact Segment. While the
parser is inside a Segment, a valid bare tag such as `<ALICE>` is a Role Cue. This is parser state,
not indentation: the compact spelling
`<opening><ALICE>我先说。<BOB>我回答。</opening>` has the same semantic value.

The package exports its Manifest, `parseScript`, semantic/source-map projection helpers, a
semantic-preserving formatter and the raw `decodeScriptSurface` handler. The first bootstrap keeps
the Narrative contract in this package; it can be split into a domain-contract package later
without changing Text or Core.
