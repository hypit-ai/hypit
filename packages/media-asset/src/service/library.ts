import { verifyMediaAssetReference, type MediaAssetReference } from "../index.js";
import { assertUtcTimestamp } from "../timestamp.js";

export const projectMediaLibraryFile = "library.json";
const format = "hypit.media-library";

export type ProjectMediaLibraryFolder = {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly folders: readonly ProjectMediaLibraryFolder[];
  readonly assets: readonly MediaAssetReference[];
};

export type ProjectMediaLibraryDocument = {
  readonly format: typeof format;
  readonly root: { readonly folders: readonly ProjectMediaLibraryFolder[] };
};

export type ProjectMediaLibrarySnapshot = {
  readonly revision: string;
  readonly root: ProjectMediaLibraryDocument["root"] & { readonly assets: readonly MediaAssetReference[] };
};

export type ProjectMediaLibraryChange =
  | { readonly kind: "folder.create"; readonly parent: string | null; readonly name: string }
  | { readonly kind: "folder.rename"; readonly folder: string; readonly name: string }
  | { readonly kind: "folder.move"; readonly folder: string; readonly parent: string | null }
  | { readonly kind: "folder.remove"; readonly folder: string }
  | { readonly kind: "asset.move"; readonly asset: MediaAssetReference; readonly folder: string | null };

export type ProjectMediaLibraryEdit = { readonly expectedRevision: string } & ProjectMediaLibraryChange;

export class ProjectMediaLibraryRevisionConflict extends Error {
  constructor() {
    super("The project media library changed. Refresh it and retry the edit.");
    this.name = "ProjectMediaLibraryRevisionConflict";
  }
}

function fields(value: unknown, keys: readonly string[], subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error(`${subject} must contain ${keys.join(", ")}.`);
  }
  return value as Record<string, unknown>;
}

function folderName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 160 || /[/\\\p{Cc}]/u.test(value)) {
    throw new Error("Media folder name must be 1–160 characters without slashes or control characters.");
  }
  return value.trim().normalize("NFC");
}

function folderId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(value)) {
    throw new Error("Media folder identity is invalid.");
  }
  return value;
}

function nullableFolder(value: unknown): string | null {
  return value === null ? null : folderId(value);
}

export function readProjectMediaLibraryEdit(value: unknown): ProjectMediaLibraryEdit {
  const kind = (value as { kind?: unknown } | null | undefined)?.kind;
  const specific = kind === "folder.create" ? ["parent", "name"]
    : kind === "folder.rename" ? ["folder", "name"]
    : kind === "folder.move" ? ["folder", "parent"]
    : kind === "folder.remove" ? ["folder"]
    : kind === "asset.move" ? ["asset", "folder"] : undefined;
  if (!specific) throw new Error("Media library edit kind is invalid.");
  const request = fields(value, ["kind", "expectedRevision", ...specific], "Media library edit");
  const { expectedRevision } = request;
  if (typeof expectedRevision !== "string" || expectedRevision.length === 0 || expectedRevision.length > 128) {
    throw new Error("Media library edit requires a revision.");
  }
  switch (kind) {
    case "folder.create": return { kind, expectedRevision, parent: nullableFolder(request.parent), name: folderName(request.name) };
    case "folder.rename": return { kind, expectedRevision, folder: folderId(request.folder), name: folderName(request.name) };
    case "folder.move": return { kind, expectedRevision, folder: folderId(request.folder), parent: nullableFolder(request.parent) };
    case "folder.remove": return { kind, expectedRevision, folder: folderId(request.folder) };
    case "asset.move": {
      verifyMediaAssetReference(request.asset);
      return { kind, expectedRevision, asset: request.asset, folder: nullableFolder(request.folder) };
    }
    default: throw new Error("Media library edit kind is invalid.");
  }
}

type Folder = {
  id: string;
  name: string;
  createdAt: string;
  folders: Folder[];
  assets: MediaAssetReference[];
};
type Library = { format: typeof format; root: { folders: Folder[] } };

export function projectMediaLibrary(
  revision: string,
  root: ProjectMediaLibraryDocument["root"],
  catalog: readonly MediaAssetReference[],
): ProjectMediaLibrarySnapshot {
  const organized = new Set<string>();
  const visit = (folders: readonly ProjectMediaLibraryFolder[]) => {
    for (const folder of folders) {
      for (const asset of folder.assets) organized.add(asset.path);
      visit(folder.folders);
    }
  };
  visit(root.folders);
  return { revision, root: { folders: root.folders, assets: catalog.filter(asset => !organized.has(asset.path)) } };
}

