import type { StudioDeclarationEditor } from '@hypit/studio-companion';
import { gptImageCleanModuleRef, gptImageModuleRef } from './index.js';

export const gptImageEditors: readonly StudioDeclarationEditor[] = [gptImageModuleRef, gptImageCleanModuleRef].map(module => ({
  id: module.name, match: { module, declaration: 'image' }, category: 'image', layout: 'prompt',
  title: module === gptImageCleanModuleRef
    ? { en: 'GPT Image Clean', 'zh-CN': 'GPT Image 降噪' }
    : { en: 'GPT Image', 'zh-CN': 'GPT Image' },
  prompts: [{ label: { en: 'Prompt', 'zh-CN': '提示词' }, source: { kind: 'reference', field: 'prompt' }, placeholder: { en: 'Describe the image you want to create…', 'zh-CN': '描述你想生成的画面…' } }],
  references: [{ child: 'Reference', field: 'image', media: ['image'] }],
  settings: [{ field: 'aspect-ratio', label: { en: 'Aspect ratio', 'zh-CN': '画面比例' } }, { field: 'resolution', label: { en: 'Resolution', 'zh-CN': '分辨率' } }],
  defaults: { 'aspect-ratio': '16:9', resolution: '1K', background: 'auto' },
}));
