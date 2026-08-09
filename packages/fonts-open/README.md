# `@narratage/fonts-open`

Local workspace package exposing a curated OFL-1.1 font catalog as exact `FontArtifactRef` values.
The Fontsource `5.3.0` dependencies carry the actual bytes and license files. Installation may use
the package registry; author compilation and rendering never download fonts or inspect system font
directories.

This is currently a private workspace package, not an npm release. A developer who pulls this
repository gets it with the ordinary `pnpm install`, then includes `@narratage/fonts-open` in the
project's explicit `lock-packages` selection. There is no global font installation step.

```svml
<import as="fonts" from="@narratage/fonts-open@1"/>

<fonts:Face id="latin" family="inter" weight="700" style="normal"/>
<fonts:Face id="cjk" family="noto-sans-sc" weight="700" style="normal"/>
<fonts:Face id="emoji" family="noto-emoji" weight="700" style="normal"/>
```

Available families:

| Family | Weight | Style | Intended use |
|---|---:|---|---|
| `inter` | 100–900 | normal, italic | neutral UI and dialogue |
| `montserrat` | 100–900 | normal, italic | geometric social captions |
| `dm-sans` | 100–1000 | normal, italic | friendly product video |
| `manrope` | 200–800 | normal | compact modern captions |
| `poppins` | 100–900 | normal, italic | rounded geometric display |
| `bebas-neue` | 400 | normal | condensed headline |
| `playfair-display` | 400–900 | normal, italic | editorial display |
| `source-serif-4` | 200–900 | normal, italic | readable serif |
| `noto-sans-sc` | 100–900 | normal | Simplified Chinese sans |
| `noto-serif-sc` | 200–900 | normal | Simplified Chinese serif |
| `noto-emoji` | 300–700 | normal | monochrome emoji/symbol fallback |

CJK and emoji faces consist of several Unicode-range WOFF2 sources but remain one logical face.
Only faces referenced by the Author Graph enter that Build's transfer bundle and ArtifactStore.
This package is private and unpublished while the repository remains pre-release.
