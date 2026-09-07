# `@hypit/semantic-take-estimate`

An explicit, provider-free semantic step for preview Builds.

```text
Narrative + spoken Segment + normalized SynchronizedMedia + SpeechEstimatePolicy
  -> syllable-weighted Token windows with real gaps
  -> SemanticTake
```

The package consumes existing normalized media. It knows nothing about how that media was made and
does not run an acoustic model. For a spoken Segment it preserves the Script's exact Segment, Token
and Anchor identities and predicts only their local frame positions. The media's complete frame
count is the allocation budget: after short edge and word gaps, every remaining frame is
distributed across Tokens by pronunciation-unit weight.

```svml
<estimated:SemanticTake id="opening-estimated" narrative={story}
  segment={story.segment.opening} media={opening-media.media}
  language="en" pace="normal" rounding="round"/>
```

For a spoken Segment, write the delivery policy inline as above or name an SVS Recipe with
`policy={recipes.speech.normal}`. `hypit measure` helps the author choose the media duration and
balance delivery across spoken Segments; the prediction then distributes that known frame domain
across the authored words.

An empty Segment already has all of the semantic timing it can carry: its start and end. Omit the
policy and the Surface maps those two authored Anchors to the prepared media boundaries without a
prediction step:

```svml
<estimated:SemanticTake id="pause-preview" narrative={story}
  segment={story.segment.pause} media={pause-media.media}/>
```

The result has the ordinary `@hypit/speech@1#SemanticTake` type. A Run can therefore choose this
Build output while real A-roll is unavailable, then later choose the corresponding WhisperX output
without changing Speech Track, Caption, Selection or Studio protocols.

For example, a later Studio Run may satisfy its ordinary measured-take output with the earlier
estimated Build product:

```svrun
<build-record id="opening-preview" build="bld_..." output="opening-estimated.take"/>
<satisfy output="opening-semantic.take" candidate="opening-preview"/>
```

This is ordinary Run candidate selection. Studio can evaluate deterministic work and the immediate
capabilities that the selected Provider permits for transient execution. Other required media work
can be completed through a Build and selected from its Result.

## Run Fragment

The package also registers `@hypit/semantic-take-estimate@1#semantic-take` as a Run Fragment:

| Input | Type |
| --- | --- |
| `narrative` | `@hypit/narrative@1#Narrative` |
| `segment` | `@hypit/narrative@1#NarrativeExcerpt` |
| `media` | `@hypit/media@1#SynchronizedMedia` |
| `policy` | `@hypit/estimate@1#SpeechEstimatePolicy` |

Its export is `take`, an ordinary SemanticTake. For a spoken Segment, the policy is a typed value
with `language`, `pace` or `rate`, `rounding` and optional `paddingSec`; the Author Surface publishes
it as `<id>.policy`. For an Author entry containing
the `opening-estimated` declaration above, a Run can use:

```svrun
<import as="estimate" from="@hypit/semantic-take-estimate@1"/>
<fragment id="timing" using="estimate:semantic-take">
  <input name="narrative" from="story"/>
  <input name="segment" from="story.segment.opening"/>
  <input name="media" from="opening-media.media"/>
  <input name="policy" from="opening-estimated.policy"/>
</fragment>
<satisfy output="opening-semantic.take" candidate="timing.take"/>
```

This selects predicted timing while retaining the required prepared-media dependency and any Run
choice for its source bytes. The estimate allocates the media's complete frame count; it neither
generates nor normalizes that media. An empty Segment instead uses the Surface's boundary branch
shown above and has no policy Fragment to select.
