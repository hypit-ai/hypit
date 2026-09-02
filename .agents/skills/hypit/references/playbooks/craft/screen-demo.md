# Screen-demo craft

A screen demo must make the person/device relationship physically possible and preserve the real
product interface as evidence.

## Choose the presentation form

- Use a full-screen screenshot or recording when the interface itself is the primary evidence.
- Use a framed `media-track:Item` when the screen is an overlay over live action.
- Use a context/proof pair when the story needs both the user and the interface: first establish the
  person/device relationship, then show the screen from the user's physically possible position.
- Keep editorial explanations outside the UI on `typo:Track`. Keep the product's own labels, buttons,
  values, and navigation physically attached to the supplied screen asset.

## Enforce hard reverse-view geometry

Define both views before generating either one:

- name camera position A for the person-facing view and camera position B for the device-facing view;
- name the background sector and dominant landmarks visible from each position;
- require position B to show the opposite sector with a different landmark set;
- require the two views to show different background sectors and different landmark sets;
- reject and regenerate if both views show the same main wall, window, furniture arrangement, or a
  mirrored/cropped version of the same background.

For example, a person-facing classroom view may show chairs behind the user, while the device-facing
reverse view shows the lectern and blackboard behind the laptop. Writing only “the same classroom”
for both views is insufficient. Apply the complete geometry review in `visual-continuity.md`.

## Keep the interface on the correct surface

- A readable laptop UI can appear only on the screen facing the camera. Never place interface content
  on the laptop lid, back, keyboard, or another physically impossible plane.
- Use a real supplied screenshot or captured screen whenever exact wording, data, layout, logo, or
  interaction state matters. Do not ask an image or video generator to guarantee exact UI text.
- When generating a contextual device image, connect the real UI screenshot as an explicit image
  reference and describe its role in the English prompt.
- Preserve device orientation, bezel, screen plane, user eye line, room geometry, and the interface
  state across the context/proof pair.

## Direct generated screen motion

- Use the vendored `broll-v1` Kit with a Recipe selecting `material-mode: screen-demo`.
- Prefer `edit-language: continuous-shot` when the screen, receipt, document, or values must remain
  unchanged throughout the take.
- Prefer `camera-language: reference-locked` for proof and stable UI, or `product-macro` for a motivated
  close detail. Avoid unnecessary reframing that makes the interface unreadable.
- Put only the physical interaction and small camera/action change in the English `story` slot.
- Generate with `seedance:ReferenceVideo generate-audio="false"`; narration and effects remain on
  explicit Audio Tracks.

## Assemble and inspect

- Place screenshots, recordings, and generated demonstrations with `media-track:Track`; define an
  explicit Frame, appearance Recipe, motion Recipe, timing window, and stack order.
- Use `during={story.selection.NAME}` for a spoken demonstration range, a Moment plus `for` for an
  event, or explicit `start`/`end` timing in the SemanticTrack frame domain for a silent demo.
- Inspect legibility at delivery size, not only full-resolution source size. Reject changed text,
  unreadable controls, moire, impossible perspective, screen reflections that hide evidence,
  same-background reverse views, or a hand interaction that does not match the UI state.
- Pin accepted screenshots, contextual frames, and generated demo takes in later Builds with
  `.svrun` `build-record` and `satisfy`.
