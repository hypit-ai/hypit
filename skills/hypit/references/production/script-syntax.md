# Timed Transcripts & Script Alignment (`script-syntax.md`)

Read this when aligning authored narration or dialogue scripts against recorded or synthesized speech to produce word-level timed transcripts (`{ language, words }`) for captions and synchronized picture edits. [Script and semantic time](../creation/script-and-time.md) owns the creative writing decisions; [Caption Authoring](caption-authoring.md) owns rendering captions from the aligned data.

## The Timed Transcript Contract (`@hypit/timed-transcript`)

Hypit represents aligned speech as a clean JSON structure (`TimedTranscript`):

```json
{
  "language": "en",
  "words": [
    { "text": "Every", "start": 0.12, "end": 0.41 },
    { "text": "frame", "start": 0.42, "end": 0.78 },
    { "text": "counts.", "start": 0.80, "end": 1.24 }
  ]
}
```

- `language` is a BCP-47 language tag (e.g., `"en"`, `"zh"`, `"ja"`, `"ko"`).
- `words` is an ordered array of spoken display tokens, each with `text`, `start` (seconds), and `end` (seconds).
- Punctuation stays attached to its word (`"counts."`). CJK text preserves natural authored phrasing or character/word boundaries without inserting artificial spaces.

## Aligning a Script with `hypit transcript align`

Raw ASR output (for example from `@hypit/whisperx`) often has minor spelling errors, missing punctuation, wrong product names, or inconsistent capitalization. Instead of editing ASR output by hand or trusting unaligned text, keep your authoritative script text and align it against the ASR word timings using `hypit transcript align`:

```bash
hypit transcript align script-transcript.json \
  --words whisperx-words.json \
  --end 14.8 \
  --to media/opening.transcript.json
```

### Arguments

| Flag | Meaning |
| --- | --- |
| `<transcript.json\|->` | Path to the authored transcript JSON (or `-` to read from stdin). |
| `--words <words.json\|->` | Path to the timed ASR words JSON (or `-` to read from stdin), e.g., exported from `@hypit/whisperx`. |
| `--start <seconds>` | Optional audio window start time in seconds (defaults to `0`). |
| `--end <seconds>` | Total audio duration / window end time in seconds (required). |
| `--to <file>` | Destination path for the aligned timed transcript JSON. |

## End-to-End Speech-to-Timeline Workflow

1. **Author the script** cleanly with final spelling, punctuation, capitalization, and terminology. When a speech model needs a phonetic hint (for example, spelling out an acronym or foreign brand name), pass the spoken variant to the TTS model (`@hypit/fishaudio-speech`, `@hypit/mimo-speech`, `@hypit/minimax-h3`) while keeping the clean display spelling in your authored transcript JSON.
2. **Transcribe the resulting audio** via `@hypit/whisperx` (`hypit execution submit` or a Canvas node) and save its word-level timing output (`words.json`).
3. **Align** with `hypit transcript align` to map your exact display words onto the WhisperX word timestamps.
4. **Consume in NLE**:
   - Pass the aligned transcript JSON into a caption component (`<present source="component">` with `<parameters>`) or load it in TSX authoring (`@hypit/nle/authoring`) to generate timed caption cues.
   - Convert key word `start`/`end` timestamps into exact rational seconds (`numerator/denominator`) to anchor B-roll cuts, callouts, and sound hits in your SVML timeline.

## Keeping Display Text and Timing Separate

- **Never rewrite your script just to match ASR mistakes.** Fix misheard terms by aligning the authored transcript against the ASR word timings.
- **Line breaks and cue grouping belong to the caption layer**, not the raw word array. Group words into readable 1–2 line cues based on phrasing, breath pauses, and target reading speed ([Caption Craft](../playbooks/craft/captions.md)).
- **Re-align after retakes or trims.** If you regenerate a voiceover or trim silence from the audio file, re-run WhisperX and `hypit transcript align` on the final audio file so timestamps stay locked to the actual waveform.
