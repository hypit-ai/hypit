import type { NleTimelineScene, NleTimelineSceneItem } from "@hypit/nle/view";

export function linkedSelection(scene: NleTimelineScene, ids: readonly string[]): string[] {
  const available = new Set(scene.tracks.flatMap(track => track.items.map(item => item.id)));
  const selected = new Set(ids.filter(id => available.has(id)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of scene.groups) {
      if (!group.items.some(id => selected.has(id))) continue;
      for (const id of group.items) {
        if (available.has(id) && !selected.has(id)) { selected.add(id); changed = true; }
      }
    }
  }
  return [...selected];
}

export function editableSelection(scene: NleTimelineScene, ids: readonly string[]): string[] {
  const locked = new Set(scene.tracks.filter(track => track.locked).flatMap(track => track.items.map(item => item.id)));
  return linkedSelection(scene, ids).filter(id => !linkedSelection(scene, [id]).some(member => locked.has(member)));
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
): NleTimelineSceneItem[] {
  const selected = new Set(editableSelection(scene, ids));
  const items = new Map(scene.tracks.flatMap(track => track.items.map(item => [item.id, item] as const)));
  const eligible = (id: string) => {
    const item = items.get(id);
    return item !== undefined && item.affordances[capability]
      && frame > item.startFrame && frame < item.startFrame + item.durationFrames;
  };
  return [...selected].filter(id => linkedSelection(scene, [id]).every(eligible)).map(id => items.get(id)!);
}
