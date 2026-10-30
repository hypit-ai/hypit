# Video examples

These projects demonstrate different directing and composition decisions. Read the one closest to
the question, then trace its intent, component boundaries, semantic events and rendered behavior.
Adapt those relationships to a new work; its scene list and styling are choices for that production.

| Example | What to learn | Starting material |
| --- | --- | --- |
| [Football ranking](ranking-football/README.md) | Independent speaking clips, a persistent tier board and timed reveals | Generate from `reference.svml`, targeting `final.video` |
| [Podcast](podcast/README.md) | Related host views, product references, motivated cuts and a lifestyle montage | Generate from `reference.svml`, targeting `final.video` |
| [Street interview](interview/README.md) | A shared encounter, derived close views, coordinated Moments and Caption tracking | Generate from `reference.svml`, targeting `final.video` |
| [Complex spoken explainer](complex-explainer/README.md) | Coordinated project scenes, moving presenter framing, independent Caption, semantic graphic events and graphics-only intervals | Download its accepted media/Result bundle; render locally |

The three generation entries use `reference.svml` and explicitly select `final.video` when planning
or building. They generate
their main images, recurring voice references and generated clips, then prepare media, align the
Script where needed, and compose the video. They need no earlier Build Result or manually supplied
presenter, host or scene image. The explainer instead opens a complete 137-second production with 17
accepted performance clips, recorded demonstrations, pixel graphics and sound; its Author Source
selects those supplied project resources; the command selects the final work for that execution.

Self-contained here means a project directory: SVML, its imported SVS/Kits and the selected local
assets. Hypit supplies the base video capabilities; each project's `package.json` declares any
additional components and fonts. A Runtime Profile and credentials supply execution; the Sources
contain neither. Real identifiers, prepared reveal art,
music and sound effects may remain explicit local assets. Copy the whole example directory when
using it outside this repository.

Football ranking and Street interview declare the Hypit 0.4 release and their additional packages.
In the selected project directory, install the selected published versions with `npm install`, review
and commit the resulting lockfile, then use `npm ci` for repeatable installs. Their dependencies install
[`@hypit/ranking`](https://www.npmjs.com/package/@hypit/ranking) and
[`@hypit/interview-emoji-reveal`](https://www.npmjs.com/package/@hypit/interview-emoji-reveal),
respectively. Interview's Flash component stays in its own `packages/flash` directory.
The nested ranking variants each have their own manifest and Author Source; install and keep each
variant's lockfile from that directory. Installation and Source checks do not submit generation requests.

The other `swap-*` and nested projects preserve separate variations and reuse studies. They have not
all been rebuilt to the same generation standard as these three reference entries. A linked showcase
video demonstrates the original production; a fresh generation is a new result and will differ.

For focused package work, `minimal-author-package/` demonstrates independent component packaging;
[provider-package](provider-package/README.md) demonstrates connecting a chosen service through a
project Provider. Each package's public inputs and behavior belong with its implementation.
