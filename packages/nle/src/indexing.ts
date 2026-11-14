import { nlePackageSymbolKey } from "./package.js";
import type {
  NleComponentItem,
  NleComposition,
  NleItem,
  NleTrack,
} from "./types.js";

export type NleIndexedItem = {
  readonly track: NleTrack;
  readonly item: NleItem;
};

/**
 * Invocation-local reverse projection of one exact Composition revision.
 * It is never serialized and must be rebuilt after the owning Project changes.
 */
export type NleCompositionIndex = {
  readonly item: (id: string) => NleIndexedItem | undefined;
  readonly componentValueUsers: (id: string) => readonly NleIndexedItem[];
  readonly pictureLayoutUsers: (id: string) => readonly NleIndexedItem[];
  readonly mediaAssetUsers: (path: string) => readonly NleIndexedItem[];
  readonly componentUsers: (component: NleComponentItem["component"]) => readonly NleIndexedItem[];
  readonly transitionParticipants: (item: string) => readonly string[];
  readonly matteParticipants: (item: string) => readonly string[];
};

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const current = map.get(key);
  if (current === undefined) map.set(key, [value]);
  else current.push(value);
}

/** Build one disposable reverse index from the Composition's canonical forward references. */
export function indexNleComposition(composition: NleComposition): NleCompositionIndex {
  const items = new Map<string, NleIndexedItem>();
  const componentValues = new Map<string, NleIndexedItem[]>();
  const pictureLayouts = new Map<string, NleIndexedItem[]>();
  const mediaAssets = new Map<string, NleIndexedItem[]>();
  const components = new Map<string, NleIndexedItem[]>();
  const transitions = new Map<string, string[]>();
  const mattes = new Map<string, string[]>();

  for (const track of composition.tracks) {
    for (const item of track.items) {
      const indexed = { track, item } as const;
      items.set(item.id, indexed);
      if (item.kind === "present") {
        if (item.picture !== undefined && "ref" in item.picture.layout) {
          append(pictureLayouts, item.picture.layout.ref, indexed);
        }
        if (item.source === "media") append(mediaAssets, item.asset.path, indexed);
        if (item.source === "component") {
          append(components, nlePackageSymbolKey(item.component), indexed);
          for (const reference of item.sharedValues ?? []) append(componentValues, reference.ref, indexed);
          for (const asset of Object.values(item.media ?? {})) append(mediaAssets, asset.path, indexed);
        }
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

  const values = <T>(map: ReadonlyMap<string, readonly T[]>, key: string): readonly T[] =>
    map.get(key) ?? [];
  return {
    item: (id) => items.get(id),
    componentValueUsers: (id) => values(componentValues, id),
    pictureLayoutUsers: (id) => values(pictureLayouts, id),
    mediaAssetUsers: (path) => values(mediaAssets, path),
    componentUsers: (component) => values(components, nlePackageSymbolKey(component)),
    transitionParticipants: (item) => values(transitions, item),
    matteParticipants: (item) => values(mattes, item),
  };
}
