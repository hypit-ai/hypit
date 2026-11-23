import type { NleTimelineScene, NleTimelineSceneItem } from "@hypit/nle/surface";

export function editableSelection(scene: NleTimelineScene, ids: readonly string[]): string[] {
  const available = new Set(scene.tracks.filter(track => !track.locked).flatMap(track => track.items.map(item => item.id)));
  return [...new Set(ids)].filter(id => available.has(id));
}

export function directionalSelection(scene: NleTimelineScene, frame: number, direction: "left" | "right"): string[] {
  return editableSelection(scene, scene.tracks.flatMap(track => track.items
    .filter(item => direction === "left" ? item.startFrame < frame : item.startFrame + item.durationFrames > frame)
    .map(item => item.id)));
}

export function selectionAtFrame(
  scene: NleTimelineScene,
  ids: readonly string[],
  frame: number,
  capability: "split" | "trimStart" | "trimEnd",
  accepts: (item: NleTimelineSceneItem) => boolean = () => true,
): NleTimelineSceneItem[] {
  const selected = new Set(editableSelection(scene, ids));
  const items = new Map(scene.tracks.flatMap(track => track.items.map(item => [item.id, item] as const)));
  const eligible = (id: string) => {
    const item = items.get(id);
    return item !== undefined && item.affordances[capability] && accepts(item)
      && frame > item.startFrame && frame < item.startFrame + item.durationFrames;
  };
  return [...selected].filter(eligible).map(id => items.get(id)!);
}
