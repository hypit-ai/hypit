# Image direction examples

Read this alongside [Directing generated images](../image-direction.md) when learning the actual
prompt language and aesthetic choices behind Hypit's phone-video images.

The record-store case pairs its exact English production prompt with the supplied output; its public
WebP viewing copy preserves the original 1152 × 2048 dimensions. The other three pictured cases pair
their supplied outputs with faithful English translations of the Chinese production prompts; those
copies preserve the original 1520 × 2688 dimensions. Framing is consolidated into `shot`, and output
orientation is moved to the external model settings. The translated English versions illustrate the
direction but have not themselves been submitted as generation requests.

In each prompt, the first paragraph comes from the Kit's fixed capture block, the next is the
`shot` input, and the remaining paragraphs are the `direction` input. These examples use no reference
media. A different work can connect references and explain their roles through the optional
`references` input. The Kit's README in the Distribution owns the exact SVML assembly.

The suggested settings for these prompts are `aspect-ratio="9:16"` and `resolution="2K"` on
`gpt:Image`. These are external model settings; the prompt describes the composition within that
shape without repeating it.

The frontal half-body view and microphone belong to this series of versatile speaking images.
Speaking and loosely gesturing describe an ongoing presence, leaving the later video to direct the
particular line and gesture. Carry the capture language into another useful shot without
automatically carrying this staging. Read examples whose directing question is relevant.

## Shanghai record-store owner: one coherent person

