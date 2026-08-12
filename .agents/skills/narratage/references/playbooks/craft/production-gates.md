# Production gates

Use staged Run Sources so unreviewed expensive outputs cannot silently feed later Operations.

## Gate 0: freeze author intent

- Freeze Script meaning, target language, aspect ratio, delivery duration, format, supplied assets,
  and factual claims before writing prompts.
- Give every planned shot one job: hook, context, evidence, mechanism, reaction, payoff, transition,
  or CTA. Delete shots with no distinct job.
- Confirm credentials, Runtime Profile, package locks, model limits, resolution, and permissions.
  Run `doctor`, `check`, and `plan` before the first paid Build.

## Gate 1: build and review reference images

1. Create a narrow `.svrun` containing Targets only for the generated reference-image outputs.
2. Submit that Build, then use `inspect` and `get` to retrieve every candidate image.
3. If the Agent can view images, open the actual full-resolution outputs and review every image
   itself. Do not approve from prompts, metadata, filenames, or thumbnails alone.
4. Reject and regenerate any failed image. Do not connect a failed image to Seedance, Media Track,
   image composition, or another downstream generator.
5. Reuse accepted image Records with `.svrun` `build-record` and connect them to the next Build with
   `satisfy`. Changing the Target list alone does not select those Records.

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
- Keep Seedance duration inside the declared 4–15 second range; invalid values fail validation rather
  than being silently clamped.
- Review each take before assembly: verify the first-frame identity, reference continuity, lip-sync
  when applicable, physical motion, stable props/text, intended camera/edit language, and absence of
  generated editorial overlays.
- Regenerate only failed takes. Pin accepted image/take Records explicitly in the next Build.

## Gate 3: measure and author Tracks

- Build `speech:Spine` only from accepted speech-bearing video or audio Takes, then run one
  `whisperx:Alignment` for the authored Narrative.
- Review Caption, Media, Typography, Ranking, Deck, Comment, Screen, and Audio Tracks against the
  real ProgramSpace and SemanticMap. Check timing, safe zones, occlusion, stacking, audio clarity,
  and whether each Track contributes unique information.
- Treat `check` and `plan` as structural proofs only. They do not prove visual quality, real speech
  alignment, Provider output quality, or factual correctness.

## Gate 4: delivery Build

- Demand `final.video` only after the upstream gates pass.
- Inspect the durable Build and retrieve the final Artifact with `get`.
- Watch and listen to the complete delivery, including the first and last second. Verify dialogue,
  captions, overlays, transitions, audio density, claims, and CTA as one program.
- Preserve accepted Records for deliberate future reuse; never assume a rerun will reuse them.

Use explicit Run Source authoring for every accepted reuse:

```svml
<target output="final.video"/>
<build-record id="accepted-take" build="reviewed-build-001"
  output="opening-take.video"/>
<satisfy output="opening-take.video" candidate="accepted-take"/>
```

The selected Candidate must supply the Logical Output's exact nominal Type. Core does not infer
creative equivalence or propagate a substitute-quality label downstream.
