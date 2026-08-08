# `@narratage/caption-gemini`

Exact Gemini Caption planning, without wording, Style-selection or timing authority.

```xml
<caption-ai:Planner
  id="caption-plan"
  display={story.caption}
  program={caption-program}
  model="gemini-2.5-flash"
/>
```

Gemini receives one `atoms: string[][]` value per resolved Style run. The outer array is the
ordered Cue-cut universe; each inner array is one indivisible display Atom; its strings are
immutable display Words with authored punctuation. The pronunciation side of Dual Text, WhisperX,
timestamps and internal ids never enter the prompt.

A response may consume consecutive Atoms with `atom_count` and assign declared fields using
one-based `atom_number` plus `word_number` inside the Cue. The package restores stable ids and
rejects rewrites, incomplete coverage, invalid coordinates, fields or values before producing a
`CaptionPlan`.

Model choice is author-visible. A Runtime separately binds the exact capability to Google Vertex
or another explicitly configured Endpoint; credentials, queue and transport remain outside SVML.
