# `@hypit/mimo-speech`

Exact model contracts and author Surfaces for Xiaomi MiMo V2.5 Voice Design and Voice Clone.

The package owns two distinct speech operations:

- `mimo-v2.5-tts-voicedesign` creates an ordinary audio voice reference from a natural-language
  description and a short authored speech sample;
- `mimo-v2.5-tts-voiceclone` uses one accepted audio voice reference to create independent speech.

It contains no API URL, credential, retry, queue or Xiaomi wire encoding. Those belong to a Runtime
Endpoint such as `@hypit/provider-xiaomi-mimo`. Both models return the shared `GeneratedAudioSet`;
the author Surfaces expose its primary member as an ordinary audio Resource.

```xml
<import as="mimo" from="@hypit/mimo-speech@1"/>

<mimo:VoiceDesign id="host" speech={story.segment.voiceSample.speech}>
  A clear young woman with a grounded, confident conversational delivery.
</mimo:VoiceDesign>

<mimo:VoiceClone id="narration" speech={story.segment.reveal.speech} voice={host.reference}>
  Quietly confident, with a short pause before the final word.
</mimo:VoiceClone>
```

`host.reference` is not a special identity record. It is a normal audio Resource, so the same
accepted reference can also feed an A-roll video model that accepts reference audio.

Official API reference: <https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5>

The Source import selects author syntax and exact model semantics only. The Runtime Profile
independently selects the Provider that fulfils either capability.
