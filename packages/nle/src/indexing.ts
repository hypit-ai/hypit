import type { PackageSymbol } from "./implementation.js";
import type {
  NleComponentItem,
  NleComposition,
  NleItem,
  NleProject,
  NleTrack,
} from "./types.js";

export type NleIndexedItem = {
  readonly composition: NleComposition;
  readonly track: NleTrack;
  readonly item: NleItem;
};

/** Disposable reverse projection of one exact Composition snapshot. It is never serialized. */
export type NleCompositionIndex = {
  readonly item: (id: string) => NleIndexedItem | undefined;
  readonly mediaAssetUsers: (path: string) => readonly NleIndexedItem[];
  readonly componentUsers: (component: NleComponentItem["component"]) => readonly NleIndexedItem[];
  readonly sharedValueUsers: (id: string) => readonly NleIndexedItem[];
  readonly transitionParticipants: (item: string) => readonly string[];
  readonly matteParticipants: (item: string) => readonly string[];
};

export type NleProjectIndex = NleCompositionIndex & {
  readonly composition: (id: string) => NleComposition | undefined;
  readonly compositionUsers: (id: string) => readonly NleIndexedItem[];
};

function symbolKey(value: PackageSymbol): string {
  return `${value.package}\0${value.symbol}`;
}

function append<T>(map: Map<string, T[]>, key: string, value: T): void {
  const values = map.get(key);
  if (values === undefined) map.set(key, [value]);
  else values.push(value);
}

function indexedValues(
  map: ReadonlyMap<string, readonly NleIndexedItem[]>,
  key: string,
): readonly NleIndexedItem[] {
  return [...new Map((map.get(key) ?? []).map((value) => [value.item.id, value] as const)).values()];
}

/** Build reverse lookup from canonical forward references without creating another owner fact. */
export function indexNleComposition(composition: NleComposition): NleCompositionIndex {
  const items = new Map<string, NleIndexedItem>();
  const mediaAssets = new Map<string, NleIndexedItem[]>();
  const components = new Map<string, NleIndexedItem[]>();
  const sharedValues = new Map<string, NleIndexedItem[]>();
  const transitions = new Map<string, string[]>();
  const mattes = new Map<string, string[]>();

  for (const track of composition.tracks) {
    for (const item of track.items) {
      const indexed = { composition, track, item } as const;
      items.set(item.id, indexed);
      if (item.kind === "adjust") {
        if (item.parameters.kind === "shared") append(sharedValues, item.parameters.ref, indexed);
        continue;
      }
      if (item.picture !== undefined && "ref" in item.picture.layout) {
        append(sharedValues, item.picture.layout.ref, indexed);
      }
      for (const process of [...(item.picture?.processes ?? []), ...(item.audio?.processes ?? [])]) {
        if (process.parameters.kind === "shared") append(sharedValues, process.parameters.ref, indexed);
      }
      if (item.source === "media") append(mediaAssets, item.asset.path, indexed);
      else if (item.source === "component") {
        append(components, symbolKey(item.component), indexed);
        for (const binding of item.valueBindings ?? []) {
          if (binding.kind === "shared") append(sharedValues, binding.ref, indexed);
        }
        for (const asset of Object.values(item.media ?? {})) append(mediaAssets, asset.path, indexed);
      }
    }
  }
  for (const relation of composition.transitions) {
    append(transitions, relation.outgoing, relation.id);
    append(transitions, relation.incoming, relation.id);
  }
  for (const relation of composition.mattes) {
    append(mattes, relation.content, relation.id);
    append(mattes, relation.matte, relation.id);
  }

  const values = <T>(map: ReadonlyMap<string, readonly T[]>, key: string): readonly T[] => map.get(key) ?? [];
  return {
    item: (id) => items.get(id),
    mediaAssetUsers: (path) => values(mediaAssets, path),
    componentUsers: (component) => values(components, symbolKey(component)),
    sharedValueUsers: (id) => indexedValues(sharedValues, id),
    transitionParticipants: (item) => values(transitions, item),
    matteParticipants: (item) => values(mattes, item),
  };
}

/** Build one disposable reverse index across every Composition in one exact Project snapshot. */
export function indexNleProject(project: NleProject): NleProjectIndex {
  const compositions = new Map(project.compositions.map((composition) => [composition.id, composition] as const));
  const items = new Map<string, NleIndexedItem>();
  const mediaAssets = new Map<string, NleIndexedItem[]>();
  const components = new Map<string, NleIndexedItem[]>();
  const sharedValues = new Map<string, NleIndexedItem[]>();
  const compositionUsers = new Map<string, NleIndexedItem[]>();
  const transitions = new Map<string, string[]>();
  const mattes = new Map<string, string[]>();
  for (const composition of project.compositions) {
    for (const track of composition.tracks) {
      for (const item of track.items) {
        const indexed = { composition, track, item } as const;
        items.set(item.id, indexed);
        if (item.kind === "adjust") {
          if (item.parameters.kind === "shared") append(sharedValues, item.parameters.ref, indexed);
          continue;
        }
        if (item.picture !== undefined && "ref" in item.picture.layout) {
          append(sharedValues, item.picture.layout.ref, indexed);
        }
        for (const process of [...(item.picture?.processes ?? []), ...(item.audio?.processes ?? [])]) {
          if (process.parameters.kind === "shared") append(sharedValues, process.parameters.ref, indexed);
        }
        if (item.source === "media") append(mediaAssets, item.asset.path, indexed);
        else if (item.source === "component") {
          append(components, symbolKey(item.component), indexed);
          for (const binding of item.valueBindings ?? []) {
            if (binding.kind === "shared") append(sharedValues, binding.ref, indexed);
          }
          for (const asset of Object.values(item.media ?? {})) append(mediaAssets, asset.path, indexed);
        } else append(compositionUsers, item.composition, indexed);
      }
    }
    for (const relation of composition.transitions) {
      append(transitions, relation.outgoing, relation.id);
      append(transitions, relation.incoming, relation.id);
    }
    for (const relation of composition.mattes) {
      append(mattes, relation.content, relation.id);
      append(mattes, relation.matte, relation.id);
    }
  }
  const values = <T>(map: ReadonlyMap<string, readonly T[]>, key: string): readonly T[] => map.get(key) ?? [];
  return {
    composition: (id) => compositions.get(id),
    item: (id) => items.get(id),
    mediaAssetUsers: (path) => values(mediaAssets, path),
    componentUsers: (component) => values(components, symbolKey(component)),
    sharedValueUsers: (id) => indexedValues(sharedValues, id),
    compositionUsers: (id) => values(compositionUsers, id),
    transitionParticipants: (item) => values(transitions, item),
    matteParticipants: (item) => values(mattes, item),
  };
}
