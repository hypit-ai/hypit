# Direct BytePlus and ElevenLabs providers

These examples exercise additive providers and exact models without changing Hypit's Core,
Timeline, Runtime or renderer. The example Profile is separate from other example projects.

## Connect keys

From the repository root, use Hypit's secure credential prompt:

```sh
node bin/hypit.mjs auth login byteplus.direct --runtime examples/direct-providers/hypit.runtime.json
node bin/hypit.mjs auth login elevenlabs.us --runtime examples/direct-providers/hypit.runtime.json
```

Alternatively pass `--from /private/path/key.txt` to import a user-supplied private key file.
Do not put keys in the runtime JSON, source files, command arguments or chat. Each provider gets
only its own key. The sample uses the platform credential store.

## Check before generation

```sh
node bin/hypit.mjs check examples/direct-providers/images.svrun --workspace examples/direct-providers
node bin/hypit.mjs plan examples/direct-providers/images.svrun --workspace examples/direct-providers --runtime examples/direct-providers/hypit.runtime.json
```

`plan` does not generate media. Missing credentials are expected until connected. A successful plan
is not proof of account entitlements or a successful live generation. Only run `build` with an
agreed spending scope. The automated tests use fake HTTP and do not submit paid generation.

## Authoring

```xml
<import as="eleven" from="@hypit/elevenlabs-models@1"/>
<import as="byte" from="@hypit/byteplus-models@1"/>
<eleven:Generate id="voice" model="eleven_v3" voiceId="YOUR_VOICE_ID" text="Welcome to the demonstration."/>
<eleven:Generate id="picture" model="gpt-image-2" prompt="A blue ceramic cup" resolution="1K"/>
<byte:Generate id="shot" model="dreamina-seedance-2-0-mini-260615" prompt="Slow push in on this cup" duration="4">
  <byte:Input port="firstFrame" source={picture.image}/>
</byte:Generate>
```

Outputs are ordinary `voice.audio`, `picture.image` and `shot.video` blobs. Feed them to existing
Normalize, Timeline/MediaTrack and Film components. Text attributes can also reference Script Text.
Use one `Input` per repeated media reference; for Veo reference images, set
`referenceRole="subject"` or `referenceRole="style"`. Frame inputs and omni references are mutually
exclusive. Repeated dialogue text inputs use `<eleven:Input port="texts">...</eleven:Input>` with
corresponding `voiceIds` inputs in the same order.

Native surfaces expose additional API options absent from the shared model contracts, such as
GPT Image masks and quality. They do not modify those shared definitions.

Existing `@hypit/seedance` and `@hypit/seedream` Sources can select BytePlus by their usual Runtime
bindings. Existing GPT Image 2 and ElevenLabs VoiceDesign Sources can select ElevenLabs. Service
limitations are rejected explicitly: e.g. ElevenLabs GPT Image 2 has no background parameter,
allows at most 10 reference images, and excludes the 9:21 ratio. No field is silently narrowed.

## Coverage and limits

- BytePlus: all 11 currently active Seedance/Seedream models listed in its public model catalog on
  2026-09-24. Seedance 1.5 Pro is marked retired; older Lite examples are not evidence of current
  catalog availability. No automatic substitution is made.
- ElevenLabs: all 18 image/video models in the official OpenAPI on 2026-09-24, plus production
  narration, dialogue, voice design, voice conversion and audio isolation. The six ByteDance
  image/video models require account approval and default to disabled. Set `allowGatedModels`
  only after that access is granted. `enabledModels` can further restrict any provider's catalog.
- US routing uses `https://api.us.elevenlabs.io`. US routing does not establish account-specific
  model availability. No EU endpoint or alternate account is selected automatically.
- Media APIs accept only implemented parameters. Model availability does not mean every advanced
  API feature is represented: e.g. BytePlus draft jobs, custom image layers and live speech
  streaming are outside these file-producing model contracts.
- BytePlus local image/audio references can be sent inline. Video references require a public
  URL publisher via the embedding `publicAssetUrl` option; the declarative profile does not
  provision storage or expose local files. This requirement is rejected before submission.
- ElevenLabs inline references are limited to 25 MiB each and the documented MIME types. Larger
  asset uploads and references to existing ElevenLabs asset IDs are not exposed by these models.
- Voice creation/cloning is explicit account setup through `createElevenLabsVoiceLibrary`; Builds
  use a selected `voiceId`. The helper can list voices/models, create instant clones, generate
  design previews and save a chosen preview. Professional clone verification remains with the user.
- Existing WhisperX timing/alignment remains unchanged. Account management, live conversational
  agents, dubbing project management and pronunciation-dictionary management are not added.
- Provider responses are fixture-tested. Authentication, regional/account access, output quality,
  and paid generation remain unverified until a user-authorized live test.

See each model package's `catalog.json` for exact scalar ports, enums, media roles and limits.
