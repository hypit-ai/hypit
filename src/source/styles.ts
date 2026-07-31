import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fail } from "../diagnostics.js";
import type {
  AttributeValue,
  ParameterSource,
  SourceDocument,
  SourceElement,
  SourceNode,
} from "../model.js";
import type {
  KernelManifest,
  KernelParameter,
  KernelRegistry,
} from "../kernel.js";
import { attributeString, childElements, textContent } from "./query.js";
import { parseRootSource } from "./parse-document.js";
import { sha256 } from "../util.js";

type StyleRule = {
  selector: string;
  className: string;
  properties: Array<{ name: string; raw: string }>;
  source: string;
};

type Sheet = {
  binding: string;
  file: string;
  rules: StyleRule[];
  contentHash: string;
};

function parseGenericLiteral(raw: string): AttributeValue {
  const value = raw.trim();
  const quoted = /^(?:"([^"]*)"|'([^']*)')$/u.exec(value);
  if (quoted) return quoted[1] ?? quoted[2] ?? "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?(?:\d+\.?\d*|\.\d+)$/u.test(value)) return Number(value);
  return value;
}

function typedValue(
  raw: string,
  parameter: KernelParameter | undefined,
  source: string,
): AttributeValue {
  const value = parseGenericLiteral(raw);
  if (!parameter) return value;
  if (parameter.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail("style_parameter_type", `${source} expects numeric ${parameter.styleName}.`);
    }
  } else if (parameter.type === "boolean") {
    if (typeof value !== "boolean") {
      fail("style_parameter_type", `${source} expects boolean ${parameter.styleName}.`);
    }
  } else if (typeof value !== "string") {
    fail("style_parameter_type", `${source} expects string ${parameter.styleName}.`);
  }
  return value;
}

function parseRules(file: string, root: SourceElement): StyleRule[] {
  const source = textContent(root).replaceAll(/\/\*[\s\S]*?\*\//gu, "");
  const rules: StyleRule[] = [];
  const rulePattern = /([A-Za-z_][A-Za-z0-9_:-]*)\.([A-Za-z_][A-Za-z0-9_-]*)\s*\{([^{}]*)\}/gu;
  let consumed = "";
  let lastEnd = 0;
  for (const match of source.matchAll(rulePattern)) {
    const index = match.index ?? 0;
    consumed += source.slice(lastEnd, index).replace(/\s+/gu, "");
    lastEnd = index + match[0].length;
    const properties = (match[3] ?? "")
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean)
      .map((statement) => {
        const colon = statement.indexOf(":");
        if (colon <= 0) {
          fail("style_declaration", `${file} has invalid declaration "${statement}".`);
        }
        const name = statement.slice(0, colon).trim();
        const raw = statement.slice(colon + 1).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(name) || !raw) {
          fail("style_declaration", `${file} has invalid declaration "${statement}".`);
        }
        return { name, raw };
      });
    rules.push({
      selector: match[1]!,
      className: match[2]!,
      properties,
      source: `${file}:${match[1]}.${match[2]}`,
    });
  }
  consumed += source.slice(lastEnd).replace(/\s+/gu, "");
  if (consumed) {
    fail("style_syntax", `${file} contains unsupported sheet syntax near "${consumed.slice(0, 40)}".`);
  }
  const keys = rules.map((rule) => `${rule.selector}.${rule.className}`);
  if (new Set(keys).size !== keys.length) {
    fail("style_duplicate_rule", `${file} repeats a selector/class rule.`);
  }
  return rules;
}

async function loadSheets(document: SourceDocument): Promise<Sheet[]> {
  const sheets: Sheet[] = [];
  for (const element of childElements(document.root, "import")) {
    const from = attributeString(element, "from");
    if (extname(from) !== ".svs") continue;
    const file = resolve(from);
    const source = await readFile(file, "utf8");
    const root = parseRootSource(file, source);
    if (root.name !== "sheet") fail("style_root", `${file} must use a <sheet> root.`);
    const id = root.attributes.id;
    const alias = element.attributes.as;
    if (alias !== undefined && typeof alias !== "string") {
      fail("style_import_alias", `${document.file} sheet alias must be a string.`);
    }
    if (typeof id !== "string" || !id) fail("style_sheet_id", `${file} requires a sheet id.`);
    const binding = typeof alias === "string" && alias ? alias : id;
    sheets.push({
      binding,
      file,
      rules: parseRules(file, root),
      contentHash: sha256(source),
    });
  }
  if (new Set(sheets.map((sheet) => sheet.binding)).size !== sheets.length) {
    fail("style_duplicate_binding", "Imported .svs bindings must be unique.");
  }
  return sheets;
}

