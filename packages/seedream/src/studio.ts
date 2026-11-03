import type { StudioDeclarationEditor } from '@hypit/studio-companion';
import { seedreamModuleRef } from './index.js';

export const seedreamEditors: readonly StudioDeclarationEditor[] = ['text-image', 'reference-image'].map(declaration => ({
  id: declaration, match: { module: seedreamModuleRef, declaration }, category: 'image', layout: 'prompt',
  title: { en: declaration === 'text-image' ? 'Seedream image' : 'Seedream reference image', 'zh-CN': declaration === 'text-image' ? 'Seedream 图片' : 'Seedream 参考图生图' },
  prompts: [{ label: { en: 'Prompt', 'zh-CN': '提示词' }, source: { kind: 'reference', field: 'prompt' }, placeholder: { en: 'Describe the image you want to create…', 'zh-CN': '描述你想生成的画面…' } }],
  settings: [{ field: 'aspect-ratio', label: { en: 'Aspect ratio', 'zh-CN': '画面比例' } }, { field: 'quality', label: { en: 'Quality', 'zh-CN': '质量' } }],
  defaults: { 'aspect-ratio': '16:9', quality: 'basic', 'output-format': 'png', 'nsfw-check': 'true' },
}));
