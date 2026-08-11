# Media Execution Boundary

Status: local reference path and AWS media/HyperFrames Endpoint variants are implemented.
HyperFrames has passed its complete live acceptance run. The media Lambda has live evidence for its
original five-operation path; three newer shared utility operations await a deployment refresh and
expanded canary. This is not yet a public compatibility freeze.

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
  stream extraction
  resample / trim / retime / pad
  still-frame extraction
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
<render:Video id="final" composition={film.main} space={speech.space}/>
```

Its package-owned Fragment expands into the real execution facts:

```text
Composition
  ├─ HyperframesDocument ── render-visual Need ──> RenderedVisual (silent)
  └─ AudioProgramPlan ───── render-timeline-audio Need ──> TimelineAudio (PCM)

RenderedVisual + TimelineAudio
  └─ mux-program-media Need ──> MuxedMedia ──> BlobArtifact
```

Thus HyperFrames is not allowed to hide audio mixing or final mux. Conversely, Core does not learn
about FFmpeg, HyperFrames, H.264, AAC or Lambda.

`MuxedMedia` remains the internal verified join between one exact visual frame domain and one exact
audio sample domain. The terminal projection exports its contained Artifact bytes unchanged as the
ordinary domain-neutral `BlobArtifact`; it does not wrap those bytes in another media descriptor or
copy duration metadata onto them. Consequently `{final.video}` can directly feed any later author
component that accepts a Blob, such as `Transform`, `ExtractAudio`, `ExtractFrame`, a model reference
port or a zero-input Run Candidate. If a downstream operation needs observed duration or stream
facts, it must demand explicit media inspection through a graph edge.

No generic `SynchronizedMedia -> visual Blob` or `SynchronizedMedia -> audio Blob` projection is
introduced. Normalized media is a typed synchronization product, not a hidden bundle of convenience
exports. A concrete author operation should request a byte transformation only when it has an actual
use case; the media package does not manufacture speculative branches.

## What survives from the legacy implementation

The legacy `SpeechSpineMediaPipelineAdapterV1` correctly recognized four remote-capable operations:
source normalization, spine assembly, audio preparation and mux. The old interface coupled those
operations to Speech and put all four behind one large adapter.

Narratage preserves the execution insight but changes the vocabulary:

| Legacy operation | SVML boundary |
|---|---|
| `normalize_source` | inspect/select/normalize generic media |
| `assemble_spine` | an ordinary visual Track plus an `AudioProgramPlan` |
| `prepare_audio` | explicit evidence-audio projection Provider |
| `mux` | generic `RenderedVisual + TimelineAudio -> MuxedMedia` Need |

The same Provider implementation may fulfill several capabilities, but they remain separate Needs
with separate inputs, results, digests, retry histories and scheduling identities.

## Local, Lambda and queues

`@narratage/provider-media-local` fulfills inspection, normalization, generic media transformation,
audio/frame extraction, canonical speech-evidence projection, timeline-audio rendering and mux with
bounded shell-free ffprobe/ffmpeg subprocesses. `@narratage/provider-hyperframes-local` fulfills the
independent silent visual Need. One
Runtime Scheduler applies configured Endpoint Authority/Route concurrency across Builds, while HyperFrames'
own `workers` option partitions frames inside one admitted render.

The same domain library also owns generic `CompositableSurface` byte verification. Before local
HyperFrames staging it checks Artifact size/digest, exact dimensions, decoded still/frame timing,
SDR/sRGB-compatible metadata and opaque/straight alpha. The result is receipt evidence, not another
graph Product and not lineage copied through unrelated values.

`@narratage/provider-media-aws-lambda` fulfills the same media Needs through one Lambda and the
same `@narratage/media-execution` implementation. `@narratage/provider-hyperframes-aws-lambda`
fulfills the same silent visual Need through one recoverable Step Functions execution. Lambda
invocation, internal frame fan-out, polling and remote queues belong to those Endpoints and their
execution topology. They do not change a Need or require another author component.
The AWS HyperFrames Endpoint currently declines documents containing typed Surfaces until that
remote route owns equivalent byte verification; it cannot silently provide weaker conformance.

The shared executor stages normal media from an Artifact stream while verifying byte count and
digest, and streams encoded outputs back through `putStream`. Animated WebP inspection and decoded
surface verification still require bounded in-memory image data; that is an explicit random-access
image boundary, not the default path for video. KIE reference uploads and generated downloads are
streamed and content-checked as well.

The three author-facing utility operations stay generic and graph-visible:

- `Transform`: ordered trim and pitch-preserving retime over selected synchronized A/V;
- `ExtractAudio`: selected audio stream to a deterministic 48 kHz stereo PCM WAV `BlobArtifact`;
- `ExtractFrame`: selected moving video stream to a PNG `BlobArtifact` at first, last, frame or time.

Their results are ordinary Artifacts. In particular, extracted audio is not a `SpeechAudioBasis` and
does not inherit Narrative or alignment meaning. It can therefore be connected directly as a model
reference, archived, replaced by another Candidate or consumed by any future package that accepts
audio bytes.

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

- deploy the implemented `services/whisperx` distribution wherever a local warm model process is
  required, and add a remote-service Provider only for a genuinely persistent warm deployment;
  WhisperX is deliberately not an AWS Lambda target because repeated model cold starts defeat this
  execution shape;
- decide whether visual-only identity should be projected earlier so an audio-only edit can reuse a
  paid visual render without even recompiling its cheap visual document.
