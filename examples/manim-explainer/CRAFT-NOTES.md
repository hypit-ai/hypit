# Craft notes

Read alongside the [Treatment](TREATMENT.md), [asset provenance](ASSET-PROVENANCE.md) and the
[project guide](README.md). These notes preserve the directing decisions that make this short
technical explainer editable and keep the animation responsibilities legible.

## Keep the presenter and demonstrations separate

The presenter remains a continuous Film contribution with the native Seedance voice attached as a
separate audio contribution. The presenter fills the portrait canvas throughout the composition.
Starting at the semantic word `First`, the three Manim videos appear as cards over that full-frame
presenter; the mathematics card is immediately enlarged and brightened while the other two remain
smaller. This is a presentation change around the same performance.

## Give each Manim scene one owner

Mathematics, machine learning and physics are three independent Python scenes and three independent
opaque MP4 inputs. Their internal drawing, propagation, curve growth and pendulum movement belong to
the corresponding Manim source. The project component owns only ordinary media concerns: sampling,
position, scale, opacity, brightness, stacking and containment inside the 720x1280 canvas.

This boundary keeps a scene reusable. A change to a parabola or a force vector is made in its Python
authoring source and re-rendered as that one MP4; a change to card placement or focus belongs in
`packages/manim-showcase/src/render.ts`.

## Let the words drive focus

The Script places four Moments at the leading words `First`, `Next`, `Finally` and `These`. The
component receives those resolved Moments through `authors/main.svml`; it never parses the spoken
text or invents fixed seconds. The accepted performance currently resolves them to frames 121, 308,
489 and 672 at 30 fps. Each focus state enlarges and brightens one card while the other two remain
visible as smaller, dimmed, opaque cards.

The opening keeps all three cards out of the way until `First`. The focus sequence is mathematics,
machine learning, then physics. At `These`, the three cards return to the overview arrangement and
continue looping through the closing paragraph. No track is cleared after physics, and no blue
placeholder frame is used as a tail state.

## Make the scene seekable and contained

The HTML program evaluates layout from the current frame, while each video track uses explicit
sampling segments and loop ranges. The scene root and card windows use clipped bounds so a scaled
card cannot escape the portrait canvas. Opaque card backgrounds remain behind the source video to
avoid treating a source MP4 as transparent. Exact-frame review at each Moment is part of the normal
production check before a new Build is accepted.

## Preserve readable authoring

The production keeps speech, direction, generation, assets, composition, recipes and Runs in their
own files, following the complex-production example. `authors/main.svml` connects the authored
relationships; the package implements the coordinated visual behavior; `runs/render.svrun` is the
editable composition entry. Historical exports do not replace those sources or become the active
authoring surface.
