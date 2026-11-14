# Football ranking

The current NLE projection is [film.nle.json](film.nle.json). It preserves the eleven supplied player
portraits as project Media Assets and binds them by named roles to the project-owned Tier Board Component.
The Component ports the original board geometry and reveal behavior. Independent Title and Caption tracks
restore the reference headline and source-aligned karaoke treatment. The accepted composite supplies the
presenter picture and audio because the two clean historical takes are no longer present; comedy B-roll still
belongs to the legacy Source and is not invented by this projection.

```bash
pnpm render:nle
```

## Legacy generation source

[reference.svml](reference.svml) generates a goth football commentator and all eight comedy B-roll
images, then makes two independent speaking clips from the same presenter image and designed voice.
A tier board preserves its state while the argument, Caption and overlapping image inserts unfold.
It records the earlier 0.4 authoring route; its generated Result media and former `@hypit/ranking` package are
not part of the current project installation. Keep it as production evidence until those missing Results are
accepted into `media/`, rather than pretending that its generated outputs already exist in the NLE.

## What is generated and what is supplied

- `presenter.image`: the striking goth host, seated to the right in a sky-blue football classroom.
- Eight `broll-*.image` outputs: independent text-to-image jokes for the annotated Script passages.
- `presenter-voice.reference`: one Fish Audio Voice Design request reused by both clips.
- `ronaldo-take.video` and `messi-take.video`: Seedance Mini performances with audio, followed by
  preparation and WhisperX alignment. Both use the same presenter image; there is no tail-frame chain.
- Eleven supplied player photographs identify the board entries. Nine are presets and two enter
  during their spoken Segments. These real identifiers are intentionally not generated lookalikes.
- `shared-soundtrack.m4a`, `ranking-appear.wav` and `ranking-move.wav` are supplied audio assets.

The image prompts, reference bindings and Action are in the Source. The image and speaker Kits are
imported from `@hypit/gpt-image-kits/phone-ugc-v1` and `@hypit/seedance-kits/speaker`;
[recipes.svs](recipes.svs) owns appearance and the speaker's pause-trim direction.
The speaker Kit requests natural edited delivery; it does not perform a postprocessing trim.
The B-roll uses its own visual language: theatrical tragedy, product comedy, sports photography or
parody UI. It does not automatically inherit the host's iPhone capture paragraph.

## Historical generation notes

The example Profiles use local media/rendering and HypiHub for hosted capabilities. They illustrate
execution choices; connect the intended account or select project Providers before paid work.
Existing production projects can retain their own Providers independently of these example defaults.

The two passages were authored as ten-second requests and previously estimated to about nine seconds each.
Re-execution is generation work, not part of this NLE migration: it requires choosing the current Provider and
package route, accepting the resulting takes, and importing those accepted files into the project Media library.

When changing the ranked subjects, use supplied photographs or search for recognizable real
photographs, official logos or product assets. Record source pages and any relevant attribution with
the project, then crop or pad consistently for the board. The original project's player files did
not include a source URL log; this example does not invent one. No asset lookup occurs during Build.

## Prompt provenance and scope

The presenter direction is an English adaptation of the author's supplied Messi goth-girl prompt,
including broad shoulders, the HYPIT spiked cap, right-side placement, a balancing desk and abstract
football posters. Output shape stays in the image parameters. The eight comic image prompts were
retained from the original ranking Source. Action corrects the host's pronouns and uses a few
meaningful gestures while preserving the dry, affectionate football humor.

`swap-host`, `swap-effect`, `swap-topic` and the nested banana projects are separate studies. Their
Author Sources from those studies are not inputs to this complete generation entry.
