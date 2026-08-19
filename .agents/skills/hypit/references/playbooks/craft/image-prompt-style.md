# Image generation and prompt craft

## Author images in SVML

- Put each prompt in a `copy:Value` from `@hypit/text@1`.
- Generate with an explicit image Surface such as `gpt:Image`, `nano:Image`, `nano:ProImage`,
  `seedream:TextImage`, or `seedream:ReferenceImage`. Use the exact package README for its ports.
- Connect every identity, product, scene, or UI reference as a visible Artifact edge. For GPT Image,
  use ordered `gpt:Reference` children and consume `{shot.image}` downstream.
- Set aspect ratio and resolution on the model Surface. Do not put pixels, resolution, or aspect-ratio
  tokens into prompt prose.

## Write every generation prompt in English

Use four ordered parts:

1. **Reality contract:** name the capture medium and texture, such as a realistic phone-video frame,
   natural light, visible background detail, realistic skin/material texture, and unpolished motion-frame
   character.
2. **Visible story:** state the exact person/product, wardrobe, location, action, emotion, objects,
   object count, and initial physical state that must be visible.
3. **Camera geometry:** state shot size, camera owner/placement, height, direction, lens relationship,
   reflection logic, and which requested objects must fit inside the frame.
4. **Reference contract:** assign each reference a role and state which identity, product geometry,
   room, or UI fact remains stable.

Describe the final image directly. Do not write an edit-operation checklist, conditional branches,
or long negative inventories containing unwanted concrete objects. Split mutually exclusive states
into separate prompts.

## Keep people and cameras physically possible

- Make the first generated identity anchor a clear complete face with both eyes visible. Vary face
  direction naturally only after that anchor exists.
- Respect hand occupancy. A person holding a phone or product cannot simultaneously have both hands
  free; assign only physically necessary tasks and avoid arbitrary left/right choreography.
- For a selfie, specify one real camera topology: an arm-held front camera, a mirror/reflective-surface
  shot with explainable reflection geometry, or a fixed low/front camera. If another person or a
  third-party camera owns the shot, do not call it a selfie.
- Make shot size agree with the story. Do not place essential feet, table-under actions, or lower-body
  props outside a close or waist-up frame.
- For reverse views, define both background sectors before writing prompts and apply the hard rule in
  `visual-continuity.md`.
- Make before/after states visibly distinguishable through the authored condition, posture, setting,
  styling, or evidence while preserving the intended recurring identity and product facts.

## Accept images before reuse

Run the image gate in `production-gates.md`. When image viewing is available, inspect the actual
output and reject identity drift, impossible anatomy/camera geometry, duplicate props, wrong text,
same-background reverse views, watermarks, and unusable overlay clearance before downstream use.
