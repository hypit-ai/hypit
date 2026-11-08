# Caption craft

Caption displays speech as it is delivered. Its verbal identity and contemporaneous relationship to
that speech matter more than size, decoration or placement. A striking animated word can be Caption;
a title held afterward to label a section is usually Typography even if the words were spoken.

Script's Dual Text permits intentional display/pronunciation differences: `<CSS|see ess ess>` keeps
`CSS` on screen while specifying the reading, `<New York|>` groups identical display and speech, and
`<|再见>` preserves spoken content without displaying it. These forms choose content and
correspondence; the Caption family chooses visual treatment. Use `||` between complete Units when a
new reading handoff is wanted.

For implementation of another visual family, read
[Caption authoring](../../production/caption-authoring.md). For applying treatments, hiding Cues and
materializing editable blocks, read
[Caption presentation](../../production/caption-presentation.md).

## Direct captions for this video

Study what the reference captions contribute: how they group speech, emphasize an idea, distinguish
a speaker and fit around the picture. Carry those relationships into the new work only when they
serve its Brief. A new language, performer, product or tone can call for another face, grouping,
placement or motion.

A short Cue can land a punchline; a longer phrase can let an explanation breathe. Choose the reading
phrase, layout and emphasis together. A meaningful Cue may wrap over two lines; its spoken Unit may
change color while the complete thought remains visible. Hiding a Caption during a demonstration
changes presentation, not Script or performed speech.

## Keep wording and time in their owners

The standalone Script owns display Words, Role Turns, Dual Text Units, attributes and authored Cues.
Alignment and Binding produce complete source-local Unit timing. A project program maps that timing
through the selected media occurrence and materializes ordinary NLE Component Items. Each Item owns
direct rational start/duration plus a complete `CaptionCuePayload`.

Reuse these facts rather than retyping spoken words into independent text merely because another
component can draw the desired shape. A visual-only restyle changes Item parameters. Correcting
display spelling or one Unit boundary is a direct payload edit. Changing Script, Cue structure or
the accepted performance is an explicit rematerialization decision.

## Design Cue rhythm

A Cue is one timed block of displayed speech. Script's `||` adds a handoff inside the same Segment
and Role Turn; Segment and Turn boundaries already start another Cue. A visual line is different:
one Cue may wrap over several lines without another `||`.

Choose grouping from language and picture together. Keep words whose meaning depends on each other,
and give a payoff or contrast its own handoff when that separation helps the visual treatment. Avoid
repeated tiny Cues that make the viewer reacquire text, and avoid blocks too dense to read while
watching the picture.

| Writing | Grouping judgment |
| --- | --- |
| English | Keep a useful phrase together, including articles, negation, names and quantities. Actual font width matters more than a word count. |
| Chinese | Keep compounds, names, modifiers and objects together. A complete short clause can share a Cue when it fits. |
| Korean | Preserve authored spaces and keep grammatical phrases readable together; `3개월` and `3 개월` remain different spellings. |
| Mixed scripts | Read the phrase as a whole. Latin brands and numbers can occupy several Han characters' width, so lexical count does not predict fit. |

`CaptionDisplayWord.separatorBefore` is authored content. A Chinese/Latin boundary does not invent a
space, and punctuation does not invent another timed Word. Measure the chosen fonts at delivery size.

## Choose emphasis independently of grouping

The same complete Unit timing supports static text, a current-Unit highlight or a trailing Karaoke
state. `step` activates a complete Unit at its start; `wipe` is a distinct visual choice that moves
through the Unit during its measured interval. Uneven durations and pauses should remain visible in
the effect.

When a compound, name or phrase should respond together, author it as one Dual Unit such as
`<组件化|>`. Use this for a real shared display-to-speech relationship, not as mandatory annotation
for every word. `<API|A P I>` remains one Unit because the correspondence is N:M.

A word attribute such as `useful{emphasis}` assigns a family-owned local role inside the Cue. It does
not change Unit time or split the Cue. A structural family might place emphasized words on another
line. Fine can map an owned attribute to another face; an unmapped attribute keeps the base face.

Text appearing and text changing color are separate choices. A family can keep the complete Cue
visible while Karaoke changes emphasis, or reveal Units as they begin. If it supports typewriter
reveal, it must preserve Unit and Word identities rather than rediscovering speech from glyphs.

## Give captions a place in the picture

Choose font, size, usable width, line height, contrast and motion together. If a Cue overflows,
inspect both its authored grouping and actual treatment. A bold outline may suit energetic social
video; a quieter box or shadow may suit an interview. Judge the actual glyphs over light and dark
moving frames at delivery size.

Caption, icons, flashes and other graphics form one composition. Keep important faces and products
clear, and reserve enough space for the complete Cue. Ordinary placement belongs to the selected
family. When the reference visibly uses head-following Caption, or the user requests it, use the
explicit [Caption tracking](caption-tracking.md) relationship; a visible face alone does not choose it.

## Reuse Fine or author another component

`@hypit/caption-fine` supplies the official flowing Caption implementation. A simple centered box,
role/style/visibility rules, rich text paint, layout and optional current/trailing Karaoke are all
Style choices on that one component. Do not introduce another family merely to remove options from
the Style surface.

Another structural visual relationship can become a project component directly: a keyword plus supporting
phrase, speaker-attached shapes, words arranged with a diagram, or another treatment whose shared
behavior deserves one owner. The family consumes `CaptionCuePayload`, owns its parameters and
registers its own NLE/HTML resolver. It does not create another transcript, Caption document or
semantic time system.

## Review in the current composition

Inspect frames for actual glyphs, spaces, decoration, wrapping and interference with nearby visuals.
Play a focused passage to judge reading rhythm, Role styling, cut transitions and Karaoke against
speech. Change `||` when the reading unit needs a handoff; change Style when the Cue works but its
appearance does not; create another family when the structural visual relationship is genuinely new.
