# Directing generated video

Read this before writing or adapting a video prompt, performance Recipe or action. An image can
establish who and where; generated video brings the Script and visual idea to life through speech,
interaction, camera behavior or silent action.

For creator-led social video, favor an appealing, engaged performance: the speaker responds to what
they are saying and draws someone into the thought. Voice, expression and movement carry that
relationship together. Expressiveness concerns how clearly the attitude comes through; it can be
outgoing or restrained.

## Direct the reason for an action

Give the passage a clear expressive intention, then specify the few details that decide how it
lands. Start with how the speaker regards the subject and relates to the listener: eagerly sharing
a discovery with a friend, weighing an ambitious claim with skeptical interest, or affectionately
roasting something they know well. Such directions suggest voice, expression, posture and rhythm
together. Their value is the performable relationship they contain.

As with [Image direction](image-direction.md#compress-the-idea-into-decisive-anchors), high-level
language should carry sensory direction. The model can realize "admiring but incredulous" across a
whole passage. A pointed emphasis or a revealing gesture can then settle its most consequential
expression. The prompt names the attitude; the performance makes the audience experience it.

For example, alongside a Script that questions a price and ends with an ironic compliment:

```text
She is venting to a friend with affectionate exasperation at how overpriced this is. Give the
price an incredulous emphasis; let the final compliment land with a teasing smile in her voice.
```

The first sentence directs the entire encounter. The details make the price and the ironic turn
read clearly; the remaining phrasing and movement can grow naturally from that attitude. A detail
earns its place when it clarifies a judgment, reveals a response or preserves an important physical
relationship. Attaching a hand movement to every phrase adds choreography without necessarily
strengthening the expression.

Let the thought determine whether the attitude develops or holds: an example may win a skeptical
speaker over, while a firm argument may sustain the same conviction throughout. When adapting a
reference, recover that relationship before selecting movements or vocal details for the new work.

Carry the character, voice and useful physical relationships across Takes while directing the
attitude each passage calls for. The same speaker can invite, question, tease and persuade as the
argument develops. Shared direction can preserve their manner; the passage supplies the particular
response. Stable framing leaves room for changes in face, voice and posture.

## Give restraint an expressive purpose

Seriousness can mean weighing a claim, insisting on a fact or challenging an assumption. A relaxed
person can tease, dismiss or show interest with very little effort. Choose the behavior that conveys
that attitude. A small, deliberate response can carry more conviction than constant movement.

For a serious judgment:

```text
She weighs the claim with skeptical interest. Her brow tightens at the price; she gives the number
a pointed emphasis, then lands her judgment with a small, decisive nod.
```

For a languid response:

```text
He lounges back in the chair, amused that anyone finds this impressive. He draws out the setup
with a sideways glance, then tosses off the verdict in a light, dismissive tone.
```

These are different intentions, not prescribed poses for every serious or relaxed person. Breathing,
blinking and small posture adjustments supply ordinary life; the speaker's response to the content
supplies the performance. Direct that response even when the body stays almost still.

Contrast describes a relationship between things; it leaves the performer's attitude unspecified.
Turn the chosen relationship into something the person can express: "She tries to sound composed,
but cannot quite hide her pride in the result" gives voice and expression a shared direction.
Humor reaches the viewer through the words, situation, response or delivery. A straight-faced
performance can sharpen a clear joke through pointed emphasis or a dry turn of phrase; an unusual
appearance alone does not make an even explanation funny. [Treatment](../../creation/brief.md#treatment-is-the-directors-answer)
owns how the premise becomes a viewer experience; action directs the person's part in creating it.

## Ground actions in the generated scene

The prompt describes what this generation should make visible over time. Give a performer physical
relationships with the camera, people, props and parts of the setting that actually exist in the
generated scene. A Caption, icon, product card or other MG composed later can influence framing, but
it is not an object for the performer to touch, watch or reveal inside the generated video.

Capable video models can turn figurative wording into literal objects, events or transformations. Use
concrete visible language for intended gaze, gesture, movement, camera behavior and cuts when a
metaphor would introduce the wrong scene content. Social attitude and aesthetic shorthand remain
useful when they direct performance; an imagined object or event belongs in the prompt when it should
truly appear in the generated world.

Natural emphatic gestures are usually more reliable than asking fingers to display an exact number.
Let speech, Caption or MG convey the quantity while pointing and hand actions serve the performance.
An encounter also has edges: someone interrupted can first be occupied, and someone finishing can
begin to leave. Small causes make a clip feel like a piece of life rather than a pose bounded by the
encoder.

## Give each input its own responsibility

| Input | Responsibility |
| --- | --- |
| Character-and-scene references | appearance, setting, framing and the physical state to preserve |
| Product, interface or other factual references | the visible facts that need continuity or exactness |
| Recurring voice references | a speaker's intended voice identity when the model accepts them |
| Script dialogue | the exact words, intended pronunciation and speaking turns for a visible performance |
| Prompt Kit or Recipe | a reusable prompt relationship that fits this kind of work |
| Passage direction | attitude, vocal delivery, attention, physical interaction, camera behavior and motivated cuts |

Keep those responsibilities explicit in Source. Prompt prose does not create a media edge, and a
reference does not explain which fact it should preserve. A selected model may accept only some of
these inputs; use its installed vocabulary and package-local documentation for the exact request.

For a visible A-roll performance, the generated video normally carries the person's picture, exact
Script delivery and sound together. Give the request the useful camera image, the recurring Voice
Reference when supported, and the Segment's dialogue.
[Voice direction](voice-direction.md) owns the casting and sample that establish who the person sounds
like. The passage's direction gives that voice its current attitude and delivery.
[Script pronunciation](../../creation/script-and-time.md#write-the-intended-pronunciation) explains
how names and abbreviations receive the intended reading while keeping their display spelling.
Independent speech is a different A-roll construction, described in
[Voice and performance](voice-and-performance.md).

For silent B-roll, direct the visual event and omit speaking identity that the shot does not use. A
listener or reaction shot can remain silent while still breathing, noticing, adjusting posture or
responding through expression. [B-roll](b-roll.md) owns its editorial relationship to the underlying
performance.

## Choose the generation relationship

Generated-video models commonly expose some combination of three relationships:

| Relationship | When it fits |
| --- | --- |
| Text-directed video | The intended world and action do not depend on an existing visual identity, composition or motion reference. |
| First-/last-frame video | The shot must begin or end at a particular authored image. |
| Reference-directed video | Images, video or audio should guide identity, world, voice, motion or camera language without declaring literal endpoints. |

Reference-directed generation is the strong starting point for controlled Hypit production because
useful images can already establish people, scenes, products, composition and visual continuity. The
requested performance then makes that world move. Text-directed or first-/last-frame generation remains
useful when its relationship is genuinely the one the shot needs; a last frame belongs when arriving
at that exact image is part of the intended action.

Model-specific Surfaces and Prompt Kits are implementations of these relationships, not the Craft
itself. Kits produce ordinary Text; Source connects that Text and the actual references to the selected
model request. The current Distribution may provide model-specific Kit packages such as
`@hypit/seedance-kits`; their package documentation owns exact imports, slots, Recipe choices and
reference order. [Prompt Kits](../../production/prompt-kits.md) explains using or authoring a Kit
without making it a model wrapper.

Read the selected template's wording when choosing its Recipe. Composition, camera, edit rhythm,
performance and gesture choices shape different aspects of the footage. Choose them to support the
intended delivery, and use action Text for the passage's particular meaning and reactions.

## Direct camera and cuts as part of the passage

For ordinary direct-to-camera social video, prefer pause-trim jump cuts at phrase boundaries. This
edited rhythm keeps the explanation moving and gives the footage the immediacy of a creator's own
cut-down recording. Stable framing, expressive acting and frequent edits are compatible choices.
Use the selected Kit's documented Recipe choice to express that rhythm.

A podcast can cut with a speaker or toward a meaningful reaction. A street interview can favor the
guest and use the interviewer view for a reaction. An unfolding action or a held reaction may gain
its effect from a continuous shot; choose that temporal shape when it serves the passage.

One generated video can contain multiple shots, several speaking turns or a split-screen composition.
One Segment is not one speaker turn or one camera shot. Conversely, several Takes can reuse the same
character-and-scene image and meet at natural editorial cuts. A genuinely continuous shot calls for
the model relationship and direction that preserve that action. See
[Reference relationships](generated-dependencies.md) when deciding which visual or motion evidence
should condition each request.

A prompt-directed jump cut asks the generator for an edited rhythm; it does not inspect or trim the
returned media. When produced footage needs a deterministic cut, speed change or trim, use the
corresponding media operation and align the edited result before it becomes a SemanticTake.

## Size the request around the delivery

Use `hypit measure` on a spoken Segment at its intended pace, including time for meaningful
interaction, pauses and actions. [Script and time](../../creation/script-and-time.md#measure-before-choosing-durations)
owns the command, rounding and the relationship between estimated duration and real aligned time.
Choose that pace from the intended performance and carry it into the voice and passage direction.
For brisk social delivery with trim cuts, `fast` is a useful starting choice; the name `normal`
does not make it the right rhythm for every piece. A shorter duration gives the words less room,
while the direction still supplies the stresses, attitude and reactions that make them engaging.
Measurement sizes the words; emphasis, attitude and motivated reactions give their delivery character.
The target's delivery determines how much generated media the passage needs; the reference video's
seconds help explain its rhythm without becoming the target duration automatically.

Read the selected video model's supported request lengths from its installed vocabulary. Those values
constrain one generation request without defining the finished work's Segment structure or edited
beats. When the estimate does not fit one request cleanly, reconsider the performable passage: a brief
question and answer may belong together, a short line may gain a meaningful reaction, and a long
exchange may divide where its thought turns. Preserve the intended meaning and energy, then choose a
supported duration.

After production, normalized media supplies the real envelope and alignment supplies word positions.
Use that material and timing to compose the piece. [Composition review](../../production/review.md)
owns judging how Caption, MG, B-roll and other layers work with the produced performance.
