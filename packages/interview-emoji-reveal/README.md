# Emoji Reveal

Reusable Hypit author vocabulary for a top-of-frame icon answer strip.

The strip owns one outer projected `TemporalWindow`. Each child answer accepts only an authored
Script `Moment`, projected outside this package to a traced `TemporalInstant`. Display order is source
order and must also be strict chronological order. The Track receives one placeholder image and every
Item receives one answer image: `n` answers therefore have exactly `n + 1` explicit image inputs. A
Moment replaces only its own slot, so earlier answers remain and later slots remain unanswered.

```xml
<media:Image id="question-icon" src="./icons/rendered/question-mark.png"/>
<media:Image id="manifest-icon" src="./icons/rendered/sparkles.png"/>
<media:Image id="real-estate-icon" src="./icons/rendered/building-estate.png"/>
<media:Image id="bitcoin-icon" src="./icons/rendered/currency-bitcoin.png"/>

<emoji:Style id="emoji-strip" recipe={styles.emoji-strip}/>

<emoji:Track id="rules" semantic={speech.semantic} canvas={vertical}
  style={emoji-strip} placeholder={question-icon} during="program">
  <emoji:Item id="manifest" icon={manifest-icon} at={story.moment.manifest}/>
  <emoji:Item id="real-estate" icon={real-estate-icon} at={story.moment.real-estate}/>
  <emoji:Item id="bitcoin" icon={bitcoin-icon} at={story.moment.bitcoin}/>
</emoji:Track>
```

`Selection`, `Segment`, numeric instants and a `boundary` fallback are deliberately not part of an
Item's vocabulary. The component consumes only `ProgramSpace`, the projected outer Window and the
projected Moment Instants; it does not interpret Script semantics itself and has no Studio dependency.

The bundled preview icons come from [Tabler Icons](https://tabler.io/icons), distributed under the
MIT license and retrieved through the Iconify API. Their SVG files are the design sources and are
explicitly rasterized to same-size transparent PNGs before video composition. They deliberately share
one viewBox, stroke width, line-cap treatment and color instead of relying on platform emoji fonts.
