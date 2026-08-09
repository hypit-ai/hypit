import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { assertFontArtifactRef, mediaTypes } from "@narratage/media";
import type { FontArtifactRef } from "@narratage/media";
import type { StructuredElement, StructuredSurfaceHandler } from "@narratage/text";

import {
  openFontFamilies,
  openFontFamilyNames,
} from "./catalog.js";
import type {
  OpenFontFamily,
  OpenFontFamilyName,
  OpenFontStyle,
} from "./catalog.js";

const require = createRequire(import.meta.url);

function attributes(element: StructuredElement): void {
  const names = Object.keys(element.attributes).sort();
  if (names.join(",") !== "family,id,style,weight") {
    throw new Error(`${element.name} requires exactly id, family, weight and style`);
  }
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) {
    throw new Error(`${element.name} does not accept children`);
  }
}

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be a string`);
  return value.trim();
}

function requestedFace(element: StructuredElement): {
  readonly id: string;
  readonly familyName: OpenFontFamilyName;
  readonly family: OpenFontFamily;
  readonly weight: number;
  readonly style: OpenFontStyle;
} {
  attributes(element);
  const id = stringAttribute(element, "id");
  const familyName = stringAttribute(element, "family") as OpenFontFamilyName;
  if (!openFontFamilyNames.includes(familyName)) {
    throw new Error(`${element.name}.family must be one of ${openFontFamilyNames.join(", ")}`);
  }
  const family: OpenFontFamily = openFontFamilies[familyName];
  const weight = Number(stringAttribute(element, "weight"));
  const validWeight = family.kind === "static"
    ? family.weights.includes(weight)
    : Number.isSafeInteger(weight) && weight >= family.minimumWeight && weight <= family.maximumWeight;
  if (!validWeight) throw new Error(`${element.name}.weight is unavailable for ${familyName}`);
  const style = stringAttribute(element, "style") as OpenFontStyle;
  if (!(family.styles as readonly OpenFontStyle[]).includes(style)) {
    throw new Error(`${element.name}.style is unavailable for ${familyName}`);
  }
  return { id, familyName, family, weight, style };
}

function oneFile(family: OpenFontFamily & { readonly fileStem: string }, weight: number, style: OpenFontStyle): string {
  const filename = family.kind === "static"
    ? `${family.fileStem}-${weight}-${style}.woff2`
    : `${family.fileStem}-${style}.woff2`;
  return require.resolve(`${family.packageName}/files/${filename}`);
}

function splitFiles(family: OpenFontFamily & { readonly kind: "variable-split" }): readonly {
  readonly path: string;
  readonly unicodeRange: string;
}[] {
  const cssPath = require.resolve(`${family.packageName}/${family.css}`);
  const css = readFileSync(cssPath, "utf8");
  return [...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/gu)].map((match) => {
    const body = match[1]!;
    const file = /src:\s*url\((?:['"])?\.\/files\/([^)'";]+)(?:['"])?\)/u.exec(body)?.[1];
    const unicodeRange = /unicode-range:\s*([^;]+);/u.exec(body)?.[1]?.replace(/\s+/gu, "");
    if (file === undefined || unicodeRange === undefined) {
      throw new Error(`${family.packageName}/${family.css} contains an unsupported @font-face`);
    }
    return { path: require.resolve(`${family.packageName}/files/${file}`), unicodeRange };
  });
}

export const decodeOpenFontFaceSurface: StructuredSurfaceHandler = async ({ element, resolveAsset }) => {
  const request = requestedFace(element);
  const files = request.family.kind === "variable-split"
    ? splitFiles(request.family)
    : [{ path: oneFile(request.family, request.weight, request.style) }];
  const sources: FontArtifactRef["sources"] = await Promise.all(files.map(async (file) => {
    const bytes = Uint8Array.from(await readFile(file.path));
    const basename = file.path.split("/").at(-1)!;
    const resolved = await resolveAsset({
      from: `package:@narratage/fonts-open/${request.familyName}/${basename}`,
      mediaType: "font/woff2",
      bytes,
      range: element.range,
    });
    return {
      artifact: resolved.artifact,
      ...("unicodeRange" in file ? { unicodeRange: file.unicodeRange } : {}),
    };
  }));
  const font: FontArtifactRef = {
    contract: "svml.font-artifact@1",
    sources,
    weight: request.weight,
    style: request.style,
  };
  assertFontArtifactRef(font, `${element.name}.${request.id}`);
  return {
    records: [{
      id: request.id,
      type: mediaTypes.fontArtifact,
      value: { kind: "inline", value: font },
      range: element.range,
    }],
    components: [],
    fragments: [],
  };
};
