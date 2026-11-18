import {
  htmlTextFragment, type HtmlTextFragment, type HtmlTextFragmentSpec, type HtmlTextNode,
  type HtmlTextTypography, type HtmlVisualDependency,
} from "@hypit/html-program";

export type NleTextTypography = Omit<HtmlTextTypography, "fontFamily" | "fontSynthesis"> & {
  /** Ordered system families, project-relative files prefixed with ./, or installed Fontsource packages. */
  readonly fonts?: readonly string[];
};

export type NleTextNode = HtmlTextNode<NleTextTypography>;

export type ResolveNleTextFont = (
  source: string,
  weight: number,
  style: NonNullable<NleTextTypography["fontStyle"]>,
) => {
  readonly family: string;
  readonly dependencies: readonly Extract<HtmlVisualDependency, { kind: "font" }>[];
};

export type NleTextFontSource =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "fontsource"; readonly package: string }
  | { readonly kind: "family"; readonly name: string };

export function readNleTextFontSource(value: unknown): NleTextFontSource {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()
    || /[;<>:"'{}\\\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("Font source requires a family name, project-relative font file or Fontsource package.");
  }
  if (/^@fontsource(?:-variable)?\/[a-z0-9][a-z0-9-]*$/u.test(value)) return { kind: "fontsource", package: value };
  if (/^\.\/(?:[^/]+\/)*[^/]+\.(?:woff2?|otf|ttf)$/iu.test(value)
    && value.slice(2).split("/").every(part => part !== "." && part !== "..")) {
    return { kind: "file", path: value };
  }
  if (/[\/@,]/u.test(value)) throw new Error(`Invalid font source ${value}.`);
  return { kind: "family", name: value };
}

const typographyKeys = new Set([
  "fonts", "fontSizePx", "fontWeight", "fontStyle", "lineHeight", "letterSpacingPx", "wordSpacingPx",
  "language", "direction", "writingMode", "textTransform", "variantCaps", "kerning",
]);

export function assertNleTextTypography(value: unknown): asserts value is NleTextTypography {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Text typography requires an object.");
  for (const name of Object.keys(value)) {
    if (!typographyKeys.has(name)) throw new Error(`Unknown typography field ${name}.`);
  }
  const typography = value as NleTextTypography;
  const { fonts, fontSizePx, fontWeight, lineHeight, letterSpacingPx, wordSpacingPx, language } = typography;
  if (fontSizePx !== undefined && (!Number.isFinite(fontSizePx) || fontSizePx <= 0)
    || fontWeight !== undefined && (!Number.isSafeInteger(fontWeight) || fontWeight < 1 || fontWeight > 1000)
    || lineHeight !== undefined && (!Number.isFinite(lineHeight) || lineHeight <= 0)
    || letterSpacingPx !== undefined && !Number.isFinite(letterSpacingPx)
    || wordSpacingPx !== undefined && !Number.isFinite(wordSpacingPx)
    || language !== undefined && (typeof language !== "string" || !/^[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(language))) {
    throw new Error("Text typography contains an invalid size, weight, spacing or language.");
  }
  const options = {
    fontStyle: ["normal", "italic", "oblique"], direction: ["auto", "ltr", "rtl"],
    writingMode: ["horizontal-tb", "vertical-rl", "vertical-lr"],
    textTransform: ["none", "uppercase", "lowercase", "capitalize"],
    variantCaps: ["normal", "small-caps", "all-small-caps"], kerning: ["auto", "normal", "none"],
  } as const;
  for (const key of Object.keys(options) as (keyof typeof options)[]) {
    const selected = typography[key];
    if (selected !== undefined && !(options[key] as readonly string[]).includes(selected)) {
      throw new Error(`Text typography ${key} is invalid.`);
    }
  }
  if (fonts === undefined) return;
  if (!Array.isArray(fonts) || fonts.length === 0) throw new Error("Text fonts requires a nonempty ordered array.");
  fonts.forEach(readNleTextFontSource);
}

function buildTextFragment(
  spec: HtmlTextFragmentSpec<NleTextTypography>,
  resolveFont?: ResolveNleTextFont,
): HtmlTextFragment {
  const dependencies = new Map<string, HtmlVisualDependency>();
  const close = (typography: NleTextTypography): HtmlTextTypography => {
    const { fonts, ...styles } = typography;
    if (fonts === undefined || resolveFont === undefined) return styles;
    let usesFontFiles = false;
    const families = fonts.map(source => {
      const resolved = resolveFont(source, styles.fontWeight ?? 400, styles.fontStyle ?? "normal");
      usesFontFiles ||= resolved.dependencies.length > 0;
      for (const entry of resolved.dependencies) dependencies.set(entry.id, entry);
      return resolved.family;
    });
    return {
      ...styles, fontFamily: families.join(","),
      ...(usesFontFiles ? { fontSynthesis: "none" } : {}),
    };
  };
  const visit = (node: NleTextNode, parent: NleTextTypography): HtmlTextNode => {
    if (node.kind === "break") return node;
    const { style, ...base } = node;
    const overrides = style?.typography;
    const selected = overrides === undefined ? parent : { ...parent, ...overrides };
    if (overrides !== undefined) assertNleTextTypography(overrides);
    const { typography: _typography, ...appearance } = style ?? {};
    const closedStyle = style === undefined ? {} : {
      style: { ...appearance, ...(overrides === undefined ? {} : { typography: close(selected) }) },
    };
    if (base.kind === "text") return { ...base, ...closedStyle };
    return { ...base, ...closedStyle, children: base.children.map(child => visit(child, selected)) };
  };
  assertNleTextTypography(spec.typography);
  const typography = close(spec.typography);
  const children = spec.children.map(node => visit(node, spec.typography));
  const fragment = htmlTextFragment({ ...spec, typography, children });
  return { html: fragment.html, dependencies: [...fragment.dependencies, ...dependencies.values()] };
}

export function assertNleTextFragment(spec: HtmlTextFragmentSpec<NleTextTypography>): void {
  buildTextFragment(spec);
}

/** Close authored text and its exact font dependencies as a single renderer fragment. */
export function nleTextFragment(
  spec: HtmlTextFragmentSpec<NleTextTypography>,
  resolveFont: ResolveNleTextFont,
): HtmlTextFragment {
  return buildTextFragment(spec, resolveFont);
}