![Shanghai record-store owner: green knit, bob, and headphones in a working record shop](https://hypit.s3.us-east-1.amazonaws.com/assets/skills/hypit/image-direction/v1/shanghai-record-store.webp)

The casting idea is a beautiful woman with distinctive taste, at ease in a place she knows deeply.
The following choices explain the prompt's directing intent as a whole.

- **Beauty with a particular character.** “Exceptionally beautiful” and “the striking appeal of a
  top girl-group idol” state the strength of the desired appeal. “The cool presence of an independent
  film actress” gives it a particular character. These describe complementary qualities of one person;
  they do not request a collage of different faces. “Shanghai” locates her social world, but the city
  name alone does not supply this casting direction.
- **Expertise expressed as presence.** Recognizing a record from its first two seconds conveys ease,
  confidence, and a relationship to music without prescribing a facial pose. The closing sentence
  makes her someone giving a personal recommendation to the viewer. That relationship gives the
  image a more specific human intention than a beautiful person simply occupying a shop.
- **Styling and surroundings that agree.** The neat bob, knitted polo, silver hoops, and headphones
  support her composed, music-literate persona. Album sleeves and a handwritten recommendation card
  make this her working shop. Each detail helps the same person become legible.
- **A palette that lets her stand out.** Jade-green clothing and walnut shelves establish distinct
  subject and setting colors. The face stays clearly lit while the shelves retain shadows and detail.
  Color, material, and lighting work together; there is no request to brighten the whole room.
- **A body situated in the room.** The lower-left turntable gives the rightward placement a physical
  reason. Comfortable proximity, visible shoulders and upper body, and explicit head-to-shoulder
  proportions work together to keep her present without asking for an extreme close-up. The fixed
  iPhone-video paragraph supplies the capture language for this highly attractive, deliberately styled
  person.

For a different character, carry forward the relationship between these choices. A different persona
may call for flowing hair, workwear, a bustling outdoor setting, or another palette. A bob, green
clothing, walnut shelves, and two beauty comparisons are not a reusable formula for an attractive
woman. Keep the aesthetic direction forceful while making its visible details belong to the new person.

In the saved result, her face draws attention between the black bob, green knit, and wooden shelves.
The knit stitches, headphone surfaces, silver hoops, and reflections on the record sleeves give
different materials their own visible character. Small highlights are visible on her nose and lips.
These are observations of this output. Its prompt does not separately request skin highlights,
record-sleeve reflections, or visible knit stitches.

The direct gaze, open mouth, microphone, and forward gesturing hand make the frame read as an ongoing
conversation. The turntable occupies the lower left, while the records and handwritten recommendation
cards make the shop legible around her. The camera sits slightly above her eye line, while one
shoulder meets the right edge of the image. The original request remains intact below so that
intention and output can be compared.

Complete English prompt:

```text
A photograph with the texture of real iPhone footage, captured as a single frame from a video actually shot on an iPhone. The image looks real, without an oily, overprocessed finish, and has the texture of video footage. The background is clearly visible, with no depth-of-field blur. Skin texture is natural and fine, the lighting is natural, and the image is coherent and free of visual artifacts.

Generate a half-body image of a Chinese woman in her late twenties inside the independent record shop she owns in Shanghai. She sits slightly to the right, comfortably near the camera, with her face level and directed toward it. A turntable on a low cabinet enters the lower-left part of the frame beside her chair. Her shoulders and upper body remain clearly visible.

She holds a small handheld microphone while speaking to the camera, her free hand gesturing naturally. She has the effortless confidence of someone who recognizes a record from its first two seconds. She is exceptionally beautiful, with the striking appeal of a top girl-group idol and the cool presence of an independent film actress. She has a small face, broad shoulders, excellent head-to-shoulder proportions, and beautifully cared-for skin.

Her hair is cut into a neat chin-length bob. She wears a jade-green knitted polo, small silver hoop earrings, and a pair of over-ear headphones resting around her neck. Behind her are walnut record shelves, a few displayed album sleeves, and a handwritten recommendation card tucked into a record bin.

The jade-green clothing gives her definition against the walnut surroundings. The shop has ordinary interior lighting: her face is clearly lit, while the shelves retain natural shadows and readable detail. It feels like a favorite local record-store owner taking a moment to tell you which album you should take home.
```

## Mob Wife: strong glamour in a captured world

![Mob Wife: strong glamour in a captured world](https://hypit.s3.us-east-1.amazonaws.com/assets/skills/hypit/image-direction/v1/mob-wife.webp)

The beauty comparison and the attitude give this person a vivid social presence. Fur, layered gold,
red lips, leather seating, and an expensive restaurant reinforce it. The production prompt
names these materials without adding instructions for leather grain, fabric folds, or metal
reflections. Its final sentence places her in the social world of a mob wife meeting her girlfriends.
The deep-red nails and dark-brown hair below preserve the production prompt that belongs to this
example. Apply the current palette guidance when directing a new image.

Complete English prompt:

```text
A photograph with the texture of real iPhone footage, captured as a single frame from a video actually shot on an iPhone. The image looks real, without an oily, overprocessed finish, and has the texture of video footage. The background is clearly visible, with no depth-of-field blur. Skin texture is natural and fine, the lighting is natural, and the image is coherent and free of visual artifacts.

Generate a close half-body image of a Latina woman in her thirties, seated slightly to the right and near the camera. Keep her body within the frame. Her face is directed straight ahead without any tilt or rotation, and the lower part of her body is visible and unobstructed.

She holds a handheld microphone in one hand and speaks to the camera, while her other hand gestures. Her commanding attitude says, “Stay out of my husband's business.” She is exceptionally beautiful, with the intense beauty of a top Italian actress and the stunning appeal of a young Monica Bellucci. She has broad shoulders, excellent head-to-shoulder proportions, and a larger-than-life presence.

She wears a leopard-print fur coat over a black low-cut top, several chunky gold chains layered around her neck, and large gold hoop earrings. Her long nails are deep red. Her dark-brown hair falls in voluminous waves; she wears classic red lipstick and bold but clean eye makeup. She sits in a leather booth in an expensive-looking Italian restaurant. An oil painting hangs on the wall behind her, a bar is visible farther back, and candles stand on a nearby windowsill.

The restaurant's background palette is mainly red and gold. It feels like an upscale private dining room where a mob wife meets her girlfriends for a meal.
```

## Orange-cat CEO: comic authority through body and setting

![Orange-cat CEO: comic authority through body and setting](https://hypit.s3.us-east-1.amazonaws.com/assets/skills/hypit/image-direction/v1/orange-cat-ceo.webp)

The boss's authority organizes the picture. A round face, large belly, crooked tie, straining suit
buttons, and undersized cat tree make that authority funny. The actual prompt obtains its character
appeal through those relationships; it adds no general handsome-animal requirement or individual-fur
detail. It names a leather chair and a gray-and-orange textured office palette without cataloging
fabric weave or leather grain. The capture paragraph supplies the photographic premise.

Complete English prompt:

```text
A photograph with the texture of real iPhone footage, captured as a single frame from a video actually shot on an iPhone. The image looks real, without an oily, overprocessed finish, and has the texture of video footage. The background is clearly visible, with no depth-of-field blur. Skin texture is natural and fine, the lighting is natural, and the image is coherent and free of visual artifacts.

Generate a close half-body image of a plump orange cat, seated slightly to the left in a large leather chair and near the camera. Keep its body entirely within the frame. Its face is directed straight ahead without any tilt or rotation, and the lower part of its body is visible and unobstructed.

The cat wears a three-piece suit. One front paw rests on a small handheld microphone as it faces the camera, while the other gestures. Its expression carries the born-to-be-the-boss authority of an orange cat.

Its tie is crooked and its suit buttons strain around its large belly. It has classic orange-and-white tabby stripes, a round face, and long whiskers. Its whole body rests back in the leather chair. Behind it is a boss's office with a floor-to-ceiling window overlooking the city skyline. A desk to its side and rear holds a MacBook and a mug marked “BIG BOSS”; a cat tree in the corner is plainly too small for its owner.

The office's background design combines gray and orange textures. It looks like a standard boss's office.
```

## Mermaid: an impossible subject in a photographed world

![Mermaid: an impossible subject in a photographed world](https://hypit.s3.us-east-1.amazonaws.com/assets/skills/hypit/image-direction/v1/mermaid.webp)

The mermaid identity, explicit beauty, and friendly curiosity direct the person. Wet hair, shells,
real pearls, shafts of underwater sunlight, and sand place her in a specific physical world. The
actual prompt names those states and objects, then finishes by saying that she really appears to be
sitting underwater. It leaves ordinary surface behavior for the model to resolve, without adding
separate instructions about shell texture or contact against the skin.

Complete English prompt:

```text
A photograph with the texture of real iPhone footage, captured as a single frame from a video actually shot on an iPhone. The image looks real, without an oily, overprocessed finish, and has the texture of video footage. The background is clearly visible, with no depth-of-field blur. Skin texture is natural and fine, the lighting is natural, and the image is coherent and free of visual artifacts.

Generate a close half-body image of a mermaid seated in the center and near the camera. Keep her body within the frame. Her face is directed straight ahead without any tilt or rotation, and the lower part of her body is visible and unobstructed.

She holds a handheld microphone in one hand and speaks to the camera, while her other hand gestures. She has the curious, friendly presence of an underwater princess, as though she is teaching people on land about ocean life. She is exceptionally beautiful, with the delicate beauty of a mermaid princess, broad shoulders, excellent head-to-shoulder proportions, and graceful upper-body lines.

Scales with a sea-blue gradient are visible on her neck and shoulders, with small fin-like decorations beside her ears. Her long, wet sea-blue-green hair is threaded with a few small shells and pearls. She wears a top made from shells and starfish and a necklace of real pearls. She sits on a coral rock on the seabed. Behind her is an underwater world with colorful coral colonies, a few small fish swimming past, and shafts of light filtering down from the water's surface farther away. A few shells lie scattered on the sandy seabed.

The background palette combines sea blue and coral orange, like a shallow-water coral reef reached by sunlight.

The image looks real, as though this woman is actually sitting underwater.
```
