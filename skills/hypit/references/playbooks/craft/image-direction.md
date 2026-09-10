# Directing generated images

Read this before writing or adapting an image prompt, including one inherited from another project.
An image establishes the person and world that a reference-conditioned video can bring to life.

UGC, podcast and street-interview work commonly share the same photographic foundation: the visible
credibility of a frame from real iPhone video, with an appealing person and a readable environment.
Use the full capture paragraph in `@hypit/gpt-image-kits/phone-ugc-v1`. Direct the particular person,
camera relationship and setting around that foundation. A change of format usually changes those
relationships while retaining the capture language. An invented or fantastical person can inhabit
this photographed world too.

## Compress the idea into decisive anchors

Study a reference as a coherent visual impression. Understand how the person, styling, camera
relationship and setting create its appeal, and which details carry that character. Keep useful
observations in the reference notes; distill them into the direction the new picture needs. Careful
observation makes concise prompting possible: the detail earns its place through what it contributes.

For social-video portraits, look first to Gen-Z styling and social aesthetics for language that
captures the closest-fitting look and presence. Soft goth, clean girl, coquette or relaxed streetwear
can organize hair, makeup, clothing and attitude together. Use the words that express this particular
person, combining descriptions where that is more accurate than a named style. The user's goal and
references still determine identity, age and defining features; the styling language articulates
the appearance to preserve or adapt. Where the brief invites new casting, it also offers a useful
starting point for an original look.

Make the choices that determine the picture explicit. Cultural background, age, intended complexion,
strength of attraction, a recognizable styling idea and the setting's palette can each change the
whole direction. Select them deliberately instead of leaving the important decisions at “a young
woman in a nice room.” A supplied reference can establish the facts it already contains.

A muscular Barbie-like woman, a nerdy student or a sailor-style outfit can also organize visible
qualities in a few words. “Creator” and “founder” describe a role; alone they give little direction
about appearance. Keep a role when it belongs to the work, and still cast and style the person.

Use specific detail where it preserves identity, expresses a useful relationship or settles a key
structure: exact product features, HYPIT lettering, a face's placement, or broad shoulders and
excellent head-to-shoulder proportions. A concise direction can be forceful and precise. Give the
image model the visual intention and decisive anchors, and let it realize the picture and organize
incidental detail within that direction.

When adapting a reference, recover its visual idea before rewriting its details. Relaxed collegiate
styling may carry what matters about a shirt; the exact fraction of forearm exposed by its rolled
sleeve may be incidental. If the sleeve exposes a featured watch, preserve that relationship. Keep
the details the new work depends on, and let its new person and camera realize the shared style.
More painstaking description does not by itself make the direction more faithful or attractive.

## Four paragraphs, four responsibilities

For a complete character-and-scene camera image, use this order:

| Paragraph | Question | Direction |
| --- | --- | --- |
| Capture | What kind of photographed image is this? | The Kit's full fixed iPhone-video paragraph. |
| Person | Who should we want to watch? | Cultural background and age, strong attraction and a cultural or aesthetic comparison for that appeal, complexion, defining appearance, proportions and styling. |
| Shot | How does the camera see them, and what are they doing with whom? | Framing, distance, posture, face direction, placement, speech, gestures and useful relationships with props or other people. |
| Setting | What place surrounds them? | A recognizable place, overall palette, and a few useful structures, materials or objects. |

These are paragraph responsibilities, not a form requiring a sentence for every possible attribute.
A hairstyle name can settle the hair; a styling idea and a memorable item can settle the outfit.
Related information can share a sentence. Keep each paragraph focused while considering the picture
together: wardrobe participates in the palette, and a table can explain an offset composition.

