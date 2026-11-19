# `@hypit/script`

Author a spoken script once and use it to prepare an aligned transcript, name points and ranges on the recording,
and materialize captions. The root entry parses text. `@hypit/script/timing` binds a selected Segment to a prepared
transcript on an explicitly selected source clock.

```script
<opening>
  <HOST> @{reveal!}This is the <API{face=accent} | A P I>. ||
  @{demo}Watch the next step.@{/demo}
  <GUEST> Now try it.
</opening>
```

| Syntax | Meaning |
| --- | --- |
| `<opening>…</opening>` | Named recording Segment. A file can contain several. |
| `<HOST>` | Speaker role until the next role tag or the end of the Segment. |
| `\|\|` | Explicit cue break. Whitespace and wrapping format the text. Speaker changes also close the current cue. |
| `<API \| A P I>` | Show `API`, say `A P I`. All display words on the left share a single timing Unit. |
| `<New York \|>` | Use the same words for display and speech, as one timing Unit. |
| `<\| really>` | Retain a spoken word for alignment and omit it from captions. |
| `word{face=accent}` | Attach a scalar attribute to the display word. The selected caption component interprets it. |
| `@{reveal!}` / `@{~reveal!}` | Name the next word's start or the previous word's end. |
| `@{demo}…@{/demo}` | Name the range from the first following word's start to the last preceding word's end. |
| `@{~demo}…@{/demo~}` | Include the adjacent pauses by choosing the earlier start boundary and later end boundary. |

Names are scoped to a Segment. At the outer edges, a boundary without a neighboring word uses the corresponding
edge of the caller's source window. Use `<!-- ... -->` for comments and a backslash to escape Script punctuation.

```ts
import { parseScript } from "@hypit/script";
import { bindScriptTiming } from "@hypit/script/timing";

const opening = parseScript("story.script", source).segments.get("opening")!;
// Preparation: pass opening.spokenWords to alignTranscript or `hypit transcript align`.
// Import: read the prepared transcript and its selected source window.
const speech = bindScriptTiming(opening, alignedTranscript, { window: sourceWindow });
const reveal = speech.moment("reveal");  // exact source time
const demo = speech.selection("demo");  // exact { start, end } on the same clock
const cues = speech.cues;                // role, Units, display Words and measured windows
```

Normal prose preserves written punctuation and spacing in caption Words. `spokenWords` contains lexical speech
without adjacent punctuation. `bindScriptTiming` uses the exact authored word sequence and requires both measured
endpoints for every spoken word. Numeric transcript seconds resolve to a 100 ns grid for exact timeline arithmetic.
A Unit spans the earliest start and latest end of its spoken words. A Cue spans the Units it displays, in source order.

Callers choose the recording and the transcript clock, project named times through the selected placement with
`@hypit/nle/authoring`, and choose styling and visibility. For a concrete subtitle import, see the
[Jensen Composition Source](../../examples/ranking-jensen/README.md#import-this-cut-from-tsx).
