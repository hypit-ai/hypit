# Speech alignment

Status: current behaviour of the Script-to-recording path, 2026-08-08.

## Two observations, deliberately independent

Narratage treats the Script as the semantic truth and the generated speech as acoustic
evidence. Those are two separate observations of the same intended sentence, and the gap
between them is information worth keeping.

The WhisperX Provider therefore sends the service **audio only** — the request body accepts
`audio_path` and an optional `language`, and the service rejects any other field. The Script
is never transmitted. What comes back is an independent transcript: what the model actually
said, not what it was asked to say.

## Alignment happens twice

```text
audio ──Whisper transcription──> the transcript's own words
      ──phoneme forced alignment──> a timestamp per transcript word

Script ──many-to-many alignment──> the transcript's words
```

The first alignment happens inside the service and concerns words Narratage never authored.
The second happens in `@narratage/speech-alignment` and is what produces the SemanticMap.

Both can come up short, in different ways:

| Stage | What fails | What follows |
|---|---|---|
| Forced alignment | The phoneme model cannot place a transcript word — digits written as numerals, symbols, out-of-dictionary names, a stretch in another language | That word arrives with text and no timestamps |
| Script alignment | The transcript diverges from the Script — a swallowed word, a synonym, an added filler | The pair is classified `merge`, `split`, `replacement`, `source-omission` or `evidence-insertion` and timed from the group envelope |

Words without timestamps are ordinary, not exceptional: one numeral in a sentence is enough.
The service states the rule it follows — *missing or partial acoustic evidence stays missing,
never manufacture a tick* — and the Provider follows it too, keeping a word whose timing it
cannot prove and dropping only the clock.

## Why not align the Script directly

WhisperX can force-align a supplied transcript, which would time every Script word in one
pass and remove the second alignment entirely. Narratage does not do this, because forced
alignment cannot fail: it stretches and squeezes the supplied words until they cover the
audio. A word the speaker never said still receives a window, and a synonym is silently
accepted as the authored word.

That would erase exactly the evidence this path exists to collect. The relations above are
how a Build reports that the generated speech departed from the Script; a Provider that
guarantees a perfect fit reports nothing.

The cost is real and stated here rather than discovered: two stages, two failure modes, and
no way to attribute a first-stage failure to an authored word, because the word that failed
was the transcript's.

## What locating guarantees

`locateSpeechTiming` is total. Every token of every Segment carries a window, whether it was
measured, derived from a neighbouring character run, or interpolated by character weight
because the transcript never reached it. A Script whose speaker said something else entirely
is still fully located.

It reports rather than judges. A window that runs backwards, overlaps its neighbour or leaves
its Segment reaches the map as measured. Those are facts about the recording, and what they
mean belongs to whoever projects them onto a timeline — a Build that dies over a twenty
millisecond wobble is worse than one that renders it.

Locating fails only when the Script, the audio and the transcript are not the same three
things:

| Code | Meaning |
|---|---|
| `SPEECH_BASIS_SEGMENTS` | The audio spine's Segment count or ids differ from the Script |
| `SPEECH_SEGMENT_UNKNOWN` / `_DUPLICATE` / `_MISSING` | The transcript names a Segment the Script never declared, repeats one, or omits one |
| `SPEECH_EVIDENCE_SEGMENT_AFFINITY` | The transcript answers a different segmentation |
| `SPEECH_BASIS_DURATION` / `SPEECH_EVIDENCE_DURATION` | A duration belongs to other audio |
| `SPEECH_CHAR_WORD` | A character addresses a word that does not exist |
| `SPEECH_WORD_TEXT` | A word carries no text |
| `SPEECH_BASIS_CONTRACT` / `SPEECH_CONTRACT` | An unsupported contract identifier |
| `SPEECH_FRAME_RATE` / `SPEECH_AUDIO_DIGEST` | A frame rate or digest that cannot be used |
| `SPEECH_WINDOW` | A time that is not finite, or negative — the only numeric refusal, because no frame can be derived from it |

No timestamp shape causes a failure.

## What the map offers

`CompleteSemanticMap` is an opaque handle. No consumer reads its fields, and a repository
test keeps it that way: a consumer holding the arrays could sort, merge or clip located spans
against one another, and those are decisions about the caller's own material.

```ts
selectionFrameSpans(map, selection, programSpace)  // one span per occurrence
momentFrames(map, moment, programSpace)            // one frame per occurrence
tokenSpanSeconds(map, tokenIds)                    // the window a run of Script tokens occupies
```

Occurrences are located independently and returned in Script order — the order the markers
appear in the source. Segments may overlap in time, so Script order is not necessarily time
order, and a caller that needs time order sorts them itself. They are never sorted, merged,
clipped against one another or otherwise reconciled.

Every marker resolved its affinity to one of the Script's 2M+2N anchors while the Script was
parsed, where the surrounding structure was known. Token cuts and Segment cuts are equal
citizens there; locating is a lookup. See [`../spec/script-surface.md`](../spec/script-surface.md).
