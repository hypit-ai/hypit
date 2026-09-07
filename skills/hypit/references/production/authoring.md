# Authoring a production

Read this when turning the current Treatment into Author Sources, Recipes, Runs, project components,
and Builds, or when revising an existing production.

[Source syntax](source-syntax.md) explains imports, references and language forms.
[Composing Tracks](tracks.md) connects the visual and audio roles; [Track authoring](track-authoring.md)
and [Caption authoring](caption-authoring.md) explain creating a new project component for them.
[System relationships](system.md) connects these concepts to execution and Results;
[media preparation](media.md) explains the values entering the timeline.

## Turn the Treatment into relationships

Begin with the work the Treatment describes, not with a package inventory. Identify:

- the Script passages and speaking roles;
- the A-roll performances that give those passages semantic time, and the B-roll that supports them;
- the Caption, Typography, MG, Effect, and Audio systems that act with them;
- the semantic relations that should follow words, phrases, pauses, or content events;
- the genuinely clock-based events;
- the final Film or other deliverables.

Author those relationships explicitly. Script Selections and Moments carry meaning through produced
speech into real time. Track and Film elements arrange the resulting picture and sound. One Source
carries the whole creative program; its cuts are relationships inside that program.

When a role first leads to an installed Surface in the current work, query its actual declaration
before writing the element:

```bash
hypit vocabulary @hypit/gpt-image --tag Image
```

Use the logical Module import, tag, attributes, children, ports, and output paths that this project's
selected installation reports. Query again when the selected package or Distribution has changed, or
when an error shows that the assumed declaration is no longer the installed one; an already
established Surface does not need to be rediscovered for every edit. After writing one coherent
Source or Run change, check that actual entry:

```bash
hypit check authors/main.svml
```

`vocabulary` establishes what the selected package declares. `check` resolves the real Source closure
and verifies its imports, references, types, outputs, and Run choices. `plan` resolves the current
Run's required capabilities; `hypit doctor` actively diagnoses the selected Profile and account
reachability. Those are execution questions rather than additional authoring checks.

When observation has already produced useful authored data—such as a per-frame region sequence for
placing Caption above a moving head—keep that data in Source or Recipe and pass it through the
component's declared input. It is part of the chosen production design, just like a Frame or Style.

When the desired measurement depends on generated footage, the first Build supplies that footage.
Observe it, author the resulting data, and reuse the produced media in the next composition Build.
[Caption tracking](../playbooks/craft/caption-tracking.md) describes this loop for head placement.

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
their demanded Outputs or Candidate selections genuinely differ. Repeating one Run creates another
Build; it does not create another production.

Use [Source syntax](source-syntax.md) for language forms and [Runs](runs.md) for execution choices.
`hypit vocabulary <package>` or a focused tag or visual query supplies the installed Surface's
attributes and outputs. Package-local documentation supplies its exact behavior and API. Source
imports select author vocabulary; Runtime configuration selects external facilities.

## Use Runs for execution choices

A Target marks where this Run asks the graph to become real. For ordinary commissioned production,
the demanded Output is usually the finished video, and the Build produces its required media
dependencies through the same graph. A public image, Take, audio item, or other intermediate Output
is also a normal Target when the user requested that deliverable or the work genuinely needs it
independently now.

Every public Author Output that completes while satisfying the demanded Target is stored in that
Build Result and can be inspected or reused later. Derived public Outputs such as a SemanticTake
therefore remain available when a downstream Target caused them to complete.

The Author Graph supplies primary Candidates. A Run may explicitly select another compatible
Candidate for a Logical Output:

- `<file>` admits project media as a zero-input Candidate;
- `<build-record>` names one public Output from one earlier Build Result;
- a Run Fragment may provide one or more Candidates, including the generic image, video, and silence
  stand-ins from `@hypit/stand-in`;
- `<satisfy>` selects one declared Candidate for one Logical Output.

Candidate selection is an implementation decision for this Run. Core checks nominal Type
compatibility and plans the combined Author and Run graphs. It replaces the displaced upstream
subgraph while preserving any upstream Outputs that the selected Candidate itself consumes.

Stand-ins carry the dimensions, duration, and clock required by downstream composition.
[Runs and substitutes](runs.md#a-complete-layout-preview) provides a complete example with media
normalization and estimated semantic timing.

## Reuse produced work explicitly

For a revision or retry, continue using produced media that still serves the current intent. Preserve
the Run's unrelated Candidate selections and add explicit selections for newly completed Outputs
that the next Build should keep. Replacing one image or changing a Caption does not release every
other output back to generation. Removing a `satisfy` restores that output's primary Candidate, which
may submit a new paid request even when the Source and output name have not changed.

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
Output, then write that exact choice into the Run. Results retain public Outputs even when no file
was exported into `assets/` or `output/`; inspect them before concluding that material is missing.
A failed or cancelled Build may still contain completed public Outputs worth using. Reuse those
Outputs rather than submitting their generation again to recover a later failure. A later Build
that forwards an earlier Output does not copy its bytes.

The current Build's generated media normally continues downstream as the material for the commissioned
work. Reusing it explicitly lets Caption, MG, Effects, composition, and final encoding change without
submitting the same paid media requests again. The following examples locate the reuse boundary:

| Current change | Keep through Candidates | Recompute or request |
| --- | --- | --- |
| Caption appearance, MG, an Effect or composition changes | Existing media and SemanticTakes whose Script identities and timing still apply | The changed visual systems and render |
| Only some B-roll images must change | The existing performance, voice and all other still-useful media | The deliberately replaced images and their downstream composition |
| The presenter changes while the spoken argument still fits | Unaffected B-roll, icons, music and other media that still serve the target | The new presenter images, affected performances, their normalization and semantic timing, and downstream composition |
| A new product changes the demonstration or claims | Views and media whose content still fits the new Treatment | The affected product views, performance, Script-dependent timing and visual treatment |
| The same video needs different normalization or semantic timing | Its generated video Output, or normalized media when that still applies | The affected normalization or alignment and downstream consumers |
| New spoken wording requires a new performance | Unaffected Takes and other still-useful inputs | The changed performance and the timing derived from it |

Choose an Output upstream of the work being changed, with the same nominal Type and the intended
creative meaning. An unchanged SemanticTake can preserve both media and alignment. It is valid only
while its Narrative, Segment, token and anchor identities and timing still describe the current
Script and media. A Script edit does not automatically invalidate every Take; inspect what changed.
Do not satisfy a changed Track or final composition with its old rendered Output, which would hide
the current edit. Type compatibility alone cannot establish that an old performance or timing still fits.

After a person or product swap, review existing Candidate selections against the new target. A Run
that still selects the old presenter's Take will keep that person on screen even after the image
prompt changes. Preserve unrelated work while selecting or generating the media the adaptation needs.

For example, correcting three wrong B-roll selections means replacing those selections while keeping
the produced performance. Inspect the resulting plan: the new image requests may be intended; a new
performance request is not explained by that correction. [Builds](builds.md) covers submission and
inspection when an earlier attempt may still be running.

## Revise the fact at its owner

Before editing an existing production, establish the current facts that can affect the change. Read the
relevant parts of its Brief and Treatment and the affected Source, Recipe or Run; inspect Results and
Runtime activity when reuse or active execution matters. Read the relevant diff and preserve unrelated work.

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

`hypit check` establishes Source and graph legality. `hypit plan <run>` shows the selected graph and
external requests without submitting them. Studio opens that same Run for visual authoring.
Only `hypit build <run>` submits work and creates a fresh Build Result. None of those facts alone says
that the video is creatively successful; review the visible work as described in `review.md`.
