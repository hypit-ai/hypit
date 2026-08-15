import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";

import { fineCaptionRecipeSchema, FINE_CAPTION_FAMILY } from "@narratage/caption-fine";
import { openFontFamilies } from "@narratage/fonts-open";
import type { OpenFontFamily, OpenFontStyle } from "@narratage/fonts-open";
import { loadNodePackageSelection } from "@narratage/package-loader-node";
import type { LoadedPackage } from "@narratage/package-loader-node";
import type { ArtifactAttachment } from "@narratage/workspace";
import type { CanonicalValue, TypedRecord } from "@narratage/protocol";
import { parseSvs } from "@narratage/svs";
import { createVideoCompiler, discoverVideoSourcePackages } from "@narratage/video-cli";
import type { Plugin, ViteDevServer } from "vite";

import type {
  CaptionPlaygroundFailure,
  CaptionPlaygroundFont,
  CaptionPlaygroundSnapshot,
  FontPatch,
  RecipePatch,
} from "./shared.js";

// Resolve font packages from the package that owns that catalog. They are its
// dependencies, not hidden root dependencies of this developer tool.
const require = createRequire(new URL("../../../packages/fonts-open/src/surface.ts", import.meta.url));

export type CaptionPlaygroundOptions = {
  readonly source: string;
  /** Host directory whose package manager installation supplies Source imports. */
  readonly packageRoot: string;
  readonly styleExport: string;
  readonly displayExport: string;
  readonly recipeFile: string;
  readonly recipePath: string;
  readonly fontFile: string;
  readonly fontId: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
};

