export type OpenFontStyle = "normal" | "italic";

export type OpenFontCategory =
  | "handwriting"
  | "script"
  | "display"
  | "sans"
  | "serif"
  | "monospace"
  | "cjk"
  | "world"
  | "emoji";

type FamilyMetadata = {
  readonly label: string;
  readonly category: OpenFontCategory;
  readonly intendedUse: string;
  readonly license: "OFL-1.1" | "Apache-2.0";
};

type VariableSingleFamily = FamilyMetadata & {
  readonly kind: "variable-single";
  readonly packageName: string;
  readonly fileStem: string;
  readonly minimumWeight: number;
  readonly maximumWeight: number;
  readonly styles: readonly OpenFontStyle[];
};

type VariableSplitFamily = FamilyMetadata & {
  readonly kind: "variable-split";
  readonly packageName: string;
  readonly css: string;
  readonly minimumWeight: number;
  readonly maximumWeight: number;
  readonly styles: readonly ["normal"];
};

type StaticFamily = FamilyMetadata & {
  readonly kind: "static";
  readonly packageName: string;
  readonly fileStem: string;
  readonly weights: readonly number[];
  readonly styles: readonly OpenFontStyle[];
};

type StaticSplitFamily = FamilyMetadata & {
  readonly kind: "static-split";
  readonly packageName: string;
  readonly weights: readonly number[];
  readonly styles: readonly OpenFontStyle[];
};

type ExternalSplitFamily = FamilyMetadata & {
  readonly kind: "external-split";
  readonly packageName: string;
  readonly css: string;
  readonly weights: readonly number[];
  readonly styles: readonly OpenFontStyle[];
};

export type OpenFontFamily =
  | VariableSingleFamily
  | VariableSplitFamily
  | StaticFamily
  | StaticSplitFamily
  | ExternalSplitFamily;

const variable = (
  id: string,
  label: string,
  category: OpenFontCategory,
  minimumWeight: number,
  maximumWeight: number,
  styles: readonly OpenFontStyle[],
  intendedUse: string,
  license: FamilyMetadata["license"] = "OFL-1.1",
): VariableSingleFamily => ({
  kind: "variable-single",
  packageName: `@fontsource-variable/${id}`,
  fileStem: `${id}-latin-wght`,
  minimumWeight,
  maximumWeight,
  styles,
  label,
  category,
  intendedUse,
  license,
});

const variableSplit = (
  id: string,
  label: string,
  category: OpenFontCategory,
  minimumWeight: number,
  maximumWeight: number,
  intendedUse: string,
): VariableSplitFamily => ({
  kind: "variable-split",
  packageName: `@fontsource-variable/${id}`,
  css: "wght.css",
  minimumWeight,
  maximumWeight,
  styles: ["normal"],
  label,
  category,
  intendedUse,
  license: "OFL-1.1",
});

const staticFont = (
  id: string,
  label: string,
  category: OpenFontCategory,
  weights: readonly number[],
  styles: readonly OpenFontStyle[],
  intendedUse: string,
  license: FamilyMetadata["license"] = "OFL-1.1",
): StaticFamily => ({
  kind: "static",
  packageName: `@fontsource/${id}`,
  fileStem: `${id}-latin`,
  weights,
  styles,
  label,
  category,
  intendedUse,
  license,
});

const staticSplit = (
  id: string,
  label: string,
  category: OpenFontCategory,
  weights: readonly number[],
  styles: readonly OpenFontStyle[],
  intendedUse: string,
): StaticSplitFamily => ({
  kind: "static-split",
  packageName: `@fontsource/${id}`,
  weights,
  styles,
  label,
  category,
  intendedUse,
  license: "OFL-1.1",
});

const externalSplit = (
  packageName: string,
  css: string,
  label: string,
  category: OpenFontCategory,
  weights: readonly number[],
  styles: readonly OpenFontStyle[],
  intendedUse: string,
): ExternalSplitFamily => ({
  kind: "external-split",
  packageName,
  css,
  weights,
  styles,
  label,
  category,
  intendedUse,
  license: "OFL-1.1",
});

