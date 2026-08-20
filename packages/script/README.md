# `@hypit/script`

Official raw Script Surface for the Markup Frontend. It parses prose-first named Segment blocks,
newline-independent Role Cues, Dual Text, Selection and Moment syntax, and lowers them to a
canonical authored Narrative value with exactly `2M + 2N` semantic anchor identities.

The package is an ordinary statically declared Surface module. Core does not import it and does not
know that Script, Segment or Narrative exist.

```svml
<script id="story">
  @answer

  <opening>
    <ALICE> 我先说第一句话。
    <BOB> 然后我来回答。
  </opening>

  <pause/>
  @/answer
</script>
```

`<opening>` opens a Segment named `opening`; `</opening>` closes that exact Segment. While the
parser is inside a Segment, a valid bare tag such as `<ALICE>` is a Role Cue. This is parser state,
not indentation: the compact spelling
`<opening><ALICE>我先说。<BOB>我回答。</opening>` has the same semantic value.

A Role Cue is optional. Text before the first Role Cue is a roleless Turn, and Role state is reset
when every Segment closes; a Role can never leak into the following Segment.

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
- `script.caption` is the complete left-side `CaptionDisplaySequence`;
- `script.caption.correspondence` maps each whole display Atom to its authored speech-token range;
- `script.caption.selection.<id>` is the display-word subset wholly owned by one Selection;
- `script.selection.<id>` is a reusable explicit Selection.

Seedance consumes dialogue `Text`, Estimate and TTS consume speech `Text`, Speech Track consumes the
Segment excerpt, and Caption consumes the explicit display and correspondence edges. None imports
Script's parser AST. Another authoring package may produce the same ordinary Text and structured
Narrative contracts.
