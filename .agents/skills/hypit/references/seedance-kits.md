# Seedance Prompt Kits

Hypit ships seven English Text Templates in the installed Distribution under
`packages/seedance-kits/kits/`. Use `hypit paths --json` to locate that Distribution. Each Kit owns the
repeatable prompt contract; the project Recipe selects its stable directing axes, and explicit Text
slots carry shot-specific dialogue or action.

| Format | Kit | Required dynamic slots | Ordered references |
|---|---|---|---|
| Talking head | `speaker-v1.svs` | `dialogue`; optional `action` | image 1 = speaker/scene, audio 1 = voice |
| Silent B-roll | `broll-v1.svs` | `story` | one or more authored images |
| Two-person podcast | `podcast-v1.svs` | `dialogue`; optional `action` | images 1/2 = A/B views, audio 1/2 = A/B voices |
| Video call | `call-v1.svs` | `dialogue`; optional `action` | images 1/2 = reversed call layouts, audio 1/2 = A/B voices |
| Street interview | `street-interview-v1.svs` | `dialogue`; optional `action` | image 1 = complete scene, audio 1/2 = interviewer/guest |
| Motion transfer | `motion-reference-v1.svs` | optional `direction` | image 1 = subject, video 1 = motion reference |
| Camera transfer | `camera-reference-v1.svs` | optional `direction` | image 1 = subject, video 1 = camera reference |

## Required procedure

1. Read the installed `packages/seedance-kits/README.md` and selected Kit file for exact axes and defaults.
2. Copy only that `.svs` file into the video project's `./kits/` directory; import the vendored copy.
3. Put stable axis choices in `recipes.svs` as a named Recipe.
4. Import `@hypit/text@1` as `copy`. Use `copy:Render` with the Kit Template and Recipe, then
   connect dynamic slots with `copy:Set`.
5. Feed the rendered Text to the appropriate low-level Seedance Surface. Keep duration, resolution,
   model, and every image/audio/video reference explicit in the Author Source.

Select these Recipe axes instead of rewriting their prompt blocks:

| Kit | Stable Recipe axes |
|---|---|
| `speaker-v1` | `composition-stability`, `camera-motion`, `edit-rhythm`, `performance`, `gesture` |
| `broll-v1` | `material-mode`, `story-shape`, `edit-language`, `camera-language`, `motion-intensity` |
| `podcast-v1` / `call-v1` | `framing`, `edit-language`, `pacing`, `performance`, `reaction`, `gesture` |
| `street-interview-v1` | `framing`, `edit-language`, `pacing`, `performance`, `reaction`, `gesture` |

Use a freeform English prompt only when none of the seven Kit contracts matches. Keep dialogue in
its authored language when it must be spoken verbatim.
