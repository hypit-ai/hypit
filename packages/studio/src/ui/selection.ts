import type { StudioItem, StudioItemAddress, StudioSnapshot } from "../shared.js";
import { sameStudioItemAddress, studioItemAddressKey } from "../shared.js";

/**
 * Which pane the user acted in. Panes ignore events they originated, which is
 * the only thing keeping timeline, code and picture from driving each other in
 * a loop.
 */
export type Origin = "timeline" | "code" | "video";

export type Selection =
  | { readonly kind: "none" }
  | { readonly kind: "item"; readonly item: StudioItemAddress; readonly origin: Origin }
  | { readonly kind: "temporal-domain"; readonly companion: string; readonly domainId: string; readonly itemId: string; readonly origin: Origin };

export type Playhead = { readonly frame: number; readonly origin: Origin | "play" };

export type State = {
  readonly snapshot: StudioSnapshot;
  readonly selection: Selection;
  readonly playhead: Playhead;
  /** Session-local omissions used only while evaluating the Studio preview. */
  readonly preview: { readonly omittedItemKeys: ReadonlySet<string> };
};

export type Store = {
  /** Undefined until the first snapshot arrives. */
  current(): State | undefined;
  item(address: StudioItemAddress): StudioItem | undefined;
  /** Items covering a frame, topmost track first. */
  itemsAt(frame: number): readonly StudioItem[];
  load(snapshot: StudioSnapshot): void;
  /** Select without moving the playhead; timeline inspection must not destroy position. */
  select(address: StudioItemAddress, origin: Origin): void;
  /** Select one package-contributed temporal-domain item without moving the playhead. */
  selectTemporalDomainItem(companion: string, domainId: string, itemId: string, origin: Origin): void;
  /** Select and seek to the Item start, used by source navigation. */
  selectItem(address: StudioItemAddress, origin: Origin): void;
  /**
   * Look at one instant, optionally selecting an Item there. Used when the thing
   * an author pointed at is a Script range rather than an Item, which has no
   * first frame of its own to jump to.
   */
  focus(frame: number, item: StudioItemAddress | undefined, origin: Origin): void;
  clearSelection(): void;
  seek(frame: number, origin: Origin | "play"): void;
  setItemPreviewIncluded(item: StudioItemAddress, included: boolean): void;
  resetPreviewMask(): void;
  subscribe(listener: (state: State) => void): void;
};

/**
 * The Item an author is pointing at in the source text.
 *
 * A Script intent wins over the element that binds it: `@{claim} … @{/claim}` sits
 * inside the `<script>` element, so without that preference every click in the
 * prose would select the speech performance instead of the B-roll. Ties break toward
 * the tightest range, which is the most specific thing under the cursor.
 */
export function itemAtOffset(snapshot: StudioSnapshot, offset: number): StudioItem | undefined {
  const items = snapshot.tracks.flatMap((track) => track.items);
  const within = (range: { readonly start: number; readonly end: number } | undefined): number =>
    range === undefined || offset < range.start || offset > range.end
      ? Number.POSITIVE_INFINITY
      : range.end - range.start;

  let best: StudioItem | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const score = item.elementLocation?.path === snapshot.source.path
      ? within(item.elementLocation.range)
      : Number.POSITIVE_INFINITY;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

export function createStore(): Store {
  let snapshot: StudioSnapshot | undefined;
  let selection: Selection = { kind: "none" };
  let playhead: Playhead = { frame: 0, origin: "timeline" };
  let omittedItemKeys = new Set<string>();
  const listeners: ((state: State) => void)[] = [];

  const items = (): readonly StudioItem[] => snapshot?.tracks.flatMap((track) => track.items) ?? [];

  const emit = (): void => {
    if (snapshot === undefined) return;
    const state: State = { snapshot, selection, playhead, preview: { omittedItemKeys } };
    for (const listener of listeners) listener(state);
  };

  const clamp = (frame: number): number =>
    Math.max(0, Math.min(Math.round(frame), (snapshot?.timeline.frameCount ?? 1) - 1));

  return {
    current: () => snapshot === undefined ? undefined : { snapshot, selection, playhead, preview: { omittedItemKeys } },
    item: (address) => items().find((item) => sameStudioItemAddress(item.address, address)),
    itemsAt(frame) {
      return items()
        .filter((item) => frame >= item.startFrame && frame < item.endFrameExclusive)
        .sort((left, right) => right.stackOrder - left.stackOrder);
    },
    load(value) {
      snapshot = value;
      // A recompiled Source may have dropped the selected Item, and its frame
      // count may have moved under the playhead.
      const held = selection;
      if (held.kind === "item" && !items().some((item) => sameStudioItemAddress(item.address, held.item))) {
        selection = { kind: "none" };
      }
      if (held.kind === "temporal-domain"
        && !snapshot.temporalDomains.some((domain) => domain.companion === held.companion
          && domain.id === held.domainId && domain.items.some((item) => item.id === held.itemId))) {
        selection = { kind: "none" };
      }
      playhead = { frame: clamp(playhead.frame), origin: playhead.origin };
      const available = new Set(items()
        .filter((item) => item.terminalTargets.some((target) => target.kind === "visual-adjustment"))
        .map((item) => studioItemAddressKey(item.address)));
      omittedItemKeys = new Set([...omittedItemKeys].filter((key) => available.has(key)));
      emit();
    },
    select(address, origin) {
      const item = items().find((candidate) => sameStudioItemAddress(candidate.address, address));
      if (item === undefined) return;
      selection = { kind: "item", item: address, origin };
      emit();
    },
    selectTemporalDomainItem(companion, domainId, itemId, origin) {
      if (snapshot?.temporalDomains.some((domain) => domain.companion === companion
        && domain.id === domainId && domain.items.some((item) => item.id === itemId)) !== true) return;
      selection = { kind: "temporal-domain", companion, domainId, itemId, origin };
      emit();
    },
    selectItem(address, origin) {
      const item = items().find((candidate) => sameStudioItemAddress(candidate.address, address));
      if (item === undefined) return;
      selection = { kind: "item", item: address, origin };
      playhead = { frame: clamp(item.startFrame), origin };
      emit();
    },
    focus(frame, address, origin) {
      const item = address === undefined ? undefined : items().find((candidate) => sameStudioItemAddress(candidate.address, address));
      selection = item === undefined ? { kind: "none" } : { kind: "item", item: item.address, origin };
      playhead = { frame: clamp(frame), origin };
      emit();
    },
    clearSelection() {
      if (selection.kind === "none") return;
      selection = { kind: "none" };
      emit();
    },
    seek(frame, origin) {
      const next = clamp(frame);
      if (next === playhead.frame && origin === playhead.origin) return;
      playhead = { frame: next, origin };
      emit();
    },
    setItemPreviewIncluded(address, included) {
      const item = items().find((candidate) => sameStudioItemAddress(candidate.address, address));
      if (item === undefined || !item.terminalTargets.some((target) => target.kind === "visual-adjustment")) return;
      const key = studioItemAddressKey(address);
      const next = new Set(omittedItemKeys);
      if (included) next.delete(key); else next.add(key);
      if (next.size === omittedItemKeys.size && [...next].every((candidate) => omittedItemKeys.has(candidate))) return;
      omittedItemKeys = next;
      emit();
    },
    resetPreviewMask() {
      if (omittedItemKeys.size === 0) return;
      omittedItemKeys = new Set();
      emit();
    },
    subscribe(listener) {
      listeners.push(listener);
      if (snapshot !== undefined) listener({ snapshot, selection, playhead, preview: { omittedItemKeys } });
    },
  };
}
