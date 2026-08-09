export type OpenFontStyle = "normal" | "italic";

type VariableSingleFamily = {
  readonly kind: "variable-single";
  readonly packageName: string;
  readonly fileStem: string;
  readonly minimumWeight: number;
  readonly maximumWeight: number;
  readonly styles: readonly OpenFontStyle[];
};

type VariableSplitFamily = {
  readonly kind: "variable-split";
  readonly packageName: string;
  readonly css: string;
  readonly minimumWeight: number;
  readonly maximumWeight: number;
  readonly styles: readonly ["normal"];
};

type StaticFamily = {
  readonly kind: "static";
  readonly packageName: string;
  readonly fileStem: string;
  readonly weights: readonly number[];
  readonly styles: readonly OpenFontStyle[];
};

export type OpenFontFamily = VariableSingleFamily | VariableSplitFamily | StaticFamily;

/** Curated OFL-1.1 families useful for product, social, editorial and multilingual video. */
export const openFontFamilies = {
  inter: {
    kind: "variable-single", packageName: "@fontsource-variable/inter", fileStem: "inter-latin-wght",
    minimumWeight: 100, maximumWeight: 900, styles: ["normal", "italic"],
  },
  montserrat: {
    kind: "variable-single", packageName: "@fontsource-variable/montserrat", fileStem: "montserrat-latin-wght",
    minimumWeight: 100, maximumWeight: 900, styles: ["normal", "italic"],
  },
  "dm-sans": {
    kind: "variable-single", packageName: "@fontsource-variable/dm-sans", fileStem: "dm-sans-latin-wght",
    minimumWeight: 100, maximumWeight: 1_000, styles: ["normal", "italic"],
  },
  manrope: {
    kind: "variable-single", packageName: "@fontsource-variable/manrope", fileStem: "manrope-latin-wght",
    minimumWeight: 200, maximumWeight: 800, styles: ["normal"],
  },
  "playfair-display": {
    kind: "variable-single", packageName: "@fontsource-variable/playfair-display", fileStem: "playfair-display-latin-wght",
    minimumWeight: 400, maximumWeight: 900, styles: ["normal", "italic"],
  },
  "source-serif-4": {
    kind: "variable-single", packageName: "@fontsource-variable/source-serif-4", fileStem: "source-serif-4-latin-wght",
    minimumWeight: 200, maximumWeight: 900, styles: ["normal", "italic"],
  },
  poppins: {
    kind: "static", packageName: "@fontsource/poppins", fileStem: "poppins-latin",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ["normal", "italic"],
  },
  "bebas-neue": {
    kind: "static", packageName: "@fontsource/bebas-neue", fileStem: "bebas-neue-latin",
    weights: [400], styles: ["normal"],
  },
  "noto-sans-sc": {
    kind: "variable-split", packageName: "@fontsource-variable/noto-sans-sc", css: "wght.css",
    minimumWeight: 100, maximumWeight: 900, styles: ["normal"],
  },
  "noto-serif-sc": {
    kind: "variable-split", packageName: "@fontsource-variable/noto-serif-sc", css: "wght.css",
    minimumWeight: 200, maximumWeight: 900, styles: ["normal"],
  },
  "noto-emoji": {
    kind: "variable-split", packageName: "@fontsource-variable/noto-emoji", css: "wght.css",
    minimumWeight: 300, maximumWeight: 700, styles: ["normal"],
  },
} as const satisfies Readonly<Record<string, OpenFontFamily>>;

export type OpenFontFamilyName = keyof typeof openFontFamilies;

export const openFontFamilyNames = Object.freeze(
  Object.keys(openFontFamilies).sort() as OpenFontFamilyName[],
);
