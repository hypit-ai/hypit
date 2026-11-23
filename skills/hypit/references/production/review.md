# Reviewing the Production (`review.md`)

Read this when inspecting work in NLE Studio, evaluating an exported `.mp4`, or deciding where to apply a revision. [Studio](studio.md) covers launching and using NLE Studio and Canvas Studio; [Delivery](delivery.md) covers `hypit nle export`.

## Choose the Right Review Surface

Use whichever view answers the current question fastest:

| Question | Best tool |
| --- | --- |
| Does the SVML parse and resolve all media/components? | `hypit nle inspect <file.svml>` |
| Are layout, typography, caption clearance, and keyframe transitions right? | Interactive scrubbing and playback in NLE Studio (`hypit nle open <file.svml>`) |
| Did a generated shot or image match the prompt and visual direction? | Canvas Studio (`hypit canvas open <board.canvas.json>`) or `hypit canvas history` + inspecting the saved image/video |
| How do picture, pacing, audio mix, and encoding hold up as a deliverable? | Export with `hypit nle export <file.svml> --to out/review.mp4` and inspect both playback and extracted frames |

When reviewing an exported video programmatically or checking exact frames around a cut or reveal, extract frames or a contact sheet with `ffmpeg`:

```bash
# Extract a single frame at 4.2s
ffmpeg -ss 4.2 -i out/review.mp4 -frames:v 1 scratch/frame-4.2.png

# Extract a 2x3 contact sheet across a 2-second transition (from 3.0s to 5.0s at 3 fps)
ffmpeg -ss 3.0 -t 2.0 -i out/review.mp4 -vf "fps=3,scale=540:-1,tile=3x2" scratch/handoff-grid.png
```

## What to Judge in the Assembled Film

Technical validity (`hypit nle inspect` passing) only proves the timeline is legal. Creative review asks whether the piece actually delivers on `BRIEF.md` and `TREATMENT.md`:

- **Performance and material**: does the chosen footage actually carry the intended speech, action, and expression? Timeline motion cannot compensate for weak source footage.
- **Pacing and coverage**: do B-roll cuts, product inserts, and graphic reveals land on the exact spoken words or musical beats?
- **Visual handoffs**: inspect frames *before, during, and after* every cut or transition. Watch for 1-frame flashes of underlying tracks, sudden pops, or layouts collapsing too early.
- **Captions and typography**: check legibility, line breaks, contrast over changing backgrounds, and face/UI safe zones at actual delivery resolution.
- **Audio balance**: verify that speech is crisp and clearly intelligible over music, with no accidental double-tracked voice (from placing the same audio twice) and smooth fades at entrances and exits.

## Compare Reference Reconstructions by Function

When recreating or adapting a reference video ([Reference Video Study](../creation/reference-video.md)), compare by **communicative function**, not pixel identity:

- Does the opening hook earn attention in the first 1–2 seconds?
- Does each visual change clarify the claim being spoken at that moment?
- Does the payoff resolve the setup cleanly for the target product, person, or language?

## Repair the Owning Fact

Always fix problems at their true owner so upstream work stays preserved:

| What the review reveals | Where the correction belongs |
| --- | --- |
| Story structure, hook, or visual direction is weak | `TREATMENT.md` |
| Generated footage, image, or voice performance is off | Canvas node parameters (`hypit canvas apply` + `hypit canvas invoke` + `hypit canvas adopt`) |
| Spoken wording or word timestamps are misaligned | Author transcript JSON + `hypit transcript align` |
| Cut timing, track order, `<layout>`, audio gain, or fades are off | `.svml` timeline (or its TSX authoring source) |
| A reusable graphic or caption layout cannot express the design | The component package (`packages/<name>/`) |

Never regenerate expensive Canvas media when the issue is purely a timeline cut, layout crop, gain level, or caption style—keep the adopted Project Media and iterate directly in SVML/TSX and NLE Studio.
