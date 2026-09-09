# Caption styling and coverage

Read this to apply a caption treatment to speakers or passages, change it locally, or leave selected
words without captions. [Caption craft](../playbooks/craft/captions.md) owns the visual direction;
[Caption authoring](caption-authoring.md) explains creating a new rendering family.

The Script owns displayed words and Cue breaks. A family's Style owns a resolved visual treatment.
`caption:Program` assigns those Styles to the words, then the family's Track joins them to the actual
SemanticTrack and draws them. Changing the appearance can reuse the existing performance and timing.

## Choose the words that receive a treatment

| Intended scope | Authoring |
| --- | --- |
| Ordinary treatment across the video | Set the Program's `default` Style. |
| A speaking character, across their turns and Segments | `Use role="GUEST" style={guest-style}` selects the Script Role. |
| A phrase, one Segment or a passage spanning several Segments | Name a Script Selection around that material and use `Use selection={story.selection.name} style={...}`. |
| A display word with a particular visual role | Mark a Script attribute and use `Use attribute="emphasis" style={...}` with a family that implements word-specific layout. |
| Selected words that should have no caption | `Mute role="GUEST"` or `Mute selection={story.selection.name}`. Speech and the semantic timeline continue. |

A Selection can cover a whole Segment; the Program consumes that Selection rather than a separate
`segment` selector. A Role selects the authored speaker, regardless of which person is currently
visible. For one speaker's particular reply, place a Selection around that reply. Each `Use` selects
one of `role`, `selection` or `attribute`; each `Mute` selects one of `role` or `selection`.

## Apply broad choices and local overrides

The following excerpt assumes the named Styles are already declared in the chosen family:

```svml
<script id="story">
  @opening-look
  <opening>
    <HOST> One simple idea.
    <GUEST> @answer It changes the whole picture. @/answer
  </opening>
  @/opening-look

  <demonstration>
    <HOST> @clear-picture Let me show you how it works. @/clear-picture
  </demonstration>
  <closing><HOST> Try it with your product.</closing>
</script>

<caption:Program id="caption-program" document={story.caption} narrative={story}
  default={base-style}>
  <caption:Use role="GUEST" style={guest-style}/>
  <caption:Use selection={story.selection.opening-look} style={opening-style}/>
  <caption:Use selection={story.selection.answer} style={answer-style}/>
  <caption:Mute selection={story.selection.clear-picture}/>
</caption:Program>
```

Role and Selection applications are evaluated in Source order. **The last matching `Use` wins** for
each complete display unit. In this example, the opening treatment replaces the guest treatment in
the opening passage, then the answer treatment replaces it in the selected reply. The closing keeps
the default. This gives the author an explicit order for broad treatments and particular moments;
selector specificity or proximity does not choose the winner.

Each match chooses a complete Style. To make an answer differ only in color, declare an answer Style
with the intended complete treatment; Program does not merge its properties with the previous Style.
The resulting Style boundaries form Cue handoffs, alongside Segment, Role-turn and authored `||`
boundaries. A selection-wide Style change is useful when a phrase becomes its own caption state.

`Use attribute="emphasis"` has a different purpose: it describes local word roles within a Cue for a
family that can arrange them. Fine keeps a uniform flow and does not implement word-specific Style
runs. An oversized keyword beside supporting words belongs naturally to a custom family consuming
those runs. Conflicting Styles applied to the same attributed word produce an error; the common
word-attribute mechanism does not use the Role/Selection override rule.

## Let coverage serve the composition

Mute is a display selection, useful when another visual already carries the words, a demonstration
needs the space, or another Caption family presents that passage. All Mute selections contribute to
the hidden words; a later Style application does not make them visible again. It changes neither
audio routing nor the performance. For a different version of the video, revise the Program's Mutes.

The family's lead, tail and handoff still determine the visible envelope of neighboring Cues. When
a passage needs a clear picture, select complete Cues and choose their neighboring lead/tail so the
previous or following caption also releases that space. Selecting a word for Mute removes that word;
it does not by itself make every caption pixel disappear during the word's time.

One family can implement several related treatments through its own Styles. When independent
families are useful in one video, give each its own Program and Track, with complementary coverage.
The common Program assigns Styles; it does not dispatch them to renderers automatically. A scene
whose words and graphics share behavior can instead own their rendering together through the common
Caption timing inputs, as described in [Caption authoring](caption-authoring.md).

Use semantic boundaries for the relationship: a Selection follows the intended words after a Script
or performance change. Keep a Dual Text unit complete when selecting it. Fine's moving placement
can independently follow measured head regions through [Caption tracking](../playbooks/craft/caption-tracking.md).
Inspect the resulting handoffs and placement with the other visuals while reusing the production's
media.
