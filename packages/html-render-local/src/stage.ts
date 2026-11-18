import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { materializeHtmlProgram, selectHtmlArtifacts, type HtmlFrameSpan, type HtmlProgram } from "@hypit/html-program";
import type { StagedHtmlFiles } from "./types.js";

const extensions: Readonly<Record<string, string>> = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg",
  "video/mp4": ".mp4", "video/webm": ".webm",
  "font/woff2": ".woff2", "font/woff": ".woff", "font/ttf": ".ttf", "font/otf": ".otf",
};

function extension(address: string, mediaType: string): string {
  return extensions[mediaType] ?? (extname(address) || ".bin");
}

/** Stage only resources observable in this render request. */
export async function stageHtmlProgram(
  program: HtmlProgram,
  directory: string,
  frameSelection?: readonly HtmlFrameSpan[],
): Promise<StagedHtmlFiles> {
  await mkdir(join(directory, "artifacts"), { recursive: true });
  const selected = new Set(selectHtmlArtifacts(program, frameSelection).map((artifact) => artifact.id));
  const paths = new Map<string, string>();
  const artifactPaths = new Map<string, string>();
  for (const [index, artifact] of program.artifacts.entries()) {
    const relative = `artifacts/asset-${index}${extension(artifact.resource.address, artifact.resource.mediaType)}`;
    paths.set(artifact.id, `./${relative}`);
    if (!selected.has(artifact.id)) continue;
    const destination = join(directory, relative);
    artifactPaths.set(artifact.resource.address, destination);
    await copyFile(artifact.resource.address, destination);
    if (artifact.resource.size !== undefined && (await stat(destination)).size !== artifact.resource.size) {
      throw new Error(`HTML Programme Artifact ${artifact.id} size differs from its declared resource.`);
    }
  }
  const html = materializeHtmlProgram(program, (_resource, id) => {
    const path = paths.get(id);
    if (path === undefined) throw new Error(`HTML Programme Artifact ${id} has no staged path.`);
    return path;
  });
  const document = join(directory, "index.html");
  await writeFile(document, html, "utf8");
  return { directory, document, artifactPaths };
}
