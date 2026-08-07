# Media Inspection and Normalization

Status: implemented public contracts, reference local Provider and adversarial fixtures; not yet a
public compatibility freeze.

## Why this boundary exists

An MP4 is a container, not a video stream and not a speech claim. The representative KIE run proved
all three distinctions:

- MiniMax H3 returned H.264 plus 32 kHz AAC;
- Gemini Omni returned H.264 plus 48 kHz AAC;
- Grok Imagine returned H.264, AAC and a second MJPEG `attached_pic` video stream;
- Seedance Mini returned H.264 without audio.

Therefore none of these shortcuts is legal:

```text
first video stream       = primary picture
container has AAC        = SpeechAudioBasis
video PTS -> zero
audio PTS -> zero        = preserved synchronization
requested duration       = observed presentation span
audio normalization      = loudness normalization
```

The implemented boundary is:

```text
raw BlobArtifact
  -> MediaInspection          observed container and every stream
  -> MediaStreamSelection     explicit deterministic stream choice
  -> SynchronizedMedia        canonical visual/audio projections on one source clock
  -> domain component         optional semantic promotion, e.g. Narrative-bound SpeechBasis
```

Core does not know any of these Types. They are nominal Types in the logical `@narratage/media` module,
with digest validators registered by the media component.

## MediaInspection

`MediaInspection` binds one exact source Blob digest and records:

- every stream index, codec type and codec name;
- default and attached-picture dispositions;
- video role: moving, still or attached picture;
- width, height and rational frame-rate metadata;
- audio sample rate, channels, layout and decoded sample count;
- rational presentation start/end derived from decoded units;
- timing admission: admissible, missing, non-monotonic or discontinuous;
- ffprobe algorithm and implementation identity;
- one digest over the complete inspection.

Inspection does not silently discard an MJPEG cover, subtitle, data or unknown stream. Non-audio and
non-video streams remain visible as `other` facts. A malformed stream can remain observable even
when normalization refuses to consume it.

## Stream selection

Default moving-video selection applies these laws in order:

1. keep only admitted moving video streams;
2. exclude every `attached_pic` stream, even if a vendor marks it default;
3. select exactly one remaining default stream;
4. otherwise select the sole remaining candidate;
5. otherwise fail as ambiguous.

Default audio uses the same unique-default/unique-candidate rule over admitted audio streams. The
selection request may instead name an exact stream index. It may never force an attached picture
through the moving-video path.

`MediaStreamSelection` records selected indexes, span authority, selection policy and its own
digest. Its direct Graph inputs are the source and inspection; their ancestry is not repeated in
the selection value. It contains no Narrative, Segment or Speech identity. Observing AAC is
therefore incapable of satisfying `SpeechAudioBasis` by itself.

## One source presentation origin

The old Twinit implementation proved why independent stream reset is unsafe. A synthetic source had
video starting at 0.400s and audio at 0.628s. Independently applying `PTS-STARTPTS` changed their
relative timing by 228ms.

V1 instead chooses one authority interval:

- video + optional audio: the selected moving video's presented start/end;
- audio-only: the selected audio's presented start/end.

It then derives one transform for both projections:

```text
audioTrimStartSamples   source audio before authority origin
audioTrimEndSamples     source audio beyond authority end
audioHeadSamples        silence before late source audio
audioContentSamples     decoded source audio retained in the program span
audioTailSamples        silence after early-ending source audio
```

The public validator requires `head + content + tail = timeline.sampleFrames`, so a Provider cannot
return a self-digested but internally incomplete sample map. Stream and source intervals must also
be positive, and the visual frame rate must exactly equal the declared timeline rate.

Video sources are video-authoritative because AAC packetization may legally extend beyond the last
picture. The tail is trimmed instead of lengthening the program and exposing black frames. A short
audio stream is padded to the exact program sample count.

For target rate `fps.num / fps.den` and frame boundary `F`, the 48 kHz sample boundary is computed
with integer/rational arithmetic:

```text
S(F) = round(F * 48000 * fps.den / fps.num)
```

No per-item floating duration is independently rounded and then summed.

## Two different meanings of audio normalization

Media normalization means deterministic technical shape:

- decoded source presentation timing;
- sample-rate conversion;
- channel-layout conversion;
- exact trim, delay, pad and sample count;
- lossless PCM until final program encoding.

It does not mean loudness mastering. The local Provider emits 48 kHz stereo PCM s16 WAV with
`loudness: preserved`. Gain, ducking, LUFS normalization and final mastering change presentation
policy and must be explicit downstream audio/mix components.

WhisperX does not consume the final program mix. The implemented speech execution path explicitly
derives one 16 kHz mono PCM `SpeechEvidenceAudio` from the Narrative-bound 48 kHz speech master,
records its resampler/sample-map identity, and passes the same bytes to WhisperX without a second
hidden transcode.

## Provider boundary

`@narratage/media-pipeline` owns the provider-neutral Fragment and exact capabilities.
`@narratage/provider-media-local` realizes them with bounded local ffprobe/ffmpeg processes.

```text
.svml/imported author package  chooses that a generated result is used as visual or speech media
Media Pipeline                fixes inspection, selection and clock laws
Runtime Profile               binds local media Provider or future AWS media Provider
Provider                      executes bytes; it cannot promote audio to speech
```

A future Lambda package returns the same `MediaInspection` and `SynchronizedMedia` contracts. It may
queue or parallelize internally, but it cannot change primary-stream selection or A/V timing laws.

## Executable evidence

The tests cover:

- Grok-shaped H.264 + AAC + MJPEG attached-picture enumeration;
- default selection excluding the attached picture;
- ambiguous multiple moving streams failing closed and explicit-index resolution;
- attached-picture explicit-index rejection;
- real local 24fps H.264 + 32 kHz AAC + MJPEG normalization;
- AAC presentation tail trimmed to the last picture;
- later-starting audio preserved as head silence from measured PTS;
- silent generated video remaining visual-only;
- semantic validators and the complete inspect → select → normalize Graph Fragment.

The same parser was replayed against the four retained KIE live artifacts on 2026-08-06 and selected
the expected main H.264 stream in every case; Grok's MJPEG stream remained visible as an attached
picture and was not selected.
