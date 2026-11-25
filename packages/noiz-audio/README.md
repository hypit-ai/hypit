# `@hypit/noiz-audio`

Exact model contracts and SVML Surfaces for [Noiz](https://developers.noiz.ai/api-docs) speech, voice
cloning, sound effect and music generation.

The package owns five exact audio generation capabilities:

- `noiz-text-to-sound` generates a sound effect from a text prompt (`POST /v1/text-to-sound`);
- `noiz-tts` synthesizes speech from text with a Noiz `voice_id` (`POST /v1/text-to-speech`);
- `noiz-voice-clone` clones a voice from a reference audio sample and synthesizes speech (`POST /v1/voices` + `POST /v1/text-to-speech`);
- `noiz-yue2-music` generates a vocal song with YuE2 from a style prompt and lyrics (`POST /v1/text-to-music`);
- `noiz-yue2-cover` generates a YuE2 cover of a source audio track with new lyrics and style (`POST /v1/text-to-music/cover`).

It contains no API URL, credential, polling, retry or wire encoding. A Runtime Provider maps these
declared ports onto the Noiz HTTP API. Every model returns the shared `GeneratedAudioSet`, and each
author Surface publishes its primary audio Artifact as `<id>.audio`.

```xml
<import as="noiz" from="@hypit/noiz-audio@1"/>

<noiz:SoundEffect id="rain" prompt={rainPrompt} duration="8" output-format="wav"/>

<noiz:Music
  id="theme"
  prompt={stylePrompt}
  lyrics={songLyrics}
  vocal-gender="Female"
  lyric-timestamps="true"/>

<noiz:MusicCover
  id="cover"
  source-audio={original.audio}
  lyrics={newLyrics}
  music-description={coverPrompt}
  melody-adherence="main_melody"
  vocal-gender="Male"/>
```

## SoundEffect (`noiz-text-to-sound`)

- `prompt`: required Text reference, 1 to 500 characters, non-whitespace.
- `duration`: optional number from 1 to 30 seconds (defaults to 10; billing rounds up to whole seconds).
- `output-format`: optional `wav` or `mp3` (defaults to `wav`).

## Tts (`noiz-tts`)

- `text`: required Text reference, 1 to 5,000 characters, non-whitespace.
- `voice-id`: required Noiz voice ID.
- `model-id`: optional `v1`, `v2`, or `v3`.
- `output-format`: optional `wav` or `mp3` (defaults to `wav`).
- `speed`, `duration`, `target-lang`, `quality-preset`, `similarity-enh`, `emo`, `trim-silence`: optional synthesis controls.

## VoiceClone (`noiz-voice-clone`)

- `text`: required Text reference, 1 to 5,000 characters, non-whitespace.
- `voice-reference`: required audio Resource (`wav`, `mp3`, or `m4a`, at most 25 MB).
- `denoise`: optional `true` or `false`.
- `model-id`, `output-format`, `speed`, `duration`, `target-lang`, `quality-preset`, `similarity-enh`, `emo`, `trim-silence`: optional synthesis controls matching `Tts`.

## Music (`noiz-yue2-music`)

- `prompt`: required Text reference describing song style.
- `lyrics` / `lyrics-prompt`: exactly one must be provided; mutually exclusive. YuE2 does not support instrumental-only generation.
- `abc`: optional Text reference carrying a non-blank ABC score (up to 64,000 characters); cannot be combined with `cot="off"`.
- `cot`: optional `full`, `melody`, or `off` (defaults to `full` when `abc` is supplied, otherwise `off`).
- `title`, `tags`, `negative-tags`: optional literals.
- `vocal-gender`: optional `Male` or `Female`.
- `lyric-timestamps`: optional `true` or `false` (defaults to `false`).

## MusicCover (`noiz-yue2-cover`)

- `source-audio`: required audio Resource (`mp3`, `wav`, `flac`, `m4a`, `aac`, or `ogg`, at most 100 MB).
- `lyrics`: required Text reference.
- `melody-adherence`: required `high` (full score) or `main_melody` (melody only).
- `music-description` (Text reference) / `style` (literal): at least one must be provided.
- `title`, `vocal-gender`, `lyric-timestamps`: optional attributes matching `Music`.

Official API reference: <https://developers.noiz.ai/api-docs>
