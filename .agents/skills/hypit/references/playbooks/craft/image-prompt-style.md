# Image generation and prompt craft

## Author images in SVML

- Put each prompt in a `copy:Value` from `@hypit/text@1`.
- Generate with an explicit image Surface — `gpt:Image` — and read its package README for the ports.
- Connect every identity, product, scene, or UI reference as a visible Artifact edge. For GPT Image,
  use ordered `gpt:Reference` children and consume `{shot.image}` downstream.
- Set aspect ratio and resolution on the model Surface. Do not put pixels, resolution, or aspect-ratio
  tokens into prompt prose.
- Never describe output dimensions in the prompt itself: do not write values such as `1:1`, `16:9`,
  `9:16`, `square image`, `portrait orientation`, `2K`, or `4K`. Those belong in the `gpt:Image`
  attributes. Use a shot description such as “close portrait” or “medium close-up” only when it
  explains composition, not as a substitute for the model's size parameters.

## Write every generation prompt in English

Write the final prompt as continuous natural-language prose, with no section headings, category
labels, slash-separated field names, or key-value formatting. Cover these four concerns in order,
but never print their names into the prompt:

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
   object count, and initial physical state that must be visible. When a person is the main subject,
   make their face and identity the most specific part of the shot description rather than treating
   them as a generic figure inside a detailed set.
3. **Camera geometry:** state shot size, camera owner/placement, height, direction, lens relationship,
   reflection logic, and which requested objects must fit inside the frame.
4. **Reference contract:** assign each reference a role and state which identity, product geometry,
   room, or UI fact remains stable.

Describe the final image directly. Do not write an edit-operation checklist, conditional branches,
or long negative inventories containing unwanted concrete objects. Split mutually exclusive states
into separate prompts.

## Spend prompt detail on the subject

Use a deliberate detail budget. For a person-led image, the person is the visual priority: spend most
of the descriptive space on intended ethnicity or heritage when it is authored or known, apparent age,
face shape, brow and eye structure, nose, lips, jaw and chin, hairline, hair texture and hairstyle,
skin tone and undertone, distinctive marks, shoulder line, body silhouette, and wardrobe. These are the
facts that make the generated person recognizable and stable across shots.

Treat the background as support, not a second subject. Usually describe it in one short sentence with
only the setting and the one or two landmarks that continuity actually needs. Do not enumerate decor,
patrons, furniture, surfaces, atmosphere, or lighting variations unless one of them changes the story
or the camera geometry. Keep required props, action, and framing explicit, but remove ornamental detail
that competes with identity.

When the identity comes from a supplied reference, say to preserve that exact identity and describe
only observable, production-relevant traits; never infer sensitive background from appearance. A useful
priority order is: identity and silhouette, required prop or action, camera geometry, then the concise
setting and finish.

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
3. **Identity and appearance anchors.** For any person-led image, make the identity description the
   visual center of the prompt. Establish the recurring person with concrete, stable traits first:
   age presentation; specifically intended ethnicity, nationality, or mixed heritage; face shape;
   brow and eye shape and spacing; nose structure; lips, jaw, and chin; hairline, hair texture, and
   hairstyle; skin tone and undertone; natural pores, fine lines, under-eye texture, small
   asymmetries, and any distinctive marks. Then add body silhouette, wardrobe, accessories, and
   styling. Use enough of these facts to make the person recognizable across generations instead of
   writing a generic attractive face. For a male-presenting subject whose physique matters, state a
   visible shoulder line — for example, “broad shoulders and a strong upper-body silhouette” — and
   choose a half-body or wider frame that can actually show it. When mixed Asian heritage is part of
   the intended identity, name the combination explicitly, such as “Japanese-American mixed-race
   man” or “Korean-American mixed-race man”; do not leave a new, authored identity at the generic
   word “Asian.” Keep heritage as one stable identity anchor, never as a bundle of stereotyped
   physical claims. If a supplied reference owns an existing person's identity, do not guess a
   sensitive background from appearance; describe observable facial traits and tell the model to
   preserve that exact identity. Prefer specific, renderable human detail over generic superlatives
   such as “extremely handsome,” “perfect face,” or “flawless skin,” which tend to produce synthetic,
   interchangeable people.
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

For a prompt family, preserve this order after the invariant prefix, but write the result as flowing
natural-language prose. The numbered parts above are an authoring checklist, never headings, labels,
field names, slash-separated categories, or a key-value outline in the generated prompt. In
particular, do not emit openings such as `Scene/purpose:`, `Composition/camera:`, or
`Subject/identity/wardrobe:`. A finished prompt should read like a concise description of the image,
for example:

```text
The frame is a compact neighborhood podcast studio; keep the acoustic wall and desk edge visible.
Compose a seated medium close-up from the guest's eye level, with him slightly right of center and
leaning toward an unseen host on the left. He is a Japanese-American mixed-race man in his early
thirties with a broad square face, softly hooded dark-brown eyes set beneath straight brows, a
medium-width nose with a rounded tip, defined cheekbones, a strong jaw and chin, and a slightly uneven
smile. His warm light-olive skin has visible pores, faint under-eye creases, and subtle cheek
asymmetry. His short coarse black hair has a mildly uneven hairline and a natural forward texture.
He has broad shoulders and a strong upper-body silhouette, wearing a faded charcoal work jacket over
a white T-shirt. He rests one forearm on the desk and holds one matte-black microphone near his mouth
while listening with a restrained smile. Keep both shoulder edges, the microphone, and its contact with
his hand inside the frame. Use the first reference to preserve his exact identity and wardrobe while
allowing the new posture and camera distance described here.
```

This example demonstrates the prose shape, not wording to paste literally. One or several short
paragraphs are acceptable, but every sentence must continue the image description rather than name
a prompt section. Keep critical facts singular and unambiguous; use controlled repetition only for a
fact that must survive across every view (identity, camera side, or lighting direction). Separate
mutually exclusive poses, locations, or before/after states into different prompts rather than
joining them with “or.”

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
