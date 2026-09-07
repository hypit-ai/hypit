# Compositing pictures, screens and overlays

Read this when several visual contributions share a frame: a persistent board over a presenter,
a live inset, a cutout, a screen inside a device or a designed background carrying media and text.
[Tracks](../../production/tracks.md) owns the authoring mechanics; this page owns the visible relationship.

## Keep physical, camera and editorial space distinct

One finished frame can relate three kinds of space:

| Space | What it owns |
| --- | --- |
| Physical scene | The people, setting and objects actually recorded or generated; gaze, touch and physical interaction belong here. |
| Camera composition | The viewpoint, framing, subject placement, scale and crop through which that scene is seen. |
| Editorial composite | The Caption, MG, inset, mask and other Tracks placed over or around the source picture, including their stack order. |

The final design can make these spaces answer one another without merging them. A later overlay can
influence the camera composition chosen for a source picture, but it does not become an object inside
that picture's physical scene. The source remains a complete image of its world; the overlay remains
an authored layer in the final composition.

## Give the layers room together

Decide which information leads at each beat. A small inset can still dominate through movement,
contrast or a face; a large quiet field can support the main action. Keep necessary faces, mouths,
gestures, product labels and readable text clear of persistent graphics.

Plan composition before generating the base image when a long-lived overlay reserves part of it.
Frame the subject and anything that must remain readable outside the overlay's planned footprint while
directing the whole image as a complete natural scene. Keep the intended graphic out of that scene
prompt when it will be authored separately. The smallest owning response to a collision may be a new
crop, a moved overlay, simpler content or a newly framed picture.

Canvas dimensions, intrinsic media extent, destination Frame and fit/crop are separate facts. Check
the result of all of them, not just the Frame coordinates. A tall cutout can consume most of a
vertical Canvas even when its width seems modest. Stack order is explicit inside Tracks, not the
order they happen to appear in Film. [Spatial layout](../../production/spatial.md) owns the exact
Frames and fitting once the intended relationship is known.

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

## Choose an A-roll presentation

The performance carrying a spoken Segment remains A-roll across several common visual
presentations. Choose the source shape and final Frame from the intended relationship, the reference
evidence, and the feeling of the shot rather than from a fixed layout recipe.

| Presentation | Useful starting judgment |
| --- | --- |
| Full-frame | A `9:16` character-and-scene image and reference-generated performance are the common fit for vertical creator footage. Frame the face, body and real setting for the later composite. |
| Upper or lower split | A square camera image and performance often cover a `9:8` half of a vertical Canvas cleanly, with a small top/bottom crop. A close, intimate phone view may instead be a vertically generated performance whose other half is covered. |
| Foreground cutout | A vertical performance often preserves a natural amount of the speaking body. Remove its background, normalize the alpha-bearing result, and use that same prepared performance as the SemanticTake. |
| Circular picture-in-picture | A square source with the face near its own center is a useful starting point. Give Speech Track a square Frame and rounded clip whose radius is half the side; its semantic, visual and audio outputs remain one assembly. |
| Audio-only A-roll | The performance contributes semantic time and sound but no picture. Another Track fills the Segment with the intended demonstration, POV, B-roll, Typography or MG. |

For a non-overlapping upper/lower split, equal stacking order can express two peer regions; the
Frames themselves keep them separate. Other unambiguous stack choices can serve the same picture.
Use Content Fit to map the source into its destination Frame rather than changing the source's
semantic role.

When reconstructing an apparent half-screen presenter, the final rectangle alone does not reveal its
source shape. Inspect camera distance, intimacy, body crop, background coverage and related views. A
close phone feeling can support the reading that a vertical performance is partly covered; a flatter,
more distant composition can support a native square view. These are useful priors, while the actual
visual evidence and intended target composition decide.

The source image and video direction describe a complete physical scene and camera view. Position a
face high or low, left or right, through framing and meaningful scene relationships when that serves
the final layout. Editorial graphics remain separate layers and are not objects for the generated
person to see, touch or point toward. [Image direction](image-direction.md#frame-the-image-for-what-it-will-become)
owns the camera-image wording; [Spatial layout](../../production/spatial.md) owns Frame, fit and crop.

## Inset, cutout and flattened composite are distinct choices

A speaking rectangular inset, circular inset or normalized cutout can be presented directly by
Speech Track. A circular inset is a geometric crop: use a square Frame and a rounded clip whose
radius is half that square's side. The camera background remains inside the circle. A cutout instead
follows the person's silhouette and needs suitable transparency in the source. Speech Track presents
the Take while it carries the Segment's speaking performance. Media Track can use the same prepared
media when the work intentionally gives it an independent Window, playback, trim or visual role.

A speaking person in either presentation remains A-roll when their performance carries the main
Script. Choose placement and stacking for the viewer's attention; preserve the performance's
semantic timing and route its speech once.

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

When the intended artifact is a fixed flattened arrangement of still images, use
[Image Compose](../../production/image-operations.md#flatten-a-fixed-still-image-arrangement).
That page owns its exact role, limits and Source syntax.

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
