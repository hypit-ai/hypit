import type { NleTimelineScene, NleTimelineSceneItem } from "@hypit/nle/surface";

export function editableSelection(scene: NleTimelineScene, ids: readonly string[]): string[] {
  const available = new Set(scene.tracks.filter(track => !track.locked).flatMap(track => track.items.map(item => item.id)));
  return [...new Set(ids)].filter(id => available.has(id));
}

export function resolveGroupSelection(scene: NleTimelineScene, ids: readonly string[]) {
  const selected = new Set(ids);
  const groups = scene.groups.filter(group => group.items.some(item => selected.has(item)));
  const singleGroup = groups.length === 1 ? groups[0] : undefined;
  if (singleGroup !== undefined && ids.every(item => singleGroup.items.includes(item))) {
    return {
      kind: "unlink" as const,
      id: singleGroup.id,
      label: singleGroup.items.length === selected.size ? "解除联动" : "移出联动",
      disabled: editableSelection(scene, singleGroup.items).length !== singleGroup.items.length,
    };
  }
  if (selected.size < 2) return;
  const partial = groups.some(group => group.items.some(item => !selected.has(item)));
  return {
    kind: "link" as const,
    label: "创建联动",
    disabled: partial || editableSelection(scene, ids).length !== selected.size,
    hint: partial ? "选全已有联动组后再创建联动" : undefined,
  };
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
): NleTimelineSceneItem[] {
  const selected = new Set(ids);
  return scene.tracks.flatMap(track => track.items.filter(item => selected.has(item.id)
    && item.startFrame < frame && frame < item.startFrame + item.durationFrames));
}
