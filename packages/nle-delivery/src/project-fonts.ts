import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import type { MediaResource } from "@hypit/media";
import { createNodeProjectPackageResolver } from "@hypit/project/node";
import { readNleTextFontSource, type ResolveNleTextFont } from "./text.js";

const fontMediaTypes: Readonly<Record<string, string>> = {
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
};
const genericFamilies = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui",
  "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong",
]);

type FontFile = { readonly resource: MediaResource; readonly unicodeRange?: string };

function fontFile(address: string): MediaResource {
  const mediaType = fontMediaTypes[extname(address).toLowerCase()];
  const information = statSync(address);
  if (mediaType === undefined || !information.isFile()) throw new Error("Expected a WOFF, WOFF2, TTF or OTF file.");
  return { address, mediaType, size: information.size };
}

/** The package CSS maps published styles and weights to local WOFF2 files and their Unicode subsets. */
function fontsourceFiles(
  installed: ReturnType<typeof createNodeProjectPackageResolver>,
  name: string,
  weight: number,
  style: string,
): readonly FontFile[] {
  const asset = (path: string) => installed(name, path, `Font ${name}`);
  const metadata = JSON.parse(readFileSync(asset("metadata.json"), "utf8")) as {
    readonly styles: readonly string[];
    readonly weights: readonly number[];
    readonly variable: false | { readonly wght?: { readonly min: string; readonly max: string } };
  };
  if (!Array.isArray(metadata.styles) || !metadata.styles.includes(style)) {
    throw new Error("Package does not publish style " + style + ".");
  }
  const axis = metadata.variable === false ? undefined : metadata.variable?.wght;
  if (metadata.variable === false ? !Array.isArray(metadata.weights) || !metadata.weights.includes(weight)
    : axis === undefined || !(weight >= Number(axis.min) && weight <= Number(axis.max))) {
    throw new Error("Package does not publish weight " + weight + ".");
  }
  const stylesheet = (metadata.variable === false ? String(weight) : "wght") + (style === "italic" ? "-italic" : "") + ".css";
  const css = readFileSync(asset(stylesheet), "utf8");
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/gu)].map(([, declaration]) => {
    const file = /src:\s*url\(\s*['"]?\.\/files\/([a-z0-9._-]+\.woff2)['"]?\s*\)/iu.exec(declaration!)?.[1];
    if (file === undefined) throw new Error(stylesheet + " has a face without a local WOFF2 source.");
    const unicodeRange = /unicode-range:\s*([^;]+)/u.exec(declaration!)?.[1]?.replace(/\s+/gu, "");
    return { resource: fontFile(asset("files/" + file)),
      ...(unicodeRange === undefined ? {} : { unicodeRange }) };
  });
  if (faces.length === 0) throw new Error(stylesheet + " declares no font faces.");
  return faces;
}

/** File access and the cache live inside one prepared compilation. */
export function createProjectFontResolver(root: string): ResolveNleTextFont {
  const installed = createNodeProjectPackageResolver(root);
  const cache = new Map<string, ReturnType<ResolveNleTextFont>>();
  const referenceRoot = realpathSync(root);
  function projectFile(path: string): FontFile {
    const address = realpathSync(resolve(referenceRoot, path));
    const local = relative(referenceRoot, address);
    if (local === ".." || local.startsWith(".." + sep) || isAbsolute(local)) {
      throw new Error("Font file leaves the Project Boundary.");
    }
    return { resource: fontFile(address) };
  }
  return (source, weight, style) => {
    const selected = readNleTextFontSource(source);
    if (!Number.isSafeInteger(weight) || weight < 1 || weight > 1000
      || !["normal", "italic", "oblique"].includes(style)) {
      throw new Error("Invalid font weight or style for " + source + ".");
    }
    if (selected.kind === "family") {
      return { family: genericFamilies.has(selected.name) ? selected.name : JSON.stringify(selected.name), dependencies: [] };
    }
    const key = JSON.stringify([source, weight, style]);
    const previous = cache.get(key);
    if (previous !== undefined) return previous;
    try {
      const files = selected.kind === "file" ? [projectFile(selected.path)]
        : fontsourceFiles(installed, selected.package, weight, style);
      const family = "hypit-font-" + createHash("sha256").update(key).digest("hex");
      const output: ReturnType<ResolveNleTextFont> = {
        family,
        dependencies: files.map(({ resource, unicodeRange }, index) => ({
          kind: "font", id: family + "-" + index, resource, family, weight: String(weight), style,
          ...(unicodeRange === undefined ? {} : { unicodeRange }),
        })),
      };
      cache.set(key, output);
      return output;
    } catch (cause) {
      const diagnostic = cause instanceof Error ? cause.message : String(cause);
      throw new Error("Cannot resolve font " + source + " at " + weight + " " + style + ". " + diagnostic, { cause });
    }
  };
}
