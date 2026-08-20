# Visual continuity

## Encode continuity in SVML

- Declare recurring anchors as explicit `media:Image`/`media:Audio` assets or accepted generated
  outputs. Reuse the same Artifact edges; do not redraw identity from prose for every take.
- Generate the location once and derive its other views from that image, rather than describing the
  room again per take; every part of a shot split by the duration ceiling references that same
  accepted image, so the parts generate in parallel rather than in a chain.
  `generated-dependencies.md` states both, and the reverse-view geometry below is what decides how
  many views a location needs.
- Keep one authoritative reference set and one stable Recipe for a continuous shot group. Split a
  group only for a genuine edit or the 15-second Seedance ceiling; preserve camera, room, wardrobe,
  light, props, action state, and reference order across its parts.
- Put each stable physical fact in both the reference image and the relevant prompt contract. Prefer
  simple, symmetric props when a distinctive feature repeatedly duplicates or mutates.

## Enforce shot/reverse-shot geometry

Treat reverse-view geometry as a hard acceptance rule, not a stylistic suggestion.

1. Name camera positions A and B, their facing directions, and the background sector/landmarks that
   each position must see before generating either image.
2. For opposing positions, require different main background sectors and different dominant
   landmarks. The room, people, lighting logic, and key props remain continuous, but the background
   behind the subject must not be the same or a cosmetic crop of the same wall.
   The two views must show different background sectors and different landmark sets.
   In short: opposing views must show different backgrounds.
3. Reject both images if they show the same main background, the same landmark arrangement, or a
   mirrored duplicate. Regenerate before either image enters downstream generation.

Use explicit English geometry such as:

`Camera A faces the subject with the window wall behind them. Camera B is the opposite reverse view from the subject's position, with the counter and blackboard wall behind the device. The two views show different sides of the same room.`

For a person-facing/device-facing pair, the person-facing image shows what is behind the person;
the device-facing reverse image shows what is behind the device. Writing only “cafe interior” or
“office interior” for both views is a continuity failure.

## Review each accepted group

- Compare identity, face angle, eye line, wardrobe, lighting direction, room layout, camera height,
  lens feel, prop count, handed tasks, and action state across every image/take in the group.
- Keep camera movement within the selected Kit Recipe. Do not introduce a new room, camera, outfit,
  or unexplained object inside a reference-locked take.
- Let only the active Script Role speak. Keep listeners visibly alive through breath, gaze, and
  reaction without invented dialogue.
- Keep supplied physical text attached to its product, screen, document, or sign; put editorial text
  on explicit Tracks.
- Apply the image gate in `production-gates.md` before connecting any generated frame downstream.
