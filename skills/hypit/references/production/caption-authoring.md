# Writing a Caption family

Read this when a work needs a new relationship among its spoken words, layout and motion.
[Caption craft](../playbooks/craft/captions.md) owns readability and directing judgment;
[Caption styling and coverage](caption-program.md) owns applying Styles and Mutes;
[Track authoring](track-authoring.md) owns project package wiring.
[Fonts and text](fonts-and-text.md) explains exact font resources and fallbacks;
[component visuals](component-visuals.md) explains the final drawing representation.
[Component design](component-design.md) connects a new family's visual idea to useful author controls
and its fit beside the rest of the video.

## Decide what is actually new

Fine Caption already covers uniform flowing text with exact fonts, Paint, boxes, karaoke states,
placement and motion. Different colors, Role styles, cue entrances or head tracking may only require
Source and Recipe changes. A keyword occupying a separate oversized line, words playing different
visual roles, or a recurring spatial relationship among speakers can justify a new family directly.
Creating that family is normal video production. Name the family for the visual relationship it
makes reusable, and name each Style for a particular treatment within it. A project can also own a
single-use caption composition when that is what the video needs.

The result is still Caption when the displayed words correspond to speech and remain close to its
delivery. Independent slogans, summaries and titles usually belong to Typography even if they react
to a Script Moment.

## Own the visual relationship

Media can present ordinary footage; a scene component can coordinate footage with diagrams or other
graphics. Fine and custom Caption families have the same relationship. Their shared input is the
authored speech and its semantic timing; the implementation owns the spatial structure and motion.

Start from what the viewer should understand or feel. A supporting phrase might establish the
thought while its key word takes the emphasis. Design how they enter, share space, respond to speech
and hand off to the next thought. That relationship suggests useful controls: the word's authored
role, fonts, relative sizes, placement and motion. Put the work's choices in its Style/Recipe and
the reusable arrangement in the renderer.

