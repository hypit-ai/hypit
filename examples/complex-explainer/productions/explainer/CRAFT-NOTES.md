# Lessons from the explainer

Read alongside the [finished work and project guide](../../README.md) and [Treatment](TREATMENT.md).
This is a retrospective of the decisions behind one complex spoken explainer. The useful inheritance
is how a visual problem was understood and given an owner; its pink treatment, scene inventory and
production settings are choices for this work.

## Understand behavior beyond the inventory

Early descriptions could identify a presenter, cards, diagrams and a countdown without explaining
what made them effective. A card that first establishes an alternative and then remains below a
demonstration is doing a different job from a fresh title card at every sentence. A drag attempt
needs contact, displacement and rejection to communicate failure; naming the objects does not
specify that experience.

Looking more closely at the reference's transitions changed the reading of its larger structure.
Reading the speech alongside those frames made it possible to name what each change answered.
The lesson is to move continuously between the argument and its realization, examining the interval
that resolves the current question and explaining the growing understanding to the user. The public
example retains the target design and sources; it does not distribute the reference creator's footage
or the private review conversation.

## Organize responsibility before exposing controls

A component is a useful owner of related behavior. Parameterization is a separate choice about what the author should vary; cross-project reuse is another choice about a demonstrated future need. The editor demonstration is one coherent scene because its folder, pointer and timeline respond to each other. Its exact pixel dimensions can remain internal. The background, Caption and presenter have independent reasons to change and deserve independent ownership.

The initial implementation accumulated large scene strings and repeated decisions, making revisions
hard to locate. The useful cleanup separated scene content, styles and frame evaluation into ordinary
modules, with shared mechanics kept in shared dependencies. It did not turn every illustrated button
into an independent Track or expose an entire editor's geometry as author controls. A file boundary,
a package boundary and a visible Track can serve different purposes.

See the [scene map](../../packages/web-scenes/README.md). Each scene can keep a designed internal
layout while accepting the material and semantic events the work really changes. The separate
[visual-language package](../../packages/visual-language/README.md) shares palette values without
declaring any visible contribution.

## Give changes meaningful event names

The Script identifies the phrase that motivates a change. A scene receives events such as “install”, “examples” or “guess”; its code turns those events into local motion. Direct time and frame counts remain useful for transition duration, silent endings and fast montages. This lets timing move with accepted performance without rewriting every animation timestamp.

For one concrete trace, [Script](authors/script.svml) places `road-fail` at the spoken claim that motion
is difficult. [Main Source](authors/main.svml) connects that meaning to the editor scene:

```svml
<webscene:Beat name="fail" at={moment-road-fail-cue}/>
```

The scene receives the named absolute event and reads its frame. Its
[animation](../../packages/web-scenes/src/scenes/editor-route/animation.js) derives the attempted
drag and return from that frame, sharing the object's displacement with the pointer. `fail` is this
component's vocabulary, not a special event known to Hypit. Moving the spoken anchor changes when
the event happens; changing the animation changes how it feels.

This also explains why one generated clip need not equal one scene. The editor develops across several spoken
passages, while a single passage can trigger several states. Keep the temporal cause separate from
the scope of the objects that respond to it.

## Keep playing footage distinct from its frame

The same accepted presenter footage appears full-frame, in a circular inset and through a moving
viewport. The short return to the inset on “我们继续” is another visual occurrence of the existing
media. The camera presentation changes while the source playback continues. The
[opening system](../../packages/opening-system/README.md) owns these Styles; Main Source owns where
they are used. Foreground and enlarged background presentations likewise share the same media sample.

Covering the presenter with MG does not require producing a new audio-only performance: the voice remains
connected separately. The opening montage and silent ending occupy authored Timeline space outside
spoken coverage. They do not need fake empty media. An actual acted drinking passage is different:
it has performed material whose actions and eventual words belong to that clip.

## Material quality starts in direction

