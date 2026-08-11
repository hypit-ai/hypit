# Two-person podcast format

Use the vendored data-only `podcast-v1` Kit; it is a reusable Text Template, not a new execution
node. Render it with `text:Render` plus an SVS Recipe, then feed the result to
`seedance:ReferenceVideo` with two final camera-position images and two ordered voice references.
Use ordered `speech:Take` inputs and peer Tracks for assembly.

- Prepare two final camera-position reference images, not isolated portraits. They establish room,
  lighting, clothing, seating, and mutually consistent reverse views.
- Prefix every Script line with an explicit speaker cue. Only the active speaker talks; the other host
  remains present with breathing, listening, and reaction.
- Use `A:`/`B:` dialogue and connect optional take-specific action through the Kit. Keep framing,
  edit language, pacing, performance, reaction, and gesture in the Recipe rather than rewriting the
  prompt scaffold.
- Choose rhythm deliberately: follow the speaker for measured dialogue or cut to a meaningful listener
  reaction. Framing changes are crops/pushes inside locked A/B views, never invented cameras/locations.
- Use one `speech:Spine`, at most one `caption:Program` + `caption-fine:Track`, and `text:Track`/
  `media-track:Track` for titles/evidence.
  Keep dialogue/action prompts separate and in English.
- Shape skeptical reviews asymmetrically: short challenge, longer grounded answer, mechanism/evidence,
  and a payoff that returns to the opening hook.
