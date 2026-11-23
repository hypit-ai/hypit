# Designing a Good Component (`component-design.md`)

Read this when deciding how to organize a picture, a transition, or a recurring visual system as an NLE component package. Design it with the taste of a director and the care of someone who will edit it in a real composition.

[Graphic composition](../playbooks/craft/graphic-compositions.md) owns visual hierarchy; [motion graphics](../playbooks/craft/motion-graphics.md) owns changes in the picture over time; [Track & Component Authoring](track-authoring.md) owns the package contract; [Component Visuals](component-visuals.md) owns HTML visual rendering.

## Find the Relationship Worth Giving a Name

Start with the viewer's experience: a comparison becomes clear, an answer resolves a question, a ranking accumulates, or a phrase lands with emphasis. Explain what appears, why it appears there, what changes, and what the viewer should retain afterward. That explanation suggests both the visual design and the component boundary.

- Use an existing component (such as `@hypit/text-fine`) when its behavior fits, or create a project component package under `packages/` for a role this production needs.
- A board whose rows share layout and persistent state belongs in one component. An independent photo and title can remain separate `<present>` occurrences on peer tracks.
- A presenter moving from full screen into a side viewport while a diagram fills the released space can share one component (receiving the presenter video through `<media-input>`), or be coordinated via TSX authoring ([TSX Authoring](authoring.md)).
- Keep coordinated geometry, state, and transitions together where that makes their behavior clear. Internal helper modules can organize the code without turning every sub-part into a separate track or package.

## Separate Responsibility, Parameters, and Reuse

| Decision | What justifies it |
| --- | --- |
| Independent component | A distinct visual responsibility, lifetime, or stateful behavior benefits from its own owner. |
| Parameterization (`<parameters>`, `<value>`, `<media-input>`) | The production needs an external choice: an asset, a word timestamp, copy, or a setting that the author or NLE Studio Inspector will actually adjust. |
| Reusable package | Multiple scenes or projects share a relationship or treatment; generalize only the variation those uses need. |

A one-off scene can keep its internal spacing, palette, and animation curves fixed inside its implementation. Expose parameters for real directing decisions—content, media slots, timing anchors, and key visual controls—rather than turning every pixel offset into a public knob.

## Let Meaning Drive the Behavior

- **Prefer speech-anchored timestamps** from aligned transcripts (`hypit transcript align`) for events that respond to narration or dialogue. Pass those timestamps into `<parameters>` (or compute them in TSX) so a retake or pace change moves the visual event without rewriting the component.
- **Separate outer lifetime from internal events.** A Present's `start` and `duration` define when the component is on screen; internal trigger timestamps (e.g., when row 2 reveals or when a pointer clicks) belong in `<parameters>` so each action stays locked to its phrase rather than arbitrary percentages of the outer clip.
- **Derive state directly from local time.** In your `HtmlVisual` `render(frame)` function, compute the complete visual state directly from the requested frame and parameters. Never rely on accumulated frame-by-frame side effects; both NLE Studio scrubbing and parallel export seek directly to arbitrary frames.

## Design the Component in Its Frame

Judge every component beside the presenter, coverage, captions, and other graphics sharing the composition canvas:

- Derive internal geometry from the Present's `<layout>` dimensions so resizing or reframing the Present adapts cleanly.
- Verify all key states in NLE Studio (`hypit nle open`): before reveal, mid-transition, settled state, and exit.
- Expose clean Inspector fields (`createNleInspectorPresentationContribution`) for the adjustments a human editor will actually make in NLE Studio (text content, colors, font size, key timings), while keeping read-only structural details out of the way.
