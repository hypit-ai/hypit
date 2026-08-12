---
title: SVML Script Surface
description: "Normative contract for the SVML script body: Segment, Role Cue, Dual Text, Selection, Moment and Slot."
---

# SVML Script Surface

> **Draft; not frozen.**
>
> SVML has not been publicly released, so there is no legacy language version to remain
> compatible with. This document directly defines the first public target, Script Surface
> v1; the early prototypes in this repository are not the normative contract. An
> implementation may claim SVML v1 support only after it passes the parser, projection,
> source-map and temporal golden fixtures in this document.

SVML is a semantic video source language, not a pixel rendering format. This document
defines only its most frequent and most readability-critical script region, `<script>`; the
outer document structure for canvas, nodes, styles, generation parameters and the other
Program regions is designed separately. After v1 ships, new semantics should first be
composed out of the constructs already in this document; only when the body syntax genuinely
must change should a new version be published, and early prototype behaviour must never be
used to weaken the current v1.

## One-page contract

Apart from natural language, the body has only six semantic constructs:

| Construct | Owns only | Does not own |
|---|---|---|
| `Segment` | Ordered media/spoken blocks and independent structural endpoints | Automatic Selection, duration, silence |
| `Role Cue` | The "who said what" text prefix in the `dialogue` projection | speaker entities, voice timbre, field routing |
| `Dual Text` | Display text that differs from the actual pronunciation | TTS vendor parameters, styling, motion |
| `Selection` | One or more explicitly closed semantic time intervals | Consumer declarations, absolute seconds |
| `Moment` | One or more explicitly complete semantic instants | Half intervals, durations |
| `Slot` | Injecting runtime text values | Injecting SVML syntax or arbitrary AST |

Comments are trivia, not a seventh semantic construct. Every caption style, B-roll, Ranking,
Deck, sound effect, silence, generation prompt, node port and consumption policy references a
Selection or Moment from outside `<script>`. A consumer does not belong to any one Segment;
one consumer may have several ports, and each port may take one or more Selections/Moments. A
Selection may cross Segments or consist of disconnected intervals, and a Moment may likewise
have several occurrences.

Script compilation MUST first produce a Narrative IR that preserves source mapping, and then
project the three texts from that same IR. Producing three unrelated strings first and then
guessing the correspondence between them is forbidden.

| Projection | Content | Typical consumers |
|---|---|---|
| `dialogue` | Role Cue + actual pronunciation | Dialogue/video generation such as Seedance |
| `speech` | Actual pronunciation only | Estimate, TTS, Speech Reference, alignment |
| `caption` | Display text only | Captions and text display |

## Worked example

```svml
<script>
  @whole

  <hook>
    <A> I just @laugh @pop! <lmao | laughed my @punch ass out @/punch> @/laugh.
  </hook>

  @silence
  <pause/>
  @/silence

  <close>
    <B> Meet <${product} | ${product_pronunciation}>.
  </close>

  @/whole~
</script>
```

If `product = "SVML"` and `product_pronunciation = "ess vee em ell"`, the three text
projections are:

```text
dialogue
A: I just laughed my ass out.
B: Meet ess vee em ell.

speech
I just laughed my ass out.
Meet ess vee em ell.

caption
I just lmao.
Meet SVML.
```

`silence` is only the name of a Selection; it does not automatically mute the audio. It
completely selects the two independent structural endpoints of the empty Segment; actual
silence or footage behaviour is decided by the outer Program. `pop` is a Moment with the
default right affinity, resolved to the onset of `laughed`; it likewise enters no text
projection.

## 1. Document and Segment

In the official Markup Frontend, one `<script>` Surface instance produces one Narrative; the
`<script>` shell is dispatched by Text according to the post-import Surface Registry, and the
Script Parser receives only its raw body. A Script body has only two Segment forms, the named
block and the named empty block:

```svml
<intro>
  Hello.
</intro>

<pause/>
```

Normative rules:

- A Script contains one or more Segments in source order.
- A Segment's tag name is its id; the id is unique within the current Script, and Segments
  MUST NOT nest.
