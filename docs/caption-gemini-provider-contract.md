# Caption Gemini and Google Vertex contract

Status: implemented vertical slice. This contract contains no credential or network authority.

## Responsibility split

```text
@narratage/script                 display Atoms/Words and Atom-to-speech correspondence
@narratage/caption                total Style assignment, Plan validation and whole-Atom timing
@narratage/caption-fine           one field-free Style family and VisualTrack renderer
@narratage/caption-gemini         Gemini request construction and response lowering
@narratage/provider-google-vertex credentials, generateContent transport and queue lane
```

Script remains the only wording, casing and punctuation truth. Gemini performs no correction,
receives no WhisperX transcript and returns neither text nor time.

## Immutable input

The planner consumes one `CaptionDisplaySequence` and one resolved `CaptionProgram`. For Dual Text
such as `<SVML | semantic video markup language>`, it sees only `SVML`. For
`<New York City | something>`, it sees one indivisible Atom containing three field-addressable
Words. It cannot cut between them.

The request deliberately sends readable text once:

```json
{
  "runs": [{
    "atoms": [
      ["new"],
      ["york"],
      ["city", "is", "beautiful"]
    ],
    "cue_words": { "minimum": 1, "maximum": 5 },
    "cue_instruction": "Use complete semantic phrases."
  }]
}
```

There is no redundant `text` or `words` payload. Punctuation is part of each immutable string, so
`45%`, `back-and-forth`, `damn!` and `300,000` survive unchanged.

## Model freedom

For each already-resolved Style run, Gemini may only:

1. consume consecutive whole Atoms into Cues with `atom_count`;
2. assign declared fields to a Word with one-based `atom_number` and `word_number` inside the Cue.

Conceptual field-bearing response:

```json
{
  "runs": [{
    "cues": [{
      "atom_count": 3,
      "fields": [{
        "declaration_id": "emphasis",
        "atom_number": 3,
        "word_number": 2,
        "value": "true"
      }]
    }]
  }]
}
```

A field-free Style returns `fields: []`. Cue bounds are preferences: one authored Atom may exceed
the preferred maximum, but Gemini still cannot split it. The response schema contains no text,
pronunciation, timestamp, Style or Provider choice. The package restores stable Atom/Word ids and
rejects incomplete coverage, invalid coordinates, undeclared fields, invalid values and cardinality
violations.

## Independent timing branch

```text
Display + Program ───────────────────────── Gemini ─── CaptionPlan
generated audio ───────── WhisperX + locator ───────── CompleteSemanticMap
Display + Correspondence + Program + Plan + Map ───── TimedCaptionProjection
TimedCaptionProjection + Display + Program ────────── VisualTrack
```

`CaptionCorrespondence` binds each whole display Atom to explicit authored speech tokens. Timing
resolves that range through the measured map. Multiword Dual Text therefore receives one exact
Atom envelope and no invented internal Word timestamps.

## Runtime registration

The author chooses Gemini and its model in SVML. Trusted Runtime configuration binds that exact
capability to a Vertex Endpoint. The Scheduler owns concurrency; the Provider owns transport and
credential slots. Secrets, network metadata and queue state never enter SVML, SVS, Caption values
or Core BuildState.
