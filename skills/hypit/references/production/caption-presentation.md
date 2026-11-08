# Caption presentation

Read this to apply subtitle treatments, change them by speaker or Cue, hide selected Cues, or enable
Karaoke. [Caption craft](../playbooks/craft/captions.md) owns visual direction;
[Caption authoring](caption-authoring.md) explains creating another family.

Script authors Words, display-to-speech Units, Cues and optional word attributes. Alignment produces
source-local Unit timing. A project program combines those facts with presentation choices and writes
ordinary NLE Component Items. The accepted NLE project contains direct rational time and complete
Cue-local payloads; it does not retain Script, Binding, transcript, media-following or named semantic
dependencies.

```ts
const presentation = appendCaptionStyleOverride(
  appendCaptionHiddenOverride(
    createCaptionPresentation(baseStyle),
    { id: "hide-pause", selector: { cues: ["cue-4"] } },
  ),
  { id: "guest-role", selector: { roles: ["GUEST"] } },
  guestStyle,
);

const transaction = createCaptionNleMaterializationForMediaItem(project, {
  id: "story-captions",
  mediaItem: "interview-use",
  track: "captions",
  document: story.caption.document,
  timing: captionTiming,
  presentation,
  picture: captionPicture,
});
```

Overrides are evaluated in order and the last match wins. Role rules can cover non-contiguous turns;
Cue rules can hide or restyle one passage. They do not change Word spelling, Unit timing or Cue
membership. A hidden Cue becomes a complete disabled Item, so the editor can restore it without
reopening semantic evidence.

The official `@hypit/caption-basic` family stores every Word and every Unit boundary inside each
materialized Cue Item. Static, current-unit and trailing Karaoke are therefore Style choices over
facts already present in the NLE. Enabling Karaoke does not rerun WhisperX or alignment.

Word attributes such as `word{face=serif}` are different from Cue presentation overrides. They are
local authored roles inside one Cue, preserved in `CaptionDisplayWord.attributes`; the selected
Caption family decides their visual meaning. Basic Caption may ignore an attribute it does not own.

After materialization, moving, trimming, disabling, deleting, restyling, correcting a displayed word
or adjusting one Unit boundary are ordinary NLE edits. They do not write back to Script or the media's
transcript. Rerunning the authoring program is an explicit regeneration operation, not a hidden live link.