- A Segment opening accepts no attributes; `script` is the reserved name of the outer raw
  Surface and MUST NOT be used as a Segment id.
- Natural language may appear only inside a Segment; between Segments only whitespace,
  Selection/Moment markers and comments are allowed.
- An empty Segment uses the self-closing form. It has structural start/end cut points, but no
  lexical anchor.
- An empty Segment implies neither silence nor any default duration. Its physical duration
  comes from media, from a generation result, or from a Program outside `<script>`.
- A Segment does not automatically declare a Selection of the same name. Selecting one, three
  or any number of Segments MUST be written as an explicit closed Selection.
- Every Segment independently owns two stable identities, `start` and `end`; adjacent
  Segments do not share structural endpoint identity. The two identities may land on the same
  ProgramPoint at a hard cut, or on different points because of overlap or gap, but they MUST
  NOT be merged into one identity.

For example, selecting three consecutive Segments:

```svml
@chapter
<one>
  One.
</one>
<pause/>
<two>
  Two.
</two>
@/chapter
```

## 2. Role Cue

A Role Cue appears only after the parser has entered some Segment body, and it opens a spoken
turn. Its recognition is determined by parse state, independent of logical line starts and
physical newlines:

```svml
<dialogue>
  <A> What time
      is it?
  <B> It’s 8:30.
</dialogue>
```

The following compact form has exactly the same Narrative semantics:

```svml
<dialogue><A> What time is it?<B> It’s 8:30.</dialogue>
```

In the `dialogue` projection the canonical serializer emits it as:

```text
A: What time is it?
B: It’s 8:30.
```

In the `speech` and `caption` projections, both `<A>` and `<B>` are removed. A Role Cue is not
a speaker data model: it creates no character entity, selects no voice, and does not implicitly
group captions. An outer Program may explicitly write `role="A"` to query those spoken turns.
The Caption Program lowers such a query directly into a `CaptionDisplayWordSubset`; it is not a
temporal Selection and does not fabricate a Selection Record. `<A>` on its own triggers no
styling, character, voice or footage behaviour.

To remove ambiguity:

- In Segment body state, a bare angle-bracket construct that contains no unescaped `|`, has no
  attribute and no `/`, and satisfies the Role label character constraints is recognized as a
  Role Cue; it MUST be followed by non-empty spoken content before the next Role Cue or the end
  of the Segment.
- A colon in the body is always body text; the parser never guesses a speaker from `A:`.
- A single non-empty Segment either has no Role Cue at all, or its first spoken atom MUST be
  opened by a Role Cue. Temporal markers, comments and layout whitespace do not count as spoken
  atoms; a Segment that has already begun with cue-less body text MUST NOT switch to cued mode
  partway through.
- A Role Cue's turn continues until the next Role Cue or the end of the Segment. Physical
  newlines inside a turn are layout whitespace only: they do not end the turn, and they do not
  require the Role Cue to be repeated.
- A Role Cue is not a container tag and has no close syntax; forms such as `</A>` and `</B>`
  MUST fail as unknown angle-bracket constructs, and the formatter never emits them.
- A Role label is readable text of 1–32 Unicode characters after NFC; it may consist of Unicode
  Letter, Mark, Number, interior spaces, `_`, `-` and `.`, and MUST NOT have leading or trailing
  whitespace. Quotes, `=`, `/`, newlines, `<`, `>`, `|` and `:` are all illegal, so an unknown
  structural tag carrying attributes is never swallowed as a Role Cue.
- In the `dialogue` projection, the canonical serializer emits a Role Cue boundary as one
  newline plus a `label: ` prefix; in `speech` and `caption` only the cue is removed, and the
  necessary separation between adjacent atoms is preserved. Re-wrapping the source MUST NOT
  change the semantic content of the Narrative IR or of any text projection; the only things
  allowed to change are the source range and the source hash.

## 3. Dual Text

Dual Text writes out the display text and the actual pronunciation at the same time:

