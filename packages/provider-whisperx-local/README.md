# @narratage/provider-whisperx-local

Trusted local Provider for the explicit `@narratage/whisperx#whisperx-alignment` capability. It talks to
the warm Python service in `services/whisperx` through `/health` and `/transcribe`.

The Provider accepts only canonical 16 kHz mono PCM s16 WAV bytes produced by the separate media
projection Need. It validates those bytes and stages them unchanged. WhisperX is therefore never
allowed to hide a second ffmpeg conversion or change the speech-master clock.

WhisperX's wire response uses floating-point seconds. This adapter converts those boundaries once
to integer positions in the 16 kHz evidence-audio sample domain. It preserves WhisperX acoustic
passages but never receives or assigns authored Script Segment identities.

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

The service must be on loopback because this protocol deliberately passes a local staged path. A
future persistent remote Provider should use an Artifact URL or request payload owned by that
Provider; it is a different deployment package but must return the same
`AlignedTranscriptEvidence` type. Lambda is deliberately not the target for this warm model.

The configured model, device, compute mode and batch size are checked through `/health` before use.
This prevents a warm process with an incompatible inference configuration from accepting work.

Install and run the service with the commands in `services/whisperx/README.md`. The current local
package and service are trusted code; this is not a community-plugin sandbox.
