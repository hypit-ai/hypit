# Caption Gemini and Google Vertex contract

Status: implemented vertical slice. This contract contains no credential or network authority.

## 1. Boundary recovered from the old engine

The production reference in the old `twinit` repository combined three concerns:

- request construction in `lib/engine/nodes/locate/caption-region-v2.ts`;
- model execution and JSON validation in `lib/engine/nodes/locate/correct.ts`;
- Google Vertex transport in `lib/adapters/vertex.ts`.

SVML retains only the useful model judgment: Cue boundaries and declared per-word fields. Script is
the sole wording, casing and punctuation truth. Gemini performs no correction, receives no
WhisperX transcript and returns neither text nor time.

The old deployment used `@google/genai` in Vertex mode with project, location and ADC credentials.
The new split preserves that mechanism without leaking it into author intent:

```text
@svml/caption                 display atoms, Style cascade, Plan validation, timing join, Track
@svml/caption-gemini          exact Gemini request and deterministic response lowering
@svml/provider-google-vertex credentials, generateContent transport, timeout and queue lane
```

An AI Studio API-key endpoint could implement the same exact capability later, but Runtime may not
silently change model family or planning method.

## 2. The two immutable inputs

Caption planning consumes:

1. `Narrative.captionProjection`, the whole visible left-side text;
2. a resolved `CaptionProgram`, the author's complete Style assignment and planning requirements.

Dual Text does not cross this boundary. For:

```svml
<SVML | semantic video markup language>
```

Seedance dialogue receives the right side and speech alignment measures the right side, while
Caption planning receives only the display atom `SVML`. This rule is covered by an executable test.

`CaptionProgram` first creates the visible atom universe, then assigns exactly one full Style to
every atom:

- `default` covers the entire universe, including roleless Turns;
- ordered `Use role="…"` and `Use on={selection}` applications replace the whole Style;
- later matching applications win;
- a `Use` selecting no visible atom is rejected as an author error.

Program runs are maximal contiguous atom sequences with the same Style inside one Turn and Segment.
The model never invents these runs and cannot move atoms between them. Different runs may have
different Cue and field requirements.

## 3. Model freedom is deliberately small

For each resolved run Gemini may do exactly two things:

1. return ordered Cue endpoints that partition every atom exactly once;
2. attach zero, one or more values from declared fields to individual atoms.

A field declaration contains an id, value schema, natural-language instruction and minimum/maximum
occurrences per Cue. Values currently support boolean, enum and bounded number schemas. This is more
general than a hard-coded contiguous emphasis span: `best` and `medium` may be independent,
non-contiguous, or coexist on one atom.

Conceptual request data:

```json
{
  "atoms": [
    { "id": "region:1:display:1", "text": "SVML" },
    { "id": "region:2:display:2", "text": "changes" }
  ],
  "runs": [{
    "id": "caption-program:run:1",
    "atom_ids": ["region:1:display:1", "region:2:display:2"],
    "cue_instruction": "Use complete phrases of two to five words.",
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

Conceptual model response:

```json
{
  "runs": [{
    "run_id": "caption-program:run:1",
    "cues": [{
      "after_atom_id": "region:2:display:2",
      "fields": [{
        "declaration_id": "important",
        "atom_id": "region:1:display:1",
        "value": "true"
      }]
    }]
  }]
}
```

The response schema has no text field. Missing or foreign runs, reordered or duplicated atoms,
non-final coverage, undeclared fields, foreign atom ids, invalid values and cardinality violations
all fail before the generic `CaptionPlan` becomes a Record.

## 4. Timing is an independent graph branch

Gemini planning does not wait for Seedance, media normalization or WhisperX. In parallel:

```text
Narrative + CaptionProgram ── Gemini ─────────────── CaptionPlan
generated audio ──────────── WhisperX + alignment ─ CompleteSemanticMap
CaptionPlan + CaptionProgram + Map + Narrative ─── TimedCaptionProjection
TimedCaptionProjection + Styles ────────────────── VisualTrack
```

For exact left/right correspondences, display atoms inherit measured source-token time. If one
authored display phrase maps to a different spoken phrase without word-level evidence, Caption may
derive proportional local windows inside the measured region envelope. Those windows are marked
`estimated`; they are downstream presentation facts and never written into `CompleteSemanticMap`.

## 5. Runtime registration

The author chooses Gemini and the model in `.svml`. A developer selects one concrete Vertex endpoint
in trusted Runtime configuration. Conceptually:

```ts
createGoogleVertexCaptionProvider({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
  credentialsJson: credentialRef("env", "GOOGLE_APPLICATION_CREDENTIALS_JSON"),
});
```

The selected `CredentialStore` provides JSON credentials without granting arbitrary filesystem
access. Endpoint identity covers its implementation, model support and non-secret configuration.
The Runtime Scheduler owns concurrency and retry timing; the Provider owns only one exact
submit/result transport. Secrets, queue state and network metadata do not enter `.svml`, `.svs`,
Core `BuildState` or Caption Types.