```svml
<lmao | laughed my ass out>
```

The left side enters `caption`; the right side enters `dialogue` and `speech`. Ordinary body
text is shorthand for `<text | text>` and needs no markup.

Dual Text is an atomic, non-nestable correspondence unit, not a simple string substitution:

- Either side may be an arbitrary N:M text mapping; the word counts need not be equal.
- After layout whitespace is removed, the right side MUST be non-empty; text that is only
  displayed and never spoken does not belong to Script and should be expressed by an outer
  Text/Deck/Caption Program.
- The left side may be empty: for example `< | um>` means the filler is actually spoken but
  not displayed in captions.
- Slots may be used on both sides; Selections/Moments may appear only on the speech side, and
  only at its lexical token boundaries.
- The entire display side inherits the time span of the entire speech side. If a display word
  needs independent timing, selection or styling, the author MUST split it into several Dual
  Text atoms.
- An ordinary temporal consumer may select part of the tokens on a Dual Text speech side; but
  if a caption ownership/style consumer covers only part of the speech span of a Dual Text
  atom, compilation MUST fail with `partial dual atom` rather than guess how to cut the
  left-side display text.

For example, a legal fine-grained temporal selection:

```svml
<lmao | laughed my @middle ass out @/middle>
```

`middle` may be used by B-roll or a sound effect; if it is used as a local caption replacement
region for that `lmao`, it MUST be an error. The author can provide an explicit mapping by
splitting the atom.

Dual Text expresses only "what was actually said". IPA, SSML, stress, rate, language, emotion,
timbre and vendor-specific pronunciation dictionaries are not a fourth body text layer; they
should be expressed by an outer generation/speech Program that references a Selection or a
lexicon resource.

## 4. Selection

A Selection is a semantic interval declaration that the author closes explicitly:

```svml
@id ... @/id
~@id ... @/id~
```

Every start marker MUST have an end marker with the same id. Script's public value emits, for
every occurrence, an already-resolved `startAnchorId` and `endAnchorId`; there is no start-only
object, no consumer-side default tail completion, and no "half the information was transmitted"
state. Left/right affinity, token indices and source ranges belong to the Parser/Source Map and
do not leak into the public Selection. A downstream that needs physical time MUST project those
two identities together with an explicitly connected `CompleteSemanticMap` into an interval.

"Closed" means both source endpoints are explicitly declared. The physical runtime uses half-open
`[startFrame, endFrameExclusive)` Frame Spans.

### 4.1 Left and right affinity

The marker itself is zero-width and enters no text projection. It sits between two optional
semantic boundaries, one on each side:

| Endpoint form | Affinity | Typical meaning |
|---|---|---|
| `@id` | Right | Start at the word start on the right or the structural endpoint on the right |
| `~@id` | Left | Expand outward to the word end on the left or the structural endpoint on the left |
| `@/id` | Left | End at the word end on the left or the structural endpoint on the left |
| `@/id~` | Right | Expand outward to the word start on the right or the structural endpoint on the right |

Examples:

```svml
before @x hello @/x after
```

`x` runs by default from the word start of `hello` to the word end of `hello`.

```svml
before ~@x hello @/x~ after
```

`x` expands outward on both sides, taking the nearest optional boundary to the left of `~@x`
and to the right of `@/x~` respectively.

```svml
@pause
<empty/>
@/pause
```

The start of `pause` attaches to the start cut point of the empty Segment, and its end to that
Segment's end cut point. A Selection may lie entirely outside a Segment, and may also span any
number of Segments.

### 4.2 Closure, crossing and disconnection

The same id may appear in sequence several times, compiling into one disconnected Selection
holding several independent anchor pairs:

```svml
@beat one @/beat ... @beat three @/beat
```

Different ids may cross freely; XML-style nesting is not required:

```svml
@a one @b two @/a three @/b
```

The specification requires the parser to manage open state per id rather than with a single
global stack. The following MUST fail:

