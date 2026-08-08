# Fine Caption Style Family

Status: accepted direction; parameter surface deliberately not frozen; current implementation has
the deltas listed below.

## Purpose

`@narratage/caption-fine` is one concrete Caption Style family. In this family, "fine-grained"
means that immutable Script display words are divided into short semantic Cues. It does not mean
that individual words receive ornamental semantic classes.

Every word in one Cue uses one uniform static appearance. This family declares:

```text
planning.fields = []
```

It has no `important`, emphasis, active-word, karaoke or random-size semantics. Another package may
declare fields or motion without changing this family or the common Caption contract.

## Package boundary

| Owner | Responsibility |
|---|---|
| `@narratage/caption` | generic Style envelope, Cue/field Plan law, total Style assignment and SemanticMap timing join |
| `@narratage/caption-fine` | Fine Recipe schema, deterministic layout/paint interpretation and VisualTrack lowering |
| `@narratage/media` | renderable byte identities such as the existing `FontArtifactRef`, never Caption typography policy |
| `@narratage/visual-ir` | closed terminal element/style/keyframe vocabulary |
| Core | graph demand, validation, derivation and execution only; no Caption meaning |

Using a Type owned by Caption or Media does not transfer implementation ownership. Removing a Fine
field, changing a Fine anchor or revising its box layout must not modify Caption, Media, Visual IR,
Composition or Core when the existing public Types can already carry the result.

## Accepted dimensions

The Style-family surface will be designed across four independent concerns:

1. Cue planning: only minimum/maximum display-word bounds and a fixed no-rewrite planning law.
2. Geometry: placement anchor, bounded range, alignment, line packing and absolute stack order.
3. Typography: deterministic font choice and ordinary size/spacing metrics.
4. Paint: restrained readability controls such as solid fill, outline, shadow and an optional
   content background.

The exact property names, defaults and bounds are not frozen by this document. Motion, gradients,
glow, long shadow, backdrop sampling, case rewriting, random variation and field-dependent paint
must not enter merely to reproduce the old engine's option count.

Cue timing is not a fifth Style dimension. It comes from the independent `TimedCaptionProjection`:
the first and last included display-word windows determine the Cue window. Fine adds no hidden hold,
lead, fade or provider-dependent timing.

## Font boundary

The current executable Fine baseline names an environment font in its Recipe. Exact font bytes are
a separate reproducibility problem shared by Text, Caption, Ranking and future typography
components. `@narratage/media` already defines `FontArtifactRef`; adding an author Surface for local
font files and connecting that value explicitly is separate work. It must not be smuggled into the
Fine redesign as a Caption-specific Media contract.

## Current implementation delta

Before this Style family can be treated as its accepted design, its package alone must:

- remove `important-min-per-cue`, `important-max-per-cue`, `important-fill` and `important-scale`;
- emit an empty field declaration list;
- remove field-dependent word color/scale and related attributes;
- replace the current left/top box with a deterministic bounded layout after its small parameter
  set is reviewed;
- add real browser/pixel evidence for placement, wrapping and basic paint.

Quickstarts continue to describe the executable baseline until this delta is implemented. They are
not a reason to preserve the temporary field.
