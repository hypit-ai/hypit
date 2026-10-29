---
title: Timing edits in Studio
description: Move and trim named Instants and Windows while preserving their authored meaning.
---

Components use named absolute Instants and Windows. Studio edits the Source declaration that gives the
selected Item its time.

## Direct time declarations

| Source form | Moving it changes | Trimming it changes |
| --- | --- | --- |
| `from="2s" for="8f"` | `from`; duration remains eight frames | leading: `from` + `for`; trailing: `for` |
| `until="3s" for="8f"` | `until`; duration remains eight frames | leading: `for`; trailing: `until` + `for` |
| `from="1s" until="3s"` | both endpoints by the same delta | the selected endpoint |
| component `during={named-window}` | the named Window declaration | the selected relation in that declaration |

An Instant reference behaves the same way: `at={claim}` edits the named declaration for `claim`.
Each drag keeps the part that did not change: a leading trim keeps the old end, a trailing trim keeps
the old start, and a move keeps the old duration.

Unedited expressions retain their units. `2s` remains two seconds when frame rate changes, while
`60f` remains sixty frames. A changed position is written on a whole frame boundary for the current
Timeline.

## Semantic time

Semantic time is projected before a component uses it:

```svml
<semantic:Projection id="story-time" narrative={story} timeline={film.timeline}>
  <semantic:Map alignment={speech.alignment} domain={speech-media.domain} window={film.speech}/>
</semantic:Projection>
<semantic:Window id="proof" projection={story-time} during={story.selection.proof}/>
<semantic:Instant id="reveal" projection={story-time} at={story.moment.reveal}/>

<visual:Clip during={proof} .../>
<deck:Card at={reveal} .../>
```

When the selected component supports that edit, moving `proof` or `reveal` changes the corresponding
Script anchors and every use updates after recompilation. The component continues to use an ordinary
absolute Window or Instant.

Some expressions have several possible author choices. For example, changing `earliest(...)` or
`latest(...)` would require choosing one branch. Studio presents such values as read-only; edit the
intended Source expression directly.

[Studio](../quickstart/preview.md) explains the editing interface. The
[Companion guide](./studio-companions.md) explains component Items and controls.
