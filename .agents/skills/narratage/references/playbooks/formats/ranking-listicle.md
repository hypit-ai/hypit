# Ranking-listicle format

Use one progressive Ranking component to reveal a stable ordered set while speech and evidence
explain why every item belongs where it is placed.

## Author the Script schedule

- Write one outer Script Selection covering the complete ranking window.
- Declare one repeated Script Moment for item reveals and one terminal Moment for the completed board.
- The outer Selection must resolve exactly once. The terminal Moment must resolve exactly once.
- Repeat the same reveal Moment id once per item. Ranking applies strict `each` semantics; the
  occurrence count must equal the number of authored items, and trigger frames must increase.
- Give every item a stable id, order, label, icon/image, rank or tier, and one evidence beat.

## Author the SVML program

1. Build the speech program with accepted speaking or audio-only `speech:Take` inputs, then run
   `whisperx:Alignment` so the Selection and Moments resolve against real audio.
2. Declare exact font bytes and the variant's package-owned Style.
3. Choose exactly one primary component: `ranking:TierBoard`, `ranking:Column`,
   `ranking:TopThree`, or `ranking:TypewriterList`.
4. Connect `map={timing.map}`, `space={speech.space}`, the outer `during` Selection, repeated
   `triggers` Moment, terminal Moment, explicit frame, Style, and the complete ordered item list.
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

Review resolved trigger count/order, terminal timing, item identity, rank/tier, labels, icon assets,
evidence alignment, safe zones, stack order, and optional sounds. Pin accepted generated evidence
media through `.svrun` before the final ranking Build.

Read `../craft/captions.md`, `../craft/overlays.md`, `../craft/b-roll.md`, and
`../craft/production-gates.md`.
