# `@hypit/seedance-kits`

Data-only authoring Kits for recurring Seedance semantics. They are `TextTemplate` source modules,
not model wrappers, Providers or new execution nodes.

Import a selected public Source from the installed package, for example
`@hypit/seedance-kits/speaker`. The package manager or active Distribution owns the installed
version; Source Closure reads that Source and its relative dependencies without copying it into the
video project or reaching through a physical `../../packages/...` path.

Each Kit is rendered by the domain-neutral `text:Render` Surface. Its Text output then feeds one of
the three low-level `@hypit/seedance` invocation modes. Reference media and duration remain
ordinary explicit graph edges:

```svml
<import as="text" from="@hypit/text@1"/>
<import as="seedance" from="@hypit/seedance@1"/>
<import as="broll-kit" source="@hypit/seedance-kits/broll"/>

<text:Render id="broll-prompt" template={broll-kit.broll-v1} recipe={recipes.broll}>
  <text:Set name="story" text={copy.broll}/>
</text:Render>

<seedance:ReferenceVideo id="broll" model="mini" prompt={broll-prompt}
  duration="5" resolution="720p" aspect-ratio="9:16">
  <seedance:Reference image={scene}/>
  <seedance:Reference image={product}/>
</seedance:ReferenceVideo>
```

Speaker uses the same graph vocabulary. The Kit assumes `@image1` is the visible person and
`@audio1` is the voice-timbre reference; it owns no media counting or generation wrapper:

```svml
<import as="speaker-kit" source="@hypit/seedance-kits/speaker"/>

<text:Render id="hook-prompt"
  template={speaker-kit.speaker-v1}
  recipe={recipes.speaker.host}>
  <text:Set name="dialogue" text={story.segment.hook.dialogue}/>
  <text:Set name="action" text={hook-action}/>
</text:Render>

<seedance:ReferenceVideo id="hook-take" model="mini"
  prompt={hook-prompt} duration="8"
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
- `street-interview-v1`: interviewer, guest and shared street views, two voices and microphone positioning;
- `motion-reference-v1`: preserve the subject and transfer body motion only;
- `camera-reference-v1`: preserve the subject and transfer camera language only.

Speaker, B-roll, Podcast, Call and Street Interview expose prompt choices through their Text
Templates. The examples above use author-chosen literal durations. Measure adopted speech with
`hypit measure` first, then choose a duration within the selected model's declared range; there is
no duration-estimation node on the generation route.

## Recipe, dialogue and action

The Recipe carries recurring choices exposed by the selected template. `dialogue` receives the
Script Segment's `.dialogue` Text, retaining pronunciation and Role turns. Optional `action` supplies
this passage's attitude, attention, interaction and any motivated cuts admitted by the Kit.
Do not retype the complete spoken text into action or treat each Role turn as a required new Take.
For B-roll, `story` carries the silent visual events rather than spoken dialogue.

These files are reusable packaged authoring material. When one production needs a different prompt
structure, author a project-local Text Template and import that Source explicitly rather than
modifying the installed package. A Kit is not a Core restriction or a hidden media-generation wrapper.
Reference order, duration, audio generation and output aspect ratio remain explicit on the model
Surface. Setting a prompt option cannot create a media reference or execute a postprocess.

## Speaker: edited UGC from one useful view

Reuse the same person-and-scene image and voice for ordinary Takes belonging to one UGC performance.
Each Take can begin from that shared reference and meet the others at a natural cut. There is no
required previous-tail-frame chain. Independent generation follows the intended edited form.

For example, a lively ranking host can use:

```svs
speaker.host {
  composition-stability: strict-locked;
  camera-motion: none;
  edit-rhythm: pause-trim-jump-cuts;
  performance: high-energy-ugc;
  gesture: expressive;
}
```

`edit-rhythm: pause-trim-jump-cuts` asks the model for an edited pause-trim rhythm at phrase boundaries.
It is compatible with a fixed camera and active performance. `continuous-take` is another authored
choice, not a universal requirement. Actual speed changes, trimming or audio extraction are explicit
media operations; selecting this Recipe does not perform them on the returned video.

## Podcast: two views and living listeners

`@image1` is Host A's view, `@image2` is Host B's view; `@audio1` and `@audio2` correspond to those hosts.
If Script uses names such as GIRL and GUY, state their correspondence to A/B in action. One Segment
can contain the entire short exchange. Choose speaker or reaction cuts for the conversation rather
than splitting it into a generation per line.

Derive a complementary host view from the first useful scene image. Product variations normally
derive from each host's own view plus the product reference. Action can state the meaningful handoff
and resulting possession. Silent listeners can adjust posture, glance down and look back up; they
must not speak the partner's lines. A split-screen opening has a different layout from this two-view
template and can use its own explicit prompt and combined reference image.

## Street interview: three supplied setups

The image order is interviewer A, guest B, shared two-person setup; the voice order is A, then B.
The interviewer always holds the microphone, moving it between speaking positions. The guest does
not take ownership merely because the microphone is extended toward them.

Action chooses cuts among the supplied setups. Guest answers can favor the guest close view, brief
neutral questions the shared view, and a meaningful interviewer reaction their close view. Small
opening and closing actions can establish an encounter: the guest looks up from another activity
as the interviewer approaches, and begins to leave after the final answer. These are examples of
motivated direction, not mandatory actions on every request.

## Keep gesture and scene direction readable

Use attitude and a few decisive actions. Prefer an explanatory hand movement or emphatic gesture
over exact numerical finger arrangements; speech or downstream graphics can state the number.
Avoid exaggerated reactions or constantly moving every person simply to prevent stillness.

For a multi-scene B-roll montage, `story` can name the references in scene order and give each a small
action. Choose an edit language compatible with cuts. “Continuous within each scene” and “one
continuous shot for the whole montage” ask for different results.
