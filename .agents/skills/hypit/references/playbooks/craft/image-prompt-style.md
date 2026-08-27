# Image generation and prompt craft

## Author images in SVML

- Put each prompt in a `copy:Value` from `@hypit/text@1`.
- Generate with an explicit image Surface — `gpt:Image` — and read its package README for the ports.
- Connect every identity, product, scene, or UI reference as a visible Artifact edge. For GPT Image,
  use ordered `gpt:Reference` children and consume `{shot.image}` downstream.
- Set aspect ratio and resolution on the model Surface. Do not put pixels, resolution, or aspect-ratio
  tokens into prompt prose.

## Write every generation prompt in English

Use four ordered parts:

1. **Reality contract:** open every photographic prompt with this sentence, verbatim, with only the
   bracketed shot replaced. It is concatenated in front of the rest, not paraphrased — a described
   reality contract drifts between prompts and a copied one does not.

   > A photograph with the texture of real iPhone footage. Generate a vertical [SHOT — for example a
   > seated medium close-up], as one frame cut out of video actually shot on an iPhone: genuinely
   > real rather than glossy, carrying the texture of video and not of a posed photograph. The
   > background stays clearly visible, with no depth-of-field blur. Skin texture is fine and real,
   > the light is natural, and no part of the picture is broken.

   This is for pictures of the photographed world — people, places, products, held objects. A drawn
   asset such as a paper texture, a board or a panel is not a photograph, and this sentence would
   damage it; write those prompts plainly.
2. **Visible story:** state the exact person/product, wardrobe, location, action, emotion, objects,
   object count, and initial physical state that must be visible.
3. **Camera geometry:** state shot size, camera owner/placement, height, direction, lens relationship,
   reflection logic, and which requested objects must fit inside the frame.
4. **Reference contract:** assign each reference a role and state which identity, product geometry,
   room, or UI fact remains stable.

Describe the final image directly. Do not write an edit-operation checklist, conditional branches,
or long negative inventories containing unwanted concrete objects. Split mutually exclusive states
into separate prompts.

## Keep the reality prefix on every photographic image

The reality contract is an invariant prompt prefix, not a hint for the model. Every `gpt:Image`
generation that depicts a photographic or photoreal scene must concatenate the exact prefix before
its shot-specific body, including generations that also have one or more `gpt:Reference` children.
References constrain identity, geometry, or continuity; they do not replace, shorten, or override the
prefix. Keep the wording and order stable across a prompt family and change only the bracketed shot
slot. A reference image with no prefix is a different visual contract and is not an acceptable
shortcut. Non-photographic illustrations and deliberately graphic assets use their own plain visual
contract instead of pretending to be iPhone footage.

## A reusable description spine

The strongest prompts turn adjectives into observable evidence and keep the same order every time:

1. **Frame purpose and setting.** Name what the frame is doing (podcast, interview, product proof,
   establishing view), where it is, and what part of the environment must remain visible.
2. **Composition and camera geometry.** State shot size, subject position relative to the frame,
   body lean, gaze direction, camera side and height, lens feel, and the background sectors or
   landmarks that must be included. Relational instructions such as “subject slightly right,
   leaning left, looking toward an unseen person on the left” are more reliable than three isolated
   adjectives.
3. **Identity and appearance anchors.** Establish the recurring person or product with concrete,
   stable traits first (face shape, eyes, hair, skin, age presentation, distinctive marks), then
   add body silhouette, wardrobe, accessories, and styling. For a male-presenting subject whose
   physique matters, state a visible shoulder line — for example, “broad shoulders and a strong
   upper-body silhouette” — and choose a half-body or wider frame that can actually show it. When
   mixed Asian heritage is part of the intended identity, name the combination explicitly, such as
   “Japanese-American mixed-race man” or “Korean-American mixed-race man”; do not leave a
   reference-critical identity to the generic word “Asian.” Keep heritage as one stable identity
   anchor, never as a bundle of stereotyped physical claims. Prefer a few renderable facts over a
   stack of generic superlatives such as “extremely handsome.”
4. **Action and physical relationships.** Give one readable starting action and posture. Say who the
   subject is addressing, what supports their body, which hands are occupied, and how props contact
   the scene. This explains a gaze, crossed legs, a microphone entering from frame left, or a person
   leaning toward an off-screen interlocutor instead of leaving the model to invent the cause.
5. **Props, branding, and scale.** Name object count, side of entry, relative size, and attachment to
   the environment. Keep diegetic labels short and specify their placement; use supplied assets or
   an explicit Track whenever lettering must be exact rather than trusting generated typography.
6. **Light and material response.** Describe light source and direction, indoor/outdoor quality,
   contrast, skin texture, surface texture, and the desired level of polish. “Natural indoor light,
   fine skin texture, background still readable” gives the model physical evidence instead of only
   saying “high quality.”
7. **A small set of positive acceptance constraints.** Repeat only the few failure modes that matter
   for this shot (for example, no depth-of-field blur, no broken/fragmented regions, background
   visible). Avoid long negative inventories: they consume attention and often introduce the very
   objects they name.
8. **Reference roles.** For each ordered reference, say whether it locks identity, room geometry,
   product shape, wardrobe, or UI. State what must remain stable and what the new shot is allowed to
   change. Do not describe a reference-locked room a second time in prose as if it were a fresh set.

For a prompt family, use this compact skeleton after the invariant prefix:

```text
Scene/purpose: …
Composition/camera: …
Subject/identity/wardrobe: …
Action/posture/relationships: …
Props/branding: …
Lighting/material: …
Acceptance constraints: …
Reference roles: …
```

This is a writing order, not text to paste literally. Keep critical facts singular and unambiguous;
use controlled repetition only for a fact that must survive across every view (identity, camera side,
or lighting direction). Separate mutually exclusive poses, locations, or before/after states into
different prompts rather than joining them with “or.”

## Keep people and cameras physically possible

- Make the first generated identity anchor a clear complete face with both eyes visible. Vary face
  direction naturally only after that anchor exists.
- If broad male shoulders are part of the design, keep both shoulder edges and enough upper torso in
  the identity anchor; a tight face crop cannot establish that invariant for later references.
- Respect hand occupancy. A person holding a phone or product cannot simultaneously have both hands
  free; assign only physically necessary tasks and avoid arbitrary left/right choreography.
- For a selfie, specify one real camera topology: an arm-held front camera, a mirror/reflective-surface
  shot with explainable reflection geometry, or a fixed low/front camera. If another person or a
  third-party camera owns the shot, do not call it a selfie.
- Make shot size agree with the story. Do not place essential feet, table-under actions, or lower-body
  props outside a close or waist-up frame.
- Make shot size agree with the overlays too. A board, band or sheet that covers part of the frame for
  most of the video decides where the subject can be, so frame for the region that is left rather than
  for the whole picture; `overlays.md` states the rule and how to write it as geometry.
- For reverse views, define both background sectors before writing prompts and apply the hard rule in
  `visual-continuity.md`.
- Make before/after states visibly distinguishable through the authored condition, posture, setting,
  styling, or evidence while preserving the intended recurring identity and product facts.
