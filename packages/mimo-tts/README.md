# `@narratage/mimo-tts`

Exact model contracts and author Surfaces for Xiaomi MiMo V2.5 speech synthesis.

The package owns the three distinct model shapes:

- `mimo-v2.5-tts`: explicit built-in voice;
- `mimo-v2.5-tts-voicedesign`: text-described voice;
- `mimo-v2.5-tts-voiceclone`: one explicit audio sample.

It contains no API URL, credential, retry, queue or Xiaomi wire encoding. Those belong to a Runtime
Endpoint such as `@narratage/provider-xiaomi-mimo`. Every model returns the shared
`GeneratedAudioSet`; author Surfaces expose its primary member as an ordinary `BlobArtifact`.
The `speech` attribute is an ordinary `Text` edge attached through the exact model's `text` port at
execution time; the Frontend never copies Script words into a request draft.

`optimize_text_preview` is intentionally absent: MiMo may not rewrite Script's exact speech truth.

```xml
<import as="mimo" from="@narratage/mimo-tts@1"/>

<mimo:Preset id="narration" speech={story.segment.opening.speech} voice="Chloe">
  Warm, direct and conversational.
</mimo:Preset>

<mimo:VoiceDesign id="designed" speech={story.segment.answer.speech}>
  A clear young woman with a grounded, confident delivery.
</mimo:VoiceDesign>

<mimo:VoiceClone id="cloned" speech={story.segment.payoff.speech} sample={presenter-voice}>
  Calm and restrained.
</mimo:VoiceClone>
```

Official API reference: <https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5>

The Source import selects author syntax and exact model semantics only. It does not select an API
service; the Runtime Profile independently selects a Provider.