export function parseProjectMediaLibrary(source: string | undefined): Library {
  if (source === undefined) return { format, root: { folders: [] } };
  const document = fields(JSON.parse(source), ["format", "root"], "Media library document");
  if (document.format !== format) throw new Error(`Media library format must be ${format}.`);
  const root = fields(document.root, ["folders"], "Media library root");
  const ids = new Set<string>();
  const placements = new Set<string>();
  const readFolders = (value: unknown): Folder[] => {
    if (!Array.isArray(value)) throw new Error("Media library folders must be an array.");
    const siblings = new Set<string>();
    return value.map(entry => {
      const folder = fields(entry, ["id", "name", "createdAt", "folders", "assets"], "Media folder");
      const id = folderId(folder.id);
      const name = folderName(folder.name);
      const { createdAt } = folder;
      assertUtcTimestamp(createdAt, `Media folder ${name}.createdAt`);
      if (ids.has(id)) throw new Error(`Media library repeats folder identity ${id}.`);
      if (siblings.has(name)) throw new Error(`Media folder name ${name} already exists here.`);
      ids.add(id);
      siblings.add(name);
      if (!Array.isArray(folder.assets)) throw new Error(`Media folder ${name} assets must be an array.`);
      const assets = folder.assets.map(reference => {
        verifyMediaAssetReference(reference);
        if (placements.has(reference.path)) throw new Error(`Media library repeats ${reference.path}.`);
        placements.add(reference.path);
        return reference;
      });
      return { id, name, createdAt, folders: readFolders(folder.folders), assets };
    });
  };
  return { format, root: { folders: readFolders(root.folders) } };
}

function findFolder(folders: Folder[], id: string, parent?: Folder): { folder: Folder; siblings: Folder[]; parent: Folder | undefined } | undefined {
  for (const folder of folders) {
    if (folder.id === id) return { folder, siblings: folders, parent };
    const child = findFolder(folder.folders, id, folder);
    if (child !== undefined) return child;
  }
}

export function requireProjectMediaFolder(root: Library["root"], id: string): NonNullable<ReturnType<typeof findFolder>> {
  const result = findFolder(root.folders, id);
  if (result === undefined) throw new Error(`Media folder ${id} does not exist.`);
  return result;
}

export function moveProjectMediaAsset(root: Library["root"], reference: MediaAssetReference, destination: string | null): boolean {
  const target = destination === null ? undefined : requireProjectMediaFolder(root, destination).folder;
  const findPlacement = (folders: Folder[]): Folder | undefined => {
    for (const folder of folders) {
      if (folder.assets.some(asset => asset.path === reference.path)) return folder;
      const nested = findPlacement(folder.folders);
      if (nested !== undefined) return nested;
    }
  };
  const previous = findPlacement(root.folders);
  if (previous === target) return false;
  if (previous !== undefined) previous.assets = previous.assets.filter(asset => asset.path !== reference.path);
  target?.assets.push(reference);
  return true;
}

export function editProjectMediaFolders(
  root: Library["root"], request: Exclude<ProjectMediaLibraryEdit, { kind: "asset.move" }>,
): boolean {
  const siblingsOf = (parent: string | null) => parent === null ? root.folders : requireProjectMediaFolder(root, parent).folder.folders;
  const unique = (siblings: Folder[], name: string) => {
    if (siblings.some(entry => entry.name === name)) throw new Error(`Media folder name ${name} already exists here.`);
  };

  if (request.kind === "folder.create") {
    const siblings = siblingsOf(request.parent);
    unique(siblings, request.name);
    siblings.push({ id: crypto.randomUUID(), name: request.name, createdAt: new Date().toISOString(), folders: [], assets: [] });
    return true;
  }
  const { folder, siblings, parent } = requireProjectMediaFolder(root, request.folder);
  switch (request.kind) {
    case "folder.rename":
      if (folder.name === request.name) return false;
      unique(siblings, request.name);
      folder.name = request.name;
      return true;
    case "folder.move": {
      const target = siblingsOf(request.parent);
      if (target === siblings) return false;
      if (target === folder.folders || request.parent !== null && findFolder(folder.folders, request.parent)) {
        throw new Error("A media folder cannot be moved into itself or one of its children.");
      }
      unique(target, folder.name);
      siblings.splice(siblings.indexOf(folder), 1);
      target.push(folder);
      return true;
    }
    case "folder.remove": {
      const otherSiblings = siblings.filter(entry => entry !== folder);
      for (const child of folder.folders) unique(otherSiblings, child.name);
      siblings.splice(siblings.indexOf(folder), 1, ...folder.folders);
      if (parent !== undefined) parent.assets.push(...folder.assets);
      return true;
    }
  }
}
