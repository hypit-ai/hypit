import { compareExactTemporalValues } from "@hypit/temporal/algebra";
import type { ProjectMediaLibraryFolder } from "@hypit/media-asset/service";
import type { NleStudioMediaEntry } from "../protocol.js";

export const libraryTypeLabels = { image: "图片", video: "视频", audio: "音频" } as const;
export type LibraryMediaType = keyof typeof libraryTypeLabels;
export type LibraryFilter = "all" | LibraryMediaType;
export type LibrarySort = {
  readonly field: "adoptedAt" | "name" | "duration";
  readonly direction: "ascending" | "descending";
};

const names = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function libraryMediaLabel({ name, fileExtension }: NleStudioMediaEntry): string {
  return fileExtension === undefined || name.toLowerCase().endsWith(fileExtension.toLowerCase())
    ? name : name + fileExtension;
}

export function libraryMediaType(entry: NleStudioMediaEntry): LibraryMediaType | undefined {
  if (entry.pictureKind === "constant") return "image";
  if (entry.pictureKind === "signal") return "video";
  if (entry.kind === "audio") return "audio";
}

export function filterLibraryFolders(
  folders: readonly ProjectMediaLibraryFolder[], entries: readonly NleStudioMediaEntry[], filter: LibraryFilter,
): readonly ProjectMediaLibraryFolder[] {
  if (filter === "all" || folders.length === 0) return folders;
  const matching = new Set(entries.filter(entry => libraryMediaType(entry) === filter).map(entry => entry.id));
  function containsMatch(folder: ProjectMediaLibraryFolder): boolean {
    return folder.assets.some(asset => matching.has(asset.path)) || folder.folders.some(containsMatch);
  }
  return folders.filter(containsMatch);
}

function compareKnown<T>(left: T | undefined, right: T | undefined, compare: (a: T, b: T) => number, direction: number): number {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  return direction * compare(left, right);
}

type LibraryItem =
  | { readonly kind: "folder"; readonly value: ProjectMediaLibraryFolder }
  | { readonly kind: "media"; readonly value: NleStudioMediaEntry };

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const itemTime = (item: LibraryItem) => item.kind === "folder" ? item.value.createdAt : item.value.adoptedAt;
const itemDuration = (item: LibraryItem) => item.kind === "media" ? item.value.duration : undefined;

export function arrangeLibraryItems(
  folders: readonly ProjectMediaLibraryFolder[], entries: readonly NleStudioMediaEntry[], filter: LibraryFilter, sort: LibrarySort,
): LibraryItem[] {
  const items: LibraryItem[] = [
    ...folders.map(value => ({ kind: "folder" as const, value })),
    ...entries.filter(entry => filter === "all" || libraryMediaType(entry) === filter)
      .map(value => ({ kind: "media" as const, value })),
  ];
  const direction = sort.direction === "ascending" ? 1 : -1;
  return items.sort((left, right) => {
    const byName = names.compare(left.value.name, right.value.name) || compareText(left.value.id, right.value.id);
    switch (sort.field) {
      case "adoptedAt":
        return compareKnown(itemTime(left), itemTime(right), compareText, direction) || byName;
      case "name": return direction * byName;
      case "duration":
        return compareKnown(itemDuration(left), itemDuration(right), compareExactTemporalValues, direction) || byName;
    }
  });
}
