# `@hypit/caption`

The deterministic Caption contract. Script emits one `CaptionDocument` containing display words,
N:M alignment units and authored `||` cue breaks. Caption applies Styles to complete units selected
by a Role or a semantic Selection, then joins those units to a `SemanticTrack` for frame timing.

```xml
<caption:Program id="captions" document={story.caption} narrative={story} default={plain}>
  <caption:Use role="HOST" style={impact}/>
  <caption:Use selection={story.selection.emphasis} style={plain}/>
  <caption:Use attribute="emphasis" style={keyword}/>
</caption:Program>
```

There is no planner, model call or frame range in this authoring contract. A Selection is projected
to complete alignment units before timing; a Selection that cuts through an N:M unit is rejected.
Script-native word attributes are resolved separately as local word Style runs and do not create
another timing source. They are part of the common Caption contract for structural Caption families;
`@hypit/caption-fine` deliberately rejects them because Fine requires one uniform token rule per Cue.
