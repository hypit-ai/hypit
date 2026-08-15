# `@narratage/fonts-open`

Workspace package exposing 109 redistributable open font families as exact,
content-addressed `FontArtifactRef` values. The installed packages carry their font bytes and license
files. Author compilation and rendering never download fonts or inspect system font directories.

A developer who pulls this repository gets the catalog with the ordinary `pnpm install`; importing
`@narratage/fonts-open@1` selects it. Nothing is installed globally and this package has not been
published to npm.

## One exact face

```svml
<import as="fonts" from="@narratage/fonts-open@1"/>

<fonts:Face id="headline" family="archivo-black" weight="400" style="normal"/>
```

`family` is a finite catalog identifier. Weight and style must exist in that family; the package
never snaps to a nearby weight and never silently substitutes an italic face.

## A convenient multilingual and Emoji stack

Emoji is normally a fallback of the chosen text face, not a separate style. `Stack` packages that
intent into one reusable Author Graph value:

```svml
<fonts:Stack id="caption-fonts"
  family="inter" weight="700" style="normal" emoji="color">
  <fonts:Fallback family="noto-sans-sc" weight="700" style="normal"/>
</fonts:Stack>

<caption-fine:Style id="caption" recipe={studio.caption.primary}
  font={caption-fonts}/>
```

The resulting order is Inter, Noto Sans SC, then Noto Color Emoji. `emoji="color"` selects the
pinned COLRv1 face verified in HyperFrames' Chromium renderer; `emoji="mono"` selects the
weight-400 monochrome Noto Emoji face. Emoji stays explicit—omitting `emoji` adds no bytes. Extra
`Fallback` children can select Arabic, Hebrew, Devanagari, Thai, Japanese, Korean or any other
catalog family with their own honest weight/style.

The package does not rewrite author text to force presentation. For characters that have both text
and Emoji forms, write the real Unicode Emoji sequence (normally the character followed by VS16,
for example `☎️`) when color presentation is intended. Ordinary pictographic Emoji such as `🌐`
already have Emoji presentation. This preserves the author's exact display text while avoiding
platform-font guesses.

`Stack` is only authoring convenience. Its output is the generic `FontStackRef` media contract, so
other packages may produce or consume the same ordered exact-face value. Caption Fine does not know
about Fontsource, Noto or COLRv1.

## Catalog

The exported `openFontFamilies` map includes `label`, `category`, `intendedUse`, exact availability
and license metadata; `openFontFamiliesByCategory` is suitable for a frontend picker.

| Category | Count | Families |
|---|---:|---|
| Handwriting | 11 | `architects-daughter`, `caveat`, `coming-soon`, `handlee`, `kalam`, `patrick-hand`, `permanent-marker`, `playpen-sans`, `shadows-into-light`, `shantell-sans`, `short-stack` |
| Script | 3 | `pacifico`, `pinyon-script`, `satisfy` |
| Display | 16 | `abril-fatface`, `alfa-slab-one`, `anton`, `archivo-black`, `bangers`, `bebas-neue`, `black-ops-one`, `bungee`, `dm-serif-display`, `fredoka`, `league-spartan`, `lilita-one`, `luckiest-guy`, `oswald`, `righteous`, `unbounded` |
| Sans | 35 | `archivo`, `barlow`, `barlow-condensed`, `cabin`, `dm-sans`, `figtree`, `fira-sans-condensed`, `geist`, `instrument-sans`, `inter`, `josefin-sans`, `jost`, `kanit`, `lato`, `lexend`, `manrope`, `montserrat`, `mulish`, `noto-sans`, `nunito-sans`, `onest`, `open-sans`, `outfit`, `plus-jakarta-sans`, `poppins`, `quicksand`, `raleway`, `rethink-sans`, `roboto`, `roboto-condensed`, `rubik`, `sora`, `space-grotesk`, `urbanist`, `work-sans` |
| Serif | 16 | `bodoni-moda`, `cinzel`, `cormorant-garamond`, `crimson-pro`, `eb-garamond`, `fraunces`, `gloock`, `instrument-serif`, `libre-baskerville`, `lora`, `merriweather`, `newsreader`, `playfair-display`, `roboto-slab`, `source-serif-4`, `vollkorn` |
| Monospace | 6 | `fira-code`, `geist-mono`, `ibm-plex-mono`, `jetbrains-mono`, `roboto-mono`, `space-mono` |
| CJK | 15 | `liu-jian-mao-cao`, `long-cang`, `ma-shan-zheng`, `noto-sans-hk`, `noto-sans-jp`, `noto-sans-kr`, `noto-sans-sc`, `noto-sans-tc`, `noto-serif-jp`, `noto-serif-kr`, `noto-serif-sc`, `noto-serif-tc`, `zcool-kuaile`, `zcool-qingke-huangyou`, `zcool-xiaowei` |
| World scripts | 5 | `noto-naskh-arabic`, `noto-sans-arabic`, `noto-sans-devanagari`, `noto-sans-hebrew`, `noto-sans-thai` |
| Emoji | 2 | `noto-color-emoji`, `noto-emoji` |

Latin variable faces intentionally load the compact Latin subset. CJK, world-script and Emoji
families preserve every Unicode-range shard from their installed CSS as one logical face. Only
faces referenced by the Author Graph enter a Build transfer bundle and ArtifactStore.

Every catalog entry is either SIL OFL 1.1 or Apache 2.0. Tests compare the declared license against
the installed package's own metadata. Private local fonts are not bundled: public redistribution
requires an independently verified license, and brand fonts remain
explicit `<media:Font>` author assets.
