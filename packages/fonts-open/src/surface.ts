import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename as fileName } from "node:path";

import {
  assertFontArtifactRef,
  assertFontStackRef,
  mediaTypes,
} from "@hypit/media";
import type { FontArtifactRef, FontStackRef } from "@hypit/media";
import type { StructuredElement, StructuredSurfaceHandler } from "@hypit/markup";
import { resolveNodePackageResource } from "@hypit/package-loader-node";

import {
  openFontFamilies,
  openFontFamilyNames,
} from "./catalog.js";
import type {
  OpenFontFamily,
  OpenFontFamilyName,
  OpenFontStyle,
} from "./catalog.js";

function resolveFontPackageFile(packageName: string, path: string): string {
  try {
    return resolveNodePackageResource(packageName, path, { from: import.meta.url });
  } catch (error) {
    const version = packageName === "@infolektuell/noto-color-emoji" ? "0.2.0" : "5.3.0";
    throw new Error(
      `${packageName} is needed by this authored font. Install it once with: hypit packages install ${packageName}@${version}`,
      { cause: error },
    );
  }
}

function attributes(
  element: StructuredElement,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const names = Object.keys(element.attributes);
  const allowed = new Set([...required, ...optional]);
  if (required.some((name) => element.attributes[name] === undefined)
    || names.some((name) => !allowed.has(name))) {
    const suffix = optional.length === 0 ? "" : `, with optional ${optional.join(", ")}`;
    throw new Error(`${element.name} requires exactly ${required.join(", ")}${suffix}`);
  }
}

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be a string`);
  return value.trim();
}

type RequestedFace = {
  readonly familyName: OpenFontFamilyName;
  readonly family: OpenFontFamily;
  readonly weight: number;
  readonly style: OpenFontStyle;
};

function requestedFace(element: StructuredElement): RequestedFace {
  const familyName = stringAttribute(element, "family") as OpenFontFamilyName;
  if (!openFontFamilyNames.includes(familyName)) {
    throw new Error(`${element.name}.family must be one of ${openFontFamilyNames.join(", ")}`);
  }
  const family: OpenFontFamily = openFontFamilies[familyName];
  const weight = Number(stringAttribute(element, "weight"));
  const validWeight = family.kind === "static" || family.kind === "static-split" || family.kind === "external-split"
    ? family.weights.includes(weight)
    : Number.isSafeInteger(weight) && weight >= family.minimumWeight && weight <= family.maximumWeight;
  if (!validWeight) throw new Error(`${element.name}.weight is unavailable for ${familyName}`);
  const style = stringAttribute(element, "style") as OpenFontStyle;
  if (!(family.styles as readonly OpenFontStyle[]).includes(style)) {
    throw new Error(`${element.name}.style is unavailable for ${familyName}`);
  }
  return { familyName, family, weight, style };
}

function oneFile(
  family: OpenFontFamily & { readonly fileStem: string },
  weight: number,
  style: OpenFontStyle,
): string {
  const filename = family.kind === "static"
    ? `${family.fileStem}-${weight}-${style}.woff2`
    : `${family.fileStem}-${style}.woff2`;
  return resolveFontPackageFile(family.packageName, `files/${filename}`);
}

function splitFiles(
  family: OpenFontFamily & { readonly kind: "variable-split" | "static-split" | "external-split" },
  weight: number,
  style: OpenFontStyle,
): readonly { readonly path: string; readonly unicodeRange: string }[] {
  const css = family.kind === "variable-split"
    ? family.css
    : family.kind === "external-split"
      ? family.css
      : `${weight}${style === "italic" ? "-italic" : ""}.css`;
  const cssPath = resolveFontPackageFile(family.packageName, css);
  const contents = readFileSync(cssPath, "utf8");
  return [...contents.matchAll(/@font-face\s*\{([\s\S]*?)\}/gu)].map((match) => {
    const body = match[1]!;
    const file = /src:\s*url\((?:['"])?\.\/files\/([^)'";]+\.woff2)(?:['"])?\)/u.exec(body)?.[1];
    const unicodeRange = /unicode-range:\s*([^;]+);/u.exec(body)?.[1]?.replace(/\s+/gu, "");
    if (file === undefined || unicodeRange === undefined) {
      throw new Error(`${family.packageName}/${css} contains an unsupported @font-face`);
    }
    return { path: resolveFontPackageFile(family.packageName, `files/${file}`), unicodeRange };
  });
}

async function materializeFace(
  request: RequestedFace,
  element: StructuredElement,
  resolveAsset: Parameters<StructuredSurfaceHandler>[0]["resolveAsset"],
): Promise<FontArtifactRef> {
  const files = request.family.kind === "variable-split" || request.family.kind === "static-split"
    || request.family.kind === "external-split"
    ? splitFiles(request.family, request.weight, request.style)
    : [{ path: oneFile(request.family, request.weight, request.style) }];
  const resolvedSources: FontArtifactRef["sources"] = await Promise.all(files.map(async (file) => {
    const bytes = Uint8Array.from(await readFile(file.path));
    // `require.resolve` answers in the platform's own separator, and this name goes into the
    // asset's provenance. Splitting on "/" left the whole absolute path standing in for the file
    // name wherever that separator is a backslash, which put a machine's directory layout inside
    // an identity that is supposed to name a font file and nothing else.
    const basename = fileName(file.path);
    const resolved = await resolveAsset({
      from: `package:@hypit/fonts-open/${request.familyName}/${basename}`,
      mediaType: "font/woff2",
      bytes,
      range: element.range,
    });
    return {
      artifact: resolved.artifact,
      ...("unicodeRange" in file ? { unicodeRange: file.unicodeRange } : {}),
    };
  }));
  const byArtifact = new Map<string, FontArtifactRef["sources"][number]>();
  for (const source of resolvedSources) {
    const existing = byArtifact.get(source.artifact.digest);
    if (existing === undefined) {
      byArtifact.set(source.artifact.digest, source);
      continue;
    }
    if (existing.unicodeRange === undefined || source.unicodeRange === undefined) continue;
    byArtifact.set(source.artifact.digest, {
      artifact: existing.artifact,
      unicodeRange: `${existing.unicodeRange},${source.unicodeRange}`,
    });
  }
  const font: FontArtifactRef = {
    sources: [...byArtifact.values()],
    weight: request.weight,
    style: request.style,
  };
  assertFontArtifactRef(font, `${element.name}.${request.familyName}`);
  return font;
}

function localName(name: string): string {
  const colon = name.lastIndexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
}

function emptyChildren(element: StructuredElement): void {
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) {
    throw new Error(`${element.name} does not accept children`);
  }
}

export const decodeOpenFontFaceSurface: StructuredSurfaceHandler = async ({ element, resolveAsset }) => {
  attributes(element, ["id", "family", "weight", "style"]);
  emptyChildren(element);
  const id = stringAttribute(element, "id");
  const font = await materializeFace(requestedFace(element), element, resolveAsset);
  return {
    records: [{
      id,
      type: mediaTypes.fontArtifact,
      value: { kind: "inline", value: font },
      range: element.range,
    }],
    components: [],
    fragments: [],
  };
};

/**
 * Compact exact-font-stack authoring. Emoji stays explicit but no longer requires a separate Face
 * declaration and Fallback reference for every Style.
 */
export const decodeOpenFontStackSurface: StructuredSurfaceHandler = async ({ element, resolveAsset }) => {
  attributes(element, ["id", "family", "weight", "style"], ["emoji"]);
  const id = stringAttribute(element, "id");
  const faces: FontArtifactRef[] = [await materializeFace(requestedFace(element), element, resolveAsset)];

  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Fallback children`);
      continue;
    }
    if (localName(child.name) !== "Fallback") throw new Error(`${element.name} accepts only Fallback children`);
    attributes(child, ["family", "weight", "style"]);
    emptyChildren(child);
    faces.push(await materializeFace(requestedFace(child), child, resolveAsset));
  }

  const emoji = element.attributes.emoji;
  if (emoji !== undefined) {
    if (emoji !== "color" && emoji !== "mono") {
      throw new Error(`${element.name}.emoji must be color or mono`);
    }
    const familyName: OpenFontFamilyName = emoji === "color" ? "noto-color-emoji" : "noto-emoji";
    const family = openFontFamilies[familyName];
    faces.push(await materializeFace({
      familyName,
      family,
      weight: 400,
      style: "normal",
    }, element, resolveAsset));
  }

  const stack: FontStackRef = { faces };
  assertFontStackRef(stack, `${element.name}.${id}`);
  return {
    records: [{
      id,
      type: mediaTypes.fontStack,
      value: { kind: "inline", value: stack },
      range: element.range,
    }],
    components: [],
    fragments: [],
  };
};