type CurrentState = {
  readonly snapshot: CaptionPlaygroundSnapshot;
  readonly attachments: ReadonlyMap<string, ArtifactAttachment>;
};

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function maskedSourceHeader(source: string): string {
  return source.replace(/^\s*<\?svml\s+using=(['"])[^'"]+\1\s*\?>/u, (header) =>
    header.replace(/[^\r\n]/gu, " "));
}

function json(response: import("node:http").ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(value)}\n`);
}

async function body<T>(request: import("node:http").IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function inlineExport(
  result: Awaited<ReturnType<ReturnType<typeof createVideoCompiler>["compileFile"]>>,
  name: string,
): unknown {
  const item = result.exports.find((candidate) => candidate.name === name);
  if (item === undefined) throw new Error(`Source exports no ${name}`);
  if (item.ref.kind !== "record") throw new Error(`${name} is computed at run time; Caption Playground needs an authored value`);
  const recordId = item.ref.id;
  const record: TypedRecord | undefined = result.program.records.find((candidate) => candidate.id === recordId);
  if (record?.value.kind !== "inline") throw new Error(`${name} is not an authored inline value`);
  return record.value.value;
}

function assertRecord(value: unknown, contract: string, subject: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || (value as Record<string, unknown>).contract !== contract) {
    throw new Error(`${subject} is not ${contract}`);
  }
}

function fontWeights(family: OpenFontFamily): readonly number[] {
  if (family.kind === "static" || family.kind === "static-split" || family.kind === "external-split") {
    return family.weights;
  }
  const common = [100, 200, 300, 400, 500, 600, 700, 800, 900]
    .filter((weight) => weight >= family.minimumWeight && weight <= family.maximumWeight);
  return common.length > 0 ? common : [family.minimumWeight, family.maximumWeight];
}

function catalog(): readonly CaptionPlaygroundFont[] {
  return Object.entries(openFontFamilies).map(([id, family]) => {
    const weights = fontWeights(family);
    return {
      id,
      label: family.label,
      category: family.category,
      intendedUse: family.intendedUse,
      license: family.license,
      weights,
      styles: family.styles,
      previewWeight: weights.includes(700) ? 700 : weights.includes(400) ? 400 : weights[0]!,
      previewStyle: family.styles.includes("normal") ? "normal" : family.styles[0]!,
    };
  }).sort((left, right) => left.label.localeCompare(right.label));
}

function quotePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function fontTag(source: string, id: string): {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly family: string;
  readonly weight: number;
  readonly style: OpenFontStyle;
} {
  const tag = new RegExp(`<[A-Za-z][A-Za-z0-9_-]*:Stack\\b[^>]*\\bid=(['"])${quotePattern(id)}\\1[^>]*>`, "u").exec(source);
  if (tag?.index === undefined) throw new Error(`Source contains no fonts:Stack with id=${id}`);
  const text = tag[0];
  const attribute = (name: string): string | undefined =>
    new RegExp(`\\b${name}=(['"])(.*?)\\1`, "u").exec(text)?.[2];
  const family = attribute("family");
  const weight = Number(attribute("weight"));
  const style = attribute("style") as OpenFontStyle | undefined;
  if (family === undefined || !Number.isSafeInteger(weight) || (style !== "normal" && style !== "italic")) {
    throw new Error(`fonts:Stack ${id} must declare family, weight and style`);
  }
  return { start: tag.index, end: tag.index + text.length, text, family, weight, style };
}

function replaceAttribute(tag: string, name: string, value: string): string {
  const pattern = new RegExp(`(\\b${name}=)(['"])(.*?)\\2`, "u");
  if (!pattern.test(tag)) throw new Error(`fonts:Stack is missing ${name}`);
  return tag.replace(pattern, `$1"${value}"`);
}

function canonicalSource(value: CanonicalValue): string {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string" && /^[^;{}\r\n]+$/u.test(value) && value.trim() === value) return value;
  if (typeof value === "string") return JSON.stringify(value);
  return JSON.stringify(value);
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporary = `${path}.caption-playground-${process.pid}-${Date.now()}`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, path);
}

function defaultFontFile(
  family: OpenFontFamily & { readonly fileStem: string },
  weight: number,
  style: OpenFontStyle,
): string {
  const filename = family.kind === "static"
    ? `${family.fileStem}-${weight}-${style}.woff2`
    : `${family.fileStem}-${style}.woff2`;
  return require.resolve(`${family.packageName}/files/${filename}`);
}

function splitFontFiles(
  family: OpenFontFamily & { readonly kind: "variable-split" | "static-split" | "external-split" },
  weight: number,
  style: OpenFontStyle,
): readonly { readonly file: string; readonly unicodeRange: string }[] {
  const css = family.kind === "variable-split"
    ? family.css
    : family.kind === "external-split"
      ? family.css
      : `${weight}${style === "italic" ? "-italic" : ""}.css`;
  const cssPath = require.resolve(`${family.packageName}/${css}`);
  return [...readFileSync(cssPath, "utf8").matchAll(/@font-face\s*\{([\s\S]*?)\}/gu)].map((match) => {
    const bodyText = match[1]!;
    const file = /src:\s*url\((?:['"])?\.\/files\/([^)'";]+\.woff2)(?:['"])?\)/u.exec(bodyText)?.[1];
    const unicodeRange = /unicode-range:\s*([^;]+);/u.exec(bodyText)?.[1]?.replace(/\s+/gu, "");
    if (file === undefined || unicodeRange === undefined) throw new Error(`${cssPath} has unsupported @font-face CSS`);
    return { file: require.resolve(`${family.packageName}/files/${file}`), unicodeRange };
  });
}

export function captionPlaygroundPlugin(options: CaptionPlaygroundOptions): Plugin {
  let current: CurrentState | undefined;
  let failure: CaptionPlaygroundFailure | undefined;
  let revision = 0;
  let server: ViteDevServer | undefined;
  let compileTimer: ReturnType<typeof setTimeout> | undefined;
  const galleryFiles = new Map<string, string>();
  const loaded = (async () => {
    let packages: readonly LoadedPackage[] = [];
    let previous = "";
    while (true) {
      const selection = await discoverVideoSourcePackages(options.source, {
        workspaceRoot: dirname(options.source),
        packages,
      });
      packages = await loadNodePackageSelection(selection, options.packageRoot);
      const key = JSON.stringify(packages.map((item) => item.specifier));
      if (key === previous) return packages;
      previous = key;
    }
  })();

  const compile = async (): Promise<CurrentState> => {
    const packages = await loaded;
    const compiler = createVideoCompiler({
      packageContributions: packages.map((item) => item.contribution),
      workspaceRoot: dirname(options.source),
    });
    const [result, fontText, recipeText] = await Promise.all([
      compiler.compileFile(options.source),
      readFile(options.fontFile, "utf8"),
      readFile(options.recipeFile, "utf8"),
    ]);
    const style = inlineExport(result, options.styleExport);
    const display = inlineExport(result, options.displayExport);
    assertRecord(style, "narratage.caption-style@1", options.styleExport);
    assertRecord(display, "narratage.caption-display-sequence@1", options.displayExport);
    if ((style.rendering as Record<string, unknown> | undefined)?.family !== FINE_CAPTION_FAMILY) {
      throw new Error(`${options.styleExport} is not a Fine Caption Style`);
    }
    const recipe = parseSvs(options.recipeFile, maskedSourceHeader(recipeText)).recipes
      .find((candidate) => candidate.value.path === options.recipePath);
    if (recipe === undefined) throw new Error(`${options.recipeFile} contains no ${options.recipePath}`);
    const selectedFont = fontTag(fontText, options.fontId);
    const attachments = new Map(result.attachments.map((item) => [item.artifact.digest, item]));
    revision += 1;
    return {
      snapshot: {
        revision,
        style: style as CaptionPlaygroundSnapshot["style"],
        display: display as CaptionPlaygroundSnapshot["display"],
        recipe: {
          file: relative(process.cwd(), options.recipeFile),
          path: options.recipePath,
          digest: sha256(recipeText),
          values: recipe.value.properties,
          schema: fineCaptionRecipeSchema,
        },
        font: {
          file: relative(process.cwd(), options.fontFile),
          id: options.fontId,
          digest: sha256(fontText),
          family: selectedFont.family,
          weight: selectedFont.weight,
          style: selectedFont.style,
        },
        preview: { width: options.width, height: options.height, fps: options.fps },
        fonts: catalog(),
        artifacts: result.attachments.map((item) => ({ ...item.artifact })),
      },
      attachments,
    };
  };

  const publish = async (): Promise<void> => {
    try {
      current = await compile();
      failure = undefined;
      server?.ws.send({ type: "custom", event: "caption:snapshot", data: current.snapshot });
    } catch (error) {
      revision += 1;
      failure = { revision, error: error instanceof Error ? error.message : String(error) };
      server?.ws.send({ type: "custom", event: "caption:error", data: failure });
    }
  };

  const schedule = (): void => {
    if (compileTimer !== undefined) clearTimeout(compileTimer);
    compileTimer = setTimeout(() => void publish(), 80);
  };

  const patchRecipe = async (patch: RecipePatch): Promise<void> => {
    const source = await readFile(options.recipeFile, "utf8");
    if (sha256(source) !== patch.expectedDigest) throw Object.assign(new Error("SVS changed outside the browser; reloaded newest source"), { status: 409 });
    const parsed = parseSvs(options.recipeFile, maskedSourceHeader(source)).recipes
      .find((item) => item.value.path === options.recipePath);
    if (parsed === undefined) throw new Error(`Recipe ${options.recipePath} no longer exists`);
    const property = parsed.properties.find((item) => item.name === patch.name);
    let next: string;
    if (patch.remove === true) {
      if (property === undefined) return;
      next = `${source.slice(0, property.range.start)}${source.slice(property.range.end)}`;
    } else {
      if (patch.value === undefined) throw new Error("Recipe patch has no value");
      const value = canonicalSource(patch.value);
      if (property !== undefined) {
        next = `${source.slice(0, property.valueRange.start)}${value}${source.slice(property.valueRange.end)}`;
      } else {
        const close = parsed.range.end - 1;
        next = `${source.slice(0, close)}\n    ${patch.name}: ${value};${source.slice(close)}`;
      }
    }
    await atomicWrite(options.recipeFile, next);
  };

  const patchFont = async (patch: FontPatch): Promise<void> => {
    const family = openFontFamilies[patch.family as keyof typeof openFontFamilies] as OpenFontFamily | undefined;
    if (family === undefined) throw new Error(`Unknown open font ${patch.family}`);
    if (!fontWeights(family).includes(patch.weight)
      || !(family.styles as readonly OpenFontStyle[]).includes(patch.style)) {
      throw new Error(`${patch.family} does not provide ${patch.weight} ${patch.style}`);
    }
    const source = await readFile(options.fontFile, "utf8");
    if (sha256(source) !== patch.expectedDigest) throw Object.assign(new Error("SVML changed outside the browser; reloaded newest source"), { status: 409 });
    const selected = fontTag(source, options.fontId);
    let replacement = replaceAttribute(selected.text, "family", patch.family);
    replacement = replaceAttribute(replacement, "weight", String(patch.weight));
    replacement = replaceAttribute(replacement, "style", patch.style);
    await atomicWrite(options.fontFile, `${source.slice(0, selected.start)}${replacement}${source.slice(selected.end)}`);
  };

  return {
    name: "narratage-caption-playground",
    configureServer(value) {
      server = value;
      value.watcher.add([options.source, options.recipeFile, options.fontFile]);
      value.watcher.on("change", (path) => {
        if (resolve(path) === options.source || resolve(path) === options.recipeFile || resolve(path) === options.fontFile) schedule();
      });
      value.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://caption.local");
        try {
          if (request.method === "GET" && url.pathname === "/__caption/session") {
            if (current === undefined && failure === undefined) await publish();
            if (current !== undefined) json(response, 200, current.snapshot);
            else json(response, 500, failure);
            return;
          }
          if (request.method === "PATCH" && url.pathname === "/__caption/recipe") {
            await patchRecipe(await body<RecipePatch>(request));
            await publish();
            json(response, 200, current?.snapshot ?? failure);
            return;
          }
          if (request.method === "PATCH" && url.pathname === "/__caption/font") {
            await patchFont(await body<FontPatch>(request));
            await publish();
            json(response, 200, current?.snapshot ?? failure);
            return;
          }
          const artifact = /^\/__caption\/artifact\/(sha256:[a-f0-9]+)$/u.exec(url.pathname)?.[1];
          if (request.method === "GET" && artifact !== undefined) {
            const attachment = current?.attachments.get(artifact);
            if (attachment === undefined) { response.statusCode = 404; response.end(); return; }
            response.setHeader("content-type", attachment.artifact.mediaType);
            response.setHeader("cache-control", "no-store");
            for await (const chunk of await attachment.open()) response.write(chunk);
            response.end();
            return;
          }
          const familyId = /^\/__caption\/font-css\/([a-z0-9-]+)$/u.exec(url.pathname)?.[1];
          if (request.method === "GET" && familyId !== undefined) {
            const family = openFontFamilies[familyId as keyof typeof openFontFamilies] as OpenFontFamily | undefined;
            if (family === undefined) { response.statusCode = 404; response.end(); return; }
            const weights = fontWeights(family);
            const weight = weights.includes(700) ? 700 : weights.includes(400) ? 400 : weights[0]!;
            const style = family.styles.includes("normal") ? "normal" : family.styles[0]!;
            const files = family.kind === "variable-split" || family.kind === "static-split" || family.kind === "external-split"
              ? splitFontFiles(family, weight, style)
              : [{ file: defaultFontFile(family, weight, style) }];
            const css = files.map((item) => {
              const token = createHash("sha256").update(item.file).digest("hex");
              galleryFiles.set(token, item.file);
              const range = "unicodeRange" in item ? `unicode-range:${item.unicodeRange};` : "";
              return `@font-face{font-family:${JSON.stringify(`caption-gallery-${familyId}`)};src:url('/__caption/font-file/${token}') format('woff2');font-style:${style};font-weight:${weight};${range}font-display:swap;}`;
            }).join("\n");
            response.setHeader("content-type", "text/css; charset=utf-8");
            response.setHeader("cache-control", "public, max-age=3600");
            response.end(css);
            return;
          }
          const token = /^\/__caption\/font-file\/([a-f0-9]+)$/u.exec(url.pathname)?.[1];
          if (request.method === "GET" && token !== undefined) {
            const path = galleryFiles.get(token);
            if (path === undefined) { response.statusCode = 404; response.end(); return; }
            response.setHeader("content-type", "font/woff2");
            response.setHeader("cache-control", "public, max-age=3600");
            response.end(await readFile(path));
            return;
          }
          next();
        } catch (error) {
          const status = typeof error === "object" && error !== null && "status" in error
            ? Number((error as { status: unknown }).status)
            : 400;
          if (status === 409) await publish();
          json(response, status, { error: error instanceof Error ? error.message : String(error), snapshot: current?.snapshot });
        }
      });
    },
  };
}