- an unclosed marker, an orphan close, or mismatched open/close ids;
- re-opening an id that has not yet been closed;
- a Selection marker cutting into a v1 speech token;
- relying on a consumer default span to complete a missing endpoint.

Multiple occurrences of the same id keep source order and stable occurrence identity. Different
SelectionSets, and different occurrences of the same set, may overlap in physical time.

### 4.3 Optional temporal boundaries

After Slot binding, Dual Text speech projection and NFC normalization, v1 uses the deterministic,
normatively defined `speech-tokenizer-v1`:

- East Asian ideographs and kana form single-character tokens;
- other supported script/digit characters form maximal contiguous runs;
- `'` or `’` is kept only when it sits between two run characters;
- whitespace, punctuation, emoji and other separator characters produce no lexical token.

Punctuation therefore cannot be timed on its own, and a Selection/Moment cannot cut into a
single token. The v1 compiler tokenizes after removing the zero-width markers, so if grapheme,
syllable or phoneme boundaries are ever needed, the same Selection/Moment types can be reused in
a new timing profile / Script Surface version; v1 should not introduce new body symbols for a
precision that does not yet exist.

If a Script has `N` Segments, the `k`-th Segment has `mₖ` speech tokens, and `M = Σmₖ`, the
Semantic Anchor Index has exactly:

```text
Σ(2mₖ + 2) = 2M + 2N
```

stable identities. The local order inside each Segment is:

```text
segment[k].start
token[k,1].start
token[k,1].end
...
token[k,mₖ].start
token[k,mₖ].end
segment[k].end
```

The Program start and end belong to the ProgramBasis and do not additionally enter the Semantic
Anchor Index. An empty Segment still has an independent start/end even when the two ultimately
coincide; any two distinct identities MUST NOT be merged even if they end up on the same frame.

The Locator MUST commit a total mapping covering all `2M + 2N` identities:

```text
SemanticAnchorIdentity → ProgramPoint(ProgramSpace)
```

A marker's left/right affinity is resolved to exactly one anchor at Script parse time. Token cut
points and Segment cut points are entirely equal here: a left-affine marker at the head of a
Segment takes that Segment's own start cut point and never reaches back to the word end of the
previous Segment. Downstream receives anchor identities and no longer performs index arithmetic
of its own.

Location is total: every token of every Segment carries a window, whether it was measured,
inferred from adjacent characters, or interpolated because the transcript never touched it.
Reversed windows, windows outside their owning Segment, and windows overlapping their neighbours
are all reported exactly as measured; that is a fact about the recording, and interpreting it
belongs to whoever projects it onto a timeline. Location fails only when the Script, the audio
and the transcript are not the same set of three things, never because of a single timestamp.

Every point MUST exist. A consumer MUST NOT invent points, move points, or borrow points from an
adjacent occurrence. Inside each Segment the order MUST be non-decreasing:

```text
segment.start ≤ token₁.start ≤ token₁.end ≤ ... ≤ segment.end
```

Segments `A` and `B` that are adjacent in source MUST additionally preserve:

```text
A.start ≤ B.start
A.end   ≤ B.end
```

This permits hard cuts, overlaps and gaps, while forbidding a Locator from silently ordering an
entire later-written Segment before an earlier-written one:

```text
hard cut   A.end == B.start
overlap    B.start <  A.end
gap        B.start >  A.end
```

If genuine reordering or parallel speech is ever needed, an explicit non-linear narrative model
should be published; v1 does not let an ordinary Range reverse or vanish under a different
Locator.

The same Selection yields preview or final-cut intervals on the `CompleteSemanticMap` produced by
different fulfillments. The Map uses the same identities. Script itself contains no seconds, frame
numbers or sample points. Script Surface is not bound to a frame rate, sample rate or renderer.
Once a backend has chosen a physical clock it MUST quantize exactly once and let every consumer
reuse the same integer boundaries; a change of backend clock does not change this language surface.

Alignment, structural endpoints, projection or frame quantization may make some occurrence end up
as a zero-length or reversed interval. An implementation MUST produce an explicit diagnostic and
MUST NOT silently drop it, move Selection endpoints, borrow an adjacent occurrence, or complete
the range on the author's behalf.

