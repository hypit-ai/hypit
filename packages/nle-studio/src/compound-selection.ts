import type { NleTimelineScene } from "@hypit/nle/surface";

type CompoundTrack = {
  readonly enabled: boolean;
  readonly items: readonly { readonly id: string; readonly kind: string; readonly enabled: boolean }[];
};

export function resolveCompoundSelection<Track extends CompoundTrack>(
  timeline: Pick<NleTimelineScene, "transitions" | "mattes" | "groups"> & { readonly tracks: readonly Track[] },
  ids: readonly string[],
) {
  const selected = new Set(ids);
  const track = timeline.tracks.find(entry => entry.items.some(item => selected.has(item.id)));
  const items = track?.items.filter(item => selected.has(item.id)) ?? [];
  if (track === undefined || !track.enabled || items.length !== selected.size || items.length === 0
    || items.some(item => item.kind !== "present") || !items.some(item => item.enabled)) {
    return { error: "NLE Studio compound requires Present Items with enabled content on one enabled Track." } as const;
  }
  const first = track.items.indexOf(items[0]!);
  if (!track.items.slice(first, first + items.length).every(item => selected.has(item.id))) {
    return { error: "NLE Studio compound requires a contiguous selection in Track Item order." } as const;
  }
  if (timeline.transitions.some(({ outgoing, incoming }) => selected.has(outgoing) !== selected.has(incoming))
    || timeline.mattes.some(({ content, matte }) => selected.has(content) !== selected.has(matte))) {
    return { error: "NLE Studio compound requires both endpoints of every selected audiovisual relation." } as const;
  }
  if (timeline.groups.some(group => group.items.some(item => selected.has(item))
    && !group.items.every(item => selected.has(item)))) {
    return { error: "NLE Studio compound requires selecting every member of each affected Group." } as const;
  }
  return { track, first, count: items.length, selected } as const;
}
