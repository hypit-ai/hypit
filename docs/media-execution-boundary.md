# Media Execution Boundary

Status: local reference path and AWS media/HyperFrames Endpoint variants are implemented. The AWS
deployments have not yet passed a live acceptance run. This is not yet a public compatibility
freeze.

## The rule

Pure planning is ordinary Producer code. Any operation that must inspect or transform real media
bytes is an explicit Provider Need.

```text
ordinary Producer
  schema validation
  stream-selection policy
  frame/sample arithmetic
  AudioProgramPlan construction
  Graph wiring and intrinsic value checks

Provider Need
  Artifact read
  ffprobe / decode
  resample / trim / pad
  audio mix
  visual frame render
  codec encode
  container mux
```

This does not add media knowledge to Core. Core still sees only typed Records, finite Operations,
Needs, selected Candidates, content digests and derivation history. `@narratage/media-pipeline` owns
the domain contracts; a Runtime Profile chooses concrete Provider implementations.

## Final video path

One author declaration remains compact:

```xml
<render:Video composition={film.main}/>
```

Its package-owned Fragment expands into the real execution facts:

```text
Composition
  ├─ HyperframesDocument ── render-visual Need ──> RenderedVisual (silent)
  └─ AudioProgramPlan ───── render-timeline-audio Need ──> TimelineAudio (PCM)

RenderedVisual + TimelineAudio
  └─ mux-program-media Need ──> MuxedMedia ──> MediaArtifactRef
```

Thus HyperFrames is not allowed to hide audio mixing or final mux. Conversely, Core does not learn
about FFmpeg, HyperFrames, H.264, AAC or Lambda.

## What survives from Twinit

Twinit's `SpeechSpineMediaPipelineAdapterV1` correctly recognized four remote-capable operations:
source normalization, spine assembly, audio preparation and mux. The old interface coupled those
operations to Speech and put all four behind one large adapter.

Narratage preserves the execution insight but changes the vocabulary:

| Twinit operation | SVML boundary |
|---|---|
| `normalize_source` | inspect/select/normalize generic media |
| `assemble_spine` | an ordinary visual Track plus an `AudioProgramPlan` |
| `prepare_audio` | explicit evidence-audio projection Provider |
| `mux` | generic `RenderedVisual + TimelineAudio -> MuxedMedia` Need |

The same Provider implementation may fulfill several capabilities, but they remain separate Needs
with separate inputs, results, digests, retry histories and scheduling identities.

## Local, Lambda and queues

`@narratage/provider-media-local` fulfills inspection, normalization, canonical speech-
evidence projection, timeline-audio rendering and mux with bounded shell-free ffprobe/ffmpeg
subprocesses. `@narratage/provider-hyperframes-local` fulfills the independent silent visual Need. One
Runtime Scheduler applies configured Endpoint lane concurrency across Builds, while HyperFrames'
own `workers` option partitions frames inside one admitted render.

`@narratage/provider-media-aws-lambda` fulfills the same five media Needs through one Lambda and the
same `@narratage/media-execution` implementation. `@narratage/provider-hyperframes-aws-lambda`
fulfills the same silent visual Need through one recoverable Step Functions execution. Lambda
invocation, internal frame fan-out, polling and remote queues belong to those Endpoints and their
execution topology. They do not change a Need or require another author component.

## Speech evidence path

WhisperX never receives a generated MP4, an AAC stream or the final program mix directly:

```text
SpeechAudioBasis (Narrative-bound 48 kHz stereo PCM master)
  -> project-speech-evidence-audio Need
  -> SpeechEvidenceAudio (16 kHz mono PCM s16, exact sample map)
  -> explicit WhisperX Need
  -> WhisperXAlignmentEvidence
  -> provider-neutral AlignedTranscriptEvidence
```

`SpeechEvidenceAudio` binds the original speech-master Artifact, exact Basis and ProgramSpace,
source/evidence sample counts, zero-origin mapping, resampler implementation and produced bytes.
The local media Provider verifies that the source really is 48 kHz stereo PCM and forces the
evidence output to `round(sourceSampleBoundary * 16000 / 48000)` samples. The local WhisperX
Provider validates that WAV again and stages the same bytes unchanged; it has no conversion branch.

## Two audio transformations, not one magic normalize

Source normalization fixes technical media shape while preserving source level:

- choose streams explicitly;
- preserve one measured A/V presentation origin;
- convert selected audio to 48 kHz stereo PCM;
- trim/pad to the authoritative frame domain;
- never infer that embedded AAC is Speech.

Program-audio rendering applies the author/compiler's explicit timeline plan:

- sample-exact placement and source offset;
- playback rate, gain and fades;
- mixing of peer `AudioTrack` clips;
- no implicit loudness normalization or limiter.

Final mux encodes the PCM program audio and combines it with one verified silent visual stream.
AAC may decode to a whole number of codec frames larger than the intended duration. The Provider
therefore verifies packet presentation start/end against the authoritative sample span; it does not
mistake codec padding for extra authored time.

## Remaining work

- publish a reviewed, redistributable exact FFmpeg Layer, then deploy and live-test the implemented
  AWS HyperFrames and ZIP-packaged media variants after explicit resource review;
- deploy the implemented `services/whisperx` distribution wherever a local warm model process is
  required, and add a remote-service Provider only for a genuinely persistent warm deployment;
  WhisperX is deliberately not an AWS Lambda target because repeated model cold starts defeat this
  execution shape;
- decide whether visual-only identity should be projected earlier so an audio-only edit can reuse a
  paid visual render without even recompiling its cheap visual document.