## 5. Moment

A Moment is a complete point declaration, not a Selection with its close omitted:

```svml
@id!
~@id!
```

`!` explicitly marks the type of this name as Moment. It neither needs nor allows a close:

| Form | Affinity | Typical meaning |
|---|---|---|
| `@id!` | Right | Word start on the right or structural endpoint on the right |
| `~@id!` | Left | Word end on the left or structural endpoint on the left |

The default right affinity covers the frequent "starts together with some word" case:

```svml
I just @pop! laughed my ass out.
```

`pop` resolves to the onset of `laughed`. Explicit left affinity is written as:

```svml
I laughed ~@pop! and left.
```

`pop` resolves to the release of `laughed`. When it sits between two Segments, the left candidate
is the previous Segment's `end` and the right candidate is the following Segment's `start`; the
two may be the same point, or different points because of overlap or gap.

Normative rules:

- `@id!` / `~@id!` with the same id may repeat and compile in source order into one Moment; the
  public value of each occurrence is a single resolved `anchorId`.
- Selection and Moment share the temporal name namespace. One id MUST NOT declare both types;
  `@x! ... @/x` MUST fail with a type conflict.
- A lone `@x` is always an unclosed Selection open and MUST be an error; the parser MUST NOT
  guess it to be a Moment just because it found no `@/x`.
- `@id!~` is a redundant and illegal right-affine form; right affinity is written only in the
  canonical form `@id!`.
- The syntax accepts only ASCII `!`. An unescaped `@id！` (fullwidth exclamation mark) is
  malformed temporal syntax and MUST NOT degrade to body text.
- Moment and Selection markers may appear in the same positions, including between Segments and
  on the speech side of Dual Text, but neither may cut into a v1 speech token.
- A Moment only selects one candidate point already present in the Semantic Anchor Index; it adds
  no anchor identity, so the exact count `2M + 2N` does not change with the number of Moments.
- Moment and Selection reuse the same CompleteSemanticMap and the same one-time frame
  quantization; the only difference is that the final carrier is `Point[]` rather than `Range[]`.

The consumer side keeps two types that never mix:

```text
NarrativeSelection = { startAnchorId, endAnchorId }[]
NarrativeMoment    = { anchorId }[]
```

The recommended explicit usage relationships are:

```svml
during="phrase"        <!-- accepts a SelectionSet only -->
at="pop"               <!-- accepts a MomentSet only -->
at="phrase.start"      <!-- start-point projection of each range of a SelectionSet -->
at="phrase.end"        <!-- end-point projection of each range of a SelectionSet -->
```

`at="phrase"` MUST NOT default to guessing start, and `during="pop"` MUST also be a type error. A
consumer that needs both a window and a trigger point MUST use two fields/ports rather than build
a polymorphic `Range | Point | mixed[]` TemporalRef. Whether a port needs `one` or `each` belongs
to the consumer's cardinality contract and does not change Script's single/multiple occurrence
syntax.

## 6. Slot

Current implementation status: `parseScript` already implements the parse-first, literal-only
binding contract below, but the official `<script>` Author Surface does not yet expose a bindings
input. An unbound Slot currently fails in `main.svml` with `SCRIPT_SLOT_UNBOUND`; public usage
examples MUST NOT claim that Slot is directly usable before the Surface completes the binding edge.

A Slot is a first-class AST atom recognized by the parser:

```svml
${product}
<${product} | ${product_pronunciation}>
```

A Slot id after NFC MUST consist of 1–64 characters: the first character is a Unicode Letter or
`_`, and the remaining characters may be Unicode Letter, Mark, Decimal Number, `_` or `-`. A bound
value is single-line Unicode plain text and MUST NOT contain CR/LF or control characters.

Key safety rules:

- Parse the Script first, then bind Slots; string substitution before parsing is forbidden.
- A bound value always enters an already existing atom as literal text and MUST NOT inject a
  Segment, Role Cue, Dual Text, Selection, Moment, Slot, comment or escape sequence.
