---
title: Fine Caption Style Family
description: implemented pre-release Style family with complete browser evidence for the declared surface.
---

# Fine Caption Style Family

Status: implemented pre-release Style family with complete browser evidence for the declared surface.

## Purpose and boundary

`@narratage/caption-fine` is the official field-free, fine-grained Caption Style family. "Fine"
means that immutable display Atoms are planned into short semantic Cues and then rendered through
one deterministic visual system. It does **not** mean `important`, semantic emphasis classes or
random per-word styling.

The package consumes three facts which already exist:

1. a `CaptionProgram`, which assigns one complete Style to every display Word;
2. a `TimedCaptionProjection`, which gives every Cue and whole Atom a proven time window;
3. a `CaptionDisplaySequence`, which preserves the author's exact visible text and punctuation.

It emits one ordinary peer `VisualTrack`. It never changes text, calls a model, infers time inside a
Dual Text Atom or adds Caption metadata to another contract.

| Owner | Responsibility |
|---|---|
| `@narratage/caption` | generic Style envelope, Cue/field Plan law, total Style assignment and Atom timing join |
| `@narratage/caption-fine` | Fine Recipe schema, layout, Paint, local motion and VisualTrack lowering |
| `@narratage/media` | exact reusable bytes such as `FontArtifactRef`, never Fine typography policy |
| `@narratage/visual-ir` | closed code-free terminal element/style/keyframe vocabulary |
| Core | graph demand, validation, derivation and execution only; no Caption meaning |

Changing a Fine shadow, anchor, karaoke mode or Cue box must not modify Caption, Media,
Composition, Visual IR or Core while their existing public contracts can express the result.

## Complete orthogonal surface

Fine owns one single-font Cue/Atom layout tree. Its dimensions are independent: a Recipe may combine
gradient glyphs, a current-word box, trail text, an underline and local motion without selecting a
different renderer. A new package is warranted only when a look changes the layout tree or requires
planner fields—for example dual-font editorial layout—not when it merely adds Paint or local motion.

### 1. Cue planning

- `cue-min-words`
- `cue-max-words`

The planner may only cut between whole Atoms. An indivisible author Atom may exceed the preferred
maximum; it is never split to satisfy a number.

### 2. Placement and layout

- normalized `x`, `y`, `width`
- `anchor-x: left | center | right`
- `anchor-y: top | center | bottom`
- `align: left | center | right`
- `direction: ltr | rtl`
- `line-height`, `letter-spacing`, `word-gap`
- absolute `stack-order`

The Cue naturally wraps only between Atoms. Words inside one Atom never wrap apart. Fine has no
`max-lines` property: a hard line limit would either discard author text or smuggle browser
measurement into deterministic lowering. Fine never clips or truncates. Authors control density
with Cue bounds, width and font size. A future hard layout assertion, if one is genuinely needed,
must be a separately connected component whose failure is explicit in the graph.

### 3. Typography

- Recipe: `size`
- `text-transform: none | uppercase | lowercase`

Text transform is terminal presentation only. It never changes `CaptionDisplaySequence`, planner
input, Word/Atom identity, speech correspondence or timing.

Family, weight and style are deliberately absent from the Recipe. Every Style must import exact
installed faces from `@narratage/fonts-open`, or declare custom/brand bytes with
`<media:Font>`. `font=` accepts one exact face with ordered Style-owned
Fallback children, or one reusable generic `FontStackRef`. The compact open-font path is:

```svml
<fonts:Stack id="caption-fonts" family="inter" weight="700" style="normal" emoji="color">
  <fonts:Fallback family="noto-sans-sc" weight="700" style="normal"/>
</fonts:Stack>
<caption-fine:Style id="primary" recipe={studio.caption.primary} font={caption-fonts}/>
```

The font edge is the single source of truth for family, weight and style. A fallback preserves its
own honest face metadata—for example a 700-weight Latin primary may use a 400-weight symbol fallback. Exact
duplicate faces are rejected. One logical face may contain several content-addressed Unicode-range
sources, as the installed CJK and Emoji fonts do. Fine expands `FontStackRef` into the same ordered
exact faces and puts them only
on its terminal text elements; Caption, Core and unrelated graph values remain unchanged. Omitting
`font=` is invalid, so no Runtime or machine-font selection policy enters the result.

CJK speech may be authored directly. A display-only emoji still needs explicit speech
correspondence, for example `<🌐 | globe>`; Script correctly refuses to invent a spoken token for a
bare symbol. A character with both text and Emoji presentation uses the exact authored Unicode
sequence (for example `☎️` with VS16); no lowerer rewrites display text to force color. This is
timing and text truth, not a font limitation.

### 4. Base and active glyph Paint

- solid `fill`, or `gradient-from`, `gradient-to`, `gradient-angle`
- `opacity`
- one outline: `stroke-color`, `stroke-width`
- one shadow: `shadow-color`, `shadow-opacity`, `shadow-x`, `shadow-y`, `shadow-blur`
- one bounded directional long shadow: `long-shadow-color`, `long-shadow-opacity`,
  `long-shadow-distance`, `long-shadow-angle`
- one glow: `glow-color`, `glow-opacity`, `glow-blur`
- one base underline: `underline: off | always`, `underline-color`, `underline-thickness`,
  `underline-offset`

Every active Paint name uses the `active-` prefix. For example `active-gradient-from`,
`active-long-shadow-distance` and `active-glow-blur` describe the active glyph without changing
the base glyph.

Base and active Paint have the same shape. A gradient replaces the solid fill for that layer; it
does not replace the active overlay or the karaoke transition. Drop shadow, long shadow and glow are
independent authored contributions lowered into one deterministic `text-shadow` declaration. Long
shadow expansion is implementation-bounded, so one Recipe cannot create an unbounded CSS payload.
Multiple arbitrary shadow layers, textures, bevel and free-form extrusion remain outside Fine.

