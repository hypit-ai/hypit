# Football ranking

[reference.svml](reference.svml) generates a goth football commentator and all eight comedy B-roll
images, then makes two independent speaking Takes from the same presenter image and designed voice.
A tier board preserves its state while the argument, Caption and overlapping image inserts unfold.
[reference.svrun](reference.svrun) targets `final.video` without earlier Results or replacement files.

## What is generated and what is supplied

- `presenter.image`: the striking goth host, seated to the right in a sky-blue football classroom.
- Eight `broll-*.image` outputs: independent text-to-image jokes for the annotated Script passages.
- `presenter-voice.reference`: one MiMo Voice Design request reused by both Takes.
- `ronaldo-take.video` and `messi-take.video`: Seedance Mini performances with audio, followed by
  normalization and WhisperX alignment. Both use the same presenter image; there is no tail-frame chain.
- Eleven supplied player photographs identify the board entries. Nine are presets and two enter
  during their spoken Segments. These real identifiers are intentionally not generated lookalikes.
- `shared-soundtrack.m4a`, `ranking-appear.wav` and `ranking-move.wav` are supplied audio assets.

The image prompts, reference bindings and Action are in the Source. The copied image/speaker Kits
are in `kits/`; [recipes.svs](recipes.svs) owns appearance and the speaker's pause-trim direction.
The speaker Kit requests natural edited delivery; it does not perform a postprocessing trim.
The B-roll uses its own visual language: theatrical tragedy, product comedy, sports photography or
parody UI. It does not automatically inherit the host's iPhone capture paragraph.

## Work with the example

With a configured Runtime and installed Distribution, run from this directory:

```bash
hypit check reference.svrun
hypit measure reference.svml --segment ronaldo --language en --pace fast --rounding ceil
hypit measure reference.svml --segment messi --language en --pace fast --rounding ceil
hypit plan reference.svrun --runtime ./hypit.runtime.json
```

Both passages estimate to nine seconds at that delivery policy; the authored ten-second requests
allow room for expression. Read the plan and its Endpoint/pricing information before authorizing paid
work. Under that authorization, `hypit build reference.svrun --runtime ./hypit.runtime.json --follow`
produces the final video. Watch the actual result and reuse its media outputs when refining graphics.

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
Sources and Runs are not inputs to this complete generation entry.
