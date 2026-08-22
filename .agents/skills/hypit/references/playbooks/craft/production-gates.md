# Production gates

Use staged Run Sources so unreviewed expensive outputs cannot silently feed later Operations.

## Gate 0: freeze author intent

- Freeze Script meaning, target language, aspect ratio, delivery duration, format, supplied assets,
  and factual claims before writing prompts.
- Give every planned shot one job: hook, context, evidence, mechanism, reaction, payoff, transition,
  or CTA. Delete shots with no distinct job.
- Confirm credentials, Runtime Profile, installed packages, model limits, resolution, and Endpoint
  prerequisites. `../../runtime.md` says how to author the Profile, and `../../vocabulary.md` how to
  find out what is installed. Run `doctor`, `check`, and `plan` before the first paid Build.

## Gate 1: build and review reference images

This gate runs once per round, not once. An image generated **from** another image — a second view of
a location derived from the one that established it — cannot be demanded until the image it derives
from has been accepted, so establishing images are one round and the views derived from them are the
next. `generated-dependencies.md` says which images derive from which.

1. Create a narrow `.svrun` containing Targets only for the generated reference-image outputs of this
   round.
2. Submit that Build, then use `inspect` and `get` to retrieve every candidate image.
3. If the Agent can view images, open the actual full-resolution outputs and review every image
   itself. Do not approve from prompts, metadata, filenames, or thumbnails alone.
4. Reject and regenerate any failed image. Do not connect a failed image to Seedance, Media Track,
   image composition, or another downstream generator.
5. Reuse accepted image Records with `.svrun` `build-record` and connect them to the next Build with
   `satisfy`. Changing the Target list alone does not select those Records. Do not transcribe the
   Build ids by hand — `hypit history --source <author.svml> --pin` emits the pairs for the newest
   accepted Record of each output, ready to paste. Every Record you fail to pin is a generation you
   pay for twice.

Pin as soon as a Build accepts something, not when you next want to build. **A Build that fails still
accepted everything upstream of the failure**, and that is exactly when pinning is skipped: the run
ended in an error, so it does not feel like a run that produced anything. It produced every picture
and every take that ran before the step that broke, and resubmitting without pinning them buys the
same bytes again. Run `--pin` against the failed Build before touching the cause.

**Pin what a Provider was paid to make, and nothing the Source computes.** `--pin` emits a line for
every accepted output, including the ones the Script's own structure produced: `speech.semantic`,
`speech.visual`, `speech.audio`, the caption plan. Those are projections of the Takes — free to
rebuild, and measured *against the Script as it was*. Paste them back after editing a Segment —
renaming one, merging two — and the Build pins a skeleton whose anchors describe a program that no
longer exists. It does not fail. Every Track times itself against those stale anchors and the
delivery is quietly wrong, which is the one failure this whole gate sequence exists to prevent.

**A `SemanticTake` is both.** Alignment is a served capability, so `<take>-semantic.take` is work
something was paid for and is worth pinning — but its tokens and anchors are keyed to the Script
Segment it aligned, so it goes stale on a Segment edit exactly as the projections above do. Pin it
while the Script is untouched; drop it for the Takes whose Segment you edited, and let those
re-align. This is the one line where "keep what was paid for" and "drop what the Script invalidated"
disagree, and the Script wins.

Keep the pictures, the takes and the voices; let everything downstream of them recompute.

**A Build that failed downstream may still hold the good draw from a model that does not repeat
itself.** The caption Planner is a language model: the same Source gives a valid plan on one run and
a plan that drops an Atom on the next. When a Build fails after the Planner accepted, that accepted
plan is the one that worked — pin it rather than resubmitting into another roll.

Apply this checklist to every image:

- identity: correct recurring person/product/location, complete face when required, no drift;
- anatomy: plausible hands, fingers, limbs, pose, gaze, and object contact;
- geometry: camera ownership, viewpoint, reflections, screen orientation, and visible objects are
  physically possible;
- reverse views: opposing camera positions show different background sectors and landmarks; the
  same or near-identical main background is an automatic failure;
- continuity: wardrobe, lighting, props, object count, handed tasks, and spatial relationships match
  the shot group;
- text: required physical labels/UI are accurate enough for the use; no invented subtitles,
  watermarks, floating words, or accidental logos;
- composition: requested framing, aspect, safe zones, and overlay clearance are present;
- quality: no broken edges, duplicated objects, severe blur, malformed texture, or generation debris.

If the Agent cannot view images, skip visual inspection and do not claim that the images passed
visual QA.

## Gate 2: generate and review video takes

- Demand only the takes whose reference images have passed Gate 1.
- **Before demanding any take with `generate-audio="true"`, trace its prompt back to the words it is
  supposed to say.** Follow the edge from the take's `prompt=` to the `copy:Render` that produced it,
  and confirm one of its `copy:Set` slots carries that Segment's `dialogue`. A prompt bound straight
  to a `copy:Value` holding a performance direction is the defect this catches: the model receives no
  words, invents its own, and the take sounds fluent and says nothing from the Script.

  It survives every structural check. `hypit check`, `preview-check` and `plan` all pass, because the
  graph is legal and complete — the prompt is a Text and the take consumes it. `whisperx:SemanticTake`
  then fits the Segment's words onto whatever audio arrived rather than reporting that they differ, so
  the Caption Track renders the Script over speech that shares none of it, and every downstream
  measurement stays clean.

  Two minutes of reading the Source here is the difference between finding it now and finding it in a
  delivery whose every take has been paid for. `seedance-directing.md` and `../../seedance-kits.md`
  name the slot the words travel through.
