# Directing generated images

Read this when an image must establish a person, place, product, visual world, or useful camera view
for the production. Read `../../creation/transformations.md` when deciding what a supplied
identity or product changes across the work.

## Begin with the world the image must establish

Image generation and reference-conditioned video generation form one directing system. The image
creates a credible person, space, object, composition, and visual language; the video model lets that
world perform, move, and be photographed over time. Choose the audience's first impression as part
of that production purpose: who or what draws attention, what presence it has, and what encounter
the viewer feels invited into. For social-video presenters, actively direct an attractive, distinctive
presence suited to the work. Make the intended appeal as clear as the required framing, whether the
person is invented or supplied by the user.

Generate an image when the work needs to establish or change visible facts. Reuse an existing image
when it already supplies them; some shots can proceed directly to video generation.

For the social-native videos Hypit most often makes, a photographic frame with the texture of real
phone footage is a strong default. Presenter-led UGC, podcasts, street interviews, lifestyle B-roll,
product demonstrations, and many comic or fantastical subjects all benefit from beginning inside a
specific captured world. The Brief, Treatment, or reference work can instead call for illustration,
animation, designed graphics, studio product photography, archival imagery, or another visual form.

Treat photographic credibility as an ordinary production goal. The intended result belongs to the
same visible category as a plausible captured frame, rather than to a separate “AI-looking” category.
Judge the world the image creates. A person, animal, meme character, mermaid, or imagined location can
inhabit the photographic language of recorded footage when its materials, light, camera, and
surroundings behave as if they were physically present.

GPT Image 2 is the usual recommendation for this work. Favor `2K` for a picture that will appear
full-screen or establish a full-screen video shot. `1K` is often sufficient for a smaller inset or
graphic asset. Choose from its eventual visible size, cropping, detail, and cost; another resolution
or model can suit a particular image better.

## Use a concrete capture direction

For social-native photographic work, direct the model toward a recognizable capture process rather
than asking abstractly for “photorealism” or “high quality.” The phone-video capture direction
describes the result as one frame cut from video actually shot on an iPhone: real without an oily,
overprocessed finish, carrying video texture, with readable background,
fine skin and material texture, natural-looking lighting, and an intact image.

Actual GPT Image 2 generations show that the complete wording repeatedly moves results toward the
visible character of ordinary phone-video frames. Preserve it as tested model-specific direction,
without turning an inference about the model's learned visual associations into a claim about its
undisclosed training data. Another model or visual form calls for evidence from its own results.

The direction combines a familiar social-video camera language, believable surfaces, and enough
background information to establish a real place that can continue into a moving shot. Choose the
subject's styling and the way the camera records it separately: a glamorous, carefully dressed person
can appear in casually recorded phone footage. Extraordinary beauty or fantastical subject matter
can still inhabit this captured visual world.

The capture language describes how the picture looks, not a prop that must appear in it. Add a
specific material or lighting direction when the shot needs that fact.

When the model exposes aspect ratio, resolution, or output dimensions as request parameters, treat
those parameters as their authority. Numeric ratios and resolution labels usually need no repetition
in the descriptive prompt. Keep directional camera or orientation language when it materially clarifies
composition, then spend the remaining attention on the actual shot: camera distance, subject placement,
what remains visible, and how the subject relates to the setting. The model package owns the exact
parameter names and supported values.

For this capture language, import `@hypit/gpt-image-kits/phone-ugc-v1`. Its fixed
English capture paragraph preserves the production method, while `shot` and `direction` carry the
current image and optional `references` text explains the connected media. The Source export enters
the production's Source Closure directly:

```svml
<import as="text" from="@hypit/text@1"/>
<import as="ugc" source="@hypit/gpt-image-kits/phone-ugc-v1"/>

<text:Render id="portrait-prompt" template={ugc.phone-ugc-v1}>
  <text:Set name="shot" text={portrait-shot}/>
  <text:Set name="direction" text={portrait-direction}/>
  <text:Set name="references" text={portrait-references}/>
</text:Render>
```

