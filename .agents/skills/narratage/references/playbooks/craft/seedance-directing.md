# Seedance directing

Separate the reusable format contract from per-take dialogue, action, story, or direction.

- Select an official vendored Seedance Kit before composing prompt prose: `speaker-v1` for talking
  heads, `broll-v1` for silent visual stories, `podcast-v1`, `call-v1`,
  `street-interview-v1`, `motion-reference-v1`, or `camera-reference-v1`.
- Render the Kit with `text:Render`; keep stable policy in an SVS Recipe and connect only dynamic
  `dialogue`, `action`, `story`, or `direction` slots through `text:Set`. Do not duplicate the Kit's
  reference, role, voice, camera, microphone, or hygiene blocks in a hand-written prompt.
- Vendor the selected `.svs` into the video project's `./kits/` directory. Do not import it from a
  separate Narratage checkout.

- Write one or two readable events, not frame-by-frame choreography: macro action plus micro eye,
  brow, smile, concern, or breath feedback.
- Start from the reference pose, objects, emotion, camera, and space. Do not introduce a new person,
  prop, room, wardrobe, or angle.
- Give physical motion envelopes: objects start in the hand or on the surface, travel a short distance,
  move slowly and naturally, never fly, bounce, teleport, detach, or multiply.
- Tie speech actions to actual Script order. Quote only words present in the Script; otherwise use
  semantic phases such as opening, turn, and verdict.
- Keep the face visible and hands away from it unless contact is required.
- For a prompt with no matching Kit, end it with the English no-overlay sentence in
  `reference-vlm.md`. Official Kits already own their format-specific hygiene block; do not append a
  duplicate.
