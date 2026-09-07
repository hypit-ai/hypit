# Image direction examples

Read these with [Directing generated images](../image-direction.md) for complete phone-video image
directions and visual examples.

The first paragraph is the Kit's fixed capture direction. The rest describes the picture in ordinary
language and can be assembled through its `shot` and `direction` slots. Use `aspect-ratio="9:16"`
and usually `resolution="2K"` on `gpt:Image` for these full-screen portraits. The [Craft](../image-direction.md#use-a-concrete-capture-direction)
shows the Kit assembly. Existing production wording, including particular lighting choices, remains
with the result it describes.

## Goth girl outside a Korean cafe

![Goth presenter outside a Korean café, with a wooden shopfront, red architectural details, plants and grape bingsu](https://hypit.s3.us-east-1.amazonaws.com/assets/skills/hypit/image-direction/v1/goth-korean-cafe.webp)

Production example: the prompt below was used directly to generate the shown image.

The intended picture is a striking, sweet-but-rebellious goth girl casually talking to the viewer
outside a Korean café. Idol beauty sets the strength of attraction; blunt bangs, feline makeup,
jewelry and a spiked cap give it a particular character. Textured wood, coral-red accents and plants
establish the place and palette. The half-eaten bingsu on the left both balances her rightward position
and suggests a café visit already underway.

In the result, wood belongs to a shopfront with openings and a recessed entrance. Sidewalk
seating, plants and the foreground dessert establish different distances and a café in use. The red
architectural detail and green foliage give color a physical role. Much of the background is still
wall: its construction and relationship to the rest of the place make it convincing. These are useful
qualities to seek in another setting, with the few spatial anchors that belong to that new view.

The [four paragraph roles](../image-direction.md#compress-the-idea-into-decisive-anchors) are visible
here. In the Kit, use the second paragraph for `shot` and the final two for `direction`.

Production prompt:

```text
A photograph with the texture of real iPhone footage, captured as a single frame from a video actually shot on an iPhone. The image looks real, without an oily, overprocessed finish, and has the texture of video footage. The background is clearly visible, with no depth-of-field blur. Skin texture is natural and fine, the lighting is natural, and the image is coherent and free of visual artifacts.

Generate a vertical close half-body photo of an exceptionally beautiful young woman sitting slightly to the right, near the camera, with her body kept within the frame. She holds a handheld microphone and speaks to the camera, her free hand making a conversational gesture. She has a sweet, slightly rebellious charm, as though casually sharing her take with a friend. Her face is in the upper-middle part of the frame, slightly to the right.

She looks Japanese-American and is extraordinarily beautiful, like a top Korean girl-group idol. She has a very small face, very broad shoulders, excellent head-to-shoulder proportions and very fair skin. Her hair is long, black and straight, with blunt bangs. She wears soft goth makeup with a captivating feline look around the eyes, beautiful silver earrings, a choker and layered necklaces. She wears a black goth-style T-shirt and a baseball cap decorated with silver spikes, with HYPIT in uppercase Gothic lettering.

She is seated outside a relaxed street-side café in Korea. Behind her are beautifully textured wooden exterior walls with a pronounced grain, coral-red architectural accents, some green plants and a few other tables. A half-eaten grape bingsu sits on the table in the lower-left corner. Wood brown forms the main backdrop, with coral red and leafy green as accents.
```

For subsequent reusable frontal speaking images, the
[idle guidance](../image-direction.md#choose-an-idle-state-for-the-encounter) adds an explicit pose:
"Her face points straight toward the lens, with no head tilt or rotation."

### A centered standing version

This variation demonstrates the paragraph roles and has not been generated.

Keep the capture and casting paragraphs above. The person can keep her strong appeal, proportions
and speaking attitude while a new encounter paragraph places her standing in the center. Update the
place paragraph to match that stance. A close half-body crop still suits this speaking image.

Replacement encounter and place paragraphs:

```text
Generate a close half-body photo of an exceptionally beautiful young woman standing in the center of the frame, comfortably near the camera, with her shoulders and upper body visible. Her face points straight toward the lens, with no head tilt or rotation. She holds a handheld microphone and speaks to the camera, her free hand gesturing naturally. She has a sweet, slightly rebellious charm, as though casually sharing her take with a friend.

She stands outside a relaxed street-side café in Korea. The wooden shopfront has a recessed entrance, coral-red architectural details and green plants beside the doorway. A café table beside her holds a half-eaten grape bingsu, with a few other seats farther along the pavement.
```

The four paragraphs keep their roles; the scene determines their particular framing and objects.

## Shanghai record-store owner

![Shanghai record-store owner: green knit, bob, and headphones in a working record shop](https://hypit.s3.us-east-1.amazonaws.com/assets/skills/hypit/image-direction/v1/shanghai-record-store.webp)

Here the striking beauty and cool music-lover presence have a different expression: a bob, jade-green
knit, headphones, and a few record-shop details. Green clothing and walnut shelves distinguish the
person from the setting; the lower-left turntable balances her rightward placement. Recognizing a
record from its first two seconds gives her confidence a vivid social meaning.

The complete prompt below belongs to this particular portrait. Carry that decisiveness into another
character while choosing the face, clothing, setting, and colors that suit the new image.

Complete prompt:

```text
A photograph with the texture of real iPhone footage, captured as a single frame from a video actually shot on an iPhone. The image looks real, without an oily, overprocessed finish, and has the texture of video footage. The background is clearly visible, with no depth-of-field blur. Skin texture is natural and fine, the lighting is natural, and the image is coherent and free of visual artifacts.

Generate a half-body image of a Chinese woman in her late twenties inside the independent record shop she owns in Shanghai. She sits slightly to the right, comfortably near the camera, with her face level and directed toward it. A turntable on a low cabinet enters the lower-left part of the frame beside her chair. Her shoulders and upper body remain clearly visible.

She holds a small handheld microphone while speaking to the camera, her free hand gesturing naturally. She has the effortless confidence of someone who recognizes a record from its first two seconds. She is exceptionally beautiful, with the striking appeal of a top girl-group idol and the cool presence of an independent film actress. She has a small face, broad shoulders, excellent head-to-shoulder proportions, and beautifully cared-for skin.

Her hair is cut into a neat chin-length bob. She wears a jade-green knitted polo, small silver hoop earrings, and a pair of over-ear headphones resting around her neck. Behind her are walnut record shelves, a few displayed album sleeves, and a handwritten recommendation card tucked into a record bin.

The jade-green clothing gives her definition against the walnut surroundings. The shop has ordinary interior lighting: her face is clearly lit, while the shelves retain natural shadows and readable detail. It feels like a favorite local record-store owner taking a moment to tell you which album you should take home.
```

### The record-store shot with a supplied presenter

Imagine the user supplies a portrait of an adult woman with a bob, glasses, and broad shoulders,
and asks to appear in the record-store setup. Her photo supplies identity; the styling and direction develop her into a striking,
music-literate host. The capture language, strong appeal, comfortable framing, and coordinated palette
carry forward. Her glasses become part of that composed presence.

Connect the portrait as the first `gpt:Reference` image. The reference sentence below can live in the
Kit's `references` input; the rest continues to use `shot` and `direction`.

```text
A photograph with the texture of real iPhone footage, captured as a single frame from a video actually shot on an iPhone. The image looks real, without an oily, overprocessed finish, and has the texture of video footage. The background is clearly visible, with no depth-of-field blur. Skin texture is natural and fine, the lighting is natural, and the image is coherent and free of visual artifacts.

Generate a half-body image of the presenter inside an independent record shop in Shanghai. She sits slightly to the right, comfortably near the camera, with her face level and directed toward it. A turntable on a low cabinet enters the lower-left part of the frame beside her chair. Her shoulders and upper body remain clearly visible.

She holds a small handheld microphone while speaking to the camera, her free hand gesturing naturally. She has the effortless confidence of someone who recognizes a record from its first two seconds. She looks exceptionally beautiful and charismatic, with the cool, discerning presence of an independent film actress. Her broad shoulders and excellent head-to-shoulder proportions give her a strong presence in the frame.

Her bob and glasses complement a jade-green knitted polo, small silver hoop earrings, and over-ear headphones resting around her neck. Behind her are walnut record shelves, a few displayed album sleeves, and a handwritten recommendation card tucked into a record bin.

The jade-green clothing gives her definition against the walnut surroundings. The shop has ordinary interior lighting: her face is clearly lit, while the shelves retain natural shadows and readable detail. It feels like a favorite local record-store owner taking a moment to tell you which album you should take home.

Use the person in reference image 1 as the presenter, preserving her recognizable identity.
```

Another supplied person may invite warmer energy, sharper humor, or different styling and colors.
Look at that image and direct its appeal within the target work, using the same image craft.

## Mob Wife: strong glamour in a captured world

![Mob Wife: strong glamour in a captured world](https://hypit.s3.us-east-1.amazonaws.com/assets/skills/hypit/image-direction/v1/mob-wife.webp)

The beauty comparison and "Stay out of my husband's business" give this person a vivid presence.
Fur, layered gold, red lips, and an expensive restaurant reinforce it. Simple material names leave
the model room to render their ordinary surfaces. Red and gold establish the room's atmosphere.
The deep-red nails and dark-brown hair below preserve the production prompt that belongs to this
example. Apply the current palette guidance when directing a new image.

Complete prompt:

```text
A photograph with the texture of real iPhone footage, captured as a single frame from a video actually shot on an iPhone. The image looks real, without an oily, overprocessed finish, and has the texture of video footage. The background is clearly visible, with no depth-of-field blur. Skin texture is natural and fine, the lighting is natural, and the image is coherent and free of visual artifacts.

Generate a close half-body image of a Latina woman in her thirties, seated slightly to the right and near the camera. Keep her body within the frame. Her face is directed straight ahead without any tilt or rotation, and the lower part of her body is visible and unobstructed.

She holds a handheld microphone in one hand and speaks to the camera, while her other hand gestures. Her commanding attitude says, “Stay out of my husband's business.” She is exceptionally beautiful, with the intense beauty of a top Italian actress in her youth. She has broad shoulders, excellent head-to-shoulder proportions, and a larger-than-life presence.

She wears a leopard-print fur coat over a black low-cut top, several chunky gold chains layered around her neck, and large gold hoop earrings. Her long nails are deep red. Her dark-brown hair falls in voluminous waves; she wears classic red lipstick and bold but clean eye makeup. She sits in a leather booth in an expensive-looking Italian restaurant. An oil painting hangs on the wall behind her, a bar is visible farther back, and candles stand on a nearby windowsill.

The restaurant's background palette is mainly red and gold. It feels like an upscale private dining room where a mob wife meets her girlfriends for a meal.
```

## Orange-cat CEO: comic authority through body and setting

![Orange-cat CEO: comic authority through body and setting](https://hypit.s3.us-east-1.amazonaws.com/assets/skills/hypit/image-direction/v1/orange-cat-ceo.webp)

The boss's authority organizes the picture. A round face, large belly, crooked tie, straining suit
buttons, and undersized cat tree make that authority funny. A leather chair, office window, laptop,
and mug establish the workplace; gray and orange establish the palette.

Complete prompt:

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
pearls, coral, and fish establish the underwater world. Sea blue and coral orange give it a color
relationship. The final sentence reaffirms that she appears to be physically sitting underwater.

Complete prompt:

```text
A photograph with the texture of real iPhone footage, captured as a single frame from a video actually shot on an iPhone. The image looks real, without an oily, overprocessed finish, and has the texture of video footage. The background is clearly visible, with no depth-of-field blur. Skin texture is natural and fine, the lighting is natural, and the image is coherent and free of visual artifacts.

Generate a close half-body image of a mermaid seated in the center and near the camera. Keep her body within the frame. Her face is directed straight ahead without any tilt or rotation, and the lower part of her body is visible and unobstructed.

She holds a handheld microphone in one hand and speaks to the camera, while her other hand gestures. She has the curious, friendly presence of an underwater princess, as though she is teaching people on land about ocean life. She is exceptionally beautiful, with the delicate beauty of a mermaid princess, broad shoulders, excellent head-to-shoulder proportions, and graceful upper-body lines.

Scales with a sea-blue gradient are visible on her neck and shoulders, with small fin-like decorations beside her ears. Her long, wet sea-blue-green hair is threaded with a few small shells and pearls. She wears a top made from shells and starfish and a necklace of real pearls. She sits on a coral rock on the seabed. Behind her is an underwater world with colorful coral colonies, a few small fish swimming past, and shafts of light filtering down from the water's surface farther away. A few shells lie scattered on the sandy seabed.

The background palette combines sea blue and coral orange, like a shallow-water coral reef reached by sunlight.

The image looks real, as though this woman is actually sitting underwater.
```
