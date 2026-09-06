# Script and semantic time

Read this when structuring Script, balancing spoken delivery across generated Takes, or attaching
pictures, Captions, MG, Effects, and Audio to what is said. It also explains how a passage with no
spoken words receives semantic boundaries. The installed `@hypit/script` vocabulary
and package README supply exact marker spellings and parsing details.

[Source syntax](../production/source-syntax.md) covers the surrounding imports, references, Recipes
and Runs; [Tracks](../production/tracks.md) covers the consumers of Script meaning.
[Media preparation](../production/media.md) explains connecting actual footage to a Segment, and
[Runs](../production/runs.md) explains choosing estimated timing for a layout study.

## Script is the target's sole verbal authority

`<script>` contains the words the target video will say. It contains no reference timecodes, media,
visual Style parameters, prompts, or provider decisions. Semantic word attributes such as
`useful{emphasis}` can identify a word's role for a Caption family. Brief may preserve required claims and Treatment may describe
the purpose of a passage, but the adopted wording appears in Source only once.

Use Script's distinct authoring concepts for distinct jobs:

- a **Segment** is a named structural passage whose accepted media can become one SemanticTake;
- a **Role Cue** says who speaks a turn without creating a character or choosing a voice;
- **Dual Text** gives one authored unit separate display and pronunciation text;
- `||` places an authored **Caption Cue Break** between complete Alignment Units;
- a **Selection** names a semantic range;
- a **Moment** names a semantic point.

```svml
<script id="story">
  <hook>
    <HOST> I made @proof this tiny product || work overnight @/proof.
  </hook>
</script>
```

Here `||` authors two reading Cues while `proof` remains one semantic range that other layers can use.

Script also represents passages without speech:

```svml
<script id="story">
  <empty></empty>
</script>
```

`empty` is an ordinary Segment name; a name such as `product-detail` can express the passage's role.
No words does not mean no semantics: the Segment retains its identity and start/end anchors. Its
associated normalized media determines the duration, and its SemanticTake has an empty word array.
The same SemanticTrack and Track timing vocabulary apply to a wordless passage or an entire
speech-free piece. The empty tag itself declares neither a zero-length interval nor a duration.

Choose Segment boundaries from natural production passages and delivery length, not from every
picture cut. One Segment and Take can carry several speaking turns, camera cuts or a split-screen
conversation. One continuous narration can carry many B-roll changes through Selections. Edited UGC
can deliberately use several Takes driven by the same character-and-scene image; a natural cut is
often part of its appeal. A Role change or `||` does not require another generation.

## Author Caption rhythm, not a word-count rule

Caption Cues express how the viewer should read the displayed speech. Break them at natural phrase,
emphasis, speaker, layout, and motion boundaries. A large display or rapid word-by-word system may
need very small Cues; a restrained lower Caption may hold a longer phrase. Inspect the actual style and
canvas.

Keep `||` between complete Alignment Units; it cannot split Dual Text. Script emits one
`CaptionDocument` containing display words, alignment units, attributes, and authored Cue breaks but
no seconds or frames. Caption packages later join that document to actual semantic timing. Independent
titles, labels, steps, and poster text normally belong to Typography, Text Track, UI, or MG rather than
being forced into spoken Caption Cues.

## Measure before choosing durations

For generated speaking Takes that require a literal `duration`, measure the adopted wording before choosing that
number. `hypit measure` counts a Segment's pronunciation units and reports how many seconds they need
at an author-chosen pace or numeric rate:

```bash
hypit measure path/to/source.svml --segment opening --language en --pace normal
hypit measure path/to/source.svml --segment proof --language en --pace normal
```

Its immediate use is to give each request a sensible media length. Its deeper use is to keep related
Takes inside one performance: measure them with the same delivery policy and compare the results, so
their pronunciation units receive compatible amounts of time. A denser Segment needs more time at
the same pace; a Segment forced into a short model window may need a faster intended delivery, tighter
copy, or a deliberate split. Use the desired pauses, action, edit, model range, and rounding to choose
the final literals. If the wording or delivery changes, measure the affected Segments again.

Measurement balances the intended speaking density and sizes generation; it supplies no timeline
anchors. Once a Take is accepted, normalize it, align its actual speech to its Script Segment, and
assemble the resulting SemanticTakes into the SemanticTrack. The literal duration answers how much
media to request. The aligned words answer where Caption, B-roll, MG, and Effects belong in that actual
media. Alignment measures real word positions inside that media envelope; it does not reproduce an
estimated distribution of words.

For a wordless Segment, choose the requested duration from the action, music or visual rhythm.
Speech-rate measurement has no role there; the resulting media still determines its Segment span.

## Bind meaning to Script identities

For a picture, Caption treatment, MG state, sound, or effect that belongs to spoken meaning, author a
Selection or Moment and let the consuming Track project it through the SemanticTrack. Use explicit
seconds for genuinely clock-based or speechless design.

Selections may overlap or cross. Default markers are already exact: `@videos videos @/videos` opens
at the word's start and closes at that same word's end. Script also offers explicit left/right affinity
when the design intentionally includes an adjacent gap or structural boundary. The `@hypit/script`
package README owns the marker spellings. For adjacent B-roll that should not reveal the underlying
picture, use the shared-boundary examples in [B-roll craft](../playbooks/craft/b-roll.md).

Reference archives keep original seconds and explain which original words or content events an item
serves. The target Source names the intended relation against the target Script. After the target's
actual audio is aligned, the SemanticTrack supplies its frames. Do not copy a reference timestamp into
the target or preserve an incidental lead/lag unless that offset itself is part of the design.

## Let the creation and production loops meet honestly

Timing seen in Studio or a real Result may expose one of several different problems. A wrong Cue or
semantic anchor changes Script. A sound performance that changes the intended rhythm may change the
duration choice or Treatment. A correct Selection rendered badly changes the component or Recipe. An
unusable generated Take changes its prompt, reference, Candidate, or shot design. Put each correction
where its fact is owned.
