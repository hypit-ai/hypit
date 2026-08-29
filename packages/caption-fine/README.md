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

An optional Spatial Region Timeline replaces only the moving placement point:

```xml
<space:RegionTimeline id="heads" within={vertical} recipe={tracking.heads.default}/>
<caption-fine:Track id="captions-track" document={story.caption}
  semantic={speech.semantic} program={captions} regions={heads}/>
```

Every Cue must carry one Script Role. When the Region Timeline contains a measured region for that
Role and Frame, the Track places the Cue at the region's top center. When that Role has a Track but
the current Frame is `null`, the Cue is not rendered: absence of evidence never becomes a guessed
position. A Role with no Track uses the Style's authored `x` and `y`, so unrelated speakers remain
ordinary fixed captions. The Style still owns its width and anchors, so `anchor-x: center;
anchor-y: bottom` puts the Caption immediately above a measured region. The Timeline is finished
external evidence: Fine does not detect people, associate identities, smooth motion, interpolate
missing Frames or invoke a Provider. Without `regions`, the ordinary Recipe `x` and `y` behavior is
unchanged.

One SVS Recipe freezes three public dimensions:

- **Where**: Region position, anchors, extent, block/inline alignment, wrapping and line limits.
- **How**: the exact font stack, typography, base/active glyph Paint, Cue box and decoration.
- **When**: the visible lead/tail envelope, handoff, Cue/Atom motion, reveal, Karaoke and loops.

Caption first projects authored Script units onto semantic Word timing. Fine then produces an
explicit visible Schedule and renders that Schedule. Lead and tail never change the semantic Word
times used by Karaoke.

The Fine Schedule preserves the Caption projection's ProgramSpace, Narrative and document identities.
The renderer rejects any mismatched Space or document. Studio may expose lead, tail and handoff as
ordinary parameter edits, but Cue rectangles remain read-only semantic evidence.

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
  wrap: word; max-lines: 2; max-words-per-line: 4;
  size: 58; line-height: 1; fill: #FFFFFF;
  background: #00000000; padding: 0; radius: 0;
  karaoke: current; active-fill: #FFD54A;
  cue-enter: spring; cue-enter-frames: 4;
  cue-enter-start-scale: 0.75;
  cue-exit: none;
  lead-frames: 4; tail-frames: 4; handoff: cut;
}
```