The output remains an ordinary VisualTrack. Its Presents can own trees of text, boxes, images and
other visual elements. When words and graphics share layout or motion, they can live in the same
component. [Component visuals](component-visuals.md#compose-video-and-graphics-in-one-browser-program)
also describes HTML/CSS browser programs with typed media and text children. That drawing freedom
applies to captions too: give the program the resolved caption schedule and explicit resources,
and evaluate its state at the requested frame. Keep separately useful overlays as peers.

## Keep the existing text and timing chain

```text
Script → CaptionDocument (display words, alignment units, authored Cue breaks)
Styles + Role / Selection / word-attribute applications → CaptionProgram
CaptionDocument + CaptionProgram + SemanticTrack → TimedCaptionProjection
projection + family parameters → explicit family schedule
schedule + document + program + ProgramSpace → VisualTrack
```

Use `@hypit/hypit/caption` for the common Program and timing helpers and `@hypit/hypit/narrative` for the Script's
document and unit types. The common Caption layer handles display-versus-spoken
wording, N:M alignment units and complete-unit Selection boundaries. Do not transcribe again,
rebuild timing by splitting a string, or use the video model's requested duration as speech evidence.
The package README explains the extension inputs and points to their owning implementations.

The ordinary Program Surface remains useful with a new family's Styles:

```svml
<caption:Program id="captions" document={story.caption} narrative={story}
  default={base-style}>
  <caption:Use role="GUEST" style={guest-style}/>
  <caption:Use selection={story.selection.punchline} style={punchline-style}/>
</caption:Program>
```

These names assume Styles have already been declared by the chosen family. They are complete Style
applications, not CSS inheritance. For word-specific roles, Script can mark `useful{emphasis}` and
`caption:Use attribute="emphasis"` can select a Style. The new family must deliberately interpret
the resulting word runs; Fine rejects them. A structural word role should not be guessed by the
renderer from spelling, capitalization or “the third word.”

## Design a family-specific schedule

Separate measured speech time from visible time. Preserve each alignment unit's measured boundaries
and identity; resolve lead, tail, stagger, hold and handoff into an explicit schedule before rendering.
The renderer draws that schedule and does not silently add another tail or reorder Cues.

For a “large keyword plus supporting phrase” family, the schedule might identify each Cue's display
words, its emphasized word ids, their measured units and the visible interval of the two groups.
Its layout then computes the two groups together. Decide what happens with no keyword, several
keywords, long text and an N:M pronunciation span. Make author correction possible through word
attributes, `||` and Style configuration instead of inventing missing text or dropping words.

The common projection respects authored Cue breaks and structural boundaries. Visual line wrapping
is a separate operation. A narrow width should not silently rewrite the Script into new spoken Cues.
If the family needs an additional grouping rule, give that rule explicit parameters and preserve the
original word/unit associations in the schedule.

Display Words follow the Script's writing system: a Han character is normally one Word, while an
English word is normally one Word. Keep that timing granularity separate from a phrase's visual
grouping. Compose adjacent Han characters without Latin word gaps, preserve punctuation with its
word, and use the selected fonts' actual widths for layout. Exercise mixed-script names as well as
plain English when the family will carry Chinese copy.

For speech-following emphasis, activate each complete unit from its projected start and end.
A Cue-wide left-to-right progress bar follows elapsed time and text width, which is a different
effect from following spoken characters. Keep within-glyph wiping an explicit visual choice.
Use uneven unit durations and a pause in a short example to check that the chosen effect follows
the intended clock.

`caption:Mute` suppresses selected display units while preserving speech. A new family should use
the common mute application when scheduling, as Fine does. Validate that schedule, document, narrative
and ProgramSpace belong together; do not silently accept timing from another video.

## Give Style, layout and rendering clear owners

The Style Surface validates a Recipe and exact font references, then emits the common Caption Style
shape with the new family's name and parameters. The Track Surface accepts the document, semantic
timeline and Caption Program; its Fragment performs the common timing join and its own schedule and
render operations. Register the new family's Producers and any new schedule Type in its own package.

The renderer owns typography, structural relationships, stacking and motion. Use the existing text
shaping and Visual IR facilities with explicit font resources, including selected local font files,
so the same faces reach the rendering machine.
Read `@hypit/caption-fine`'s `fragment.ts`, `schedule.ts` and `render.ts` as separate implementation
examples. Reuse the common parts and replace the actual family behavior, including its parameter
validation; renaming Fine while retaining its uniform-word assumption will not implement a structural
keyword treatment.

The common Program does not automatically dispatch Styles to different renderers. Fine rejects a
foreign family. A new family can provide its own ordinary and emphasized treatments in one Program;
if the work combines separate Caption Tracks, author their coverage or mutes so the same words do
not appear twice. Define any mixed-family support explicitly in the component that implements it.

If this family supports spatial tracking, take an explicit RegionTimeline and map it into the actual
composition. Define subject matching and absent-region behavior. Detection belongs to the measurement
step described in [Caption tracking](../playbooks/craft/caption-tracking.md), not to this renderer.

## Check the relationships that matter

Use a short Script with a normal phrase, the new structural treatment, a Role change and a Dual Text
unit. Verify displayed words and their association with measured speech, then inspect the new layout
at the intended frame size and around its handoffs. Check long words, overflow and direct seeking
where relevant. A still can show typography; only the configured timeline establishes timing.

Expose the family with useful vocabulary and a designed preview. Keep wording, font choices, palette
and authored word roles editable in the project. The package adds its rendering language while
consuming the existing Script, Caption and semantic-time owners.

For live Cue entities and Inspector editing, add a [Studio Companion](studio.md#give-a-project-component-a-useful-companion)
that consumes the family's actual schedule, CaptionDocument and Program. Preserve the selected
Style reference for each Cue rather than exposing one misleading global Style. Caption Fine's
Companion is a useful example of these relationships; the new family's layout stays in its renderer.
