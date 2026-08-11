# B-roll craft

B-roll is authored visual evidence, context, or emotional progression outside the primary speaking
take. Every insert must earn its place in the story and remain independent from editorial text and
program audio.

## Choose the story beats first

- Write the shot list before writing prompts. Give every shot one clear job: establish context, show
  a problem, demonstrate failed effort, reveal a mechanism, provide proof, or deliver a payoff.
- A useful product arc is **problem → failed effort → mechanism/product → payoff**, but the number of
  beats follows the actual story rather than a fixed template.
- Adjacent shots must contribute different information. Change the location, camera relationship,
  action, prop relationship, evidence, or emotional state; a cosmetic crop is not a new shot.
- Decide whether each beat needs generated motion, a supplied image, a supplied video, or an authored
  graphic before choosing components.

## Author generated B-roll in SVML

1. Put the reference-frame prompt in an English `copy:Value` and generate the image with an explicit
   image Surface such as `gpt:Image`.
2. Pass the image through the image gate in `production-gates.md` before using it as a video reference.
3. Vendor `broll-v1.svs`, choose the stable material/story/edit/camera/motion axes in an SVS Recipe,
   and put only the shot-specific micro-story in an English `copy:Value`.
4. Render the Kit with `copy:Render` and connect the story through `copy:Set`.
5. Generate through `seedance:ReferenceVideo` with `generate-audio="false"` and explicit ordered
   references.
6. Place accepted shots with `media-track:Track` and `media-track:Item` or `media-track:Sequence`.

```svml
<copy:Value id="demo-story">
  The hand places the device on the desk, wakes the screen, and pauses as the result becomes visible.
</copy:Value>

<copy:Render id="demo-prompt"
  template={broll-kit.broll-v1} recipe={studio.broll.screen-demo}>
  <copy:Set name="story" text={demo-story}/>
</copy:Render>

<seedance:ReferenceVideo id="demo-motion" model="mini"
  prompt={demo-prompt} duration="6" resolution="720p"
  aspect-ratio="9:16" generate-audio="false">
  <seedance:Reference image={demo-frame.image}/>
</seedance:ReferenceVideo>
```

Use the model limits and prompt rules in `seedance-directing.md`. Generated B-roll supplies pictures
only; narration, music, and effects remain explicit audio contributions.

## Design the image and motion prompt as one package

- The image prompt establishes every visible fact: subject, identity, location, wardrobe, props,
  object count, camera geometry, emotion, and initial physical state.
- The video story adds only motion over those established facts. Audit every person, object,
  relationship, and emotional starting point in the video text against the accepted image.
- Direct one or two readable events with macro action and small facial/postural feedback. Do not add
  a new room, person, outfit, prop, or unexplained camera angle during the shot.
- Give every manipulated object a plausible starting contact and short motion envelope. Preserve its
  count, shape, label, and distinctive physical features throughout the take.
- When a document, device screen, receipt, or product label must stay unchanged, use a continuous-shot
  edit language and a reference-locked camera treatment.

## Place B-roll by authored meaning

- Mark the intended spoken range as a Script `Selection`, then use `during={story.selection.NAME}` on
  the Media Item and pass `{timing.map}` to the Track.
- For a point event, declare a Script `Moment` and use `at={story.moment.NAME}` with an explicit `for`.
- For silent programs or intentionally absolute edits, use `during="program"` or explicit `start` and
  `end` expressions in the shared ProgramSpace.
- For a non-contiguous Selection, choose `occurrences="each"` only when the same insert should appear
  at every occurrence; otherwise author separate Items.
- Create J-cuts and L-cuts in the Script boundaries: let narration establish a few words before the
  B-roll opens, and let speech continue before or after the picture returns. Do not make every visual
  cut start and end exactly with a complete spoken sentence.

## Protect screens, text, and reverse views

- Keep physical UI and product text attached to the screen, label, document, or sign. Put editorial
  titles, arrows, comparisons, and cards on `typo:Track` or `media-track:Track`.
- When exact UI or brand artwork matters, use the supplied asset as authored media rather than asking
  a generator to recreate it.
- A person-facing view and its device-facing reverse view must pass the hard geometry gate in
  `visual-continuity.md`: opposing camera positions require different background sectors and different
  dominant landmark sets. The same main background is an automatic rejection.
- Follow `screen-demo.md` for context/proof pairs and physically possible screen orientation.

## Accept and reuse shots

- Review each generated image before its video, then review each video before Track assembly.
- Reject identity drift, same-background reverse views, impossible contact, duplicated props,
  unstable screen content, unwanted text, broken end frames, or motion that does not start from the
  accepted reference.
- Pin accepted image and video outputs in the next `.svrun` with `build-record` and `satisfy`, so
  only failed shots are regenerated.
