# Two-take live acceptance

This example deliberately exercises the real path rather than a placeholder path:

```text
Script -> deterministic Estimate -> two Seedance Mini 480p generations
       -> media normalization -> Speech Spine -> WhisperX -> SemanticMap
       -> Vertex Gemini Caption plan -> Caption Track
       -> Selection-located Text Track -> Film -> HyperFrames -> audio mix -> mux
```

Both English lines use a fully explicit duration policy. The package does not add a hidden pause,
padding interval, model bound, or rounding choice. The generated presenter image is intentionally ignored by Git under
`assets/`; supply or regenerate `assets/presenter.png` before checking or building.

Prerequisites for the exact checked-in Runtime Profile:

- `KIE_API_KEY` for the two paid Seedance Mini generations;
- `GOOGLE_CLOUD_PROJECT` naming a project with Vertex AI enabled;
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` containing the credential JSON, not a committed path or
  secret file;
- `ffmpeg`, `ffprobe`, Chrome/HyperFrames and the prepared managed local WhisperX service.

Prepare and health-check WhisperX as described in
[`../../services/whisperx/README.md`](../../services/whisperx/README.md). `hypit check` validates
the source and Run Graph without making a paid Provider request. `hypit build` assembles the
selected Runtime and rejects missing capability coverage before scheduling external work; neither
command promises that remote credentials and service health are valid.

Run the complete graph through the explicit Run Graph and declarative local Runtime Profile. Source
imports select author and compute packages. The Profile selects Local execution, SQLite state,
filesystem Artifacts, credentials, KIE, media, WhisperX, Vertex and HyperFrames packages.

```bash
cd examples/talking-film-live
hypit runtime use hypit.runtime.json
hypit runtime up

hypit build build.svrun --follow

hypit inspect <build-id>

hypit get <build-id> \
  --name final.video \
  --to output/final.mp4
```

`build` prints the fresh automatic Build id assigned to this durable submission. `--follow` only
observes the detached Worker; closing this terminal does not cancel the Build.

`build.svrun` owns the Targets and any explicit Candidate selections. `hypit.runtime.json` owns Provider instances,
credentials and their capacity. The Build archives all accepted intermediate Records and referenced
Artifacts even when no destination path is requested. `get` only makes an optional copy of the
already archived named target. The CLI accepts the declarative JSON Runtime Profile shown here;
applications that embed Hypit assemble Runtime roles directly through `@hypit/runtime-local`.

To reuse the paid shot outputs from a verified earlier Build, add two zero-input Build Record
Candidates and their explicit Satisfaction edges to another `.svrun`:

```xml
<?svml using="@hypit/run-markup@1"?>
<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
  <build-record id="opening" build="prior-build-id" output="opening-take.video"/>
  <build-record id="answer" build="prior-build-id" output="answer-take.video"/>
  <satisfy output="opening-take.video" candidate="opening"/>
  <satisfy output="answer-take.video" candidate="answer"/>
</svrun>
```

The second Run compiles a new Build whose two shot outputs explicitly select historical values.
It therefore contains no Seedance Operations or KIE Needs. The rebuilt media normalization,
WhisperX, SemanticMap, Tracks, Film and HyperFrames path consumes those values through ordinary
typed graph edges.
