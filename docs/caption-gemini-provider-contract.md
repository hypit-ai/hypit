# Caption Gemini and Google Vertex contract

Status: implemented vertical slice. This contract contains no credential or network authority.

## 1. Responsibility split

The old engine mixed prompt construction, model judgment, response parsing and Vertex transport.
Narratage keeps only the useful model judgment: Cue boundaries and declared per-word fields. Script
is the sole wording, casing and punctuation truth. Gemini performs no correction, receives no
WhisperX transcript and returns neither text nor time.

```text
@narratage/script                 ordered display words and Selection word subsets
@narratage/caption                total Style assignment, Plan validation and timing join
@narratage/caption-fine           one concrete Style family and visual renderer
@narratage/caption-gemini         exact Gemini request and deterministic response lowering
@narratage/provider-google-vertex credentials, generateContent transport, timeout and queue lane
```

An AI Studio endpoint could implement the same exact capability later, but Runtime may not silently
change model family or planning method.

## 2. Immutable inputs

Caption planning consumes:

1. Script's complete ordered `CaptionWordSequence`;
2. a resolved `CaptionProgram`, containing total Style assignment and planning requirements.

For `<SVML | semantic video markup language>`, Seedance and alignment use the right side. Caption
planning sees one display word, `SVML`, from the left side. The Program's explicit default covers
the complete word universe. Ordered Role or `CaptionWordSubset` applications replace one whole
Style, with the last match winning. Gemini never selects Styles or moves words between resolved
runs.

## 3. Model freedom

For each resolved run Gemini may do exactly two things:

1. return ordered Cue endpoints that partition every word exactly once;
2. attach zero, one or more values from declared fields to individual words.

A field declaration contains an id, value schema, instruction and per-Cue cardinality. Values
support boolean, enum and bounded-number schemas. Fields are independent and need not be contiguous.

Conceptual request data:

```json
{
  "words": [
    { "id": "caption-word:1", "text": "SVML" },
    { "id": "caption-word:2", "text": "changes" }
  ],
  "runs": [{
    "id": "caption-program:run:1",
    "word_ids": ["caption-word:1", "caption-word:2"],
    "cue": {
      "minimum_words": 1,
      "maximum_words": 5,
      "instruction": "Use complete semantic phrases."
    },
    "fields": [{
      "id": "important",
      "type": "boolean",
      "minimum_per_cue": 0,
      "maximum_per_cue": 2,
      "instruction": "Select words whose emphasis best communicates this Cue."
    }]
  }]
}
```

Conceptual response:

```json
{
  "runs": [{
    "run_id": "caption-program:run:1",
    "cues": [{
      "after_word_id": "caption-word:2",
      "fields": [{
        "declaration_id": "important",
        "word_id": "caption-word:1",
        "value": "true"
      }]
    }]
  }]
}
```

The response schema has no text field. Missing or foreign runs, reordered or duplicated words,
incomplete coverage, Cue word-count violations, undeclared fields, foreign word ids, invalid values
and cardinality violations all fail before `CaptionPlan` enters the graph.

## 4. Timing is another graph branch

Gemini planning does not wait for generation, media normalization or WhisperX:

```text
CaptionWordSequence + CaptionProgram ── Gemini ───────── CaptionPlan
generated audio ─────────────────────── WhisperX ─────── CompleteSemanticMap
Plan + Program + Words + Map + Narrative ───────────── TimedCaptionProjection
TimedCaptionProjection + Words + Program ─ Style renderer ─ VisualTrack
```

Display words inherit time only through Script's explicit display/speech correspondence. If one
display word aliases several spoken words, Caption may derive a presentation window inside the
measured region envelope. It never writes that estimate into the global semantic map.

## 5. Runtime registration

The author chooses Gemini and its model in `.svml`. Trusted Runtime configuration selects one exact
Vertex Endpoint. The selected `CredentialStore` supplies credentials without granting arbitrary
filesystem access. Endpoint identity covers implementation, model support and non-secret config.
The Scheduler owns concurrency; the Provider owns transport. Secrets, queue state and network
metadata do not enter `.svml`, `.svs`, Core `BuildState` or Caption values.
