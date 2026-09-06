# Compositing pictures, screens and overlays

Read this when several visual contributions share a frame: a persistent board over a presenter,
a live inset, a cutout, a screen inside a device or a designed background carrying media and text.
[Tracks](../../production/tracks.md) owns the authoring mechanics; this page owns the visible relationship.

## Give the layers room together

Decide which information leads at each beat. A small inset can still dominate through movement,
contrast or a face; a large quiet field can support the main action. Keep necessary faces, mouths,
gestures, product labels and readable text clear of persistent graphics.

Plan composition before generating the base image when a long-lived overlay reserves part of it.
Describe a natural scene that leaves the useful area free, such as a person to the right with a table
on the left. Keep the intended graphic out of that scene prompt when it will be authored separately.
The smallest owning response to a collision may be a new crop, a moved overlay, simpler content or a
newly framed picture.

Canvas dimensions, intrinsic media extent, destination Frame and fit/crop are separate facts. Check
the result of all of them, not just the Frame coordinates. A tall cutout can consume most of a
vertical Canvas even when its width seems modest. Stack order is explicit inside Tracks, not the
order they happen to appear in Film.

## Distinguish container motion from content motion

Watch the edges of the device, card or browser frame. If its corners stay fixed while a page moves,
the content is scrolling inside a stationary container. Animate or play the inner material under
that container's clip; translating the whole device tells a different story.

A still can represent a state that the viewer only needs to read. A recording or authored sampling
motion can preserve actual scrolling when the scroll matters. Use explicit states or a Sequence
when the content changes discretely. Match the medium to the observed behavior: preserve meaningful
interaction and let an intentionally unchanged screen remain still.

## Preserve screen and product evidence

Use actual screenshots or recordings when the interface's wording, numbers, navigation or behavior
are evidence. A generated context shot may surround that screen; explicit compositing is useful
when the exact interface must remain editable and legible. A screenshot as a model reference helps
direct appearance but does not establish that every generated label remained accurate.

Keep the screen on the visible screen plane, with believable perspective, gaze and physical access.
For a reverse angle, reason about which background sector the camera now sees instead of mirroring
the first image. Two views may legitimately share landmarks when their geometry remains coherent.
[Visual continuity](visual-continuity.md) covers reference
relationships across those views.

Inspect at delivery size. Glare, tiny lettering, crop, moving fingers or captions can hide the very
fact the insert was meant to show. A plausible-looking product interaction is not evidence of a real
product capability by itself.

## Inset, cutout and flattened composite are distinct choices

A rectangular image or normalized video can be placed directly as a Media Item. A circular inset
is a geometric crop: use a square Frame and a rounded clip whose radius is half that square's side,
or an authored clip Path. The camera background remains inside the circle. A cutout instead follows
the person's silhouette and needs suitable transparency in the source.

A speaking person in either presentation remains A-roll when their performance carries the main
Script. A large screen recording can occupy the background while a small presenter above it supplies
the semantic timeline. Choose placement and stacking for the viewer's attention; preserve the
performance's semantic timing and route its speech once.

When the intended composition needs an isolated silhouette, a still portrait can use
[image background removal](../../production/image-operations.md#remove-a-background). A moving subject
needs video background removal or a suitable key/matte for the changing silhouette.
Choose from what the selected capability actually accepts and returns. Removing the background from
one reference image does not establish transparency in the generated video, and a frozen portrait
cutout does not supply the speaking motion of a live presenter.

Matting changes the picture, not the clip's role in the work. Apply removal to the generated or
supplied clip, then
[normalize the processed video](../../production/media.md#prepare-moving-media-on-the-program-clock).
The normalized result continues into Script alignment and a SemanticTake when it carries the A-roll.
For B-roll, use that normalized result directly in Media Track. Transparency belongs to the picture
and needs to survive normalization; the semantic step belongs to the performance's role in the work.

The Source selects an installed video-matting Surface, and the Runtime Profile selects the Endpoint
that performs it. For the official portrait-matting Model, use
`hypit vocabulary @hypit/volcengine-matting --tag Portrait` for the installed Surface, output and
format values; its package README owns current Model and Provider availability. Normalize the returned
video while preserving alpha, then consume it according to its role in this work.

The semantic step keeps the prepared picture and adds the Script's timing; transparency does not
require another kind of Take or Track. Choose which role the cutout serves in this work:

| Role | Consume the prepared output |
| --- | --- |
| A speaking performance establishing semantic time | `cutout-media.media` → SemanticTake → Speech Track; include its visual and audio outputs in Film. |
| A visual overlay on an existing semantic timeline | `cutout-media.media` → a Media Item's `media` input; select its Window and include the Track's visual output in Film. |

A deterministic image composition can flatten several layers into a reusable still when that frozen
result is the useful artifact. If a cutout belongs inside it, removal precedes composition. An ordinary
inset or a source with suitable transparency already has the material it needs.

Inspect cutout edges against the final background: hair, fingers, translucent edges, holes, halos
and color spill. Match light and color when the layers should read as one scene; an intentionally
graphic collage can have a different visual logic. Keep original media and editable layer choices
when future reframing or changes are likely.

For a live reaction or call layout, silent participants can breathe, adjust posture or react while
remaining silent. Main/inset swaps keep each participant
with their own camera, room and identity; this is different from reversing cameras in one shared
physical space. Generated call footage and separately composited feeds are both possible designs.

Choose sound explicitly. A moving inset need not contribute audio, and visible source audio does
not enter Film by implication. Avoid doubled speech when a clip is also used in the performance
Track. Reuse prepared or generated Outputs through the Run when revising downstream composition.

Review the coexistence of layers through entry, handoff and exit. A clean still does not reveal a
one-frame A-roll exposure, a late reaction, a clipped sound or a board that vanishes after each reveal.
Use [frame coverage](frame-coverage.md) for those boundary questions.
