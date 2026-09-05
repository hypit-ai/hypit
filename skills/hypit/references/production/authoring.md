# Authoring a production

Read this when turning the current Treatment into Author Sources, Recipes, Runs, project components,
and Builds, or when revising an existing production.

## Turn the Treatment into relationships

Begin with the work the Treatment describes, not with a package inventory. Identify:

- the Script passages and speaking roles;
- the A-roll and B-roll Takes that carry those passages;
- the Caption, Typography, MG, Effect, and Audio systems that act with them;
- the semantic relations that should follow words, phrases, pauses, or content events;
- the genuinely clock-based events;
- the final Film or other deliverables.

Author those relationships explicitly. Script Selections and Moments carry meaning through produced
speech into real time. Track and Film elements arrange the resulting picture and sound. One Source
carries the whole creative program; its cuts are relationships inside that program.

When observation has already produced useful authored data—such as a per-frame region sequence for
placing Caption above a moving head—keep that data in Source or Recipe and pass it through the
component's declared input. It is part of the chosen production design, just like a Frame or Style.

## Give each production surface one job

- An **Author Source** (`.svml`) owns the target Script, media requests, components, Tracks, Film, and
  public Outputs. It imports the vocabulary it uses and may import other Author or Recipe Sources.
- A **Recipe Source** (`.svs`) owns reusable authored values such as a visual Style or request
  configuration. It remains explicit input to the Source that uses it.
- A **Run Source** (`.svrun`) binds one Author entry, names the public Outputs this execution requires,
  and selects any file, earlier Result, or Fragment Candidates used for it.
- A project **Author Package** under `packages/` owns a visual or semantic role that deserves its own
  vocabulary and implementation.

A project may have several of each. Different Runs against the same Author Source are useful when
their demanded Outputs or Candidate selections genuinely differ, not because production is divided
into mandatory approval stages. Repeating one Run creates another Build; it does not create another
production.

Read the selected Distribution documentation and the owning package README for exact grammar. Use
`hypit vocabulary <package>` or a focused tag or visual query to inspect the public Surfaces before
writing them. Source imports select author vocabulary; they grant no Runtime or credential authority.

## Use Runs for execution choices

A Target marks where this Run asks the graph to become real. For ordinary commissioned production,
the demanded Output is usually the finished video and the Build can produce the media dependencies
on its route without image-by-image or Take-by-Take approval. A public image, Take, audio item, or
other intermediate Output is also a normal Target when the user requested that deliverable or the
work genuinely needs it independently now.

Every public Author Output that completes on the demanded route is stored in that Build Result and
can be inspected or reused later. Derived public Outputs such as a SemanticTake therefore remain
available when a downstream Target caused them to complete, without becoming separate production
checkpoints.

The Author Graph supplies primary Candidates. A Run may explicitly select another compatible
Candidate for a Logical Output:

- `<file>` admits project media as a zero-input Candidate;
- `<build-record>` names one public Output from one earlier Build Result;
- a Run Fragment may provide one or more Candidates, including the generic image, video, and silence
  stand-ins from `@hypit/stand-in`;
- `<satisfy>` selects one declared Candidate for one Logical Output.

Candidate selection is an implementation decision for this Run. Core checks nominal Type
compatibility and plans the combined Author and Run graphs. It replaces the displaced upstream route
while preserving any upstream Outputs that the selected Candidate itself consumes.

Stand-ins carry the dimensions, duration, and clock required by downstream composition. The Run
chooses them in the same way as every other Candidate.

## Reuse produced work explicitly

The exact address of an earlier public Output is its Build id plus Output name:

```svml
<build-record id="opening-take"
  build="bld_20260902T110000001Z_0000000001" output="opening-take.video"/>
<satisfy output="opening-take.video" candidate="opening-take"/>
```

If the current Logical Output was renamed, the two names may differ: `build-record output` remains
the old Result's public name, while `satisfy output` names the current graph position. Hypit does not
infer that two names carry the same creative meaning.

Use `hypit builds`, `hypit inspect <build-id>`, and `hypit history <output-name>` to find a produced
Output, then write that exact choice into the Run. A failed Build may still contain completed public
Outputs worth using. A later Build that forwards an earlier Output does not copy its bytes.

The current Build's generated media normally continues downstream as the material for the commissioned
work. Reusing it explicitly lets Caption, MG, Effects, composition, and final encoding change without
submitting the same paid media requests again. A SemanticTake remains meaningful only for the Script
Segment and produced speech it aligns; changed wording needs timing from the changed speech.

## Revise the fact at its owner

Before editing an existing production, read its Brief, Treatment, Source, Recipes, Run, current
Results, and relevant diff. Preserve unrelated work.

- Revise Treatment when the creative design changed.
- Revise Script when words, Cue breaks, Selections, or Moments changed.
- Revise Source or Recipe when composition, parameters, or authored timing relations changed.
- Revise the Run when the demanded deliverable or selected Candidate changed.
- Revise a project package when its reusable visual role or rendering behavior is wrong.
- Revise a media request when the desired shot or the user's requested media has changed.

Generated Result bytes are evidence and reusable inputs, not editable Source. A change that still
uses existing media should keep selecting it. A change that intentionally requests new paid media
should first make the additional request visible in `hypit plan` and then follow the user's spending
authority.

## Use each view for what it can establish

`hypit check` establishes Source and graph legality. `hypit plan <run>` shows the selected target
route and external requests without submitting them. Studio opens that same Run for visual authoring.
Only `hypit build <run>` submits work and creates a fresh Build Result. None of those facts alone says
that the video is creatively successful; review the visible work as described in `review.md`.
