import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationCompiler,
} from "@hypit/hypit/author";
import type { CanonicalValue } from "@hypit/hypit/protocol";
import { assertFontArtifactRef, mediaTypes, type FontArtifactRef } from "@hypit/media";

import { fontsourceModuleRef } from "./manifest.js";

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

function literal(declaration: AuthorDeclaration, name: string): string {
  const value = declarationField(declaration, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`Fontsource Face.${name} must be a non-empty literal.`);
  }
  return value.value.trim();
}

function packageName(declaration: AuthorDeclaration): string {
  const value = literal(declaration, "package");
  if (!/^@fontsource(?:-variable)?\/[a-z0-9][a-z0-9-]*$/u.test(value)) {
    throw new Error("Fontsource Face.package must name one @fontsource or @fontsource-variable package.");
  }
  return value;
}

function weight(declaration: AuthorDeclaration): number {
  const value = Number(literal(declaration, "weight"));
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw new Error("Fontsource Face.weight must be an integer from 1 to 1000.");
  }
  return value;
}

function style(declaration: AuthorDeclaration): "normal" | "italic" {
  const value = literal(declaration, "style");
  if (value !== "normal" && value !== "italic") {
    throw new Error("Fontsource Face.style must be normal or italic.");
  }
  return value;
}

function validateMetadata(value: unknown, packageValue: string): FontsourceMetadata {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${packageValue}/metadata.json must be an object.`);
  }
  const metadata = value as Partial<FontsourceMetadata>;
  if (typeof metadata.id !== "string" || typeof metadata.family !== "string"
    || !Array.isArray(metadata.weights) || !metadata.weights.every(Number.isSafeInteger)
    || !Array.isArray(metadata.styles) || !metadata.styles.every((item) => typeof item === "string")
    || (metadata.variable !== false && (metadata.variable === null || typeof metadata.variable !== "object"))) {
    throw new Error(`${packageValue}/metadata.json has an unsupported shape.`);
  }
  return metadata as FontsourceMetadata;
}

function faceFiles(css: string, packageValue: string, cssName: string): readonly {
  readonly path: string;
  readonly unicodeRange?: string;
}[] {
  const result = [...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/gu)].map((match) => {
    const body = match[1]!;
    const file = /src:\s*url\((?:['"])?\.\/files\/([^)'";]+\.woff2)(?:['"])?\)/u.exec(body)?.[1];
    const unicodeRange = /unicode-range:\s*([^;]+);/u.exec(body)?.[1]?.replace(/\s+/gu, "");
    if (file === undefined) throw new Error(`${packageValue}/${cssName} contains an unsupported @font-face source.`);
    return {
      path: `files/${file}`,
      ...(unicodeRange === undefined ? {} : { unicodeRange }),
    };
  });
  if (result.length === 0) throw new Error(`${packageValue}/${cssName} contains no @font-face rules.`);
  return result;
}

const idField = {
  name: "id", kind: "identifier" as const, required: true,
  summary: "Names the exact FontArtifact value.",
};

export const fontsourceFaceAuthorDeclaration: AuthorDeclarationCompiler = {
  module: fontsourceModuleRef,
  declaration: "face",
  outputs: [mediaTypes.fontArtifact],
  shape: {
    summary: "Adapts one exact face from an explicitly installed Fontsource package.",
    fields: [
      idField,
      { name: "package", kind: "literal", required: true,
        summary: "Names an installed @fontsource or @fontsource-variable package." },
      { name: "weight", kind: "literal", required: true,
        summary: "Chooses an exact integer weight supported by the package." },
      { name: "style", kind: "literal", required: true, values: ["normal", "italic"],
        summary: "Chooses an exact published style." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: id, ref: { kind: "record", id }, type: mediaTypes.fontArtifact }];
  },
  async compile({ declaration, readAsset, resolveAsset }) {
    const id = literal(declaration, "id");
    const selectedPackage = packageName(declaration);
    const selectedWeight = weight(declaration);
    const selectedStyle = style(declaration);
    const metadataBytes = await readAsset({
      from: `package:${selectedPackage}/metadata.json`,
      mediaType: "application/json",
      range: declaration.range,
    });
    const metadata = validateMetadata(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(metadataBytes)), selectedPackage);
    if (!metadata.styles.includes(selectedStyle)) {
      throw new Error(`${selectedPackage} does not publish style ${selectedStyle}.`);
    }
    let cssName: string;
    if (metadata.variable === false) {
      if (!metadata.weights.includes(selectedWeight)) {
        throw new Error(`${selectedPackage} does not publish weight ${selectedWeight}.`);
      }
      cssName = `${selectedWeight}${selectedStyle === "italic" ? "-italic" : ""}.css`;
    } else {
      const axis = metadata.variable.wght;
      if (axis === undefined || selectedWeight < Number(axis.min) || selectedWeight > Number(axis.max)) {
        throw new Error(`${selectedPackage} does not publish weight ${selectedWeight}.`);
      }
      cssName = `wght${selectedStyle === "italic" ? "-italic" : ""}.css`;
    }
    const cssBytes = await readAsset({
      from: `package:${selectedPackage}/${cssName}`,
      mediaType: "text/css",
      range: declaration.range,
    });
    const files = faceFiles(new TextDecoder("utf-8", { fatal: true }).decode(cssBytes), selectedPackage, cssName);
    const sources: FontArtifactRef["sources"][number][] = [];
    for (const file of files) {
      const artifact = await resolveAsset({
        from: `package:${selectedPackage}/${file.path}`,
        mediaType: "font/woff2",
        range: declaration.range,
      });
      sources.push({ artifact, ...(file.unicodeRange === undefined ? {} : { unicodeRange: file.unicodeRange }) });
    }
    const font: FontArtifactRef = { sources, weight: selectedWeight, style: selectedStyle };
    assertFontArtifactRef(font, `Fontsource Face.${id}`);
    return {
      records: [{ id, type: mediaTypes.fontArtifact, value: font as unknown as CanonicalValue, range: declaration.range }],
      components: [],
    };
  },
};

export const fontsourceAuthorDeclarations = [fontsourceFaceAuthorDeclaration] as const;
export const fontsourceMarkupDeclarations = [{ name: "face", tag: "Face" }] as const;