- An unbound Slot may remain in the structured editing IR, but anything that produces the three
  texts, computes tokens or compiles a timeline MUST fail closed.
- An SVML v1 writer emits only `${variable}`; an unescaped `[variable]` is just ordinary body text.

## 7. Lexical reservation, escaping and canonical formatting

The source uniformly converts CRLF/CR to LF and applies Unicode NFC. Unescaped `<`, `@` and `${`
in the source language are reserved syntax starts. Malformed reserved syntax MUST be an error and
MUST NOT degrade to spoken text.

Body escapes:

```svml
\@openai
\<not-a-role>
\${literal}
\\
```

Inside Dual Text there are additionally:

```svml
\|
\>
```

An unknown backslash escape MUST be an error. Parse priority is fixed as:

1. comments, temporal markers and named Segment opens in Script body state;
2. the current Segment's close in Segment body state;
3. an inline `<display | speech>` containing one unescaped separating `|` in a Segment body;
4. a bare `<Role>` in a Segment body satisfying the Role label contract;
5. any other angle-bracket construct is an error.

Segment names and temporal names use independent namespaces; Selection and Moment share the
temporal name namespace. All three kinds of id satisfy:

```text
[a-z][a-z0-9_-]{0,63}
```

Source indentation, newlines and runs of whitespace are all authoring layout: they take no part
in recognizing a Segment, a Role Cue or a turn, and they are not caption line-break or pause
instructions. The compiled projections preserve the necessary separation at atom boundaries and
normalize layout whitespace; caption cue segmentation and hard line breaks are decided by the
outer Caption Program.

Structural tags and comments do not depend on occupying a line of their own to be parsed. The
canonical formatter puts each structural tag and each comment on its own line, indents Segments
by two spaces and spoken content inside a Segment by four spaces, and leaves one blank line
between Segments. The Narrative IR obtained by re-parsing before and after formatting MUST have
identical semantic content; the only things allowed to change are the source range and the source
hash.

Comments use `<!-- ... -->`. They may span lines but MUST NOT nest, and MUST NOT be written inside
Dual Text, a Slot, a temporal marker, a Role Cue or a structural tag. A comment may appear wherever
layout whitespace is allowed between atoms and is treated as layout whitespace; the canonical
formatter gives it its own line. A comment enters the semantic content of no projection, token,
Selection, Moment or hash; a separate source hash may be computed when a reproducible source
identity is needed.

## 8. Narrative IR and the consumer contract

The parse result preserves at least:

- Segment order, ids and independent start/end identities;
- each Segment's ordered spoken turns, together with each turn's stable identity, optional Role
  Cue, token range and source range;
- plain / Dual Text / Slot atoms and their source ranges;
- Caption display Atoms, their internal ordered display Words, and the independent explicit
  mapping from an Atom to one or more speech tokens;
- one or more ordered occurrences per Selection, and each occurrence's resolved
  `startAnchorId` / `endAnchorId`;
- one or more ordered occurrences per Moment, and each occurrence's resolved `anchorId`;
- the Parser/Source Map separately preserves affinity and token/source ranges; public values do
  not carry them;
- the complete ordered `CaptionDisplaySequence`, an independent `CaptionCorrespondence`, and a
  `CaptionDisplayWordSubset` for every explicit Selection. Captions need not, and MUST NOT,
  reverse-engineer word indices from public Selections.

An outer Program's `role="label"` selector may project its own word subset out of the full word
set above; several Turns with the same label are several ordered, mutually non-adjacent hits. It
is an explicit query internal to the Caption author surface, not an implicit caption behaviour of
Role Cue, and it establishes no speaker entity.

SelectionSet/MomentSet are consumer boundaries, not sub-objects of a Segment. The typical external
relationships are:

