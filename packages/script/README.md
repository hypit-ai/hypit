# `@hypit/script`

Official raw Script Surface for the Markup Frontend. It parses prose-first named Segment blocks,
newline-independent Role Cues, Dual Text, Selection and Moment syntax, and lowers them to a
canonical authored Narrative value with exactly `2M + 2N + 2` semantic anchor identities: both
ends of every Token and Segment, plus the Script Program's own start and end.

The package is an ordinary statically declared Surface module. Core does not import it and does not
know that Script, Segment or Narrative exist.

```svml
<script id="story">
  @answer

  <opening>
    <ALICE> I will make the first point.
    <BOB> Then I will answer.
  </opening>

  <pause/>
  @/answer
</script>
```

`<opening>` opens a Segment named `opening`; `</opening>` closes that exact Segment. While the
parser is inside a Segment, a valid bare tag such as `<ALICE>` is a Role Cue. This is parser state,
not indentation: the compact spelling
`<opening><ALICE>I speak first.<BOB>I answer.</opening>` has the same semantic value.

A Role Cue is optional. Text before the first Role Cue is a roleless Turn, and Role state is reset
when every Segment closes; a Role can never leak into the following Segment.

An empty Segment such as `<empty></empty>` (or `<empty/>`) is valid. `empty` is an ordinary
author-chosen name, not a reserved keyword. It retains the Segment identity and both boundary anchors
while contributing no Tokens or spoken text. This supports wordless passages in the same semantic
model: the associated normalized media, not the empty tag, determines the SemanticTake's duration.

The package exports its Manifest, `parseScript`, semantic/source-map projection helpers, a
semantic-preserving formatter and the raw `decodeScriptSurface` handler. Source ranges and parser
state remain private to Script; its authored Narrative Record uses the Frontend-neutral type from
`@hypit/narrative`, so third-party author surfaces can feed the same WhisperX, locator and caption
components without importing Script internals.

The Surface exports one full Narrative plus narrow, immutable views:

- `script.segment.<id>` is a narrow `NarrativeExcerpt` used to associate a generated Take with one Segment;
- `script.segment.<id>.dialogue` is ordinary `Text`: display-independent dialogue, including optional
  Role cues and right-side Dual Text pronunciation, for a speech-video model;
- `script.segment.<id>.speech` is ordinary pronunciation-only `Text` for duration estimation or TTS;
- `script.caption` is one complete `CaptionDocument`: ordered display Words, N:M Alignment Units,
  and authored Cue Breaks, empty when the Script has no visible Caption words;
- `script.selection.<id>` is a reusable explicit Selection;
- `script.moment.<id>` is a reusable explicit Moment.

`@hypit/caption` projects `script.selection.<id>` or a Role onto complete Caption Alignment Units;
it then joins those units to a SemanticTrack for frame timing. Seedance consumes dialogue `Text`,
Estimate and TTS consume speech `Text`, and Speech Track consumes the Segment excerpt. None imports
Script's parser AST. Another authoring package may produce the same ordinary Text, Narrative and
CaptionDocument contracts.

### Script vocabulary

- **Segment**: a named structural passage, written `<opening>...</opening>`.
- **Role Cue**: a speaker turn, written as a bare tag such as `<ALICE>` inside a Segment. The next
  Role Cue or the Segment close ends that turn.
- **Dual Text**: one authored speech span with separate display and spoken projections, written
  `<display text | spoken text>`.
- **Selection marker**: a named semantic range, written `@name ... @/name`.
- **Moment marker**: a named semantic point, written `@name!`.
- **CaptionDocument**: the Script-owned caption truth; it contains **Display Words**,
  **Alignment Units** and **Cue Breaks**. It contains no seconds or frames.
- **Token attribute**: a flat postfix display-word annotation such as `really{emphasis}` or
  `really{emphasis,importance=2,tone=warm}`. Values may be strings, finite numbers or booleans. It
  becomes `CaptionDisplayWord.attributes`; it is not a Selection and does not carry timing.

Within Dual Text, an unescaped `@` is legal only on the spoken side. The display side is literal; write
`\@` if an at-sign must be shown. An empty display side, such as `< | spoken words>`, keeps the speech
tokens and omits them from Caption. `||` is an authored Caption Cue Break and must occur between
complete Alignment Units.

## Segments, turns and Cues are different boundaries

A Segment names a structural production passage. It can contain several Role turns and be performed
by one Take with several edited shots. A Role Cue changes who speaks; it neither creates a character
asset nor requires another generated Take. `||` changes Caption grouping between complete Alignment
Units; it does not split the Segment, cut the picture or end a Selection.

```svml
<script id="story">
  <exchange>
    <HOST> I use it || every day, || since <2012 | twenty twelve>.
    <GUEST> Even @proof on holiday @/proof?
    <HOST> @answer! Especially then.
  </exchange>
</script>
```

Dual Text preserves display spelling while supplying an explicit pronunciation. Its N:M Alignment
Unit is indivisible for Caption timing and authored Cue Breaks. Roles are lexical speaking cues;
the Source's model references and action direction bind them to the intended performers.

English words and numbers normally form lexical units; Han characters form individual units, as do
Hiragana and Katakana characters. A Latin name adjacent to Han text remains separate from the
following characters. Display punctuation attaches to neighboring words without adding timing units.
These units support precise timing and highlighting. A Caption Cue can hold a whole phrase of them;
`||` chooses its handoff independently of character counts or visual line wrapping.

## Selection and Moment affinity

A marker selects the adjacent semantic anchor; it does not write a timecode. Inside a spoken
passage, its affinity normally chooses a neighboring word boundary:

| Marker | Boundary |
| --- | --- |
| `@name` | Selection opens at the next word's start: right affinity. |
| `~@name` | Selection opens at the previous word's end: left affinity. |
| `@/name` | Selection closes at the previous word's end: left affinity. |
| `@/name~` | Selection closes at the next word's start: right affinity. |
| `@name!` | Moment at the next word's start: right affinity. |
| `~@name!` | Moment at the previous word's end: left affinity. |

At structural edges, the parser retains the corresponding Segment or program boundary rather than
inventing a neighboring word. Selection and Moment ids share one namespace. Selections can overlap,
cross and span Segments; unlike tags, they do not need to nest.

To join two visual Selections without exposing their inter-word pause, match affinity on both sides:

```text
@coffee my coffee @/coffee ~@smoothie my smoothie @/smoothie
@coffee my coffee @/coffee~ @smoothie my smoothie @/smoothie
```

These are alternative spellings, not two occurrences to put in the same Script. In the first,
“coffee” ends both the first Window and the gap's left boundary, so the smoothie Selection owns the
pause. In the second, the next “my” starts both touching boundaries, so the coffee Selection owns it.
Plain `@/coffee @smoothie` leaves the gap between previous word end and next word start outside both.
The media consumer still decides playback and visual coverage inside those projected Windows.
