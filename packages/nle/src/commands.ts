import { findClip, validateProject, type EditProject, type MediaAsset, type Track } from './document.js';
export type EditCommand =
  | { type: 'asset.add'; assets: MediaAsset[] }
  | { type: 'asset.rename'; assetId: string; name: string }
  | { type: 'asset.relink'; assetId: string; uri: string }
  | { type: 'asset.remove'; assetId: string }
  | { type: 'track.add'; track: Track; before?: string }
  | { type: 'track.move'; trackId: string; before?: string }
  | { type: 'track.update'; trackId: string; name?: string; locked?: boolean; muted?: boolean }
  | { type: 'clip.add'; trackId: string; clip: Track['clips'][number] }
  | { type: 'clip.move'; clipIds: string[]; delta: number; trackId?: string }
  | { type: 'clip.trim'; clipId: string; edge: 'start' | 'end'; frame: number }
  | { type: 'clip.split'; clipId: string; frame: number; rightId: string }
  | { type: 'clip.remove'; clipIds: string[] }
  | { type: 'clip.detach-audio'; clipId: string; audioClipId: string; audioTrackId: string; trackName: string };
export type EditTransaction = { revision: number; commands: EditCommand[] };
export class RevisionConflict extends Error {
  constructor(readonly expected: number, readonly actual: number) { super(`Project changed: expected revision ${expected}, found ${actual}`); }
}
function trackFor(project: EditProject, id: string) {
  const track = project.tracks.find(item => item.id === id);
  if (!track) throw new Error(`Unknown track: ${id}`);
  return track;
}
function editable(track: Track) { if (track.locked) throw new Error(`Track is locked: ${track.name}`); }
/** Apply a complete user gesture atomically to an immutable document revision. */
export function applyTransaction(project: EditProject, transaction: EditTransaction): EditProject {
  if (transaction.revision !== project.revision) throw new RevisionConflict(transaction.revision, project.revision);
  const next = structuredClone(project);
  for (const command of transaction.commands) {
    switch (command.type) {
      case 'asset.add': next.assets.push(...structuredClone(command.assets)); break;
      case 'asset.rename': case 'asset.relink': {
        const asset = next.assets.find(item => item.id === command.assetId);
        if (!asset) throw new Error('Unknown asset');
        if (command.type === 'asset.rename') asset.name = command.name;
        else asset.uri = command.uri;
        break;
      }
      case 'asset.remove': {
        if (next.tracks.some(track => track.clips.some(clip => clip.assetId === command.assetId))) throw new Error('Remove timeline occurrences before removing their asset');
        next.assets = next.assets.filter(asset => asset.id !== command.assetId); break;
      }
      case 'track.add': case 'track.move': {
        const track = command.type === 'track.add' ? structuredClone(command.track) : trackFor(next, command.trackId);
        if (command.type === 'track.move') { editable(track); next.tracks = next.tracks.filter(item => item.id !== track.id); }
        const index = command.before === undefined ? next.tracks.length : next.tracks.findIndex(item => item.id === command.before);
        if (index < 0) throw new Error('Unknown destination track');
        next.tracks.splice(index, 0, track); break;
      }
      case 'track.update': {
        const track = trackFor(next, command.trackId);
        if (command.name !== undefined) track.name = command.name;
        if (command.locked !== undefined) track.locked = command.locked;
        if (command.muted !== undefined) track.muted = command.muted;
        break;
      }
      case 'clip.add': {
        const track = trackFor(next, command.trackId); editable(track); track.clips.push(structuredClone(command.clip)); break;
      }
      case 'clip.move': {
        for (const id of new Set(command.clipIds)) {
          const { clip, track } = findClip(next, id); editable(track); clip.start += command.delta;
          if (command.trackId && command.trackId !== track.id) {
            const target = trackFor(next, command.trackId); editable(target);
            track.clips = track.clips.filter(item => item.id !== id); target.clips.push(clip);
          }
        }
        break;
      }
      case 'clip.trim': {
        const { clip, track } = findClip(next, command.clipId); editable(track);
        if (command.edge === 'start') {
          const delta = command.frame - clip.start; clip.start += delta; clip.duration -= delta; clip.sourceStart += delta;
        } else clip.duration = command.frame - clip.start;
        break;
      }
      case 'clip.split': {
        const { clip, track } = findClip(next, command.clipId); editable(track);
        const offset = command.frame - clip.start;
        if (offset <= 0 || offset >= clip.duration) throw new Error('Split must be inside the clip');
        const right = { ...clip, id: command.rightId, start: command.frame, sourceStart: clip.sourceStart + offset, duration: clip.duration - offset };
        clip.duration = offset; track.clips.splice(track.clips.indexOf(clip) + 1, 0, right); break;
      }
      case 'clip.detach-audio': {
        const { clip, track } = findClip(next, command.clipId); editable(track);
        const asset = next.assets.find(item => item.id === clip.assetId)!;
        if (track.kind !== 'visual' || !asset.hasAudio || !clip.audio) throw new Error('Clip has no attached audio');
        next.tracks.unshift({ id: command.audioTrackId, name: command.trackName, kind: 'audio', locked: false, muted: false,
          clips: [{ ...clip, id: command.audioClipId, audio: true }] });
        clip.audio = false; break;
      }
      case 'clip.remove': {
        for (const id of new Set(command.clipIds)) { const { track } = findClip(next, id); editable(track); track.clips = track.clips.filter(item => item.id !== id); }
        break;
      }
      default: throw new Error('Unsupported editing command');
    }
  }
  next.revision++; validateProject(next); return next;
}
/** Pixel tolerance remains constant while timeline zoom changes. */
export function snapFrame(value: number, boundaries: readonly number[], pixelsPerFrame: number, tolerance = 8): { frame: number; snapped?: number } {
  const rounded = Math.max(0, Math.round(value));
  let distance = tolerance / Math.max(.00001, pixelsPerFrame), nearest: number | undefined;
  for (const boundary of boundaries) { const delta = Math.abs(boundary - rounded); if (delta <= distance) { distance = delta; nearest = boundary; } }
  return nearest === undefined ? { frame: rounded } : { frame: nearest, snapped: nearest };
}
