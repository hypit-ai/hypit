import { endFrame, validateProject, type EditProject } from './document.js';
export type AuthorField = string | { reference: string };
export type AuthorElement = { tag: string; fields: Record<string, AuthorField>; children?: AuthorElement[] };
const reference = (reference: string): AuthorField => ({ reference });
const element = (tag: string, fields: Record<string, AuthorField>, children?: AuthorElement[]): AuthorElement => ({ tag, fields, ...(children ? { children } : {}) });
const token = (id: string) => `n_${Array.from(new TextEncoder().encode(id), byte => byte.toString(16).padStart(2, '0')).join('')}`;
/** Build the package-owned author tree from editing relationships. Host resolves asset URIs. */
export function projectAuthor(project: EditProject, assetLocator: (id: string, uri: string) => string): AuthorElement[] {
  validateProject(project);
  const end = endFrame(project); if (!end) throw new Error('Place media on the timeline before exporting');
  const nodes: AuthorElement[] = Object.entries({ media: 'media', prepare: 'media-operations', time: 'timeline-author', space: 'spatial', visual: 'visual-track', audio: 'audio-track', film: 'film', html: 'html-video' }).map(([alias, name]) => element('import', { as: alias, from: `@hypit/${name}@1` }));
  nodes.push(element('import', { as: 'look', source: './appearance.svs' }),
    element('space:Canvas', { id: 'canvas', width: String(project.canvas.width), height: String(project.canvas.height) }),
    element('time:Clock', { id: 'clock', 'frame-rate': `${project.frameRate.numerator}/${project.frameRate.denominator}` }));
  const clips = project.tracks.flatMap(track => track.clips);
  const used = new Set(clips.map(clip => clip.assetId));
  for (const asset of project.assets.filter(asset => used.has(asset.id))) {
    const id = token(asset.id);
    nodes.push(element(`media:${asset.kind === 'video' ? 'Video' : asset.kind === 'audio' ? 'Audio' : 'Image'}`, { id, src: assetLocator(asset.id, asset.uri) }));
    if (asset.kind !== 'image') nodes.push(element('prepare:Prepare', { id: `${id}_media`, source: reference(id), video: asset.kind === 'audio' ? 'none' : 'primary-moving', audio: asset.hasAudio ? 'default' : 'none', 'span-authority': asset.kind === 'audio' ? 'audio' : 'video', picture: 'sdr-bt709' }));
    else nodes.push(element('space:Extent', { id: `${id}_extent`, width: String(asset.width ?? project.canvas.width), height: String(asset.height ?? project.canvas.height) }));
  }
  nodes.push(element('time:Timeline', { id: 'program', clock: reference('clock'), end: `${end}f` }, clips.map(clip => element('time:Window', { id: token(clip.id), from: `${clip.start}f`, for: `${clip.duration}f` }))));
  const members: AuthorElement[] = [];
  const seconds = (frames: number) => `${frames * project.frameRate.denominator}/${project.frameRate.numerator}s`;
  for (const track of project.tracks) {
    if (!track.clips.length) continue;
    const id = token(track.id);
    if (track.kind === 'visual') {
      nodes.push(element('visual:Track', { id, timeline: reference('program.timeline') }, track.clips.map(clip => {
        const asset = project.assets.find(asset => asset.id === clip.assetId)!, source = token(asset.id);
        return element('visual:Clip', { id: token(clip.id), during: reference(`program.${token(clip.id)}`), frame: reference('canvas.bounds'), fit: 'contain', ...(asset.kind === 'image' ? { image: reference(source), picture: 'srgb', extent: reference(`${source}_extent`) } : { media: reference(`${source}_media.media`) }) }, asset.kind === 'image' ? undefined : [element('visual:Map', { 'target-at': 'start', 'source-at': clip.sourceStart ? `start+${seconds(clip.sourceStart)}` : 'start', rate: '1' })]);
      })));
      members.push(element('film:Track', { id, source: reference(`${id}.visual`) }));
    }
    const audible = track.clips.filter(clip => !track.muted && clip.audio && project.assets.find(asset => asset.id === clip.assetId)?.hasAudio);
    if (audible.length) {
      nodes.push(element('audio:Track', { id: `${id}_audio`, timeline: reference('program.timeline') }, audible.map(clip => element('audio:Clip', { id: token(clip.id), source: reference(`${token(clip.assetId)}_media.media`), during: reference(`program.${token(clip.id)}`), gain: String(clip.gain) }, [element('audio:Map', { 'target-at': 'start', 'source-at': clip.sourceStart ? `start+${seconds(clip.sourceStart)}` : 'start', rate: '1' })]))));
      members.push(element('film:Track', { source: reference(`${id}_audio.audio`) }));
    }
  }
  nodes.push(element('film:Film', { id: 'main', canvas: reference('canvas.canvas'), timeline: reference('program.timeline'), appearance: reference('look.film.main') }, members), element('html:Video', { id: 'final', composition: reference('main.composition') }));
  return nodes;
}
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function printAuthor(nodes: readonly AuthorElement[]): string {
  const print = (node: AuthorElement, level: number): string => {
    const indent = '  '.repeat(level), attributes = Object.entries(node.fields).map(([name, value]) => `${name}=${typeof value === 'string' ? `"${escape(value)}"` : `{${value.reference}}`}`).join(' ');
    return node.children?.length ? `${indent}<${node.tag} ${attributes}>\n${node.children.map(child => print(child, level + 1)).join('\n')}\n${indent}</${node.tag}>` : `${indent}<${node.tag} ${attributes}/>`;
  };
  return `<?svml using="@hypit/markup@1"?>\n<svml>\n${nodes.map(node => print(node, 1)).join('\n')}\n</svml>\n`;
}
export const appearanceSource = '<?svml using="@hypit/recipe@1"?>\n<sheet version="1">\nfilm.main { background: #000000; }\n</sheet>\n';
