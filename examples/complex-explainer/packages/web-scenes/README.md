# Coordinated explainer scenes

Eight project-owned scenes combine accepted media with frame-addressable HTML animation. A scene owns the objects that respond to one another; independent presenter framing, Caption, countdown and sound stay outside it. Fixed local geometry is appropriate for this one-off design.

## Scene map

| Declaration | Source folder | What belongs together |
| --- | --- | --- |
| Introduction | `src/scenes/introduction/` | Website/code demonstrations, app icons and paired example cards |
| Comparison | `src/scenes/comparison/` | Two product demonstrations and their visual comparison |
| Road | `src/scenes/editor-route/` | Opposing route cards, folder, pointer, editor, rejected drag and terminal |
| CodeJourney | `src/scenes/code-route/` | Code, copied implementations and time-editing demonstration |
| ComponentWorkshop | `src/scenes/components/` | Reused structures and changing media inputs |
| SemanticWorkshop | `src/scenes/semantic-time/` | Visible words and the graphic events attached to them |
| DeliveryWorkshop | `src/scenes/delivery/` | Result library, phone feeds and the drinking callback |
| Outro | `src/scenes/outro/` | GitHub demonstration, install sequence, portraits and closing card |

Each folder owns `index.js` (content and resource slots), `styles.js` (appearance) and `animation.js` (frame-to-state behavior). The editor route additionally separates the appearances of its stage, editor, material and output demonstrations.

## Inputs and time

Each declaration receives Timeline, Canvas, font, an absolute Window, its explicit assets and named `Beat`
children. Source obtains those values from Narrative Projection or direct time declarations before
passing them in. Its compiler resolves only completed Window and Instant references; local animation
reads their frames. Seek any frame directly: pointer paths, springs, typing and transitions derive
state from time.

Video inputs are `PreparedMedia`; each scene passes the selected source and exact sampling relation to the terminal visual program. Image inputs are Blob artifacts. `DeliveryWorkshop.reference` is the fictional drinking illustration; it is deliberately an image, without fabricating silent performance media or video. Media entries explicitly choose native playback, holding the last frame or looping where the scene needs it.

Shared ordinary modules under `src/shared/` own html-visual assembly and media sampling, visual primitives, the route cards, terminal behavior and editor artwork. `@explainer/visual-language` supplies common palette and motion helpers. These code dependencies are not automatically separate Film Tracks.

## Companion and sound

`src/studio.js` declares scene identity, concise descriptions, temporal lineage and drawing-order controls through Hypit's public Companion facet. Studio does not know these scene names. Detailed design remains in the package instead of exposing every internal dimension.

All outputs are visual contributions. Music and pixel effects are explicit Audio Tracks in the main Source; these scenes neither play hidden audio nor infer routing.

## What the demonstrations mean

Website and template-library passages use supplied recordings. The competitor-case clips were made by the project owner. Repeated marks, token counters, the editor and its failed drag are authored illustrations, not measurements or recordings proving product behavior. The complete argument remains this production's editorial copy. See the production's asset provenance notes.
