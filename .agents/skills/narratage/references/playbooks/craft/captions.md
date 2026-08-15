# Caption craft

Captions are one program-wide interpretation of the authoritative Script, measured against the real
speech program. Do not create separate caption systems for speakers, regions, or styles.

## Author one caption pipeline

Use one pipeline for the program:

```text
exact font → caption-fine:Style → caption:Program → caption-ai:Planner
                                                        +
                                           whisperx:Alignment map
                                                        ↓
                                              caption-fine:Track
```

```svml
<fonts:Stack id="caption-font" family="inter" weight="700"
  style="normal" emoji="color"/>
<caption-fine:Style id="primary-caption"
  recipe={studio.caption.primary} font={caption-font}/>

<caption:Program id="caption-program" display={story.caption}
  default={primary-caption}>
  <caption:Use role="HOST" style={host-caption}/>
  <caption:Use words={story.caption.selection.product}
    style={product-caption}/>
  <caption:Mute words={story.caption.selection.private}/>
</caption:Program>

<caption-ai:Planner id="caption-plan" display={story.caption}
  program={caption-program} model="gemini-2.5-flash"/>

<caption-fine:Track id="captions" display={story.caption}
  correspondence={story.caption.correspondence}
  map={timing.map} space={speech.space}
  program={caption-program} plan={caption-plan.plan}/>
```

Add `{captions.track}` to `film:Film` as one peer Visual Track. If the format intentionally has no
captions, omit the Caption components entirely.

## Keep the Script authoritative

- Preserve the exact Script display text. Do not copy burned-in reference subtitles or rewrite the
  spoken source to match an existing visual caption.
- Use Dual Text when display and pronunciation differ. A Dual Text Atom is indivisible for timing and
  planning; do not expect the Planner to split it internally.
- Use `caption:Use role` for speaker-wide style and `caption:Use words` for a Script Selection's
  caption-word projection. Ordered rules replace the complete Style, with the last matching rule
  winning.
- Use `caption:Mute` to hide complete display Atoms without deleting Script words, changing speech,
  or regrouping Cues.
- Preserve original-language dialogue. Translation or alternate-language delivery is a separate
  authored Script decision, not a caption-planner rewrite.

## Separate planning from timing

- `caption-ai:Planner` receives immutable display Atoms and resolved Style runs. It may place Cue cuts
  only between complete Atoms and attach fields declared by the Style family.
- The Planner does not see audio, rewrite text, select Styles, or invent timestamps.
- `whisperx:Alignment` measures the accepted `speech:Spine` audio and produces the SemanticMap used by
  `caption-fine:Track`.
- Recheck alignment whenever the speech audio changes. A Style-only change does not prove that a
  prior visual review is still valid.

## Design for readability

- Define one explicit default Style covering every word, then use only the overrides the story needs.
- Keep caption placement inside a safe region and clear of faces, products, device screens, buttons,
  and essential evidence.
- Use consistent font bytes, width, size, line height, Cue bounds, and padding when stable readability
  matters. Avoid decorative motion or active scaling that makes consecutive Cues appear unrelated.
- Short spoken phrases remain complete even when they cannot satisfy a preferred minimum word count.
  Never remove words merely to force a visual layout target.
- Treat captions and editorial overlays as separate Tracks with deliberate stack orders and spatial
  regions so they do not compete for the same area.

## Review the actual program

- Review the full delivery with real speech timing, not only a still frame or a structural plan.
- Verify every word, Role Style, muted Atom, Cue boundary, timing window, line wrap, safe zone, and
  overlap with Media/Text Tracks.
- Listen while reviewing: a visually plausible Caption Track still fails if it leads or trails the
  actual spoken word.

## Show it in a browser only when style is genuinely in question

Caption Playground is a local visual editor that reads and writes the same `.svml` and `.svs` files
a Build compiles, so edits land in the author source rather than a side format.

Start it in two situations only:

- the user asks to see or tune captions visually;
- you cannot settle a styling decision from the source alone — size, padding, fill, safe-zone
  collision, line wrapping against real speech timing — and a rendered frame would settle it.

Otherwise author the Recipe directly. Every field the playground exposes is writable from the
source, and starting a server nobody asked for interrupts the user for nothing.

```bash
pnpm caption:playground -- \
  --source main.svml \
  --style base-caption \
  --display story.caption \
  --recipe studio.svs#caption.base \
  --font main.svml#caption-font \
  --canvas 1080x1920 \
  --fps 30
```

It serves `http://localhost:5178`. You cannot see that page yourself: give the user the URL, say
which Recipe fields you want judged, and wait for their answer before continuing. Every argument is
an explicit selection — `docs/guide/caption-playground.md` lists what each one selects.
