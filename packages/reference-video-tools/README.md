# `@hypit/reference-video-tools`

Direct tools for understanding a reference video and inspecting or previewing a Hypit project.

The package does not own a production workflow. It has no route/revision/variant state machine, no
checkpoint or recovery cursor, no content-addressed evidence directory, and no aggregate approval
state. Calling a command performs that command. It does not silently advance another process.

The useful outputs are ordinary content:

- prepared reference media, shots and transcript under `.hypit/reference-video-tools/`;
- reference observations and explicit comparison/review logs;
- requested stills, clips and package previews;
- direct JSON reports about vocabulary, package loading, Script Cues, graph tracing and realized
  browser layout.

These files can be opened, named, copied or removed directly. A repeated comparison or review is a
new explicit observation; it is not suppressed by comparing file hashes.

## Commands

```bash
hypit-reference-video-tools list_svml_packages
hypit-reference-video-tools prepare_reference --video-path ./reference.mp4 --observer agent
hypit-reference-video-tools observe_reference --reference-id <reference-id>
hypit-reference-video-tools record_observation --reference-id <reference-id> --key <key> --text-file ./answer.md
hypit-reference-video-tools inspect_svml_vocabulary --package @hypit/media-track --tag Track
hypit-reference-video-tools validate_local_author_packages --run ./build.svrun
hypit-reference-video-tools validate_script_cues --run ./build.svrun
hypit-reference-video-tools preview_check ./build.svrun
hypit-reference-video-tools layout_check --run ./build.svrun
hypit-reference-video-tools render_element ./build.svrun --element title --segment intro --out ./title.mp4
hypit-reference-video-tools compare_reconstruction --reference-id <reference-id> --run ./build.svrun --segment intro --video ./title.mp4 --element title
hypit-reference-video-tools review_element --run ./build.svrun --element title --segment intro --video ./title.mp4 --intent-file ./title-intent.md
hypit-reference-video-tools reconstruction_check ./build.svrun --reference-id <reference-id>
hypit-reference-video-tools authoring_check ./build.svrun
```

Every command prints one JSON result. Commands also accept `--input '{...}'` when structured input is
more convenient. Batch forms read JSON arrays from files for observations, comparisons, renders,
reviews and layout decisions.

## Reference preparation

`prepare_reference` accepts a local path or a supported video URL. It extracts bounded shot clips,
representative frames, a storyboard, speech audio and a word-timed transcript. The returned reference
id contains the source filename, byte length and modification time so it is inspectable without a
lookup table.

`--observer gemini` uses HypiHub or Vertex according to the configured provider. `--observer agent`
calls no visual provider; it returns observation tasks with local pictures and transcript context for
the calling agent to answer through `record_observation`.

It also produces `transcript`: the verbatim speech of the whole reference with a start and an end for
every single word. Placing an on-screen text reveal against the line that triggers it needs the time
of the word, not of the sentence around it, and that question comes up in every reconstruction. The
speech audio is extracted to `speech.wav` beside the shot media and measured through the
`@hypit/whisperx#whisperx-alignment` capability. This tool currently instantiates the local WhisperX
Provider directly; routing it through the selected Runtime Profile is pending.
The result reports `status`, `transcript_ref` and `word_count`, and the words themselves live in
`transcript.json` as passages, each with a `words` array of `{ text, start_seconds, end_seconds, score }`.
The transcript is deterministic local evidence rather than an observation: it is never written to the
observation cache and nothing about it is sent to Gemini. An unavailable WhisperX Provider reports
`status: "unavailable"` with the reason and prepares everything else.

Prepared stages are reused until the caller explicitly asks for `--redo ...` or `--reobserve`. This
is ordinary working data for one reference, not Build history.

## Inspection and review

`inspect_svml_vocabulary` reports the public Surfaces of packages the caller names.
`inspect_visual_schema` reports the actual Composition schema accepted from drawing Producers.
`validate_local_author_packages`, `validate_script_cues`, `preview_check`, `layout_check`,
`reconstruction_check` and `authoring_check` are independent reports. None approves or unlocks
another command.

`layout_check` always measures the current realized DOM. Its report contains advisory candidates such
as overflow, overlap and vertical offset. `layout_accept` attaches a human reason to a structural
finding id; it does not fingerprint the project or cache a previous measurement.

`render_element` draws one element directly from the Run using local preview media. A comparison reads
that render against the requested reference stretch. A review reads it against an explicit intent.
Their JSONL logs contain the actual question, paths and prose answer so later inspection does not
depend on a separate state database.

## Environment

Reference observation uses `HYPIT_GEMINI_PROVIDER=auto|hypihub|vertex`. HypiHub first reads the
`hypihub.oauth` session written by `hypit auth login` from the OS credential store, then falls back to
`HYPIHUB_API_KEY`; `HYPIHUB_BASE_URL` remains optional. Vertex reads `GOOGLE_CLOUD_PROJECT`,
`GOOGLE_APPLICATION_CREDENTIALS_JSON` and optional `GOOGLE_CLOUD_LOCATION`. Gemini defaults to
`gemini-3.1-pro`.

Transcript preparation uses the selected local WhisperX service. Start services through the normal
Runtime configuration with `hypit runtime up`. `HYPIT_REFERENCE_CONCURRENCY` and
`HYPIT_REFERENCE_LAUNCH_GAP_MS` only control observation request pacing.
