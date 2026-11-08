# `@hypit/script`

Standalone prose authoring for spoken content, Caption display and transient semantic locations.

Script is a file format and ordinary TypeScript library. It is not an SVML declaration, an AuthorGraph
frontend or an AIGC prompt template. A project program reads a `.script` file, projects its typed facts,
combines them with measured media timing, and materializes ordinary NLE transactions. The accepted NLE
project retains no Script dependency.

```script
<opening>
  <HOST>Use <API | A P I> today.||
  @{answer!}Now the result is visible.
</opening>
```

The syntax owns relationships that are difficult to express correctly as independent strings:

- a **Segment** names one performable passage that can be aligned to one accepted media passage;
- a **Role Cue** assigns a turn without choosing a voice, character or model;
- **Dual Text** relates displayed spelling to intended speech as one explicit M:N Unit;
- `||` authors a Caption Cue handoff between complete Units;
- a **Selection** or **Moment** names meaning for an external materializer to locate;
- a display-word **attribute** gives a Caption family a local visual role inside one Cue.

Script contains no media path, prompt, model, provider, NLE Track, rectangle, Style, timecode or persistent
NLE dependency.

## Read and project one file

```ts
import { readFile } from "node:fs/promises";
import { parseScript, projectScript, scriptSegmentSpeech } from "@hypit/script";

const path = "story.script";
const parsed = parseScript(path, await readFile(path, "utf8"));
const story = projectScript(parsed, "story");

story.narrative;
story.segments;
story.selections;
story.moments;
story.caption.document;
story.caption.binding;

const spokenOpening = scriptSegmentSpeech(parsed, "opening");
```

`projectScript()` returns one strongly typed and internally consistent projection. It does not publish one
Record per Segment and does not manufacture `.dialogue` or `.speech` graph outputs. A caller explicitly asks
for a Segment's pronunciation text only when a concrete operation needs it. Model-specific role formatting
belongs to the selected prompt or model adapter, which can read `Narrative.turns`.

## Structure

All natural-language prose belongs inside a lower-case named Segment:

```script
<intro>
  A roleless passage.
</intro>

<exchange>
  <ALICE>First turn.
  <BOB>Second turn.
</exchange>
```

Role state ends with the Segment. A Role change establishes a new Caption Cue boundary but does not imply a
new generated clip. Segment, Role and Caption Cue are independent author decisions.

Dual Text separates display from speech:

```script
<line>
  Connect through an <API | A P I>.
  Keep <New York|> together as one display-to-speech Unit.
  <|This is spoken but not displayed.>
</line>
```

The left side supplies Caption display. The right side supplies intended speech. When the right side is
omitted, the displayed text supplies both projections while the explicit group still remains one Unit.

## Caption Cues and local word attributes

`||` creates a reading handoff; visual line wrapping remains a Caption-family decision:

```script
<line>
  First Caption Cue.|| Second Caption Cue.
</line>
```

Postfix attributes annotate one complete displayed word and survive into `CaptionDisplayWord.attributes`:

```script
<line>
  Most words are bold, but this{face=serif} one is serif.
</line>
```

Script validates flat scalar attribute spelling but assigns no central meaning to names or values. The
selected Caption family owns its vocabulary and rendering. Attributes do not alter pronunciation, Unit
membership or measured time.

## Semantic locations

Selections name ranges and Moments name points:

```script
<line>
  @{comparison}This passage explains the difference.@{/comparison}
  @{reveal!}This word triggers a reveal.
</line>
```

Affinity assigns an inter-word pause to the intended side:

| Form | Boundary |
| --- | --- |
| `@{name}` | next word start |
| `@{~name}` | previous word end |
| `@{/name}` | previous word end |
| `@{/name~}` | next word start |
| `@{name!}` | next word start |
| `@{~name!}` | previous word end |

These identities are consumed only while a project program maps source-local timing into direct NLE values.
They do not survive as named dependencies in the NLE project.
Project programs should author a Moment for an intended trigger instead of searching normalized prose for
a phrase. Phrase search remains useful for interactive inspection of an unannotated transcript, but it is
not a substitute for an already-authored relationship.

## Source preservation

The parser preserves UTF-16 source ranges, authored whitespace, comments, escapes and Unicode tokenization.
`formatScript`, `adjustScriptSelection` and `adjustScriptMoment` are ordinary file-authoring helpers; they
rewrite Script source without turning it into an editor timeline or mutating an NLE project.

`hypit estimate story.script --segment opening ...` reads the same standalone file directly. It does not
compile an SVML project or open a Runtime.
