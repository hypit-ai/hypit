# Directing generated video

Read this before writing or adapting a video prompt, performance Recipe or action. An image can
establish who and where; generated video brings the Script and visual idea to life through speech,
interaction, camera behavior or silent action.

For creator-led social video, favor an engaged, expressive performance that draws the viewer into
what is being said. Give personality and humor an audible or visible expression: a revealing choice
of emphasis, an amused reaction, a turn in attitude or a payoff in the delivery. Let the audience
experience the idea through the performed words and actions.

## Direct the reason for an action

Start with the social situation and attitude: affectionate ridicule, candid surprise, playful
skepticism, delighted conviction or another relationship the audience can recognize. Write a short
passage direction around that attitude and the few reactions through which it develops. An eager
lean, an incredulous look, a knowing shrug or a sudden smile can make the spoken idea tangible.

Let the meaning motivate the change: a claim invites skepticism, an example wins the speaker over,
or a final judgment lands with confidence. A description such as "funny" or "ironic" becomes useful
direction when the words, expression or timing give the viewer something to recognize. Choose the
decisive beats and let the model perform the connecting behavior naturally.

For example, alongside a Script that moves from a claim through a demonstration to a verdict:

```text
The host is eager to show a friend why this works. Give the bold claim a playfully skeptical look,
brighten as the example proves it, then land the verdict with delighted certainty and a knowing nod.
```

Carry the character, voice and useful physical relationships across Takes while directing the
attitude each passage calls for. The same speaker can invite, question, tease and persuade as the
argument develops. Stable framing leaves room for these changes in face, voice and posture.

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
| Passage direction | attitude, attention, physical interaction, camera behavior and motivated cuts |

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