`shot` and `direction` are required; omit the `references` Set when no media reference is connected.
The resulting `{portrait-prompt}` is ordinary Text. Pass it to the selected image Surface and connect
the actual reference images there as explicit graph inputs; explaining a reference in Text does not
create that media edge.

[Image direction examples](examples/image-direction.md) pairs the record-store portrait with its
English production prompt and observations of the result, alongside three supplied case images with
faithful English translations of their production prompts. Use these when the capture language,
aesthetic specificity, or relationship between character and scene choices is unfamiliar. Each case
identifies what its evidence covers.

Within one production, use a prompt language the selected model handles well and keep reusable capture
wording consistent.
Preserve aesthetic force, social meaning and specific facts when translating: confident praise, a
familiar cultural type and a vivid attitude retain their full strength. Keep dialogue, visible text,
names and other literal wording in the language the work requires.

## Direct a person from identity and presence

Begin with the kind of person the audience should recognize, the role they play, and the presence
they bring to camera. A social archetype, subculture, profession, attitude, or compact piece of
character language can coordinate face, styling, posture, environment, and props more effectively
than an inventory of facial measurements.

When on-camera attraction, charisma, beauty, handsomeness, strength, cuteness, awkwardness, age, or
comic authority matters, state it directly and with conviction. A direction such as “exceptionally
beautiful, with the presence of a top Korean girl-group idol,” “the striking beauty and commanding
presence of a leading Italian film actress,”
or “a round orange cat with effortless CEO authority” gives the model an overall aesthetic target.
Support it with a few visible anchors that distinguish this character. Let millimeter-level anatomy
remain subordinate to the intended person and the camera image.

Photographic credibility can coexist with exceptional beauty, precise makeup, excellent skin and
strong styling. Preserve the requested appeal; natural texture describes how the captured surface
reads, while the person remains as polished, attractive or distinctive as the direction requires.

For the attractive, invented presenters in this photographic style, explicitly direct **broad
shoulders and excellent head-to-shoulder proportions**. Overly narrow, pinched shoulders beneath a
disproportionately large head can make a generated half-body portrait feel flimsy or doll-like even
when the face is convincing. This is a useful whole-figure direction, alongside strong beauty or
handsomeness, rather than a request for anatomical measurements. Preserve the actual physique of a
supplied person and any different body type intentionally chosen for the character.

Express the intended appeal in the character's own terms:

- For an appealing older character, state distinguished beauty or handsomeness, vitality, and the
  presence of someone who was strikingly good-looking in youth. Age remains part of the person.
- For an animal, choose the imposing, cute, or comic presence the role needs. A lustrous coat and
  handsome proportions can serve a majestic animal; the orange-cat CEO's round face, large belly,
  straining suit, and undersized cat tree give its authority a comic form.
- For a recognizable Meme character, preserve its defining features, silhouette, and proportions.
  Express appeal within that character's visual identity while giving it the requested capture language.

