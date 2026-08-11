# Seedance Prompt Kits

Narratage ships seven data-only English Text Templates under `packages/seedance-kits/kits/`. They
assemble recurring prompt contracts without adding execution nodes or hiding media/model choices.

| Format | Kit | Required dynamic slots | Ordered references |
|---|---|---|---|
| Talking head | `speaker-v1.svs` | `dialogue`; optional `action` | image 1 = speaker/scene, audio 1 = voice |
| Silent B-roll | `broll-v1.svs` | `story` | one or more authored images |
| Two-person podcast | `podcast-v1.svs` | `dialogue`; optional `action` | images 1/2 = A/B views, audio 1/2 = A/B voices |
| Video call | `call-v1.svs` | `dialogue`; optional `action` | images 1/2 = reversed call layouts, audio 1/2 = A/B voices |
| Street interview | `street-interview-v1.svs` | `dialogue`; optional `action` | image 1 = complete scene, audio 1/2 = interviewer/guest |
| Motion transfer | `motion-reference-v1.svs` | optional `direction` | image 1 = subject, video 1 = motion reference |
| Camera transfer | `camera-reference-v1.svs` | optional `direction` | image 1 = subject, video 1 = camera reference |

## Required workflow

1. Read `packages/seedance-kits/README.md` and the selected Kit file for exact axes and defaults.
2. Copy only that `.svs` file into the video project's `./kits/` directory; import the vendored copy.
3. Put stable axis choices in `studio.svs` as a named Recipe.
4. Use `text:Render` with the Kit Template and Recipe. Connect dynamic slots with `text:Set`.
5. Feed the rendered Text to the appropriate low-level Seedance Surface. Keep duration, resolution,
   model, and every image/audio/video reference explicit on the graph.

Do not hand-write or duplicate a Kit's fixed reference, role, voice, microphone, camera, or hygiene
blocks. Write a freeform English prompt only when none of the seven Kit contracts matches.
