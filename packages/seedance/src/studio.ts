import type { StudioDeclarationEditor } from '@hypit/studio-companion';
import { seedanceModuleRef } from './index.js';
const names: Record<string, { en: string; 'zh-CN': string }> = {
  'text-video': { en: 'Seedance text to video', 'zh-CN': 'Seedance 文生视频' },
  'frame-video': { en: 'Seedance image to video', 'zh-CN': 'Seedance 图生视频' },
  'reference-video': { en: 'Seedance reference video', 'zh-CN': 'Seedance 参考素材生视频' },
};
export const seedanceEditors: readonly StudioDeclarationEditor[] = Object.entries(names).map(([declaration,title]) => ({
  id: declaration, match: { module: seedanceModuleRef, declaration }, category: 'video', layout: 'prompt', title,
  prompts: [{ label: { en: 'Prompt', 'zh-CN': '提示词' }, source: { kind: 'reference', field: 'prompt' }, placeholder: { en: 'Describe the scene and camera movement…', 'zh-CN': '描述画面、动作和镜头运动…' } }],
  settings: [{ field: 'model', label: { en: 'Model', 'zh-CN': '模型' } }, { field: 'duration', label: { en: 'Duration (s)', 'zh-CN': '时长（秒）' } }, { field: 'resolution', label: { en: 'Resolution', 'zh-CN': '分辨率' } }, { field: 'aspect-ratio', label: { en: 'Aspect ratio', 'zh-CN': '画面比例' } }],
  references: declaration === 'frame-video'
    ? [{ field: 'first-frame', media: ['image'] }, { field: 'last-frame', media: ['image'] }]
    : declaration === 'reference-video'
      ? [{ child: 'Reference', field: 'image', media: ['image'] }, { child: 'Reference', field: 'video', media: ['video'] }, { child: 'Reference', field: 'audio', media: ['audio'] }]
      : [],
  defaults: { model: 'standard', duration: '5', resolution: '720p', 'aspect-ratio': '16:9', ...(declaration === 'frame-video' ? { 'first-frame-person-reference': 'false' } : {}) },
}));