The [balcony example](examples/image-direction.md#japanese-sailor-on-an-apartment-balcony) preserves
a successful complete prompt. Use it to see the amount and kind of direction that
produced the result, rather than turning every incidental detail in the image into another requirement.

## Use a concrete capture direction

The Kit preserves the chosen capture paragraph verbatim. It establishes a frame from actual iPhone
video, the photographic surface, a clearly visible background, natural fine skin texture, natural
lighting and a coherent image. Carry this wording intact into phone-footage images; later paragraphs
direct this picture's content. Adding sensor grain, exposure falloff or elaborate lighting language
is an additional aesthetic choice, not a necessary completion of the capture paragraph.

GPT Image 2 is the usual choice. Favor `2K` for a full-screen picture or video reference; `1K` often
suffices for an inset or small graphic. Set aspect ratio and resolution on the model's parameters.
The prompt concentrates on composition inside that shape. For an illustration, product photograph
or other explicitly different visual form, select capture language that serves that goal.

The Kit assembles `person`, `shot` and `setting` after the fixed capture paragraph:

```svml
<import as="text" from="@hypit/text@1"/>
<import as="ugc" source="@hypit/gpt-image-kits/phone-ugc-v1"/>

<text:Render id="portrait-prompt" template={ugc.phone-ugc-v1}>
  <text:Set name="person" text={portrait-person}/>
  <text:Set name="shot" text={portrait-shot}/>
  <text:Set name="setting" text={portrait-setting}/>
</text:Render>
```

These slots take ordinary paragraphs, not individual appearance parameters. Pass `{portrait-prompt}`
to the image Surface and connect reference images there. For a derived view, a reference may already
establish person or setting; the Kit permits those blocks to be omitted. State the needed inheritance
and change in the relevant paragraph. Its package README owns the exact assembly interface.

## Make the person immediately compelling

Begin an invented person's paragraph with the cultural background and age range you intend. State
the intended complexion when choosing it; a broad identity label need not settle it. A supplied
person's image and the user's description establish their identity and appearance.

For an invented human presenter in this photographic style, **explicitly state strong beauty or
handsomeness, with an appropriate visual comparison, and explicitly include broad shoulders and
excellent head-to-shoulder proportions**. Preserve their force when revising. “Exceptionally,
strikingly beautiful, with the looks of a top Korean girl-group idol” directs both strength and kind
of appeal. “Idol-level polish” describes grooming and cannot replace that beauty direction.

The shoulder and proportion wording is a deliberate structural anchor for these half-body portraits:
pinched shoulders beneath a large-looking head can undermine the intended human presence. Keep the
anchor across centered, offset, seated and standing views. Develop the appeal of a supplied person
while preserving their recognizable identity and physique. Animal and established character designs
use the appealing proportions and defining features that belong to them.

Choose a few appearance anchors under the whole-person idea. Long straight black hair with bangs,
alluring goth eye makeup and a sweet-but-edgy beret can establish a person without an inventory of
facial measurements or garment construction. Overall makeup style, a strong eye-makeup emphasis and
the intended allure can work together. Keep the strength of these choices rather than replacing them
with general praise such as “well presented.”

Attraction is a positive casting goal. Photographic credibility does not call for automatically
adding fatigue, rough skin or an unflattering pose. Select a particular appearance because this
person and work need it. A cultural or styling anchor has a scope: goth can describe the person
while an ordinary classroom, balcony or café supplies their surroundings.

## Frame the image for what it will become

The Shot paragraph makes the encounter visible. For a reusable, direct-to-viewer UGC image, explicitly
settle these relationships. The wording in the successful example provides a useful baseline:

| Relationship | Useful direction and its purpose |
| --- | --- |
| Framing and distance | A medium or close half-body shot, fairly close to the camera, makes the face, shoulders and gestures readable. Framing decides visible extent; distance decides the camera relationship. |
| Posture | Sitting on a chair or standing gives the body a clear arrangement. Choose the posture the scene needs. |
| Address and activity | Holding a handheld microphone and speaking directly to the viewer establishes an ongoing exchange. Choose a microphone or other prop when it belongs to that encounter. |
| Accompanying movement | With the free hand gesturing gives the speaking state visible life. Adapt this to the hands and objects involved; an exact finger pose usually adds little. |
| Frontal face | “Her face points straight toward the lens, with no head tilt or rotation.” Preserve this explicit wording for the reusable frontal speaking view. |
| Placement | State where the face belongs: for example, toward the upper-right part of the frame. Choose the position for this picture and its later composition. |
| Scene relationship | A table entering the lower-left corner can balance a person on the right and explain their placement. A seat, partner or body orientation can do this in another encounter. |

Centered, leftward, rightward, seated and standing images all retain deliberate framing and body
proportions. Plan shared space with later MG through the source camera view. Describe the actual
person and scene; author the later graphic in its component. An image made for a half-screen or
circular presentation needs a camera view that serves that crop. [Compositing](compositing.md)
owns those presentation relationships.

### Choose an idle state for the encounter

Idle is a readable exchange that can continue into different passages. Speaking, gesturing and an
engaging gaze belong in it. Give the person a useful state from which to perform. An elaborate
“about to say something outrageous” expression chooses a particular dramatic beat; use such a beat
when the passage earns it. Natural speaking gestures need no finger-by-finger choreography.

Choose direction from whom the person addresses:

| Encounter | Face and body relationship |
| --- | --- |
| Directly addressing the viewer | Keep the reusable frontal view explicit, including no head tilt or rotation, with an engaged speaking state. |
| Podcast partners | Look toward the partner, keeping the face usefully visible to this camera; preserve complementary positions and microphone relationships. |
| Interviewer and guest | Preserve the shared encounter and its gaze axis in the two-person image and derived close views. |

A deliberate story image can show a particular laugh or action. Opening and closing performance
beats belong in the relevant video passage. The reference supplies visual facts; the selected model
mode determines whether it is a literal first frame. See [video direction](video-direction.md) and
[conversation images](examples/conversation-images.md).

## Establish the place with a few details

Begin the Setting paragraph with a recognizable place and give it an overall palette. Add the few
structures and objects that make this camera view specific. A Korean street-side café, navy blue and
yellow, with stairs, an entrance, textured walls, plants and railings gives the model a coherent
world to arrange. The prose can place the palette at the end while it guides the choice of details.

Texture and spatial construction contribute different things. Wood grain varies a surface; a doorway,
balcony railing, shelving aisle or view beyond a window helps establish how a place continues. A wall
covered with many small notes can remain one flat plane. Choose actual spatial anchors rather than
adding more decoration merely to make the description detailed. A broad wall can naturally belong to
a well-chosen view. The person, setting and objects need not all express the same subculture or job.

A useful object can carry several relationships: a half-eaten bingsu suggests a café visit underway
and adds color; the nearby table belongs in Shot when it explains the person's framing or interaction.
Keep the setting concise enough for the model to complete the incidental architecture and arrangement.

### Give the frame a clear color relationship

Choose the overall palette explicitly and consider it with the person's skin, hair and clothes.
Give the larger areas a useful relationship and let smaller colors support or accent them. Navy
clothing, terracotta architecture and green plants can separate the person from the setting while
belonging to one image. A place and a few material names can carry this direction without assigning
a separate color to every object.

For clean phone-footage images, prefer considered colors and material variation to an unchosen white
or flat-gray background. Avoid defaulting to broad white clothing against a broad white wall: that
combination can wash the person into the setting. Wood, tile, fabric and foliage can provide tangible
variation. The useful choice is the combination; a texture adjective cannot repair a weak palette.

Keep lighting at the natural premise supplied by Capture unless the scene calls for a particular
light event. Avoid casually adding dim lighting, dark shadows, exposure falloff or sensor grain to
make the picture “more real.” Name hues directly when hue is what you intend. A local dark textured
wall or white trim is a surface choice, not a request to darken or brighten the whole image. Preserve
exact product and wardrobe colors, and choose their surroundings to support them.

## Let references supply the facts they own

Look at a supplied person before directing them. Their reference establishes identity; the Person
paragraph develops the styling and appeal this work needs. A parent view can establish the shared
place; an exact product reference establishes the product. Put these responsibilities in the paragraph
they affect, with the needed preservation and change. Connect actual reference Resources on the model
Surface in the stated order; mentioning an image in prose does not supply it.

Keep a derived view as short as its inherited facts allow. A close view can change attention and crop;
a product-holding view can change hands and prop state while keeping the camera and setting. Preserve
the capture language. Another angle may reveal different surroundings within the same place.
[Reference relationships](generated-dependencies.md) and [conversation examples](examples/conversation-images.md)
own these branches; [Transformations](../../creation/transformations.md) owns a swap across the video.

## Keep successful direction useful

Judge a picture first by the intended person, appeal and feeling, then by the framing, color and
interactions the video needs. Use that understanding when directing another image. Preserve useful
results with their exact prompts, references and known model settings. Distinguish a proposed rewrite
from the wording that actually produced an image. A successful rendering of individual leaves,
tiles or reflections does not make their exact arrangement necessary in the next prompt.

Carry accepted material into the production. When a new request calls for a different image, revise
the choice responsible for that difference while retaining the direction that still serves the work.
