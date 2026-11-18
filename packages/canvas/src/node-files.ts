import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { assertProjectRelativePath } from "@hypit/project";
import { CanvasError, decodeCanvas, encodeCanvas, type CanvasDocument } from "./document.js";
import type { CanvasSnapshot, CanvasStore } from "./service.js";

function inside(root: string, target: string): string {
  const path = relative(root, target);
  if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new CanvasError("invalid-path", "Destination leaves the Project Boundary.");
  }
  return path.split(sep).join("/");
}

export async function canvasPath(root: string, path: string): Promise<string> {
  assertProjectRelativePath(path, "Canvas path");
  if (!path.endsWith(".canvas.json")) throw new CanvasError("invalid-path", "Canvas path must end in .canvas.json.");
  const canonical = inside(root, await realpath(resolve(root, path)));
  if (!canonical.endsWith(".canvas.json")) throw new CanvasError("invalid-path", "Canvas path must address a .canvas.json file.");
  return canonical;
}

export async function prepareProjectDestination(root: string, path: string): Promise<string> {
  assertProjectRelativePath(path);
  const parts = path.split("/");
  const name = parts.pop()!;
  let parent = root;
  for (const part of parts) {
    const child = resolve(parent, part);
    await mkdir(child).catch(error => {
      if (error?.code !== "EEXIST") throw error;
    });
    parent = await realpath(child);
    inside(root, parent);
  }
  return resolve(parent, name);
}

function temporary(path: string): string {
  return resolve(dirname(path), `.${basename(path)}.${randomUUID()}.writing`);
}

export async function writeNewDocument(path: string, contents: string): Promise<void> {
  const staging = temporary(path);
  try {
    await writeFile(staging, contents, { flag: "wx" });
    await link(staging, path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new CanvasError("destination-exists", "A document already exists at this destination.");
    }
    throw error;
  } finally { await rm(staging, { force: true }); }
}

function revision(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function canvasFileStore(root: string, path: string): CanvasStore {
  async function checkPath(): Promise<void> {
    if (await canvasPath(root, path) !== path) throw new CanvasError("invalid-path", "The Canvas file changed location. Reopen it.");
  }
  async function currentFile(): Promise<string> {
    await checkPath();
    return await readFile(resolve(root, path), "utf8");
  }
  async function read(): Promise<CanvasSnapshot> {
    const contents = await currentFile();
    return { revision: revision(contents), document: decodeCanvas(contents) };
  }
  async function write(expected: string, document: CanvasDocument): Promise<CanvasSnapshot> {
    const target = resolve(root, path);
    const staging = temporary(target);
    const contents = encodeCanvas(document);
    await checkPath();
    try {
      await writeFile(staging, contents, { flag: "wx" });
      if (revision(await currentFile()) !== expected) {
        throw new CanvasError("revision-conflict", "The Canvas file changed. Inspect the current revision and retry.");
      }
      await rename(staging, target);
    } finally { await rm(staging, { force: true }); }
    return { revision: revision(contents), document };
  }
  return { read, write };
}
