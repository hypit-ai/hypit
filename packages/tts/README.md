# `@hypit/tts`

Exact model contracts and author Surfaces for voice design and voice clone speech synthesis.

The package owns two distinct speech operations, each served by exact models chosen with the
`model` attribute:

- Voice Design creates an ordinary audio voice reference from a natural-language description and a
  short authored speech sample: Fish Audio `voice-design-1` (`fish`, the default), Xiaomi
  `mimo-v2.5-tts-voicedesign` (`mimo`) and ElevenLabs `eleven_ttv_v3` (`eleven`);
- Voice Clone uses one accepted audio voice reference to create independent speech: Fish Audio
  `voice-clone` (`fish`, the default) and Xiaomi `mimo-v2.5-tts-voiceclone` (`mimo`).

It contains no API URL, credential, retry, queue or vendor wire encoding. Those belong to a Runtime
Endpoint such as `@hypit/provider-hypihub` or `@hypit/provider-xiaomi-mimo`. Every model returns the
shared `GeneratedAudioSet`; the author Surfaces expose its primary member as an ordinary audio Resource.

```xml
<import as="tts" from="@hypit/tts@1"/>

<tts:VoiceDesign id="host" speech={story.segment.voiceSample.speech}>
  A clear young woman with a grounded, confident conversational delivery.
</tts:VoiceDesign>

<tts:VoiceClone id="narration" speech={story.segment.reveal.speech} voice={host.reference}>
  Quietly confident, with a short pause before the final word.
</tts:VoiceClone>
```

`host.reference` is not a special identity record. It is a normal audio Resource, so the same
accepted reference can feed Voice Clone or an A-roll video model that accepts reference audio,
whichever model designed it.

Official API references:

- Fish Audio: <https://docs.fish.audio/>
- Xiaomi MiMo: <https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5>
- ElevenLabs Voice Design: <https://elevenlabs.io/docs/api-reference/text-to-voice/design>

The Source import selects author syntax and exact model semantics only. The Runtime Profile
independently selects the Provider that fulfils each capability.
