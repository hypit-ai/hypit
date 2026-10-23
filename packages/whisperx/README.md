# `@hypit/whisperx`

Explicit WhisperX model-family capability for speech transcription evidence. Importing this package selects
WhisperX; Runtime registration binds the resulting evidence Need to a concrete Endpoint. The package
contains no credentials, Python environment or queue.

The package implementation consumes public Hypit author APIs and the owning domain packages and can be
released independently from the Host. Providers that interpret this exact capability may declare a
normal compatible dependency or peer range on this package; npm/pnpm and the project lockfile own the
resolved physical version. The logical capability remains `@hypit/whisperx@1`.

The official Distribution currently obtains this package as a default npm dependency because its CLI
and default HypiHub Provider use the capability contract. Its source is not embedded in the root
tarball, and its npm version can advance independently.

The package also owns `@hypit/whisperx/cli` and therefore `hypit transcribe`. That command projects an
explicit audio or video file to canonical evidence audio through `@hypit/media-local`, invokes the
selected WhisperX transcription Endpoint, and writes a lossless `<speech:Transcript>` SVML Source. It is an
immediate authoring operation: it creates no Author Graph, Build or Result, and its transcript stays
on the input file's local clock.

```bash
hypit transcribe reference.mp4 --language en --to notes/reference.transcript.svml
```

The generated Source exports `transcript`, so another author Source can use the same evidence without
running the model again:

```svml
<import as="accepted-speech" source="./notes/reference.transcript.svml"/>
<speechalign:Alignment id="opening" narrative={story}
  segment={story.segment.opening} domain={opening-media.domain}
  evidence={accepted-speech.transcript}/>
```

The reusable transcript document and phrase-range operations belong to `@hypit/speech-evidence`.
WhisperX owns only how evidence is obtained through this model family; media decoding remains with
the local-media executor.

`<whisperx:Transcription>` consumes one normalized `SynchronizedMedia` and an explicit lowercase
two- or three-letter language code. The provider receives canonical evidence audio and returns
provider-neutral `SpeechTranscriptEvidence` preserving its exact sample span:

```svml
<whisperx:Transcription id="opening-transcription"
  media={opening-media.media} language="ko"/>
<speechalign:Alignment id="opening" narrative={story}
  segment={story.segment.opening} domain={opening-media.domain}
  evidence={opening-transcription.transcript}/>
```

The first result is only `opening-transcription.transcript`. The separately imported
`@hypit/narrative-speech-alignment` Surface combines that evidence with an authored Segment and local
domain to publish `opening.alignment`. A Segment with no Tokens can use the alignment Surface without
evidence; no WhisperX request is needed.

For Chinese speech use `zh`. WhisperX may emit character-sized evidence units; local alignment maps
them to Script's authored units while Caption continues to use Script's display wording and authored Cue boundaries.
The package validates only the language-code form; the selected Endpoint owns actual language support.

## Local deployment

`@hypit/provider-hypihub` is the normal hosted adapter. A local deployment may bind the same Need:

```json
{
  "endpoints": {
    "whisperx.local": {
      "use": "@hypit/provider-whisperx-local",
      "config": { "expectedModel": "small", "alignmentLanguages": ["ko"] }
    }
  },
  "bindings": {
    "@hypit/whisperx@1#whisperx-transcription": "whisperx.local"
  }
}
```

```bash
hypit programs prepare --runtime hypit.runtime.json --endpoint whisperx.local
hypit runtime up --runtime hypit.runtime.json --endpoint whisperx.local
hypit build video.svrun --runtime hypit.runtime.json --follow
```

The Provider README owns model cache and hardware choices. To materialize editable evidence, use
`hypit transcribe source.mp4 --language ko --to transcript.svml` with the selected Runtime.
