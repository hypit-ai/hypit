# @narratage/provider-whisperx-local

Trusted local Provider for the explicit `@narratage/whisperx#whisperx-alignment` capability. It talks to
the warm Python service in `services/whisperx` through `/health` and `/transcribe`.

The Provider accepts only canonical 16 kHz mono PCM s16 WAV bytes produced by the separate media
projection Need. It validates those bytes and stages them unchanged. WhisperX is therefore never
allowed to hide a second ffmpeg conversion or change the speech-master clock.

```ts
createLocalWhisperXProvider({
  baseUrl: "http://127.0.0.1:8765",
  expectedModel: "small",
  expectedDevice: "cpu",
  expectedCompute: "int8",
  expectedBatchSize: 8,
  defaultConcurrency: 1,
});
```

The sidecar must be on loopback because this protocol deliberately passes a local staged path. A
future Lambda/hosted Provider should use an Artifact URL or request payload owned by that Provider;
it is a different deployment package but must return the same `WhisperXAlignmentEvidence` type.

The configured model, device, compute mode, batch size, service version, WhisperX version and
sentence-tokenizer data digest are checked through `/health` and contribute to Provider identity.
This prevents a warm process with a different inference configuration from silently fulfilling the
same locked Runtime Closure.

Install and run the service with the commands in `services/whisperx/README.md`. The current local
package and service are trusted code; this is not a community-plugin sandbox.
