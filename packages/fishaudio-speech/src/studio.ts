import type { StudioDeclarationEditor } from '@hypit/studio-companion';
import { fishAudioSpeechModuleRef } from './index.js';
export const fishAudioEditors: readonly StudioDeclarationEditor[] = ['voiceDesign','voiceClone'].map(declaration => ({
  id: declaration, match: { module: fishAudioSpeechModuleRef, declaration }, category: 'audio', layout: 'prompt',
  title: { en: declaration === 'voiceDesign' ? 'Fish Audio voice design' : 'Fish Audio voice clone', 'zh-CN': declaration === 'voiceDesign' ? 'Fish Audio 声音设计' : 'Fish Audio 声音复刻' },
  prompts: [
    { label: { en: 'Speech', 'zh-CN': '朗读内容' }, source: { kind: 'reference' as const, field: 'speech' }, placeholder: { en: 'Enter the words to speak…', 'zh-CN': '输入需要朗读的内容…' } },
    ...(declaration === 'voiceDesign' ? [{ label: { en: 'Voice', 'zh-CN': '声音描述' }, source: { kind: 'body' as const }, placeholder: { en: 'Describe the tone and voice…', 'zh-CN': '描述音色、语气和声音特点…' } }] : []),
  ],
}));