Voice reference, Script and Action establish the intended performance. Useful direction describes an attitude the audience can hear and see, supported by a few decisive expressions or gestures. A generated actor’s request should describe the actual performance; a metaphor about graphics flying into frame belongs in component direction. Composition review then improves framing, Caption, coverage and event timing around accepted materials.

The voice and Script changed during this production. A more representative language sample and
durations suited to the intended delivery addressed a different problem from graphic timing. A
requested line or performance change needs new accepted material; moving a card or changing a crop
can reuse the current material. Preserve that distinction so composition iteration does not become
unnecessary regeneration. The retained [direction](authors/direction.svml) and
[performance Recipe](recipes/performance.svs) show what was actually requested.

## Preserve complete visual systems when changing style

Removing redundant text does not remove the need for visual detail. When the treatment changed to pink retro graphics, folder contents, editor controls and terminal activity still had to fill their roles. A shared palette made coherent updates possible; local scene code retained the details that explained each idea.

The change from a glossy technical look to the accepted pink treatment required more than a color
replacement: edges, offset shadows, type, texture and motion all contributed to its character. The
flag's complex continuous shading became a small stepped raster animation. That was a better
expression of the chosen style, not a universal argument against 3D. Judge implementation effort
by what it contributes to the visible work.

Website passages use actual recordings where page details and scrolling matter. The editor, token
counters and comparison transformations are authored illustrations. Separating those roles kept
recorded evidence reusable while letting component behavior remain editable. Their precise status
is documented in [asset provenance](ASSET-PROVENANCE.md).

## Write motion that can be sought directly

A pointer follows an eased path; a rejected drag shares the picture’s spring displacement; typing derives its visible tail from time. None requires playback of all preceding frames. This makes exact-frame review and range rendering normal operations. A low-resolution Canvas flag was a better match for the chosen pixel language than preserving an elaborate cloth simulation.

The hold matters as much as the entrance. A terminal should continue visibly working while that is
the subject of the narration; a board can settle and remain as context. An event's lifetime and the
duration of its entrance are different decisions. Review the state before, during and after a handoff
alongside the independent presenter and Caption, where collisions or unintended gaps become visible.

## Use Studio to discuss intentions

Many valuable comments describe a new visual idea, not a number a user can edit. Time-stamped comments kept that discussion attached to the picture. Companions expose only useful identifiers, timing and directing controls, through Studio’s common interfaces. A coordinated scene does not need controls for every internal measurement.

Changing the flag's motion language or the whole treatment called for interpretation and source
edits. Adjusting Caption position and color could use existing controls. Both are useful forms of
review. A comment's time identifies the visible symptom; a correction to a shared style may apply
throughout the film. Browser review made these decisions available without repeatedly exporting
the entire video. The portable example starts without the production's private comments.

## Preserve accepted outputs and readable authoring

Project assets and direct consumer references express which accepted material the composition uses. Build execution handles only the remaining work selected by the current Target list. Keep explicit Output boundaries where independently useful material should be targeted; separate Script and direction without hiding those boundaries. Archive obsolete experiments so the active entry is evident. Keep CSS and frame programs readable rather than compressing a complete scene into a single enormous string.

## Export for the machine actually available

The full film temporarily exceeded local disk capacity while lossless frames accumulated. Consecutive range renders bounded temporary storage; eight workers handled each range and the output parts were joined. This is a production workaround for this machine, not a requirement for every video or a new rendering abstraction.

## Carry the reasoning into another work

Trace a revision to the fact it changes: the material, its placed time, a semantic event, the
presentation, a scene's behavior or a shared design decision. That gives the next edit a useful owner.
Copy a component when its relationship fits; adapt or author one when the new work asks for a different
relationship. The example is useful even when none of its finished scenes should be reused verbatim.

General production guidance lives in the
[presenter-led visual explainer playbook](https://github.com/hypit-ai/hypit/blob/main/skills/hypit/references/playbooks/formats/presenter-led-explainer.md)
and its linked crafts. These notes preserve the concrete reasoning behind this work rather than
making its production history a required workflow.
