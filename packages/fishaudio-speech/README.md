# `@hypit/fishaudio-speech`

Exact model contracts and author declarations for Fish Audio Voice Design and Voice Clone.

The package owns two distinct speech operations:

- `voice-design-1` creates an ordinary audio voice reference from a natural-language description
  and a short authored speech sample;
- `voice-clone` uses one accepted audio voice reference to create independent speech.

It contains no API URL, credential, retry, queue or Fish Audio wire encoding. Those belong to a
Runtime Endpoint such as `@hypit/provider-hypihub`. Both models return the shared
`GeneratedAudioSet`; the author declarations expose its primary member as an ordinary audio Resource.

```xml
<import as="fish" from="@hypit/fishaudio-speech@1"/>

<fish:VoiceDesign id="host" speech={story.segment.voiceSample.speech}>
  A clear young woman with a grounded, confident conversational delivery.
</fish:VoiceDesign>

<fish:VoiceClone id="narration" speech={story.segment.reveal.speech} voice={host.reference}/>
```

`host.reference` is not a special identity record. It is a normal audio Resource, so the same
accepted reference can also feed an A-roll video model that accepts reference audio.
`VoiceClone` takes spoken text and a voice reference. It has no separate natural-language delivery
instruction input; the description in `VoiceDesign` establishes the reference voice.

Official API reference: <https://docs.fish.audio/>

The Source import selects author syntax and exact model semantics only. The Runtime Profile
independently selects the Provider that fulfils either capability.