Use wardrobe, grooming, jewelry, makeup, silhouette, and memorable details to reinforce
the same identity. They should belong to one person rather than read as unrelated fashionable items.
A beauty comparison can establish the strength of the appeal and another phrase its particular
character; a role-specific disposition makes that person socially present. In the
[record-store example](examples/image-direction.md#shanghai-record-store-owner-one-coherent-person),
idol-level beauty, an independent film actress's cool presence, and effortless musical expertise
describe compatible qualities of one woman. The bob, knitted polo, headphones, and shop then give
that casting idea visible form. The transferable choice is this coherence: another person may need
different beauty language, styling, and surroundings, without acquiring a fixed number of comparisons
or a required idol-and-actress formula.

When the user supplies the person, pet, product, or character they want, look at the image and use it
as the identity reference. "Use the person in reference image 1 as the presenter" can be enough to
establish that relationship. The full capture direction, attraction, framing, proportions, setting,
and palette still do their work. Keep the aesthetic direction confident and specific to this subject.

Notice what can make this person compelling in the intended shot: their hair, styling, silhouette,
or expression may suggest a particular presence. Develop that appeal through the image's wardrobe,
light, color, and vibe, keeping the supplied identity recognizable. Choose which of the photo's
other details belong in the new scene. The [supplied-presenter variation](examples/image-direction.md#the-record-store-shot-with-a-supplied-presenter)
shows how much of a complete prompt can carry forward with that change.

## Let the setting belong to the subject

A useful camera image normally creates the person and their setting together. The setting is not an
empty plate waiting for a subject to be inserted. It reveals who this person is, what they are doing,
and what kind of video the audience believes they are watching.

Choose a small number of details that carry that relationship: condensation on an iced latte in a
Korean-style café, a product diagram on a startup whiteboard, a cat tree that is visibly too small for
an orange-cat CEO, drying flowers on a textured wall, or worn candles inside a real stone chapel.
Favor details that connect choices across the image. The record-store owner's turntable belongs to
her work and gives her rightward placement a spatial reason; a handwritten recommendation card
expresses how she runs the shop. Make the details that define this person, place, and shot explicit,
then leave incidental particulars open for the model to resolve within that direction.

Give the scene a relationship to its viewer when that relationship matters: the owner is taking a
moment to recommend an album to you. A compact line like this conveys ease, expertise, and personal
attention without prescribing a smile or a precise gesture. After describing the visible details,
a closing vibe sentence can bring the whole image back to the intended encounter or atmosphere,
rather than repeating a list of props or adding unrelated style adjectives.

Describe the setting from the camera view that will actually be used. Another useful angle can grow
from that image while showing the naturally different part of the same place. The work needs camera
images that do a real job. An independent location image is useful when the work needs that location
on its own; otherwise the actual camera view can establish both the person and the place.

Across related views, distinguish the shared world from what this camera sees. The shared world can
carry a warm dessert-shop atmosphere, natural afternoon light, textured materials and the social
relationship between two hosts. One view may see the window and table while the reverse view sees the
counter and another group of ordinary objects. The background then feels continuous without becoming
a copied backdrop. In a short drama, the same judgment lets a location carry character, mood and plot
while each useful camera image remains authored for its own view.

Write fluent natural-language direction, with exact props and relationships singular and clear.
Separate mutually exclusive visual states into the images the work needs. Preserve dominant facts
across related images, including the chosen capture language on derived views: an identity reference
and a capture direction do different jobs.

## Frame the image for what it will become

A camera image can establish identity, space, composition, and capture language together. A portrait
used only for identity or a product reference used only for geometry does not also dictate camera
position, pose, or setting. State which facts the downstream shot should inherit. A reference is not
necessarily its literal first frame; exact endpoint control is a separate shot decision.

For recurring presenter images, favor a sustainable presence: relaxed confidence, attentive curiosity,
or effortless authority. This is the useful idle principle. Give the video room to perform the line,
gesture, or emotional change instead of fixing the person in a blink, peak grimace, or contorted pose.
Describe a disposition, such as warmth or a compelling gaze, instead of choreographing a raised
eyebrow, narrowed eyes, a grin, a head tilt, or a precise hand gesture. For these reusable speaking
images, “speaking to the camera, with the free hand gesturing naturally” gives enough direction.
Idle retains the character's emotional presence while leaving the later performance room to change.

For a presenter image, that may be a clear face, readable upper body, handheld microphone, natural
gaze, and a posture with room for gesture. For a podcast reverse view, eye line and microphone entry
matter more than front-facing symmetry. A selfie needs a physically credible phone-camera
relationship. A product-use image needs the hands, product, and contact geometry that the action will
continue from. B-roll may begin with a more specific action because the visual event itself carries
the passage.

For a reusable presenter image, a half-body view can place the person modestly near the camera, with
the face level and directed straight ahead, a handheld microphone, and clear shoulders and arms.
Direct distance and proportions together: “She sits slightly nearer the camera in a comfortable
half-body composition, with broad shoulders and excellent head-to-shoulder proportions.” The face
should be readable while the shoulders and upper body still establish the person. Repeatedly
intensifying “close” can instead favor a face-dominated crop. Asking to keep the body in frame means
preserving the intended visible silhouette, not widening the shot until the whole body fits.

Choose left, center, or right placement from the scene and the eventual composition. A slight offset
can give the image a casually captured quality, but it should have a spatial reason. A small table
entering the lower-left corner can balance a person on the right; a chair or thighs angled toward
the left can establish the same relationship through posture. Describe where the person sits in the
place, rather than merely moving a centered portrait toward an edge. The balancing area remains a
real part of the setting, with its own objects and texture.

Use seat and leg details when they explain that relationship. A brief direction such as “her thighs
angle toward the table on her left” can be useful; a catalog of shoes or clothing outside the intended
crop can compete with the framing. A foreground table, visible feet or lower-body detail belongs when
it serves the scene and leaves the face, microphone and important gesture area readable.

Apply that speaking-reference solution when the work has the same need. A side-on conversation,
product action, or full-body shot needs its own gaze, hand occupancy, contact, and composition.
A specific starting action is useful when the shot is actually about that action.

Compose for the final stack. A Ranking icon on the left can call for a presenter toward the right;
the same person may remain on that side across every related shot. Keep the face, microphone, and
useful gesture area clear of the overlay's actual footprint and movement. A lower-left table can
balance the shot while leaving an upper-left icon area available. Position and scale depend on the
work, not a fixed left/right alternation or a universal percentage.

Translate that layout into visible image direction: describe subject placement and usable background
space. Author the MG separately in its component; mentioning a future icon is not a request to paint
it into the source image. Carry the intended spatial relationship into the downstream performance.
If Caption follows a face, leave usable space around the head. If a board covers the lower frame,
place the performer in the region that remains visible. If a product or screen must be read, give
it enough scale and a credible relationship to the person.

## Make imagined subjects physically present

Fictional content does not imply an illustrated or computer-generated finish. Place the extraordinary
subject inside an ordinary physical camera world. The mermaid prompt establishes wet hair, shells,
real pearls, coral, fish, light entering the water, and shells scattered on the sandy seabed. These
specific states and surroundings make the intended world concrete.

Describe the fantastical facts positively and give the physical directions the scene needs. Familiar
material names and a few decisive states can be sufficient; explicit grain, reflection, wear, and
contact instructions belong where they resolve an actual ambiguity or serve the shot. The result can
remain strange, funny, or impossible while feeling as though somebody pointed a phone at it.

For this photographic fantasy method, finish by reaffirming the subject's physical presence in the
specific place: “The image looks real, as though this woman is actually sitting underwater.” This
repeats the intended reading of the whole image after its fantastical details.

## Direct color through material and atmosphere

Compose the palette across the whole frame. Consider the visible area and relative lightness of
skin, hair, clothing, furniture, and background together. Decide where the person should separate
from the setting, which colors belong together, and where the eye should settle. Material texture
alone cannot give a poorly coordinated palette a clear subject or believable tonal depth.

In one portrait, a cream knit against a white background made the image feel too bright and washed
out; navy clothing gave the person definition against the light surroundings. This is a relationship
between wardrobe and setting, not a rule against cream or white. For an intentionally pale, luminous
image, direct the tonal separation, skin color,
surface variation, and lighting that keep it convincing. When exact wardrobe or brand colors are
fixed, make the adjustable surroundings work with them.

For these character portraits, two anchor colors can establish a compact palette that supports the
overall atmosphere. Let incidental colors belong to that whole; this does not require every object
to use exactly one of two colors.

Then name useful hues and materials. Coral fabric, charcoal wood paneling, weathered brass, or cream
plaster carries color together with physical response. A few relevant material cues support the
overall direction; every surface does not need its own grain, seam, defect, or texture instruction.

In palette descriptions, name hues without casually adding brightness modifiers such as “bright,”
“dark,” “deep,” or “light.” These words can steer the whole image's lighting when only a color was
intended. Describe the wanted lighting separately.

For white or black areas whose exact color is not essential, prefer a light- or dark-toned material
with visible surface variation. This is a deliberate alternative to an extreme black/white field,
not a reason to attach brightness modifiers to every hue. When exact black or white is required,
keep it and use a concise material or texture cue to give the area visible variation.

| Palette shorthand to improve | A material-led direction |
| --- | --- |
| deep purple and pure black | purple fabric and charcoal wood panels |
| cream clothing against an extensive white background, when it washes out the intended image | give the subject definition through wardrobe and background together, such as a navy knit against light plaster |
| a pure white wall | light-toned textured plaster |
| a required black jacket | black leather with visible grain |

These examples teach authored choices, not automatic word substitutions. Exact product, wardrobe,
makeup, and brand facts remain exact. Preserve the actual wording when documenting an existing result;
apply the current palette judgment when directing a new image. Surface detail supports the image;
avoid turning the correction into an inventory of defects or a demand for roughness.

When an image feels washed out or its color balance feels wrong, identify what is visible: large pale
areas merging, missing highlight detail, flattened skin color, or a color cast. These observations
point to different adjustments; an overly pale palette alone does not establish a white-balance
fault. Keep wardrobe and set design, exposure and lighting, and color balance distinct in the
diagnosis, then make them serve the same image.

Light belongs to the same physical description. State the source and broad relationship that matter:
soft window light from camera left, ordinary overhead office light, overcast street light, or warm
lamps within the room. Let texture and small irregularities survive. The goal is not to make every
image dark, flat, or underproduced; it is to make polish arise from a believable captured world.

“The lighting is natural” means the light belongs convincingly to the scene. It can come from
daylight, room fixtures, or the practical lights of a night location. Give the face the exposure it
needs while letting the setting retain its own readable detail, shadows, materials, and tonal depth.
Choose wardrobe, surroundings, and light as one relationship so a polished, beautiful subject still
feels physically present in that place.

## Give references clear responsibilities

Use references when the image needs a fact that public visual knowledge or prose cannot reliably own,
or when exactness itself matters: the user's identity, a private or obscure product, a particular
current logo, proprietary UI, or a camera image already used by the work. A familiar public icon,
person, meme, object or place can be generated directly when recognizable visual meaning is enough.
State what each reference contributes and what the new image may change. Choose it because it owns a
needed fact, not merely because it was generated most recently. A new view can inherit the same room
while showing a different arrangement of its objects in the frame.

Keep the relationship shallow and useful. The first actual A-roll camera image often establishes the
person, setting, camera culture, and art direction together. Another A-roll view can use it to retain
the person and world while changing eye line and camera position. A B-roll image can share the person
or product when continuity matters. One useful image can constrain several later images and Takes.

The Source owns the exact Resource edges. The Treatment explains why this work preserves or changes
the relationship. Model documentation owns reference count, media support, aspect, resolution, and
other request limits.

[Conversation image examples](examples/conversation-images.md) show this distinction in complete
podcast and interview directions: a complementary host view, product-holding variations, independent
lifestyle scenes and two close views derived from one shared encounter. Use
[Reference relationships](generated-dependencies.md) when deciding which parent each image needs.

## Judge visible causes, not provenance

Look at the generated image as the intended audience will see it and as the downstream video model
will use it. Consider whether the intended appeal and personality actually come through, whether
the subject draws attention within the whole frame, and whether the image supports the next shot.
Name the visible cause of a weak result:

| Visible result | Revisit |
| --- | --- |
| an interchangeable polished face | the character's role, presence, and aesthetic direction |
| an oversized-looking head above pinched shoulders | shoulder breadth, head-to-shoulder proportions, and the camera framing |
| a beauty campaign instead of social footage | the capture direction, light, texture, and camera relationship |
| an empty showroom or decorative collage | the few setting details that reveal the subject's world |
| flat dark or light regions | material, surface variation, palette, and local lighting |
| a pale subject merging into a pale setting, or an overall washed-out image | the relative lightness and visible area of clothing and background, skin color, and exposure |
| implausible hands, gaze, microphone, phone, or product contact | the physical relationship and framing |
| identity, product, or room drift across useful views | the selected reference and its stated responsibility |
| a strong still that cannot support the intended motion or overlays | the shot's downstream role and performable state |

Authorized image outputs continue downstream through the relationships declared in Source. When
looking at an existing image or Result, use this table to diagnose the visible problem. If a result
cannot serve the user's goal, identify the owning direction or reference decision. Additional paid
generation is an explicit production decision under `../../production/authoring.md` and the user's
spending authority. Build quality into the direction and reuse produced media during deterministic
refinement.
