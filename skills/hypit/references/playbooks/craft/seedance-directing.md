# Directing generated performance

Read this when turning useful visual references and Script into living speech, interaction or
silent action. The image establishes who and where; motion makes something happen to them.

## Give each input its own responsibility

| Input | Responsibility |
| --- | --- |
| Character-and-scene references | appearance, setting, framing and the physical state to preserve |
| Recurring voice references | the intended speaker's voice identity |
| Script dialogue projection | the exact words and speaking turns |
| Kit Recipe | recurring camera, edit, pace and performance choices |
| Action direction | this passage's attitude, attention, physical interaction and motivated cuts |

The `@hypit/seedance-kits` README owns template assembly and reference order. The exact model module
owns invocation modes, duration and media limits. Kits produce ordinary Text; the Source connects
that Text and explicit references to a model request. Action does not secretly add those references.

Use the Script's `.dialogue` Text rather than retyping dialogue into action. Map Role names to the
Kit's A/B identities where necessary. Preserve one recurring voice reference per character when
voice continuity matters. See [Voice and performance](voice-and-performance.md) for A-roll versus
genuinely independent narration.

## Direct the reason for a gesture

Start with the social situation and attitude: affectionate ridicule, candid surprise, dry confidence,
playful skepticism. Then choose a few visible actions that communicate it. A restrained lean, an
open-palmed explanation, a knowing shrug or a short glance can carry more than elaborate choreography.
Vibe alone may leave an important interaction unspecified; describe the decisive action when the
story needs a handoff, a look toward a partner or an exit.

Natural emphatic gestures are usually more reliable than asking fingers to display an exact number.
Let speech, Caption or MG convey the quantity while pointing and hand actions serve the performance.

Silence still has behavior. A listener can settle in the chair, notice the object, glance down and
look back up, breathe or smile while keeping their mouth out of the speaking performance. Pick small
actions that follow the exchange.

An encounter also has edges. Someone being interrupted can first be busy; someone finishing can
begin to leave. Those small causes make the clip feel like a piece of life rather than a pose that
starts and stops at the encoder's boundaries.

## Choose cuts as part of the performance

UGC can benefit from pause-trim jump cuts. A podcast can cut with the speaker or toward a meaningful
reaction. A street interview can favor the guest and use the interviewer close view for surprise.
Stable camera framing, expressive acting and frequent edits are compatible choices.

One Take can contain multiple shots, several speaking turns or a split-screen composition. One
Segment is not one speaker turn or one camera shot. Conversely, several UGC Takes can use the same
character-and-scene image and meet at natural editorial cuts. A genuinely continuous shot calls for
the model mode and direction that preserve that action. See [Reference relationships](generated-dependencies.md).

The Speaker Kit's `pause-trim-jump-cuts` requests an edited rhythm from the model. It does not inspect
or trim the returned media. If a produced pause actually needs editing, use an explicit media
operation and align the resulting edited media; a prompt choice is not a deterministic postprocess.

## Size the request around the delivery

Use `hypit measure` on the adopted Segment before writing its duration. Estimate the desired pace,
then account for the interaction and any intentional pause. Check the selected model's actual range
with `hypit vocabulary @hypit/seedance`; Mini in these examples accepts 4–15 whole seconds. This is
a bound on those requests, not on all video models or the finished video's duration.

If a passage is too dense, tighten it or divide it at a natural stage. Avoid filling the maximum
duration merely because it is available. A short question, an answer with a reaction, and a payoff
can have different lengths. After production, use actual normalized media and alignment for time;
the estimate never supplies the final word anchors.

Watch the result for the decisions that matter: engaged performance, correct speaking identity,
legible interaction, intentional cuts and the right degree of energy. Correct words alone do not
establish that the scene works. Continue the authorized production and revise a visible problem at
its owner.
