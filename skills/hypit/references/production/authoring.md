# Authoring a production

Read this when turning the current Treatment into Author Sources, Recipes, Invocations, project components,
and Builds, or when revising an existing production.

[Script and semantic time](../creation/script-and-time.md) explains target wording, Segments, Roles,
Caption Cue decisions and semantic relationships. [Script syntax](script-syntax.md) gives their exact
forms; [Timing](timing.md) projects them into components. [Source syntax](source-syntax.md) explains
imports and references.
[Composing Tracks](tracks.md) connects the visual and audio roles; [Track authoring](track-authoring.md)
and [Caption authoring](caption-authoring.md) explain creating a new project component for them.
[Component design](component-design.md) explains shaping its behavior and controls around the work.
[System relationships](system.md) connects these concepts to execution and Results;
[media preparation](media.md) explains material inputs. [Production navigation](index.md) locates
specialized questions without requiring every page for every revision.

## Turn the Treatment into relationships

Begin with the work the Treatment describes, not with a package inventory. Identify:

- the meaningful, performable Script passages and any speaking roles;
- the performances placed on Timeline and the independent material supplied to other components;
- the picture and sound contributions the work needs, including a simple full-frame performance;
- the semantic relations that should follow words, phrases, pauses, or content events;
- the genuinely clock-based events;
- the final Film or other deliverables.

Bring the relevant directing knowledge into those decisions: use
[Script and semantic time](../creation/script-and-time.md) for the verbal structure and the meanings
other layers will follow,
[image direction](../playbooks/craft/image-direction.md) for generated camera images,
[video direction](../playbooks/craft/video-direction.md) for generated performance and action,
[voice direction](../playbooks/craft/voice-direction.md) for casting and directing a character's voice,
[voice and performance](../playbooks/craft/voice-and-performance.md) for A-roll and recurring voices,
[B-roll](../playbooks/craft/b-roll.md) for coverage,
[screen demonstrations](../playbooks/craft/screen-demonstrations.md) when an interface carries evidence or explanation,
[Caption](../playbooks/craft/captions.md) for speech-linked text, and
[graphic composition](../playbooks/craft/graphic-compositions.md) for designed visual hierarchy,
with [motion graphics](../playbooks/craft/motion-graphics.md) for changes within it.
These pages establish what the authored relationship should accomplish. Installed vocabulary then
supplies the exact language for expressing it.

For a performance-led work, including pure A-roll or short drama, keep the intended passages in
Script and let accepted media establish their actual extent. Add semantic preparation when Caption,
sound or visual relationships need positions inside that performance. A standalone asset edit can
instead end at its requested media Output.

Author those relationships explicitly. Script Selections and Moments carry meaning through placed
performances into real time; authored positions locate independently timed events on the same Timeline.
Track and Film elements arrange the resulting picture and sound. One Author entry connects the
work; imported Sources and project modules divide its meaningful responsibilities. A camera cut
is not by itself a reason for another Source, Segment, component or Build.

When a role first leads to an installed declaration in the current work, query its actual declaration
before writing the element:

```bash
hypit vocabulary @hypit/gpt-image --tag Image
```

Use the logical Module import, tag, attributes, children, ports, and output paths that this project's
selected installation reports. Query again when the selected package or Distribution has changed, or
when an error shows that the assumed declaration is no longer the installed one; an already
established declaration does not need to be rediscovered for every edit. After writing one coherent
Source or saved Invocation change, check that actual entry:

```bash
hypit check authors/main.svml
```

`vocabulary` establishes what the selected package declares. `check` resolves the real Source closure
and verifies its imports, references, types, outputs, and Invocation choices. `plan` resolves the current
Invocation's required capabilities; `hypit doctor` actively diagnoses the selected Profile and account
reachability. Those are execution questions rather than additional authoring checks.

When observation has already produced useful authored data—such as a per-frame region sequence for
placing Caption above a moving head—keep that data in Source or Recipe and pass it through the
component's declared input. It is part of the chosen production design, just like a Frame or Style.

When the desired measurement depends on generated footage, the first Build supplies that footage.
Observe it, author the resulting data, and reuse the produced media in the next composition Build.
[Caption tracking](../playbooks/craft/caption-tracking.md) describes this loop for head placement.

## Give each production source one job

- An **Author Source** (`.svml`) owns the target Script, media requests, components, Tracks, Film, and
  public Outputs. It imports the vocabulary it uses and may import other Author or Recipe Sources.