```text
Script ──compile──> Narrative IR ──project──> dialogue / speech
                           ├──resolve──> NarrativeSelection[] / NarrativeMoment[]
                           └──project──> CaptionDisplaySequence
                                         + CaptionCorrespondence
                                         + CaptionDisplayWordSubset[]

NarrativeSelection A ──during──> consumer.port_1
NarrativeMoment P    ──at──────> consumer.port_2
CaptionDisplayWordSubset C ──words──> caption.Program
```

One Ranking, B-roll or other node may have several dynamic ports, each accepting different
Selections/Moments; the same set may also be reused by several consumers. A future Graph syntax
may write these typed edges as `during=` / `at=`, but they MUST reference resolved names or
endpoint projections and MUST NOT accept vague natural-language locators.

Caption multi-style, region, cue segmentation, annotation, mute and layout all belong to the
Caption Program. If a Caption consumer requires mutually exclusive token ownership, an overlap
MUST be a compile error for that consumer; this is not Script forbidding Selections to overlap.
If Caption ever supports overlay, only the Caption Program is extended, not the body syntax.

The current Caption Program uses one default Style covering every visible word, then applies whole
Style replacements from Roles or explicit Selections in source order, with the last matching rule
winning. A Turn without a Role automatically keeps the default Style; modifying one local interval
does not require the author to write its complement. The complete rules are in
[`caption-program.md`](./caption-program.md).

## 9. What v1 explicitly does not express in Script

The following capabilities are not a missing seventh inline marker:

| Requirement | v1 owner |
|---|---|
| Absolute seconds, frame numbers, sample points, arbitrary sub-frame positions | Runtime/Program outside Script |
| Phoneme- or grapheme-level cut points inside a token, punctuation-specific timing | A later timing profile or a new version |
| Preview duration of an empty Segment | Media, a generator or an explicit Program |
| Simultaneous overlapping speech | Multi-track media/generation Program; the Base Script remains a sequential semantic axis |
| Laughter, coughing, ambience, SFX, beeps | Audio/generation/SFX Program |
| Pure display text with no speech timing basis | Text, Deck or Caption Program |
| Caption styling, manual line breaks, motion, on-screen action | The corresponding Program referencing a Selection |
| Tone, emotion, timbre, stress, rate, SSML | Speech/Generation Program |
| Consumers, nodes, ports, DAG wiring | SVML regions outside `<script>` |

These boundaries keep Script a "script you can read directly", while not preventing full SVML from
ultimately compiling a deterministic DAG and timeline.

## 10. Completeness and the extension test

Classify a new requirement in the following order:

1. The display text differs from the actual pronunciation: Dual Text.
2. The speaker prefix of the dialogue export differs: Role Cue.
3. The semantic time range differs: Selection.
4. The semantic instant differs: Moment.
5. The sequential media/spoken block differs: Segment.
6. The runtime text input differs: Slot.
7. The caption, picture, audio, generation or consumption behaviour differs: a Program outside
   Script.

As long as a requirement falls into one of these seven, no new inline delimiter may be invented.
If none of the seven can express it losslessly, first prove that it is script semantics rather
than a Program, then handle it as a new version proposal; an existing parser MUST NOT be made to
"support it along the way".

## 11. Implementation acceptance

An implementation may declare Script Surface v1 support only when it satisfies all of the
following evidence at once:

1. every positive example, negative example, projection and source-map golden fixture in this
   document;
2. parser, formatter, Narrative IR and the three projections depend on no provider and no
   renderer;
3. SelectionSet supports closure, crossing, disconnected occurrences and left/right affinity;
4. MomentSet supports `@id!` / `~@id!`, single/multiple occurrences and the `at` type gate;
5. Dual Text keeps one auditable source map across speech, caption and temporal mapping;
6. Slot uses parse-first, literal-only binding and cannot inject syntax;
7. unknown versions, unknown reserved syntax, mixed temporal types and partial dual atoms all
   fail closed.
8. the canonical serialization, digest, complete Map and adjacent-Segment double monotonicity
   constraint for the `2M + 2N` identities all have golden fixtures; hard cut, overlap, gap,
   empty Segment and coincident endpoints are all covered.
