# Designing a good component

Read this when a video needs a new visual role, shared state or expressive structure. Design it with
the taste of a director and the care of someone who will use it in a real composition. A useful
component makes a particular idea legible and gives its author clear ways to direct that idea.

[Graphic composition](../playbooks/craft/graphic-compositions.md) owns visual hierarchy and motion;
[Track authoring](track-authoring.md) owns the implementation. A new Caption family also draws on
[Caption craft](../playbooks/craft/captions.md) and [Caption authoring](caption-authoring.md).

## Find the relationship worth giving a name

Start with the viewer's experience: a comparison becomes clear, an answer resolves a question, a
ranking accumulates, or a phrase lands with particular emphasis. Explain what appears, why it appears
there, what changes, and what the viewer should retain afterward. That explanation suggests both
the visual design and the component boundary.

A board whose rows share layout and persistent state benefits from one component. An independent
photo and title can remain peer Tracks. An object that survives several camera cuts keeps the same
authored identity while its state develops. Let shared behavior define the unit.

A performance moving from full screen into a side viewport and a diagram filling the released space
can share one component. It owns their relative layout, overlap, masking and coordinated motion.
A-roll names the performance carrying semantic time; it does not reserve the picture for Speech
Track. Ordinary presentation can reuse Media; a new relationship can be authored directly. A
one-off scene is a useful component too. Caption and independent overlays can remain separate.

Choose visual grouping and timing independently. A combined scene can respond to spoken Moments;
separate Tracks can share an authored event. What belongs together on the canvas does not decide
what gives that behavior its time.

Fine Caption similarly offers reusable flowing text, while a custom Caption family can own a new
relationship among words and graphics. Both consume Script wording and semantic timing. Shared
behavior can keep these visuals together; [Caption authoring](caption-authoring.md) explains the
specialized text inputs and the same freedom to compose.

Give a reusable scene the prepared performance, its outer Window and the Moment that changes its
layout. Replacing a product or rewriting the Script then changes content and semantic anchors while
preserving the behavior. The final frame positions come from the selected Takes.

Sketch its intended Source use with this video's actual content. The tag and its children should
read like a concise account of the visual idea: which subjects are compared, which answer is already
known, and which statement reveals the next one. This makes the important choices visible early and
helps reveal a missing relationship before it becomes rendering code.

## Let meaning drive the behavior

Prefer Script Selections, Moments and Segments for events that respond to the argument or performance.
The Surface projects them through the accepted SemanticTrack; the component consumes the resulting
Windows or Instants. A different delivery can then move the event while preserving its purpose.
Explicit time remains useful for an authored lead, a short entrance or another clock-based decision.
In a pure MG piece, name the events that carry its meaning and direct their reading rhythm. A useful
component accepts resolved Instants or Windows so the same reveal can follow a Script Moment or an
authored time. Keep message content and its trigger together in Source; repeated children can each
have their own trigger. Use semantic examples first for speech-led roles, showing how a new performance
preserves the relationship. [Authored animation](rendering.md#compose-an-authored-animation) covers
the film clock when there is no performance.

Choose the temporal input from what the component does. A picture covering an explanation occupies
its Selection. An answer revealed on a word can remain visible after that word ends. A ranking item
may move during a reveal Window and stay in its settled row afterward. The board's outer lifetime,
the trigger and the resulting state each have a clear meaning.

Direct motion through that relationship. Arrival draws attention, settling establishes a new state,
replacement makes a change readable, and departure releases space for the next idea. Choose how much
time each needs relative to the meaning it carries. When an authored interval changes length, decide
which part follows that interval and which part keeps its own readable duration. Document that choice.

One authored event can also coordinate peer Tracks: a reveal, sound and flash can use the same
Moment. A shared event is enough when each contribution already has a useful independent component.
[Track authoring](track-authoring.md#keep-selection-projection-and-consumption-distinct) explains the
projection and consumption boundary in detail.

## Expose the choices that preserve the idea

Separate the work's content from the behavior that presents it. Words, images, identities and event
references belong in Source. Related visual choices can form a Recipe. The component supplies a
coherent default treatment and the reusable layout, state and motion that make its role recognizable.

A good parameter earns its place by enabling a useful directing choice. A comparison may need labels,
images, emphasis, a Frame and a reveal relationship. Its internal coordinates can follow those choices.
Keep independently useful decisions independent, while letting one meaningful control coordinate details
that belong together. Palette, spacing and motion defaults should already form a designed whole.

Support the variation the work actually needs. Longer names, another product, a different number of
rows or a changed performance may be ordinary inputs; a new visual relationship may deserve another
component. Reuse becomes valuable when the next author can change the content while retaining the
idea. [Caption craft](../playbooks/craft/captions.md#caption-families-styles-and-parameters) gives
a concrete example of this distinction through family, Recipe/Style and parameters.

## Design the component in its frame

Judge it beside the presenter, coverage, Caption and other graphics it will share the picture with.
Give the eye a clear entry point, useful grouping and a settled state that remains readable. The
component's local palette, density and motion should support the whole composition's hierarchy.

Use the supplied Frame to express placement and derive the internal layout from it. Decide how real
text and media occupy that space: what wraps, what crops, what scales, and what stays aligned. A useful
default can suit the present work while leaving size, position and assets authored. Let a genuinely
unsupported configuration produce an actionable explanation of the content or space that needs changing.
[Spatial layout](spatial.md) owns fitting and coordinate relationships; [Fonts and text](fonts-and-text.md)
owns text resources and placement.

Look at the important states in the actual composition: before the reveal, during the change, after
it settles, and when the system leaves. A preview with representative content can answer hierarchy,
readability, collisions and timing together. Make the correction at its owner: a semantic anchor,
the chosen Recipe, the component's behavior or the visual idea itself. Reuse the production's media
while refining those relationships.

## Make the idea easy to use and revise

Give the component vocabulary and an example that show its purpose, required inputs, public outputs
and the meaning of its timing. For persistent state, explain what remains after activation. A preview
should reveal the behavior that makes someone choose this component, with useful default content.

When a Studio Companion helps, expose the same meaningful entities and choices: a board's lifetime,
a row's reveal, a Caption Cue's actual Style. Editing the displayed entity should change the owning
Source fact. [Studio](studio.md#give-a-project-component-a-useful-companion) owns those bindings.

For an existing example, read the installed `@hypit/ranking` README and the part of its implementation
that answers the current question. It connects semantic reveals, settled state, layout and editor
entities. Carry the relevant relationship into the project component's own design.
