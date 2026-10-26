# Complex spoken explainer

A complete Chinese explainer combining 17 accepted performances, website demonstrations and eight
project-owned animated scenes. Its 137-second Timeline includes an opening montage without speech,
full-frame and circular presenter views, a half-frame handoff, covered narration, and a silent ending.

The source is an editable production, not a general-purpose explainer template. It demonstrates how
to give each visual relationship an owner while exposing only the parameters the author actually needs.

[Watch the finished film](https://storage.googleapis.com/hypit-public-assets/assets/examples/complex-explainer/v1/20260914/final.mp4)
(137 seconds, approximately 42 MiB), or
[download the complete media archive](https://storage.googleapis.com/hypit-public-assets/assets/examples/complex-explainer/v1/20260914/media.tar.gz)
(approximately 455 MiB) to open the editable production below.

## Open the production

Use the Hypit checkout accompanying this example. The example has been validated against that
checkout; it does not claim compatibility with an older published Distribution. Install the
project-local packages from this directory:

```sh
npm ci --ignore-scripts
```

The code is stored in Git. Images, recordings, accepted Result resources and a finished video are
supplied separately in the media archive. Download and extract the archive **at this directory**:

```sh
mkdir -p .hypit
curl --fail --location 'https://storage.googleapis.com/hypit-public-assets/assets/examples/complex-explainer/v1/20260914/media.tar.gz' --output .hypit/media.tar.gz
tar -xzf .hypit/media.tar.gz
```

The archive contains source assets, one portable Result with 50 accepted Outputs and their resource
files, and the finished film. It preserves the resource bindings inside composite values. It contains
accepted material rather than generation history; private review notes, credentials and the original
reference creator's footage are excluded. Media is hosted on Google Cloud Storage and stays outside Git.
After extraction, `.hypit/media.tar.gz` can be removed to reclaim the archive's download space.

```sh
cd productions/explainer
hypit check runs/render.svrun
hypit plan runs/render.svrun --runtime ../../hypit.runtime.json
hypit studio --run runs/render.svrun --runtime ../../hypit.runtime.json
```

Open the printed **Comments** URL (`#comments`) to review the composition before export and leave
timestamped direction on the current picture. In the same session, switch to **Studio** to explore
the timeline and adjust exposed parameters. Browser review does not render a video file. Notes save to
this workspace's `FEEDBACK.json`; the Agent can read and resolve them while editing the owning Source
or scene code. Existing private review conversations are not included. The Inspector remains useful
for the selected Caption, Style and event choices without exposing every internal scene dimension.

The default Run explicitly selects 50 accepted Outputs from the bundled Result. Its remaining plan
contains only local visual rendering, audio mixing and muxing. The included Profile has no generation
account, credential store or transcription service. Material has already been prepared and given
its semantic timing; opening this example does not generate or transcribe it again.

Submit `runs/render.svrun` to render the complete film. `runs/export-parts.svrun` instead renders five
consecutive ranges for limited temporary disk space. Its local Profile requests eight rendering
workers and one render request at a time. The [production guide](productions/explainer/README.md)
explains joining exported parts. The archive also includes `productions/explainer/output/final.mp4`.

## Read the work by responsibility

| Question | Owner |
| --- | --- |
| What is said, and which words motivate a change? | [Script](productions/explainer/authors/script.svml) |
| Which raw resources, clock and canvas are used? | [Assets](productions/explainer/authors/assets.svml) |
| What directed the accepted performance? | [Direction](productions/explainer/authors/direction.svml), [performance Recipe](productions/explainer/recipes/performance.svs) |
| How are media occurrences, Uses, events and contributions assembled? | [Main Source](productions/explainer/authors/main.svml) |
| How does the Caption look? | [Composition Recipe](productions/explainer/recipes/composition.svs) |
| How does each coordinated scene behave? | [Web scenes](packages/web-scenes/README.md) |
| How do the presenter and opening graphics move? | [Opening system](packages/opening-system/README.md) |
| How are cue boundaries and one-line captions handled? | [Caption package](packages/single-line-captions/README.md) |
| Where does the shared palette live without becoming another Track? | [Visual language](packages/visual-language/README.md) |
| Which existing material should a new Build use? | [Render Run](productions/explainer/runs/render.svrun) |

Generated and prepared-media Outputs remain in the entry Source where the Run can satisfy them explicitly.
Changing a Cue boundary or graphic event does not require replacing the performance. A rewrite of the
spoken words is different: supply new performance media with timing for that Script and select it in the Run.
The retained generation declarations show the original direction but are not invoked by the default
Run. Configure an explicitly chosen Model/Provider path before requesting new material.

## What this example teaches

A coordinated editor scene can own its folder, pointer, preview and timeline without publishing a
control for every dimension. The presenter, Caption and countdown change for different reasons and
remain independent. Shared palette and typing helpers are ordinary code dependencies, not extra
Tracks. The scene's state is computed from frame time, making direct seeking and range rendering
possible. Script Moments locate spoken changes; authored durations shape how those changes unfold.

Read the [Treatment](productions/explainer/TREATMENT.md) and
[craft notes](productions/explainer/CRAFT-NOTES.md) for the practical reasoning: recovering behavior
beyond a list of objects, the style change, scene boundaries, semantic events, framing and review.
The [presenter-led visual explainer playbook](https://github.com/hypit-ai/hypit/blob/main/skills/hypit/references/playbooks/formats/presenter-led-explainer.md)
draws out the whole-work relationship for other productions. Components use public
Author Package and Companion interfaces; Studio and Core contain no dispatch for this example.

## Materials and editorial copy

The host image and voice are AI-generated. The competitor-case demonstrations were made by the
project owner. The phone's drinking callback uses a newly generated fictional illustration, not the
reference creator's footage. Website captures and product marks retain their sources; the diagrams,
repeated marks and token counters are authored illustrations rather than measured product tests.
See [asset provenance](productions/explainer/ASSET-PROVENANCE.md).

This is the owner's authored explainer, including its comparisons and rhetorical claims. The
reusable lesson is how the production is expressed, not a benchmark of other products.
