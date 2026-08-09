# Fine Caption Style Family

Status: complete public design recorded; implementation proceeds by the evidence gates below.

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

The complete restrained family has these independent dimensions. Properties not listed here are
not deferred accidents: they are deliberate non-goals for this family.

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

The Cue naturally wraps only between Atoms. Words inside one Atom never wrap apart. A hard
`max-lines` control is intentionally unavailable until exact font bytes and browser-measured layout
can fail the build rather than silently clip or truncate authored text.

### 3. Typography

- `font`, `weight`, `size`, `font-style: normal | italic`

The current Recipe names an environment font. Exact `FontArtifactRef` input is a shared typography
reproducibility gate and remains visible in the implementation table below.

### 4. Base glyph Paint

- solid `fill` and `opacity`
- one outline: `stroke-color`, `stroke-width`
- one shadow: color, opacity, x/y offset and blur
- one glow: color, opacity and blur

Shadow and glow are two independently authored contributions lowered into one deterministic
`text-shadow` declaration. Multiple arbitrary layers, textures, gradients, bevel, extrusion and
long-shadow generators are outside this restrained family.

### 5. Cue box Paint

- solid `background`
- `border-color`, `border-width`
- horizontal/vertical `padding`
- `radius`

Backdrop sampling is forbidden because it would make this Track inspect another Track's pixels.

### 6. Karaoke Paint and timing

- `karaoke: off | current | trail`
- `karaoke-transition: step | wipe`
- a complete active glyph Paint with the same fill/opacity/stroke/shadow/glow shape as base Paint

`current` activates only the Atom whose measured window contains the frame. `trail` retains every
activated Atom through the end of the Cue. `step` swaps the whole Atom; `wipe` reveals its active
layer across that Atom's measured window. RTL reverses the wipe direction.

Karaoke is deliberately Atom-grained. In ordinary text an Atom is normally one visible Word. In
`<45% | forty five percent>` the authored visible `45%` is one Atom and activates as one unit. In a
multi-word display Atom, the whole authored Atom activates together. No downstream package invents
internal Word timestamps that the author and audio evidence never supplied.

### 7. Restrained local motion

- Cue enter/exit: `none | fade`, with one frame duration
- Atom reveal: `all | on-start`
- active Atom scale

These motions affect only Fine's own elements. Typewriter, bounce, rotation, path motion and random
variation are intentionally excluded until a concrete reusable style needs them.

## One renderer, one layout tree

Static and karaoke output share this structure:

```text
placement
└── cue box
    ├── atom
    │   ├── base words
    │   └── active overlay (only when karaoke is enabled)
    │       └── active words
    └── atom ...
```

The active overlay reuses the same Atom geometry; karaoke does not fork a second DOM renderer.
Every animation lowers to frame-addressed `VisualTrack` keyframes before HyperFrames sees it.

## Defaults and compatibility

The original fifteen baseline properties remain required, so a minimal Recipe is explicit about
planning, geometry, typography and its visible box. New dimensions are optional and resolve to a
complete immutable parameter object:

- top-left anchor, LTR, normal font, zero letter spacing and a one-quarter-em word gap;
- no stroke, shadow, glow or border;
- karaoke off, Cue motion off, all Atoms visible, scale 1;
- when karaoke is enabled without another active Paint, active fill defaults to `#FFD54A` and the
  other active Paint dimensions inherit base Paint.

Unknown properties are rejected. Defaults are package implementation policy and therefore covered
by its implementation digest; they are not hidden Runtime behavior.

## Evidence gates and implementation order

This is one complete design, delivered progressively rather than three incompatible versions:

1. **Resolved model and static lowering** — complete parameters, anchors, layout, base/active Paint,
   Cue box and strict validation.
2. **Timed lowering** — current/trail, step/wipe, Cue fades, Atom reveal and active scale using only
   proven whole-Atom time.
3. **Reproducibility freeze** — exact Font Artifact input, real browser/pixel fixtures for wrapping,
   outline/glow and all karaoke modes, then decide whether measured `max-lines` can be exposed
   without clipping.

The first two gates require no common-contract change. The third may add an explicit Font input to
the Fine Surface/fragment, but still does not belong in Core or common Caption.
