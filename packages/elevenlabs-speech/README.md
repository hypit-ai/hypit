# `@hypit/elevenlabs-speech`

Exact model contract and author Surface for ElevenLabs Voice Design.

`eleven_ttv_v3` creates an ordinary audio voice reference from a natural-language description and an
authored speech sample of 100 to 1000 characters. The service returns several candidate previews;
the Surface exposes the primary member of the shared `GeneratedAudioSet` as `<id>.reference`.

It contains no API URL, credential, retry, queue or ElevenLabs wire encoding. Those belong to a
Runtime Endpoint such as `@hypit/provider-hypihub`.

```xml
<import as="eleven" from="@hypit/elevenlabs-speech@1"/>
<import as="mimo" from="@hypit/mimo-speech@1"/>

<eleven:VoiceDesign id="host" speech={story.segment.voiceSample.speech}>
  A clear young woman with a grounded, confident conversational delivery.
</eleven:VoiceDesign>

<mimo:VoiceClone id="narration" speech={story.segment.reveal.speech} voice={host.reference}>
  Quietly confident, with a short pause before the final word.
</mimo:VoiceClone>
```

`host.reference` is a normal audio Resource, so it can feed a Voice Clone model from another
package or an A-roll video model that accepts reference audio.

Official API reference: <https://elevenlabs.io/docs/api-reference/text-to-voice/design>

The Source import selects author syntax and exact model semantics only. The Runtime Profile
independently selects the Provider that fulfils the capability.
