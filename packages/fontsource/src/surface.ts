import { readFile } from "node:fs/promises";

import type { StructuredElement, StructuredSurfaceHandler } from "@hypit/hypit/markup";
import { assertAttributes, assertEmptyElement } from "@hypit/hypit/markup";
import { assertFontArtifactRef, mediaTypes } from "@hypit/media";
import type { FontArtifactRef } from "@hypit/media";
import {
  NodePackageNotFoundError,
  resolveNodePackageResource,
} from "@hypit/hypit/loader/node";

type FontsourceMetadata = {
  readonly id: string;
  readonly family: string;
  readonly weights: readonly number[];
  readonly styles: readonly string[];
  readonly variable: false | Readonly<Record<string, {
    readonly min: string;
    readonly max: string;
    readonly step: string;
  }>>;
};

function textAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${element.name}.${name} must be a non-empty string`);
  }
  return value.trim();
}

function fontsourcePackage(element: StructuredElement): string {
  const value = textAttribute(element, "package");
  if (!/^@fontsource(?:-variable)?\/[a-z0-9][a-z0-9-]*$/u.test(value)) {
    throw new Error(`${element.name}.package must name one @fontsource or @fontsource-variable package`);
  }
  return value;
}

function resolveResource(packageName: string, path: string, sourceId: string): string {
  try {
    return resolveNodePackageResource(packageName, path, {
      from: sourceId,
      workspaceRoots: [],
    });
  } catch (error) {
    if (!(error instanceof NodePackageNotFoundError)) throw error;
    throw new Error(
      `${packageName} is not installed for the Source that selected it. Add it to that project's package.json and install the lockfile.`,
      { cause: error },
    );
  }
}

function faceFiles(css: string, packageName: string, cssName: string): readonly {
  readonly path: string;
  readonly unicodeRange?: string;
}[] {
  const result = [...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/gu)].map((match) => {
    const body = match[1]!;
    const file = /src:\s*url\((?:['"])?\.\/files\/([^)'";]+\.woff2)(?:['"])?\)/u.exec(body)?.[1];
    const unicodeRange = /unicode-range:\s*([^;]+);/u.exec(body)?.[1]?.replace(/\s+/gu, "");
    if (file === undefined) throw new Error(`${packageName}/${cssName} contains an unsupported @font-face source`);
    return {
      path: `files/${file}`,
      ...(unicodeRange === undefined ? {} : { unicodeRange }),
    };
  });
  if (result.length === 0) throw new Error(`${packageName}/${cssName} contains no @font-face rules`);
  return result;
}

function numberAttribute(element: StructuredElement, name: string): number {
  const value = Number(textAttribute(element, name));
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw new Error(`${element.name}.${name} must be an integer from 1 to 1000`);
  }
  return value;
}

function validateMetadata(value: unknown, packageName: string): FontsourceMetadata {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${packageName}/metadata.json must be an object`);
  }
  const metadata = value as Partial<FontsourceMetadata>;
  if (typeof metadata.id !== "string" || typeof metadata.family !== "string"
    || !Array.isArray(metadata.weights) || !metadata.weights.every(Number.isSafeInteger)
    || !Array.isArray(metadata.styles) || !metadata.styles.every((style) => typeof style === "string")
    || (metadata.variable !== false && (metadata.variable === null || typeof metadata.variable !== "object"))) {
    throw new Error(`${packageName}/metadata.json has an unsupported shape`);
  }
  return metadata as FontsourceMetadata;
}

export const decodeFontsourceFaceSurface: StructuredSurfaceHandler = async ({
  element,
  sourceId,
  resolveAsset,
}) => {
  assertAttributes(element, ["id", "package", "weight", "style"]);
  assertEmptyElement(element);
  if (sourceId === undefined) throw new Error(`${element.name} requires a canonical Source identity from its Host`);
  const id = textAttribute(element, "id");
  const packageName = fontsourcePackage(element);
  const weight = numberAttribute(element, "weight");
  const styleValue = textAttribute(element, "style");
  if (styleValue !== "normal" && styleValue !== "italic") {
    throw new Error(`${element.name}.style must be normal or italic`);
  }
  const style: "normal" | "italic" = styleValue;
  const metadataPath = resolveResource(packageName, "metadata.json", sourceId);
  const metadata = validateMetadata(JSON.parse(await readFile(metadataPath, "utf8")), packageName);
  if (!metadata.styles.includes(style)) throw new Error(`${packageName} does not publish style ${style}`);
  let cssName: string;
  if (metadata.variable === false) {
    if (!metadata.weights.includes(weight)) throw new Error(`${packageName} does not publish weight ${weight}`);
    cssName = `${weight}${style === "italic" ? "-italic" : ""}.css`;
  } else {
    const axis = metadata.variable.wght;
    if (axis === undefined || weight < Number(axis.min) || weight > Number(axis.max)) {
      throw new Error(`${packageName} does not publish weight ${weight}`);
    }
    cssName = `wght${style === "italic" ? "-italic" : ""}.css`;
  }
  const cssPath = resolveResource(packageName, cssName, sourceId);
  const files = faceFiles(await readFile(cssPath, "utf8"), packageName, cssName);
  const sources: FontArtifactRef["sources"][number][] = [];
  for (const file of files) {
    // Validate the CSS path against the located package before asking the Host to stage it.
    resolveResource(packageName, file.path, sourceId);
    const resolved = await resolveAsset({
      from: `package:${packageName}/${file.path}`,
      mediaType: "font/woff2",
      range: element.range,
    });
    sources.push({
      artifact: resolved,
      ...(file.unicodeRange === undefined ? {} : { unicodeRange: file.unicodeRange }),
    });
  }
  const font: FontArtifactRef = { sources, weight, style };
  assertFontArtifactRef(font, `${element.name}.${id}`);
  return {
    records: [{ id, type: mediaTypes.fontArtifact, value: (font), range: element.range }],
    components: [],
  };
};
