# Ranking-listicle format

Use one progressive Ranking component to reveal a stable ordered set while speech and evidence
explain why every item belongs where it is placed.

## Author the Script schedule

- Write one outer Script Selection covering the complete ranking window.
- `ranking:TierBoard` and `ranking:TopThree` are driven by item-owned Moments: give every item its own
  `at={story.moment.NAME}` and declare one terminal Moment for the completed board. Reveal order comes
  from the Moments' real frame order, not from a repeated marker id.
- `ranking:Column` is driven by its items: give each item that is not `preset` its own Script
  Selection, and declare no Moments for it.
- Give every item a stable id, its rank or tier, its icon or image, and one evidence beat. Copy
  belongs to the item only where the component carries it: `ColumnItem` and `TopThreeItem` require a
  `label`, while a `TierItem` requires an `icon` and carries no copy of its own.

## Author the SVML program

1. Normalize each accepted speaking or audio-only source, create its `whisperx:SemanticTake`, then
   assemble those Takes with `speech:Track` so Selections and Moments resolve against real audio.
2. Declare exact font bytes and the variant's package-owned Style.
3. Choose exactly one primary component: `ranking:TierBoard`, `ranking:Column`, or
   `ranking:TopThree`.
4. Connect `semantic={speech.semantic}`, the outer `during`, an explicit `frame`, the Style, and the
   complete ordered item list. `TierBoard` and `TopThree` also take the repeated `triggers` Moment
   and the `terminal` Moment; `Column` takes a required `canvas` instead and reads its timing from
   each item's own `during`.
5. Add the component's `.visual` output to `film:Film`; add its optional `.audio` output only when
   authored sound is present.
6. Put screenshots, demonstrations, or proof clips on a separate `media-track:Track`. Use
   `deck:DepthStack` only as an intentional evidence treatment, not as a second ranking system.
7. Add the full Caption pipeline when spoken words should be captioned, then render and target the
   delivery through `.svrun`.

## Write and design the list

- Use setup → concrete evidence or cost → punchline for each spoken item.
- Give higher-ranked entries stronger proof and a more decisive close, not merely a brighter color.
- Keep row/tier vocabulary stable. Do not change layout grammar, label style, or icon logic halfway
  through the list.
- Keep claims verifiable. Do not invent performance numbers, votes, comparisons, or product facts.
- Separate ranking copy from captions: item labels belong to the Ranking component; spoken dialogue
  belongs to Script and Caption; supporting proof belongs to Media Track.

## Review and reuse

Review the resolved trigger count and order and the terminal timing where the component uses them,
item identity, rank/tier, labels, icon assets,
evidence alignment, safe zones, stack order, and optional sounds. Pin accepted generated evidence
media through `.svrun` before the final ranking Build.

Read `../craft/captions.md`, `../craft/overlays.md`, `../craft/b-roll.md`, and `../craft/sfx.md`.

That list is complete, and the always-read craft in `../index.md` applies regardless of format.
