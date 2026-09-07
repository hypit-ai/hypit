# B-roll and semantic coverage

B-roll adds evidence, association, humor or another view over the passage that carries the speech.
It can be a photograph, an illustration, a screenshot, generated motion or existing footage.
Choose the material for what the viewer needs to understand, not from a rule that every noun needs
its own video generation. Keep the speaking performance's sound when covering its picture.

## Let people live inside B-roll

B-roll is defined by what the picture contributes, not by whether a person appears in it. Creator-led
social video commonly covers a speaking performance with the same person's life: working, studying,
driving, exercising, travelling, using a product or reacting inside another situation. These shots can
make the work feel inhabited and socially credible while remaining B-roll.

A person visible while words are heard is not by itself evidence that the pictured clip produced those
words. Read the whole passage: the picture may be a silent lifestyle action covering audio from the
underlying A-roll, or it may be another visible speaking performance whose own delivery carries the
line. Preserve those as separate sound and picture relationships. [Voice and performance](voice-and-performance.md)
owns the choice of speech source.

## Decide how closely the pictures follow the words

**Exact correspondence** is useful when the reference or explanation depends on a particular image
being present for a particular claim. Give each scene a Selection and its own media input. A short
window can play just the needed beginning or authored source trim of a longer generated clip.
The selected model's minimum generation length does not set a minimum display length.

**A montage over a thought** is useful when several scenes collectively communicate a habit, history
or attitude. Several lifestyle images can feed one short B-roll request whose direction owns their
scene order, while the result covers one broader Selection. Each noun need not land
on a cut for the idea to read. This trades precise correspondence for a compact, lively sequence;
it is not a substitute when reconstruction requires the original's exact correspondence.

The B-roll Kit's `story` Text directs scene order and a few meaningful actions. Select compatible
edit choices for that story. A multi-scene montage with cuts should not also ask for one uninterrupted
shot; if each scene should be continuous internally, say that explicitly. Keep motion understated
when posture, context and a small action already communicate the event.

## Distinguish generated length, source sampling and display window

A Selection determines where an Item is active in the program. Its Recipe determines which source
frames it samples there. They are separate decisions. `@hypit/media-track` owns exact playback and
trim syntax; moving inputs are explicitly normalized before entering the Track.

For the natural moving coverage discussed here, prefer one native-speed pass: `playback: once-start`.
Give a montage enough room to finish when all its scenes matter. A Selection slightly longer than
the actual clip is fine when returning to the underlying picture at the clip's end is intended.
A shorter Selection deliberately cuts the clip off. Do not fill the extra time with a frozen tail,
repetition or automatic retiming merely to occupy every frame of that Selection.

- `once-start` plays from the beginning at native speed. A shorter window cuts the source off; a
  longer window outlasts the material and can reveal what lies beneath.
- `stretch` retimes the selected source range across the whole window. A shorter window compresses
  all scenes; a longer one slows them. Very brief scenes may read as a flash even if sampled.
- `hold-start` plays once, then freezes the last frame if the Window is longer. This frozen tail is
  usually distracting in natural lifestyle coverage. Hold, loop and stretch belong to an explicitly
  intended freeze, repetition or retiming effect, rather than the default treatment of these clips.
- A durationless still has no playback or source trim. Its Item's window determines its presence;
  authored spatial motion can move it without pretending it is generated video.

For example, take a five-second montage whose last scene starts at 3.5 seconds. If a window lasts
three seconds, `once-start` never reaches that scene. A 5.2-second Window permits the entire clip to
play at native speed, including the last scene's 1.5 seconds. For the remaining 0.2 seconds the clip
no longer covers the picture beneath; it does not hold its last frame. These numbers illustrate
the relationship, not a required montage duration or a fixed amount of extra room.

## Let picture and speech hand over at different moments

A montage can stay up after its subject finishes speaking. A partner can start responding while the
last lifestyle picture is still visible, with their camera returning later. This incoming voice
before its picture forms a J-cut relationship and gives the montage room.
The B-roll does not need to contain that speech: the speaking Track's audio already continues beneath.

Choose the endpoint by the thought, reaction and visual reading time. Extending coverage across a
Role turn is legal; a Selection can also cross a Segment boundary. Avoid cutting the final scene
short just to make the visual endpoint coincide with the original speaker's last word.

## Join adjacent coverage on the same boundary

For separate clips that should cover a passage without briefly exposing the A-roll, both sides of
each shared boundary must select the same instant. Default markers close on the previous word's end
and open on the next word's start, leaving their intervening pause uncovered.

```text
@coffee my coffee @/coffee ~@smoothie my smoothie @/smoothie
```

Here both sides meet at the end of “coffee”; the smoothie picture owns the pause. Alternatively:

```text
@coffee my coffee @/coffee~ @smoothie my smoothie @/smoothie
```

Both sides now meet at the start of the next “my”; the coffee picture owns the pause. Keep both
sides left-affine or both right-affine at each join. `||` may also sit between those phrases, but it
only authors Caption grouping and cannot close a visual gap. [Script and semantic time](../../creation/script-and-time.md#bind-meaning-to-script-identities)
contains the complete marker grammar.

These joins handle internal pauses. If coverage must also include lead-in or trailing silence,
choose outer boundaries that cover those edges through the Track's actual timing vocabulary.
Inspect media exhaustion, fades and component visibility too: touching windows alone cannot make
an exhausted or transparent visual cover the frame. See [Frame coverage](frame-coverage.md).

## When the pictures carry the whole passage

The same media tools can form a music-led montage or a tactile process film with no underlying
speaking picture. Then the images are the main sequence rather than coverage. Choose cuts from the
visual argument, musical phrase or physical action; a fixed hook/detail/CTA shot count is not a
requirement. Adjacent images should earn their change through a new view, information, attitude or
rhythm. A closer crop can be a meaningful beat when it reveals something the wider shot did not.

For quiet material or ASMR-like work, the contact point, texture, action and sound can carry attention.
Keep the decisive action visible and let small changes finish; camera movement and extra cuts should
serve that sensation. Synchronized generated sound, recorded sound or separately authored sound can
each be appropriate. [Sound and mix](sound-mix.md) covers their relationship.

When a work is genuinely speech-free, its visual, musical and action relationships still need
authored semantic boundaries. [Media preparation](../../production/media.md#empty-segments-use-their-media-boundaries)
owns how actual media supplies them.