function findRule(
  token: string,
  element: SourceElement,
  sheets: Sheet[],
): StyleRule {
  const dot = token.indexOf(".");
  if (dot > 0) {
    const binding = token.slice(0, dot);
    const className = token.slice(dot + 1);
    const sheet = sheets.find((candidate) => candidate.binding === binding);
    if (!sheet) fail("style_unknown_binding", `Unknown style binding "${binding}".`);
    const rule = sheet.rules.find(
      (candidate) => candidate.selector === element.name && candidate.className === className,
    );
    if (!rule) {
      fail(
        "style_unknown_class",
        `${sheet.file} does not define ${element.name}.${className}.`,
      );
    }
    return rule;
  }
  const matches = sheets.flatMap((sheet) => sheet.rules.filter(
    (candidate) => candidate.selector === element.name && candidate.className === token,
  ));
  if (matches.length !== 1) {
    fail(
      "style_ambiguous_class",
      `Unqualified class "${token}" on <${element.name}> resolves to ${matches.length} rules.`,
    );
  }
  return matches[0]!;
}

function parameterFor(
  manifest: KernelManifest | undefined,
  styleName: string,
): KernelParameter | undefined {
  if (!manifest) return undefined;
  return manifest.parameters.find(
    (parameter) => parameter.styleName === styleName || parameter.name === styleName,
  );
}

function styleElement(
  element: SourceElement,
  sheets: Sheet[],
  kernels: KernelRegistry,
  ownerKernel?: KernelManifest,
): SourceElement {
  const manifest = kernels.get(element.name) ?? ownerKernel;
  const topLevelKernel = kernels.get(element.name);
  const classValue = element.attributes.class;
  if (classValue !== undefined && typeof classValue !== "string") {
    fail("style_class_type", `<${element.name}> class must be a string.`);
  }
  const attributes: Record<string, AttributeValue> = {};
  const parameterSources: Record<string, ParameterSource[]> = {};
  for (const token of (classValue ?? "").split(/\s+/u).filter(Boolean)) {
    const rule = findRule(token, element, sheets);
    for (const property of rule.properties) {
      const parameter = topLevelKernel
        ? parameterFor(topLevelKernel, property.name)
        : undefined;
      if (topLevelKernel && !parameter) {
        fail(
          "style_unknown_parameter",
          `${rule.source} configures unknown public parameter "${property.name}".`,
        );
      }
      const name = parameter?.name ?? property.name;
      const value = typedValue(property.raw, parameter, rule.source);
      attributes[name] = value;
      (parameterSources[name] ??= []).push({
        kind: "svs-class",
        source: rule.source,
        value,
      });
    }
  }
  for (const [name, value] of Object.entries(element.attributes)) {
    attributes[name] = value;
    if (name !== "class") {
      (parameterSources[name] ??= []).push({
        kind: "instance",
        source: element.origin?.file ?? "<source>",
        value,
      });
    }
  }
  return {
    ...element,
    attributes,
    parameterSources,
    children: element.children.map((child) => child.kind === "element"
      ? styleElement(child, sheets, kernels, manifest)
      : child),
  };
}

export async function applyStyleSheets(
  document: SourceDocument,
  kernels: KernelRegistry,
): Promise<SourceDocument> {
  const sheets = await loadSheets(document);
  if (!sheets.length) return document;
  return {
    ...document,
    root: {
      ...document.root,
      children: document.root.children.map((node: SourceNode) =>
        node.kind === "element" && !["import", "script"].includes(node.name)
          ? styleElement(node, sheets, kernels)
          : node),
    },
    modules: [
      ...(document.modules ?? []),
      ...sheets.map((sheet) => ({
        kind: "svs" as const,
        uri: pathToFileURL(sheet.file).href,
        contentHash: sheet.contentHash,
        dependencies: [],
      })),
    ],
  };
}
