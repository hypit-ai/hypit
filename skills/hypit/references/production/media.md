# Preparing Media for a Production

Read this when admitting local files, adopting generated Publications from Canvas or ExecutionHost, inspecting streams, or preparing cutouts and trimmed clips for NLE timelines. [Picture Presents](visual-clips.md) owns picture placement, [Audio Presents](audio-clips.md) owns sound placement, and [Video Downloads](video-downloads.md) owns fetching online reference footage.

## Project Media (`*.media.json`)

Every file referenced by an NLE `<present source="media">` is a **Project Media** asset stored inside the project (typically under `media/`), paired with a `.media.json` descriptor that records its verified metadata (stream type, dimensions, frame rate, duration, audio sample rate, and relative asset path).

Keep source facts, preparation, and timeline placement distinct:

| Material | How it enters the project |
| --- | --- |
| Generated image, video, speech, or music | Created on a Canvas board (`hypit canvas invoke`) or via `hypit execution submit`, then adopted into Project Media (`hypit canvas adopt` or `hypit execution resource`). |
| Local footage, still image, or audio | Copied into the project (`media/` or `assets/`), inspected with `ffprobe`, and registered as a Project Media asset. |
| Code-authored graphics, titles, captions | Authored directly as HTML/React components (`<present source="component">`) without intermediate video files. |
| Model reference input | Passed directly by path or Canvas edge to the model capability; timeline normalization is not required for reference inputs. |

## Adopting Generated Outputs from Canvas

When a Canvas node completes (`hypit canvas invoke`), adopt its chosen Publication into Project Media so SVML timelines can reference it cleanly:

```bash
hypit canvas adopt board.canvas.json opening-shot --input adopt.json
```

See [Canvas](canvas.md) for the exact `adopt.json` payload and node history inspection (`hypit canvas history`). For standalone ExecutionHost runs outside Canvas, download the output resource directly:

```bash
hypit execution resource <invocation-id> --output video --resource primary --to media/opening.mp4
```

## Inspecting and Trimming Local Media

Use `ffprobe` to verify exact dimensions, pixel format, alpha channel, frame rate, audio streams, and duration before placing a file or writing rational timestamps:

```bash
ffprobe -v error -show_format -show_streams -of json media/recording.mp4
```

When only part of a long local recording belongs in the project, trim or extract streams with `ffmpeg` before registering it as Project Media:

```bash
# Trim a single interval
ffmpeg -ss 12.4 -to 19.8 -i assets/recording.mp4 -c copy media/opening.mp4

# Extract audio as 48 kHz WAV for transcription or voice reference
ffmpeg -i media/opening.mp4 -vn -acodec pcm_s16le -ar 48000 -ac 2 media/opening-voice.wav

# Extract a reference frame (e.g., at 2.5 seconds) for image-to-video or review
ffmpeg -ss 2.5 -i media/opening.mp4 -frames:v 1 media/opening-ref.png
```

Use stream copy (`-c copy`) only when keyframe-accurate cuts are acceptable; re-encode (`-c:v libx264 -pix_fmt yuv420p -c:a aac`) when you need frame-exact cuts or when normalizing variable-frame-rate (VFR) screen recordings to a constant frame rate.

## Subject Isolation and Video Matting

When a moving portrait or presenter needs a transparent background for compositing over graphics or backgrounds, run the `@hypit/volcengine-matting` capability via Canvas or `hypit execution submit`:

1. Inspect the capability schema with `hypit execution doctor @hypit/volcengine-matting` (or `hypit canvas catalog`).
2. Trim or retime the source clip *before* matting if the matting output format is heavier or if you only need a short passage.
3. Retain both the original opaque footage and the matted cutout as distinct Project Media files so the timeline can switch between full-frame and cutout layers cleanly.

Do not confuse masking with matting: a CSS `clip-path` or `<matte>` masks geometric regions of a frame, whereas `@hypit/volcengine-matting` isolates the moving foreground subject with an alpha channel.

## Timed Alignment for Spoken Media

When a spoken recording or generated voiceover drives captions or synchronized picture edits:

1. Transcribe the audio with `@hypit/whisperx` via ExecutionHost or Canvas to obtain word-level timestamps (`words.json`).
2. Align the authored script wording against the detected word timings with `hypit transcript align` ([Timed Transcripts](script-syntax.md)).
3. Use the resulting exact timestamps to drive caption components and rational `<present>` boundaries in SVML or TSX.

Keep original and processed assets explicit. Never overwrite a source file in place if downstream nodes or earlier timeline versions still depend on it.
