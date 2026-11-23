import { readFile, readdir, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { bindingValues, decodeCanvas, type CanvasDocument } from "@hypit/canvas";
import type { MediaAssetReference } from "@hypit/media-asset";
import { indexNleProject, readNleProject, type NleProject } from "@hypit/nle";
import { nleProjectOwnerProvider } from "@hypit/nle/node";
import type { ProjectHost } from "@hypit/project";

async function* storedDocuments(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory() && ![".git", ".hypit", "node_modules"].includes(entry.name)) {
      yield* storedDocuments(path);
    } else if (entry.isFile() && (entry.name.endsWith(".svml") || entry.name.endsWith(".canvas.json"))) {
      yield path;
    }
  }
}

export async function assertProjectMediaUnused(project: ProjectHost, asset: MediaAssetReference): Promise<void> {
  const root = project.boundary.root;
  const target = resolve(root, asset.path);
  const uses = new Set<string>();
  const addresses = new Map<string, Promise<string | undefined>>();
  const matches = async (address: string) => {
    if (address === target) return true;
    if (!address.startsWith(root + sep)) return false;
    let canonical = addresses.get(address);
    if (canonical === undefined) {
      canonical = realpath(address).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") return undefined;
        throw error;
      });
      addresses.set(address, canonical);
    }
    return await canonical === target;
  };
  const inspectNle = async (document: NleProject, path: string) => {
    const index = indexNleProject(document);
    for (const name of index.mediaAssetPaths()) {
      if (await matches(resolve(dirname(resolve(root, path)), name))) {
        for (const { item } of index.mediaAssetUsers(name)) uses.add(`${path} · ${item.id}`);
      }
    }
  };
  const inspectCanvas = async (document: CanvasDocument, path: string) => {
    for (const node of document.nodes) {
      const references = "media" in node ? [node.media] : Object.values(node.inputs)
        .flatMap(bindingValues).flatMap(value => "media" in value ? [value.media] : []);
      for (const reference of references) {
        if (await matches(resolve(root, reference.path))) uses.add(`${path} · ${node.id}`);
      }
    }
  };
  for await (const file of storedDocuments(root)) {
    const path = relative(root, file).split(sep).join("/");
    try {
      const contents = await readFile(file, "utf8");
      if (path.endsWith(".svml")) await inspectNle(readNleProject(contents), path);
      else await inspectCanvas(decodeCanvas(contents), path);
    } catch (error) {
      throw new Error(`无法检查 ${path} 的素材引用。`, { cause: error });
    }
  }
  for (const { owner, path } of project.documents.observe()) {
    if (owner !== nleProjectOwnerProvider.owner) continue;
    const service = project.documents.current(nleProjectOwnerProvider, path);
    if (service !== undefined) await inspectNle(service.snapshot().project, path);
  }
  if (uses.size > 0) {
    const locations = [...uses].slice(0, 5).join("、");
    const extra = uses.size > 5 ? `等 ${uses.size} 处` : "";
    throw new Error(`素材仍被引用：${locations}${extra}。请先移除这些引用。`);
  }
}
