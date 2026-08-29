# `@hypit/seedance-kits`

Data-only authoring Kits for recurring Seedance semantics. They are `TextTemplate` source modules,
not model wrappers, Providers or new execution nodes.

Vendor the selected `.svs` file into the video project (for example `./kits/speaker-v1.svs`). This
keeps its bytes inside the project's Source Closure and Workspace boundary; a project must not
reach back into the installed Distribution through `../../packages/...`.

Each Kit is rendered by the domain-neutral `text:Render` Surface. Its Text output then feeds one of
the three low-level `@hypit/seedance` invocation modes. Reference media and duration remain
ordinary explicit graph edges:

```svml
<import as="text" from="@hypit/text@1"/>
<import as="seedance" from="@hypit/seedance@1"/>
<import as="broll-kit" source="./kits/broll-v1.svs"/>

<text:Render id="broll-prompt" template={broll-kit.broll-v1} recipe={recipes.broll}>
  <text:Set name="story" text={copy.broll}/>
</text:Render>

<seedance:ReferenceVideo id="broll" model="mini" prompt={broll-prompt}
  duration={broll-duration.duration} resolution="720p" aspect-ratio="9:16">
  <seedance:Reference image={scene}/>
  <seedance:Reference image={product}/>
</seedance:ReferenceVideo>
```

Speaker uses the same graph vocabulary. The Kit assumes `@image1` is the visible person and
`@audio1` is the voice-timbre reference; it owns no media counting or generation wrapper:

```svml
<import as="speaker-kit" source="./kits/speaker-v1.svs"/>

<text:Render id="hook-prompt"
  template={speaker-kit.speaker-v1}
  recipe={recipes.speaker.host}>
  <text:Set name="dialogue" text={story.segment.hook.dialogue}/>
  <text:Set name="action" text={hook-action}/>
</text:Render>

<seedance:ReferenceVideo id="hook-take" model="mini"
  prompt={hook-prompt} duration={hook-duration.duration}
  resolution="720p" aspect-ratio="9:16" generate-audio="true">
  <seedance:Reference image={presenter}/>
  <seedance:Reference audio={voice}/>
</seedance:ReferenceVideo>
```

The seven templates are:

- `speaker-v1`: one visible speaker, one character-and-scene image and one voice reference;
- `broll-v1`: silent visual micro-story;
- `podcast-v1`: two fixed podcast views with two voices;
- `call-v1`: two live video-call reverse views;
- `street-interview-v1`: interviewer, guest and shared street views, two voices and microphone handoff;
- `motion-reference-v1`: preserve the subject and transfer body motion only;
- `camera-reference-v1`: preserve the subject and transfer camera language only.

Speaker, B-roll, Podcast, Call and Street Interview expose finite orthogonal prompt axes through
their Text Templates. Speed, trim, last-frame extraction and audio extraction are ordinary media
operations and intentionally do not live in these templates.
