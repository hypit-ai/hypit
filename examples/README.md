# Video examples

Start with [Production project](production-project/README.md). It is the current executable example of
the recommended project boundary: an independent Generation Graph and Canvas, portable Media Asset,
flat NLE, optional Runtime Profile, project packages, and explicit one-way acceptance between them.

## Current focused examples

| Example | What to learn |
| --- | --- |
| [Production project](production-project/README.md) | How current project files coexist without a central manifest or permanent cross-system dependency |
| [Complete Caption materialization](caption-materialization/README.md) | Three A-rolls, base/role/Cue style rules, a hidden Cue, and always-timed Karaoke payloads materialized into flat NLE JSON |
| [Audiovisual title card package](semantic-composition/packages/audiovisual-title-card/README.md) | A project-owned Component implemented across AVIR, HTML, and the flat NLE |
| [Provider package](provider-package/README.md) | Connecting a chosen service through a project Provider package |

Use these examples for current file and package boundaries. A real project installs its ordinary npm
dependencies, commits the package-manager lockfile, keeps accepted media under its project root, and
keeps `.hypit/` execution/history state out of authored dependencies.

## Historical production studies

The following projects preserve valuable directing, composition, and component decisions from the
earlier Source/SVML architecture. Study their creative relationships and package implementations, but
do not copy their `.svml`, `authors/`, `recipes/`, or nested `productions/` layout as the current project
template.

| Example | What remains useful |
| --- | --- |
| [Football ranking](ranking-football/README.md) | Independent speaking clips, a persistent tier board, and timed reveals |
| [Podcast](podcast/README.md) | Related host views, product references, motivated cuts, and a lifestyle montage |
| [Street interview](interview/README.md) | A shared encounter, derived close views, coordinated moments, and Caption tracking |
| [Complex spoken explainer](complex-explainer/README.md) | Moving presenter framing, semantic graphic events, graphics-only intervals, and production-owned components |

The other `swap-*` and nested directories are separate variation and reuse studies. Linked showcase
videos demonstrate their original productions; fresh model generation is a new result and will differ.
Older component directories that are not current workspace packages remain historical design fixtures.
