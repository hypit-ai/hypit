# `@hypit/caption-fine`

The uniform-flow Caption family. It renders authored Cues whose tokens all obey the same layout,
type, Paint and motion rules. Spoken time and token order may change the state of that rule; a token
does not carry a private visual role.

```xml
<caption-fine:Style id="primary" recipe={recipes.caption.primary} font={caption-font}/>
<caption:Program id="captions" document={story.caption} narrative={story} default={primary}/>
<caption-fine:Track id="captions-track" document={story.caption}
  semantic={speech.semantic} program={captions}/>
```

One SVS Recipe freezes three public dimensions:

- **Where**: Region position, anchors, extent, block/inline alignment, wrapping and line limits.
- **How**: the exact font stack, typography, base/active glyph Paint, Cue box and decoration.
- **When**: the visible lead/tail envelope, handoff, Cue/Atom motion, reveal, Karaoke and loops.

Caption first projects authored Script units onto semantic Word timing. Fine then produces an
explicit visible Schedule and renders that Schedule. Lead and tail never change the semantic Word
times used by Karaoke.

Cue grouping is authored by Script segments, turns, Style changes and `||`; it is not delegated to
an LLM. Fine rejects word-specific Style runs. A caption whose Cue contains structural roles or
relationships—an emphasis group with another font and layout, alternating full-frame inversion, or
one clause tearing through another—belongs in a separate Caption family that consumes the common
Caption contract. It is not a Fine preset.

```svs
caption.primary {
  stack-order: 70;
  x: 0.5; y: 0.9; width: 0.84; height: 0.22;
  anchor-x: center; anchor-y: bottom;
  align: center; block-align: end; inline-size: fixed;
  wrap: word; overflow: clip; max-lines: 2; max-words-per-line: 4;
  size: 58; line-height: 1; fill: #FFFFFF;
  background: #00000000; padding: 0; radius: 0;
  karaoke: current; active-fill: #FFD54A;
  lead-frames: 4; tail-frames: 4; handoff: cut;
}
```
