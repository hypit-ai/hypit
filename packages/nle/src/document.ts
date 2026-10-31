/** Frame positions use the project's rational frame rate. Tracks are back-to-front. */
export type FrameRate = { numerator: number; denominator: number };
export type MediaAsset = {
  id: string;
  name: string;
  uri: string;
  kind: 'video' | 'audio' | 'image';
  durationSeconds?: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
};
export type Clip = {
  id: string;
  assetId: string;
  start: number;
  duration: number;
  sourceStart: number;
  audio: boolean;
  gain: number;
};
export type Track = { id: string; name: string; kind: 'visual' | 'audio'; locked: boolean; muted: boolean; clips: Clip[] };
export type EditProject = {
  format: 'hypit.nle@1';
  id: string;
  name: string;
  revision: number;
  frameRate: FrameRate;
  canvas: { width: number; height: number };
  assets: MediaAsset[];
  tracks: Track[];
};
export function createProject(id: string, name: string): EditProject {
  return { format: 'hypit.nle@1', id, name, revision: 0, frameRate: { numerator: 30, denominator: 1 }, canvas: { width: 1920, height: 1080 }, assets: [], tracks: [] };
}
export function frameRate(project: EditProject) { return project.frameRate.numerator / project.frameRate.denominator; }
export function endFrame(project: EditProject) { return Math.max(0, ...project.tracks.flatMap(track => track.clips.map(clip => clip.start + clip.duration))); }
export function sourceFrames(project: EditProject, asset: MediaAsset) {
  return asset.durationSeconds === undefined ? undefined : Math.max(1, Math.floor(asset.durationSeconds * frameRate(project) + 1e-6));
}
export function findClip(project: EditProject, id: string) {
  for (const track of project.tracks) { const clip = track.clips.find(value => value.id === id); if (clip) return { track, clip }; }
  throw new Error(`Unknown clip: ${id}`);
}
function frame(value: number, minimum = 0) { if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid frame: ${value}`); }
export function validateProject(project: EditProject): void {
  if (project.format !== 'hypit.nle@1') throw new Error('Unsupported project document');
  frame(project.revision); frame(project.frameRate.numerator, 1); frame(project.frameRate.denominator, 1);
  frame(project.canvas.width, 1); frame(project.canvas.height, 1);
  const ids = new Set<string>();
  const unique = (id: string) => { if (!id || ids.has(id)) throw new Error(`Duplicate or empty ID: ${id}`); ids.add(id); };
  unique(project.id);
  for (const asset of project.assets) {
    unique(asset.id);
    if (!['video', 'audio', 'image'].includes(asset.kind) || !asset.uri) throw new Error(`Invalid asset: ${asset.id}`);
    if (asset.durationSeconds !== undefined && (!Number.isFinite(asset.durationSeconds) || asset.durationSeconds <= 0)) throw new Error(`Invalid media duration: ${asset.id}`);
  }
  for (const track of project.tracks) {
    unique(track.id);
    if (!['visual', 'audio'].includes(track.kind)) throw new Error(`Invalid track: ${track.id}`);
    for (const clip of track.clips) {
      unique(clip.id); frame(clip.start); frame(clip.duration, 1); frame(clip.sourceStart);
      const asset = project.assets.find(item => item.id === clip.assetId);
      if (!asset) throw new Error(`Missing asset: ${clip.assetId}`);
      if ((track.kind === 'visual' && asset.kind === 'audio') || (track.kind === 'audio' && !asset.hasAudio)) throw new Error('Media does not support this track');
      const length = sourceFrames(project, asset);
      if (length !== undefined && clip.sourceStart + clip.duration > length) throw new Error(`Clip exceeds source duration: ${clip.id}`);
      if (!Number.isFinite(clip.gain) || clip.gain < 0) throw new Error(`Invalid audio gain: ${clip.id}`);
    }
  }
}
export function parseProject(text: string): EditProject {
  const project: EditProject = JSON.parse(text); validateProject(project); return project;
}
