# Script syntax

Read this when writing or correcting a standalone `.script` file: spoken wording, display spelling,
Caption Cues, Role turns, local display attributes and semantic locations. [Script and semantic
time](../creation/script-and-time.md) owns the creative decisions. Timing and NLE materialization happen
outside this file.

Script is an ordinary file format supplied by `@hypit/script`. It is not embedded in SVML and it does
not publish graph Records. A project program reads the file, calls `parseScript()` and `projectScript()`,
then uses only the projections needed for the current operation.

## Structure and authored relationships

```script
<opening>
  <HOST>Use <API | A P I> today.||
  @{answer!}Now the result is visible.
</opening>
```

The forms are:

| Form | Meaning |
| --- | --- |
| `<opening>...</opening>` | A Segment named `opening`; spoken prose belongs inside a Segment. |
| `<HOST>` | A Role Cue lasting until another Role Cue or the Segment end. |
| `<display text \| spoken text>` | One M:N Unit with separate visible and pronounced wording. |
| `<display text\|>` | One explicit Unit using the same wording for both projections. |
| `< \| spoken text>` | Spoken words that contribute no visible Caption words. |
| `\|\|` | A Caption Cue handoff between complete Units. |
| `word{face=serif}` | One local display-word attribute interpreted by the Caption family. |
| `@{proof} ... @{/proof}` | A named semantic Selection. |
| `@{claim!}` | A named semantic Moment. |

Segment names match `[a-z][a-z0-9_-]{0,63}`. Role labels may use Unicode letters, marks and
numbers. Role identity does not select a voice, character, model or media file. A Segment can contain
several Role turns and one Role turn can contain several Caption Cues.

## Display and pronunciation

Dual Text owns an explicit relation rather than asking a later matcher to compare strings:

| Script | Display | Speech |
| --- | --- | --- |
| `<S\|ess>` | `S` | `ess` |
| `<New York\|>` | `New York` | `New York` |
| `<\|再见>` | nothing | `再见` |

The complete Dual is one Caption Unit even when either side contains several words. Its Caption Unit
therefore takes the full measured range of the spoken Tokens to which it is bound. An explicit speech
side must contain a spoken word; punctuation or markers alone cannot time visible text.

When speech is omitted, markers may appear on the shared side: `<组@{beat!}件化|>`. With an explicit
speech side, markers belong on that right side because it owns the spoken Tokens. A Cue break cannot
split a Dual Unit.

Ordinary whitespace is authored display information. Runs normalize to one space, while no
language-specific rule inserts or removes spaces. Newlines format the source; only `||` makes a Cue
handoff. Punctuation remains attached to its displayed word and does not invent another timed Token.

## Local Caption attributes

An attribute immediately follows one complete displayed word:

```script
<line>
  Most words are bold, this{face=serif} word is serif,
  and this{emphasis,importance=2} word has two authored roles.
</line>
```

Values are strings, finite numbers or booleans. Script preserves them in
`CaptionDisplayWord.attributes` but assigns no global rendering meaning. The selected Caption family
owns the supported names and behavior. Attributes do not change speech Tokens, Unit membership, Cue
boundaries or time.

The attribute is word-local. When several words require the same treatment, annotate those words
explicitly until a real Caption family demonstrates the need for a distinct authored range syntax.
Do not reuse a semantic Selection as a hidden style range.

## Semantic locations and pause ownership

Markers contribute no displayed or spoken characters. They cannot split a Token or detach its
punctuation. Each marker chooses one adjacent semantic boundary:

| Marker | Boundary |
| --- | --- |
| `@{name}` | open at the next word's start |
| `@{~name}` | open at the previous word's end |
| `@{/name}` | close at the previous word's end |
| `@{/name~}` | close at the next word's start |
| `@{name!}` | Moment at the next word's start |
| `@{~name!}` | Moment at the previous word's end |

This distinction assigns a real inter-word pause to the outgoing or incoming relationship. Selections
may overlap or cross; they are not XML nesting. Selection and Moment names share one namespace and
match `[a-z][a-z0-9_-]{0,63}`.

These names are transient project-program inputs. After measured media timing locates them, the
materializer writes direct NLE start/duration or component parameters. The NLE project retains no
Selection, Moment or Script lookup.

## Comments, escapes and exact spelling

Comments contribute no text and do not divide a word: `hel<!-- note -->lo` remains `hello`.
Zero-width markers behave the same way. Reserved punctuation can be escaped:

- `\@`, `\<`, `\{`, `\}`, `\|` and `\\` produce literal characters;
- a single `|` in prose is literal; `||` is a Cue handoff;
- the first unescaped `|` inside Dual Text separates display from speech;
- `\>` prevents `>` from closing Dual Text.

Do not add spaces merely to make annotations parse. `是的@{part}就是这样@{/part}` remains joined;
`是的 @{part}就是这样@{/part}` retains the authored space.

## Use typed projections explicitly

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

const openingSpeech = scriptSegmentSpeech(parsed, "opening");
```

`projectScript()` creates no `.dialogue` or `.speech` Records. A prompt node owns its actual prompt;
when it deliberately reuses Script wording, the project program asks for the Segment speech and the
model adapter formats any Role turns required by that model. `hypit estimate story.script --segment
opening` uses the same explicit speech query without opening a compiler or Runtime.

The Caption projection owns display Words, Unit membership, Role and Cue grouping. The separate
binding relates every Unit to its authored Narrative Tokens. Alignment and media timing remain in
their own packages; they are not written into Script.