- Keep Seedance duration inside the selected model's declared range, read from that model rather than
  from memory: the models differ and one accepts far longer takes. Invalid values fail validation rather
  than being silently clamped.
- Review each take before assembly: verify the first-frame identity, reference continuity, lip-sync
  when applicable, physical motion, stable props/text, intended camera/edit language, and absence of
  generated editorial overlays.
- Regenerate only failed takes. Pin accepted image/take Records explicitly in the next Build.

## Gate 3: measure and author Tracks

- Normalize every accepted speech-bearing video or audio Take, create its Segment-local
  `whisperx:SemanticTake`, then assemble those Takes with `speech:Track`.
- Recompute the affected SemanticTake whenever its speech audio changes. Every Track timed against it — Caption,
  Media, Typography, Ranking, Deck, Comment, Screen, Audio — is measured against audio that no longer
  exists otherwise, and the drift is invisible in a still frame. A Style-only change does not prove a
  prior review still holds.
- Review Caption, Media, Typography, Ranking, Deck, Comment, Screen, and Audio Tracks against the
  real SemanticTrack. Check timing, safe zones, occlusion, stacking, audio clarity,
  and whether each Track contributes unique information.
- Treat `check` and `plan` as structural proofs only. They do not prove visual quality, real speech
  alignment, Provider output quality, or factual correctness.
- A reconstruction route may have compared these Tracks against a reference before this gate. That
  comparison runs on renders made from the Source's values with no SemanticTrack behind them, so it
  settles how a Track looks and leaves everything this gate is about — timing against real speech,
  drift after a recompute, occlusion between Tracks that were rendered separately — still to be
  measured here. Review them against the real SemanticTrack whatever was compared earlier.

## Gate 4: delivery Build

- Demand `final.video` only after the upstream gates pass.
- Inspect the durable Build and retrieve the final Artifact with `get`.
- Watch and listen to the complete delivery, including the first and last second. Verify dialogue,
  captions, overlays, transitions, audio density, claims, and CTA as one program.
- **Measure the delivery's own speech against the Script.** An agent reads pictures and cannot hear,
  so "listen and verify dialogue" above resolves to nothing on its own, and a take whose spoken words
  came from somewhere other than the Script passes `check`, `plan`, `preview-check` and both
  measurements below without a mark. Transcribe what was delivered and read it against the words the
  Script holds:

  ```bash
  hypit-reference-video-tools prepare_reference --video-path output/final.mp4 --observer agent
  ```

  Its `transcript` is measured locally by WhisperX from the delivery's own audio, so it is what the
  video says rather than what the Source intended. Compare it line by line with the Script's
  Segments. They correspond, or a take was generated from a prompt that did not carry its dialogue —
  read `seedance-directing.md` and the Kit contract in `../../seedance-kits.md`, which name the slot
  the words travel through.

  The symptom this catches is total rather than subtle: the captions render the Script while the
  voice says unrelated sentences, and alignment hides it by fitting the Script's words onto whatever
  audio arrived. Run it before reporting any delivery that contains speech.
- Measure the delivery for empty picture before reporting it as finished. Watching finds a scene that
  is wrong; it slides straight past a second of black between two shots, and a program assembled from
  Selections can hold several. `ffmpeg -i final.mp4 -vf blackdetect=d=0.2:pic_th=0.90 -an -f null -`
  prints every stretch with its start and duration, and any hit is a hole in the picture rather than
  an edit — read `generated-dependencies.md` on covering a Segment. Report the delivery only after
  this comes back empty.
- Measure the delivery for anything that flashes, which black detection does not catch once something
  is bedded underneath. A cut list makes it objective: any state that lives for a fraction of a second
  between two cuts is a hole showing the layer below, not an edit.

  ```bash
  ffmpeg -v error -i final.mp4 -vf "select='gt(scene,0.20)',metadata=print:file=-" -an -f null - \
    | grep -oE 'pts_time:[0-9.]+' | sed 's/pts_time://' \
    | awk '{if(p!=""&&$1-p<0.7)printf "%.2fs on screen at %.2fs\n",$1-p,p; p=$1}'
  ```

  Two cuts a quarter of a second apart is a picture nobody authored. Read it against
  `generated-dependencies.md` on windows that do not tile.
- Preserve accepted Records for deliberate future reuse; never assume a rerun will reuse them.
- The delivery is accepted, so ask the last question: did this job produce a project-local package,
  and should it outlive this one video? `../../local-author-package.md` says how to judge that and
  what promoting it costs.

Use explicit Run Source authoring for every accepted reuse:

```svml
<target output="final.video"/>
<build-record id="accepted-take" build="reviewed-build-001"
  output="opening-take.video"/>
<satisfy output="opening-take.video" candidate="accepted-take"/>
```

The selected Candidate must supply the Logical Output's exact nominal Type. Core does not infer
creative equivalence or propagate a substitute-quality label downstream.
