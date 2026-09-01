# `@hypit/mimo-tts`

Exact model contract and author Surface for Xiaomi MiMo V2.5 VoiceDesign.

The package owns only `mimo-v2.5-tts-voicedesign`: exact speech text plus a
natural-language voice description.

It contains no API URL, credential, retry, queue or Xiaomi wire encoding. Those belong to a Runtime
Endpoint such as `@hypit/provider-xiaomi-mimo`. The model returns the shared
`GeneratedAudioSet`; author Surfaces expose its primary member as an ordinary `BlobArtifact`.
The `speech` attribute is an ordinary `Text` edge attached through the exact model's `text` port at
execution time; the Frontend never copies Script words into a request draft.

`optimize_text_preview` is intentionally absent: MiMo may not rewrite Script's exact speech truth.

```xml
<import as="mimo" from="@hypit/mimo-tts@1"/>

<mimo:VoiceDesign id="designed" speech={story.segment.answer.speech}>
  A clear young woman with a grounded, confident delivery.
</mimo:VoiceDesign>
```

Official API reference: <https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5>

The Source import selects author syntax and exact model semantics only. It does not select an API
service; the Runtime Profile independently selects a Provider.
