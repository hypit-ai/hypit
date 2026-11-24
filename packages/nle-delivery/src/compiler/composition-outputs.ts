import type { NleComposition, NleItem, NleTrack } from "@hypit/nle";

export type CompositionOutputs = { readonly picture: boolean; readonly audio: boolean };

export function selectCompositionOutputs(composition: NleComposition, outputs: CompositionOutputs) {
  const located = new Map<string, { readonly item: NleItem; readonly track: NleTrack }>();
  const matteSources = new Set(composition.mattes.map(relation => relation.matte));
  const pictureOrder: string[] = [];
  const audioOrder: string[] = [];
  for (const track of composition.tracks) for (const item of track.items) {
    located.set(item.id, { item, track });
    if (!item.enabled) continue;
    if (outputs.picture && track.pictureEnabled && !matteSources.has(item.id)) pictureOrder.push(item.id);
    if (outputs.audio && track.audioEnabled && (item.kind === "present" ? item.audio !== undefined : track.kind === "audio")) {
      audioOrder.push(item.id);
    }
  }

  const matteByContent = new Map(composition.mattes
    .filter(relation => located.get(relation.matte)!.track.pictureEnabled)
    .map(relation => [relation.content, relation] as const));
  const requiredPicture = new Set(pictureOrder.filter(id => located.get(id)!.item.kind === "present"));
  for (const id of requiredPicture) {
    const relation = matteByContent.get(id);
    if (relation !== undefined) requiredPicture.add(relation.matte);
  }
  const requiredAudio = new Set(audioOrder.filter(id => located.get(id)!.item.kind === "present"));
  return { located, matteByContent, pictureOrder, audioOrder, requiredPicture, requiredAudio };
}
