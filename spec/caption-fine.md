# Fine Caption Style Family

Status: implemented baseline; parameter surface remains deliberately small and pre-release.

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
the first and last included whole-Atom windows determine the Cue window. Fine adds no hidden hold,
lead, fade or provider-dependent timing, and it receives no display-Word timestamps.

## Font boundary

The current executable Fine baseline names an environment font in its Recipe. Exact font bytes are
a separate reproducibility problem shared by Text, Caption, Ranking and future typography
components. `@narratage/media` already defines `FontArtifactRef`; adding an author Surface for local
font files and connecting that value explicitly is separate work. It must not be smuggled into the
Fine redesign as a Caption-specific Media contract.

## Remaining visual evidence

The field-free contract is executable. Before freezing the family's visual surface, add real
browser/pixel evidence for placement, wrapping and basic paint and review whether the current
bounded left/top geometry is the smallest useful public parameter set.
