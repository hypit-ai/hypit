/**
 * The one code-free terminal visual language accepted by the official video
 * stack. Author packages may own any Program they want, but a VisualTrack that
 * participates in Composition must lower to this closed profile or contribute
 * a typed CompositableSurface.
 *
 * This is a video contract, not a Core concept and not an author component.
 */
export const VISUAL_IR_V1 = "svml.visual-ir@1" as const;

/**
 * Closed CSS-shaped vocabulary for public visual Visual IR v1.
 *
 * Values remain serialized declarations because the target is browser based,
 * but components cannot silently extend the language by inventing another CSS
 * property. New semantics require a versioned IR revision; unusual visuals use
 * CompositableSurface instead.
 */
export const VISUAL_STYLE_NAMES_V1 = [
  "-webkit-background-clip",
  "-webkit-box-decoration-break",
  "-webkit-box-orient",
  "-webkit-line-clamp",
  "-webkit-text-fill-color",
  "-webkit-text-stroke",
  "-webkit-text-stroke-color",
  "-webkit-text-stroke-width",
  "align-content",
  "align-items",
  "align-self",
  "aspect-ratio",
  "background",
  "background-clip",
  "background-color",
  "background-image",
  "background-position",
  "background-repeat",
  "background-size",
  "border",
  "border-bottom",
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-color",
  "border-left",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-right",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-style",
  "border-top",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "border-width",
  "bottom",
  "box-decoration-break",
  "box-shadow",
  "box-sizing",
  "clip-path",
  "color",
  "column-gap",
  "direction",
  "display",
  "filter",
  "flex",
  "flex-basis",
  "flex-direction",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "font-family",
  "font-size",
  "font-style",
  "font-synthesis",
  "font-weight",
  "gap",
  "grid-area",
  "grid-template-columns",
  "grid-template-rows",
  "height",
  "inset",
  "justify-content",
  "justify-items",
  "justify-self",
  "left",
  "letter-spacing",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "object-fit",
  "object-position",
  "opacity",
  "outline",
  "outline-color",
  "outline-style",
  "outline-width",
  "overflow",
  "overflow-wrap",
  "overflow-x",
  "overflow-y",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "perspective",
  "perspective-origin",
  "position",
  "right",
  "row-gap",
  "text-align",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-thickness",
  "text-overflow",
  "text-shadow",
  "text-transform",
  "text-underline-offset",
  "top",
  "transform",
  "transform-origin",
  "transform-style",
  "vertical-align",
  "visibility",
  "white-space",
  "width",
  "word-break",
  "word-spacing",
  "writing-mode",
] as const;

export type VisualStyleNameV1 = typeof VISUAL_STYLE_NAMES_V1[number];

const STYLE_NAMES = new Set<string>(VISUAL_STYLE_NAMES_V1);
const CROSS_TRACK_STYLES = new Set(["backdrop-filter", "mix-blend-mode"]);

export const VISUAL_STYLE_ENUM_VALUES_V1 = {
  "box-sizing": ["border-box", "content-box"],
  direction: ["ltr", "rtl"],
  display: ["block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "-webkit-box", "none"],
  "flex-direction": ["row", "row-reverse", "column", "column-reverse"],
  "flex-wrap": ["nowrap", "wrap", "wrap-reverse"],
  "object-fit": ["contain", "cover", "fill", "none", "scale-down"],
  overflow: ["visible", "hidden", "clip"],
  "overflow-x": ["visible", "hidden", "clip"],
  "overflow-y": ["visible", "hidden", "clip"],
  position: ["absolute", "relative"],
  "text-align": ["left", "right", "center", "start", "end", "justify"],
  "text-transform": ["none", "capitalize", "uppercase", "lowercase"],
  visibility: ["visible", "hidden"],
  "white-space": ["normal", "nowrap", "pre", "pre-wrap", "pre-line", "break-spaces"],
  "writing-mode": ["horizontal-tb", "vertical-rl", "vertical-lr"],
} as const satisfies Partial<Record<VisualStyleNameV1, readonly string[]>>;

const ENUM_VALUES = new Map<string, ReadonlySet<string>>(
  Object.entries(VISUAL_STYLE_ENUM_VALUES_V1)
    .map(([name, values]) => [name, new Set<string>(values)]),
);

export function assertVisualStyleV1(
  name: string,
  value: string | number,
  label: string,
): void {
  if (CROSS_TRACK_STYLES.has(name)) {
    throw new Error(`${label} contains cross-Track style ${name}.`);
  }
  if (!/^-?[a-z][a-z0-9-]*$/u.test(name)) {
    throw new Error(`${label} contains invalid style name ${name}.`);
  }
  if (!STYLE_NAMES.has(name)) {
    throw new Error(`${label} style ${name} is outside ${VISUAL_IR_V1}.`);
  }
  const values = ENUM_VALUES.get(name);
  if (values !== undefined) {
    if (typeof value !== "string" || !values.has(value)) {
      throw new Error(`${label} style ${name} has unsupported value ${String(value)}.`);
    }
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${label} contains a non-finite style value.`);
    return;
  }
  if (value.length === 0) throw new Error(`${label} contains an empty style value.`);
  if (/url\s*\(/iu.test(value)) {
    throw new Error(`${label} must use typed Artifact references instead of CSS url().`);
  }
  if (/(?:-webkit-)?image-set\s*\(/iu.test(value)) {
    throw new Error(`${label} must use typed Artifact references instead of CSS image-set().`);
  }
  if (/[;{}]/u.test(value)) {
    throw new Error(`${label} contains a style value that escapes its declaration.`);
  }
  if (/!important|[\u0000-\u001f\u007f]/iu.test(value)) {
    throw new Error(`${label} contains an unsafe style value.`);
  }
  if (/(?:var|env|attr)\s*\(/iu.test(value)) {
    throw new Error(`${label} contains an environment-dependent style value.`);
  }
}
