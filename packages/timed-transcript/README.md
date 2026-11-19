# @hypit/timed-transcript

Validates and serializes `{ language, words }`. Each entry in the ordered `words` list has `word` text and
may include a paired `start` and `end` in source-local seconds. Words without a measured range retain their
text. The same document format serves transcription results and explicitly edited transcripts.

## Align an authored script

`alignTranscript({ transcript, words, window })` aligns the authored word list to the transcript and
returns a corrected transcript plus one timing source per authored word. The caller supplies the
segmentation and the audio window in the same seconds as the input. Every authored word keeps its
text and receives a positive interval inside the window. Matching is monotone and allows split,
merged, inserted, omitted and substituted words.

`matched` takes a single recognized interval, `distributed` assigns time from a group of matched
words, and `estimated` fills gaps or repairs inconsistent timing. With no timed evidence, the
operation distributes words across the supplied window. Timing sources describe the assignment
and stay in the return value. The corrected document uses the same `{ language, words }` format.

For the CLI, save the authored words as a JSON string array such as `["can", "not", "wait."]`.

```sh
hypit transcript align raw.transcript.json --words authored.json --end 12.5 --to aligned.transcript.json
```

The window starts at zero by default. Use `--start` for excerpts with a nonzero start, and pass
the transcript for that window. Use `--json` to get the timing sources with the output path.
For long recordings, align corresponding takes or excerpts. Fuzzy matching uses a bounded matrix.
