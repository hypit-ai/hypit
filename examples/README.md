# Video examples

These projects demonstrate different directing and composition decisions. Read the one closest to
the question, then trace its intent, component boundaries, semantic events and rendered behavior.
Adapt those relationships to a new work; its scene list and styling are choices for that production.

| Example | What to learn | Starting material |
| --- | --- | --- |
| [Football ranking](ranking-football/README.md) | Independent speaking Takes, a persistent tier board and timed reveals | Generate from `reference.svrun` |
| [Podcast](podcast/README.md) | Related host views, product references, motivated cuts and a lifestyle montage | Generate from `reference.svrun` |
| [Street interview](interview/README.md) | A shared encounter, derived close views, coordinated Moments and Caption tracking | Generate from `reference.svrun` |
| [Complex spoken explainer](complex-explainer/README.md) | Coordinated project scenes, moving presenter framing, independent Caption, semantic graphic events and Take-free intervals | Download its accepted media/Result bundle; render locally |
| [Manim explainer](manim-explainer/README.md) | Three project-local mathematical animations rendered separately, then composed with semantic cues | Render its three locked Manim scenes; check and plan locally |

The three generation entries use `reference.svml` and an adjacent `reference.svrun`. They generate
their main images, recurring voice references and video Takes, then normalize media, align the Script
and compose the video. They need no earlier Build Result or manually supplied presenter, host or scene
image. The explainer instead opens a complete 137-second production with 17 accepted Takes, recorded
demonstrations, pixel graphics and sound; its default Run reuses the supplied material.

The Manim explainer is an opt-in local authoring example. Its locked Python project renders three
silent MP4s outside Hypit; probe and watch each file, then use `hypit check` and `hypit plan` to
verify the Author graph. The project component samples the three `media:Video` Blobs into one
VisualTrack; the presenter is normalized separately. Generated MP4s are ignored and Manim is never
invoked by a Hypit Build.

Self-contained here means a project directory: SVML, its imported SVS/Kits and the selected local
assets. The installed Hypit Distribution supplies the imported packages. A Runtime Profile and
credentials supply execution; the Sources contain neither. Real identifiers, prepared reveal art,
music and sound effects may remain explicit local assets. Copy the whole example directory when
using it outside this repository.

The other `swap-*` and nested projects preserve separate variations and reuse studies. They have not
all been rebuilt to the same generation standard as these three reference entries. A linked showcase
video demonstrates the original production; a fresh generation is a new result and will differ.

For focused package work, `minimal-author-package/` demonstrates independent component packaging;
[provider-package](provider-package/README.md) demonstrates connecting a chosen service through a
project Provider. Each package's public inputs and behavior belong with its implementation.