const normal = ["normal"] as const;
const romanItalic = ["normal", "italic"] as const;

/**
 * Reproducible open faces intended for video typography. Latin variable faces load their compact
 * Latin subset. Script-complete CJK, world-script and emoji faces preserve Fontsource's complete
 * Unicode-range shards as one logical face.
 */
export const openFontFamilies = {
  // Handwriting and casual lettering.
  "architects-daughter": staticFont("architects-daughter", "Architects Daughter", "handwriting", [400], normal, "casual annotations"),
  caveat: variable("caveat", "Caveat", "handwriting", 400, 700, normal, "warm handwritten captions"),
  "coming-soon": staticFont("coming-soon", "Coming Soon", "handwriting", [400], normal, "informal notes", "Apache-2.0"),
  handlee: staticFont("handlee", "Handlee", "handwriting", [400], normal, "light handwritten copy"),
  kalam: staticFont("kalam", "Kalam", "handwriting", [300, 400, 700], normal, "confident handwritten copy"),
  "patrick-hand": staticFont("patrick-hand", "Patrick Hand", "handwriting", [400], normal, "friendly handwritten captions"),
  "permanent-marker": staticFont("permanent-marker", "Permanent Marker", "handwriting", [400], normal, "marker headlines", "Apache-2.0"),
  "playpen-sans": variable("playpen-sans", "Playpen Sans", "handwriting", 100, 800, normal, "playful product and education video"),
  "shadows-into-light": staticFont("shadows-into-light", "Shadows Into Light", "handwriting", [400], normal, "airy handwritten notes"),
  "shantell-sans": variable("shantell-sans", "Shantell Sans", "handwriting", 300, 800, romanItalic, "expressive informal captions"),
  "short-stack": staticFont("short-stack", "Short Stack", "handwriting", [400], normal, "compact handwritten labels"),

  // Formal and brush scripts.
  pacifico: staticFont("pacifico", "Pacifico", "script", [400], normal, "friendly brush titles"),
  "pinyon-script": staticFont("pinyon-script", "Pinyon Script", "script", [400], normal, "formal editorial titles"),
  satisfy: staticFont("satisfy", "Satisfy", "script", [400], normal, "casual brush titles", "Apache-2.0"),

  // High-impact display faces.
  "abril-fatface": staticFont("abril-fatface", "Abril Fatface", "display", [400], normal, "editorial headlines"),
  "alfa-slab-one": staticFont("alfa-slab-one", "Alfa Slab One", "display", [400], normal, "heavy slab headlines"),
  anton: staticFont("anton", "Anton", "display", [400], normal, "dense vertical-video headlines"),
  "archivo-black": staticFont("archivo-black", "Archivo Black", "display", [400], normal, "ranking cards and bold labels"),
  bangers: staticFont("bangers", "Bangers", "display", [400], normal, "comic impact titles"),
  "bebas-neue": staticFont("bebas-neue", "Bebas Neue", "display", [400], normal, "condensed headlines"),
  "black-ops-one": staticFont("black-ops-one", "Black Ops One", "display", [400], normal, "stencil and gaming titles"),
  bungee: staticFont("bungee", "Bungee", "display", [400], normal, "poster-like display copy"),
  "dm-serif-display": staticFont("dm-serif-display", "DM Serif Display", "display", [400], romanItalic, "high-contrast editorial display"),
  fredoka: variable("fredoka", "Fredoka", "display", 300, 700, normal, "rounded playful headlines"),
  "league-spartan": variable("league-spartan", "League Spartan", "display", 100, 900, normal, "geometric all-purpose display"),
  "lilita-one": staticFont("lilita-one", "Lilita One", "display", [400], normal, "friendly heavy titles"),
  "luckiest-guy": staticFont("luckiest-guy", "Luckiest Guy", "display", [400], normal, "energetic comic titles", "Apache-2.0"),
  oswald: variable("oswald", "Oswald", "display", 200, 700, normal, "compact headlines and lower thirds"),
  righteous: staticFont("righteous", "Righteous", "display", [400], normal, "retro geometric titles"),
  unbounded: variable("unbounded", "Unbounded", "display", 200, 900, normal, "futuristic brand headlines"),

  // Sans-serif workhorses and contemporary brand faces.
  archivo: variable("archivo", "Archivo", "sans", 100, 900, romanItalic, "dense information layouts"),
  barlow: staticFont("barlow", "Barlow", "sans", [100, 200, 300, 400, 500, 600, 700, 800, 900], romanItalic, "neutral product and UI copy"),
  "barlow-condensed": staticFont("barlow-condensed", "Barlow Condensed", "sans", [100, 200, 300, 400, 500, 600, 700, 800, 900], romanItalic, "narrow social captions"),
  cabin: variable("cabin", "Cabin", "sans", 400, 700, romanItalic, "humanist dialogue"),
  "dm-sans": variable("dm-sans", "DM Sans", "sans", 100, 1_000, romanItalic, "friendly product video"),
  figtree: variable("figtree", "Figtree", "sans", 300, 900, romanItalic, "clean modern captions"),
  "fira-sans-condensed": staticFont("fira-sans-condensed", "Fira Sans Condensed", "sans", [100, 200, 300, 400, 500, 600, 700, 800, 900], romanItalic, "compact explanatory copy"),
  geist: variable("geist", "Geist", "sans", 100, 900, romanItalic, "minimal technology branding"),
  "instrument-sans": variable("instrument-sans", "Instrument Sans", "sans", 400, 700, romanItalic, "refined modern branding"),
  inter: variable("inter", "Inter", "sans", 100, 900, romanItalic, "neutral UI and dialogue"),
  jost: variable("jost", "Jost", "sans", 100, 900, romanItalic, "geometric brand copy"),
  "josefin-sans": variable("josefin-sans", "Josefin Sans", "sans", 100, 700, romanItalic, "fashion and lifestyle titles"),
  kanit: staticFont("kanit", "Kanit", "sans", [100, 200, 300, 400, 500, 600, 700, 800, 900], romanItalic, "technical condensed captions"),
  lato: staticFont("lato", "Lato", "sans", [100, 300, 400, 700, 900], romanItalic, "humanist general-purpose copy"),
  lexend: variable("lexend", "Lexend", "sans", 100, 900, normal, "high-legibility captions"),
  manrope: variable("manrope", "Manrope", "sans", 200, 800, normal, "compact modern captions"),
  montserrat: variable("montserrat", "Montserrat", "sans", 100, 900, romanItalic, "geometric social captions"),
  mulish: variable("mulish", "Mulish", "sans", 200, 900, romanItalic, "soft readable captions"),
  "noto-sans": variable("noto-sans", "Noto Sans", "sans", 100, 900, romanItalic, "broad Latin, Greek and Cyrillic coverage"),
  "nunito-sans": variable("nunito-sans", "Nunito Sans", "sans", 200, 900, romanItalic, "rounded friendly dialogue"),
  onest: variable("onest", "Onest", "sans", 100, 900, normal, "clean product storytelling"),
  "open-sans": variable("open-sans", "Open Sans", "sans", 300, 800, romanItalic, "highly readable general copy"),
  outfit: variable("outfit", "Outfit", "sans", 100, 900, normal, "geometric creator captions"),
  "plus-jakarta-sans": variable("plus-jakarta-sans", "Plus Jakarta Sans", "sans", 200, 800, romanItalic, "polished startup branding"),
  poppins: staticFont("poppins", "Poppins", "sans", [100, 200, 300, 400, 500, 600, 700, 800, 900], romanItalic, "rounded geometric display"),
  quicksand: variable("quicksand", "Quicksand", "sans", 300, 700, normal, "soft lifestyle captions"),
  raleway: variable("raleway", "Raleway", "sans", 100, 900, romanItalic, "elegant brand copy"),
  "rethink-sans": variable("rethink-sans", "Rethink Sans", "sans", 400, 800, romanItalic, "contemporary brand captions"),
  roboto: variable("roboto", "Roboto", "sans", 100, 900, romanItalic, "neutral general-purpose video"),
  "roboto-condensed": variable("roboto-condensed", "Roboto Condensed", "sans", 100, 900, romanItalic, "space-efficient captions"),
  rubik: variable("rubik", "Rubik", "sans", 300, 900, romanItalic, "friendly rounded interfaces"),
  sora: variable("sora", "Sora", "sans", 100, 800, normal, "technology and product video"),
  "space-grotesk": variable("space-grotesk", "Space Grotesk", "sans", 300, 700, normal, "editorial technology branding"),
  urbanist: variable("urbanist", "Urbanist", "sans", 100, 900, romanItalic, "modern lifestyle video"),
  "work-sans": variable("work-sans", "Work Sans", "sans", 100, 900, romanItalic, "screen-first explanatory copy"),

  // Serif and editorial faces.
  "bodoni-moda": variable("bodoni-moda", "Bodoni Moda", "serif", 400, 900, romanItalic, "fashion editorial titles"),
  cinzel: variable("cinzel", "Cinzel", "serif", 400, 900, normal, "classical display titles"),
  "cormorant-garamond": variable("cormorant-garamond", "Cormorant Garamond", "serif", 300, 700, romanItalic, "literary editorial copy"),
  "crimson-pro": variable("crimson-pro", "Crimson Pro", "serif", 200, 900, romanItalic, "readable editorial captions"),
  "eb-garamond": variable("eb-garamond", "EB Garamond", "serif", 400, 800, romanItalic, "classic editorial copy"),
  fraunces: variable("fraunces", "Fraunces", "serif", 100, 900, romanItalic, "expressive editorial titles"),
  gloock: staticFont("gloock", "Gloock", "serif", [400], normal, "dramatic high-contrast titles"),
  "instrument-serif": staticFont("instrument-serif", "Instrument Serif", "serif", [400], romanItalic, "contemporary editorial titles"),
  "libre-baskerville": variable("libre-baskerville", "Libre Baskerville", "serif", 400, 700, romanItalic, "traditional readable copy"),
  lora: variable("lora", "Lora", "serif", 400, 700, romanItalic, "warm narrative captions"),
  merriweather: variable("merriweather", "Merriweather", "serif", 300, 900, romanItalic, "screen-readable long copy"),
  newsreader: variable("newsreader", "Newsreader", "serif", 200, 800, romanItalic, "news and documentary editorial"),
  "playfair-display": variable("playfair-display", "Playfair Display", "serif", 400, 900, romanItalic, "editorial display"),
  "roboto-slab": variable("roboto-slab", "Roboto Slab", "serif", 100, 900, normal, "sturdy explanatory titles", "Apache-2.0"),
  "source-serif-4": variable("source-serif-4", "Source Serif 4", "serif", 200, 900, romanItalic, "readable serif"),
  vollkorn: variable("vollkorn", "Vollkorn", "serif", 400, 900, romanItalic, "bookish narrative copy"),

  // Monospaced faces.
  "fira-code": variable("fira-code", "Fira Code", "monospace", 300, 700, normal, "code and technical overlays"),
  "geist-mono": variable("geist-mono", "Geist Mono", "monospace", 100, 900, romanItalic, "minimal technical labels"),
  "ibm-plex-mono": staticFont("ibm-plex-mono", "IBM Plex Mono", "monospace", [100, 200, 300, 400, 500, 600, 700], romanItalic, "editorial technical overlays"),
  "jetbrains-mono": variable("jetbrains-mono", "JetBrains Mono", "monospace", 100, 800, romanItalic, "code demonstrations"),
  "roboto-mono": variable("roboto-mono", "Roboto Mono", "monospace", 100, 700, romanItalic, "neutral measurements and code"),
  "space-mono": staticFont("space-mono", "Space Mono", "monospace", [400, 700], romanItalic, "retro technical titles"),

  // Complete CJK faces and display lettering. These retain all Unicode-range shards.
  "long-cang": staticSplit("long-cang", "龙藏体 / Long Cang", "cjk", [400], normal, "expressive Chinese brush copy"),
  "liu-jian-mao-cao": staticSplit("liu-jian-mao-cao", "刘建毛草 / Liu Jian Mao Cao", "cjk", [400], normal, "Chinese cursive display"),
  "ma-shan-zheng": staticSplit("ma-shan-zheng", "马善政毛笔体", "cjk", [400], normal, "Chinese brush titles"),
  "noto-sans-hk": variableSplit("noto-sans-hk", "Noto Sans HK", "cjk", 100, 900, "Hong Kong Traditional Chinese"),
  "noto-sans-jp": variableSplit("noto-sans-jp", "Noto Sans JP", "cjk", 100, 900, "Japanese sans-serif"),
  "noto-sans-kr": variableSplit("noto-sans-kr", "Noto Sans KR", "cjk", 100, 900, "Korean sans-serif"),
  "noto-sans-sc": variableSplit("noto-sans-sc", "Noto Sans SC", "cjk", 100, 900, "Simplified Chinese sans-serif"),
  "noto-sans-tc": variableSplit("noto-sans-tc", "Noto Sans TC", "cjk", 100, 900, "Traditional Chinese sans-serif"),
  "noto-serif-jp": variableSplit("noto-serif-jp", "Noto Serif JP", "cjk", 200, 900, "Japanese serif"),
  "noto-serif-kr": variableSplit("noto-serif-kr", "Noto Serif KR", "cjk", 200, 900, "Korean serif"),
  "noto-serif-sc": variableSplit("noto-serif-sc", "Noto Serif SC", "cjk", 200, 900, "Simplified Chinese serif"),
  "noto-serif-tc": variableSplit("noto-serif-tc", "Noto Serif TC", "cjk", 200, 900, "Traditional Chinese serif"),
  "zcool-kuaile": staticSplit("zcool-kuaile", "站酷快乐体", "cjk", [400], normal, "playful Chinese display"),
  "zcool-qingke-huangyou": staticSplit("zcool-qingke-huangyou", "站酷庆科黄油体", "cjk", [400], normal, "geometric Chinese display"),
  "zcool-xiaowei": staticSplit("zcool-xiaowei", "站酷小薇体", "cjk", [400], normal, "Chinese editorial display"),

  // Complete non-Latin script faces.
  "noto-naskh-arabic": variableSplit("noto-naskh-arabic", "Noto Naskh Arabic", "world", 400, 700, "Arabic serif and traditional copy"),
  "noto-sans-arabic": variableSplit("noto-sans-arabic", "Noto Sans Arabic", "world", 100, 900, "Arabic sans-serif"),
  "noto-sans-devanagari": variableSplit("noto-sans-devanagari", "Noto Sans Devanagari", "world", 100, 900, "Devanagari sans-serif"),
  "noto-sans-hebrew": variableSplit("noto-sans-hebrew", "Noto Sans Hebrew", "world", 100, 900, "Hebrew sans-serif"),
  "noto-sans-thai": variableSplit("noto-sans-thai", "Noto Sans Thai", "world", 100, 900, "Thai sans-serif"),

  // Emoji. Color is fixed at 400; monochrome remains variable for typographic treatments.
  "noto-color-emoji": externalSplit("@infolektuell/noto-color-emoji", "index.css", "Noto Color Emoji", "emoji", [400], normal, "full-color COLRv1 emoji fallback"),
  "noto-emoji": variableSplit("noto-emoji", "Noto Emoji", "emoji", 300, 700, "monochrome emoji and symbols"),
} as const satisfies Readonly<Record<string, OpenFontFamily>>;

export type OpenFontFamilyName = keyof typeof openFontFamilies;

export const openFontFamilyNames = Object.freeze(
  Object.keys(openFontFamilies).sort() as OpenFontFamilyName[],
);

export const openFontFamiliesByCategory = Object.freeze(Object.fromEntries(
  (["handwriting", "script", "display", "sans", "serif", "monospace", "cjk", "world", "emoji"] as const)
    .map((category) => [category, Object.freeze(openFontFamilyNames.filter(
      (name) => openFontFamilies[name].category === category,
    ))]),
) as Readonly<Record<OpenFontCategory, readonly OpenFontFamilyName[]>>);