### 5. Cue box Paint

- solid `background`
- `border-color`, `border-width`
- horizontal/vertical `padding`
- `radius`

Backdrop sampling is forbidden because it would make this Track inspect another Track's pixels.

### 6. Activation channels, karaoke Paint and timing

- active glyph state: `karaoke: off | current | trail`
- active glyph transition: `karaoke-transition: step | wipe`
- active box state: `active-box: off | current | trail`
- active box continuity: `active-box-continuity: isolated | joined`
- active box Paint: `active-box-background`, border, padding and radius
- active box motion: `active-box-enter`, `active-box-exit`, `active-box-transition-frames`
- active underline state: `active-underline: off | current | trail`, plus color, thickness and offset

Activation state and decoration geometry are deliberately separate. `current` activates only the
Atom whose measured window contains the frame. `trail` retains every activated Atom through the end
of the Cue. `step` swaps the whole active glyph layer; `wipe` reveals it across the Atom's measured
window. RTL reverses the wipe direction. Glyphs, boxes and underlines may choose different state
policies, so the retained legacy behavior—trail text with a current-only pill—is directly expressible.

An isolated box paints one box per activated Atom. A joined trail paints the one ordered activated
prefix as continuous inline fragments: atoms on the same rendered line share one background, while
each wrapped line receives its own end caps. Browser line layout, not upstream metadata, determines
the fragments. Fine never propagates measured line boxes through the graph.

Karaoke is deliberately Atom-grained. In ordinary text an Atom is normally one visible Word. In
`<45% | forty five percent>` the authored visible `45%` is one Atom and activates as one unit. In a
multi-word display Atom, the whole authored Atom activates together. No downstream package invents
internal Word timestamps that the author and audio evidence never supplied.

### 7. Layered local motion

- Cue enter/exit: `none | fade | pop | scale | spring | bounce | elastic | stamp | tilt |
  zoom-blur | flip-x | flip-y | spin | squash | stretch | slide-left | slide-right | slide-up |
  slide-down | blur-in | wipe-left | wipe-right | wipe-up | wipe-down`
- Atom entry and exit: the same one-shot vocabulary, with independent durations
- Atom reveal: `all | on-start | typewriter`
- active response and active-box enter/exit: the same one-shot vocabulary
- continuous local loop: `none | shake | wobble | glow-pulse | breathe | float | pulse | flicker`,
  targeted at the Cue or active Atom

The flat Recipe names are `cue-enter`, `cue-exit`, their independent `*-frames`; `atom-enter`,
`atom-enter-frames`, `atom-exit`, `atom-exit-frames`, `atom-reveal`; `active-response`,
`active-response-frames`, `active-scale`;
`slide-distance`; and `loop`, `loop-target`, `loop-period-frames`, `loop-intensity`.

Cue, Atom lifecycle, active response and loop own separate wrappers, so their transforms compose instead
of overwriting one another. Typewriter reveals authored display graphemes inside a whole Atom; it is
visual interpolation, not a claim of character timestamps and never changes Atom boundaries.
Continuous motion is a bounded deterministic frame function with no random input. Arbitrary path
motion and random variation remain outside Fine; they belong to generic Typography or a separate
effect package rather than a Caption preset vocabulary.

## One renderer, one layout tree

Static and karaoke output share this structure:

```text
placement
└── cue motion
    └── cue box
        ├── joined/isolated decoration underlay
        └── cue loop
            └── atom entry
                └── active response
                    ├── base words
                    └── active glyph/underline overlay
```

The decoration underlay repeats only the same transparent glyph geometry required to obtain honest
browser line fragments. It does not create another text truth. Active overlays reuse the same Atom
geometry. Every animation lowers to finite frame-addressed `VisualTrack` keyframes before
HyperFrames sees it.

## Defaults and compatibility

The original fifteen baseline properties remain required, so a minimal Recipe is explicit about
planning, geometry, typography and its visible box. New dimensions are optional and resolve to a
complete immutable parameter object:

- top-left anchor, LTR, normal font, zero letter spacing and a one-quarter-em word gap;
- no stroke, shadow, long shadow, glow, underline or border;
- solid fill, text transform none;
- active glyph, active box and active underline off;
- Cue/Atom/box motion and loops off, all Atoms visible; active response scale defaults to 1.08 when
  that response channel is enabled;
- when karaoke is enabled without another active Paint, active fill defaults to `#FFD54A` and the
  other active Paint dimensions inherit base Paint.

Unknown properties are rejected. Defaults are package implementation policy and therefore covered
by its implementation digest; they are not hidden Runtime behavior.

## Completed evidence gates

The complete design was delivered progressively rather than as incompatible versions:

1. **Resolved model and static lowering** — complete parameters, anchors, layout, base/active Paint,
   Cue box and strict validation.
2. **Timed lowering** — current/trail, step/wipe, Cue fades, Atom reveal and active scale using only
   proven whole-Atom time.
3. **Reproducibility evidence** — an ordered exact Font Artifact stack, CJK, emoji/symbol fallback,
   multiline wrapping, outline, shadow, glow and all four glyph karaoke modes have real browser/pixel
   witnesses. `max-lines` was deliberately rejected rather than deferred.
4. **Expressive Paint and motion evidence** — current-only and trail boxes, isolated and joined
   geometry, gradient, underline, long shadow, text transform, layered one-shot motion, typewriter
   reveal and deterministic loops each have a terminal-IR witness; joined geometry additionally has
   a real wrapped browser/pixel witness.

No gate changes Core or common Caption. Exact font selection is an explicit author-graph reference
between the Media Font Surface and the Fine Style Surface, not metadata propagated through the
Caption pipeline.