- A **Recipe Source** (`.svs`) owns reusable authored values such as a visual Style or request
  configuration. It remains explicit input to the Source that uses it.
- An **Invocation Source** (`.svrun`) optionally saves one Author entry, the public Outputs this execution
  requires, and any transient override for this invocation.
- A project **Author Package** under `packages/` owns a visual or semantic role that deserves its own
  vocabulary and implementation.

A project may have several of each. Different Invocations against the same Author Source are useful when
their demanded Outputs or transient choices genuinely differ. Repeating one Invocation creates another
Build; it does not create another production.

Use [Source syntax](source-syntax.md) for language forms and [Invocations](runs.md) for execution choices.
`hypit vocabulary <package>` or a focused tag or visual query supplies the installed declaration's
attributes and outputs. Package-local documentation supplies its exact behavior and API. Source
imports select author vocabulary; Runtime configuration selects external facilities.

## Use Invocations for execution choices

A Target marks where this Invocation asks the graph to become real. For ordinary commissioned production,
the demanded Output is usually the finished video, and the Build produces its required media
dependencies through the same graph. A public image, prepared video, audio item, or other intermediate Output
is also a normal Target when the user requested that deliverable or the work genuinely needs it
independently now.

Every public Author Output that completes while satisfying the demanded Target is stored in that
Build Result and can be inspected or exported later. Project files and durable realization choices
belong in the Author Source. An Invocation can temporarily select the AuthorGraph primary or another existing
authored Record through `<override>`, without changing the production.

[Invocations](runs.md#generate-material-while-composing) shows how to target prepared material while
component work continues, then reuse that material for focused rendering and delivery.

## Reuse produced work explicitly

For a revision or retry, continue using produced media that still serves the current intent. Inspect
the Result, export the chosen file into the project, declare it with the package that owns its meaning,
and connect that Record to the generated role with `realization:Select`. The durable choice now lives
beside the rest of the authored production:

```svml
<import as="asset" from="@hypit/media@1"/>
<import as="realization" from="@hypit/realization@1"/>

<asset:Video id="accepted-opening" src="./assets/opening.mp4"/>
<realization:Select output={opening-generation.video} record={accepted-opening}/>
```

Replacing a Caption or graphic does not release that selected performance back to generation. To
request another take for one Build, use an explicit Invocation override to the Author primary; the
accepted selection remains unchanged until the Author Source is deliberately edited.

Keep evidence at its own owner. Project-owned Speech Transcript evidence can be inspected and edited
without changing the media file. Alignment remains valid only while its Narrative, Segment, token,
domain and timing facts still describe the current Script and performance. Moving a marker to another
existing token can retain the evidence; changing spoken text or the performance requires fresh evidence
and alignment judgment.

Use `hypit builds`, `hypit inspect <build-id>`, `hypit history <output-name>` and `hypit get` to find
and export useful Outputs. A failed or cancelled Build may still contain a completed media file worth
using. Result identity stays in execution history; the authored production references the project file.

For example, correcting three B-roll choices should keep the accepted performance declarations and
change only those image records and downstream composition. Inspect the resulting plan: new image
requests may be intended, while a new performance request needs a separate production reason.

## Revise the fact at its owner

Before editing an existing production, establish the current facts that can affect the change. Read the
relevant parts of its Brief and Treatment and the affected Source, Recipe or Invocation Source; inspect Results and
Runtime activity when reuse or active execution matters. Read the relevant diff and preserve unrelated work.

- Revise Treatment when the creative design changed.
- Revise Script when words, Cue membership, Selections, or Moments changed.
- Revise Source or Recipe when composition, parameters, or authored timing relations changed.
- Revise the saved Invocation only when its demanded deliverable or transient execution override changed.
- Revise a project package when its fixed or reusable behavior needs to change; an unexposed local
  design detail can be edited there without creating a new parameter.
- Revise a media request when the desired shot or the user's requested media has changed.

Generated Result bytes are evidence and potential project inputs, not editable Source. A change that
still uses existing media should retain its project asset declaration and realization selection. A
change that intentionally requests new paid media should first make the additional request visible in
`hypit plan` and then follow the user's spending authority.

## Use each view for what it can establish

`hypit check` establishes Source and graph legality. `hypit plan <source> --target <output>` shows the
selected graph and external requests without submitting them; a saved Invocation Source can be passed
instead when that execution intent needs a durable name. Studio opens the same Author Source and
Invocation for visual authoring. Only `hypit build` submits work and creates a fresh Build Result. None
of those facts alone says that the video is creatively successful; review the visible work as described
in `review.md`.
