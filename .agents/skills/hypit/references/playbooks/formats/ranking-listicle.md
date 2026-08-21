# Ranking-listicle format

Use one progressive Ranking component to reveal a stable ordered set while speech and evidence
explain why every item belongs where it is placed.

## Author the Script schedule

- Write one outer Script Selection covering the complete ranking window. It must resolve exactly once.
- `ranking:TopThree` is driven by Moments: declare one repeated Script Moment for item reveals and
  one terminal Moment for the completed board, which must resolve exactly once. Repeat the same
  reveal Moment id once per item — it applies strict `each` semantics, so the occurrence count must
  equal the number of authored items and trigger frames must increase.
- `ranking:Column` is driven by its items: give each item that is not `preset` its own Script
  Selection, and declare no Moments for it.
- Give every item a stable id, its rank, its icon or image, and one evidence beat. `ColumnItem` and
  `TopThreeItem` both require a `label`; the icon is optional on each.

## Author the SVML program

1. Normalize each accepted speaking or audio-only source, create its `whisperx:SemanticTake`, then
   assemble those Takes with `speech:Track` so Selections and Moments resolve against real audio.
2. Declare exact font bytes and the variant's package-owned Style.
3. Choose exactly one primary component: `ranking:Column` or `ranking:TopThree`.
4. Connect `semantic={speech.semantic}`, the outer `during`, an explicit `frame`, the Style, and the
   complete ordered item list. `TopThree` also takes the repeated `triggers` Moment and the
   `terminal` Moment; `Column` takes a required `canvas` instead and reads its timing from each
   item's own `during`.
5. Add the component's `.visual` output to `film:Film`; add its optional `.audio` output only when
   authored sound is present.
6. Put screenshots, demonstrations, or proof clips on a separate `media-track:Track`. Use
   `deck:DepthStack` only as an intentional evidence treatment, not as a second ranking system.
7. Add the full Caption pipeline when spoken words should be captioned, then render and target the
   delivery through `.svrun`.

## Write and design the list

- Use setup → concrete evidence or cost → punchline for each spoken item.
- Give higher-ranked entries stronger proof and a more decisive close, not merely a brighter color.
- Keep row vocabulary stable. Do not change layout grammar, label style, or icon logic halfway
  through the list.
- Keep claims verifiable. Do not invent performance numbers, votes, comparisons, or product facts.
- Separate ranking copy from captions: item labels belong to the Ranking component; spoken dialogue
  belongs to Script and Caption; supporting proof belongs to Media Track.

## Review and reuse

Review the resolved trigger count and order and the terminal timing where the component uses them,
item identity, rank, labels, icon assets,
evidence alignment, safe zones, stack order, and optional sounds. Pin accepted generated evidence
media through `.svrun` before the final ranking Build.

Read `../craft/captions.md`, `../craft/overlays.md`, `../craft/b-roll.md`, and `../craft/sfx.md`.

That list is complete: `../index.md` does not repeat it, and the craft its required load
order marks always-read is required regardless of format.
