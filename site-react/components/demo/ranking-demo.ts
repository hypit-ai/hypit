import { rankingMedia } from './demo-media'
import { createDemoTimeline } from './demo-timeline'
import { wordCues as rawWordCues, type WordCue } from './regen-ranking-cues'

// Data layer of the upstream SvmlPlayground.vue, lifted out of the component so
// the React version can precompute it once at module scope.

export type RankingSelectionId = 'photoshop' | 'facetune' | 'remini' | 'chatgpt' | 'regen'
export type BrollSelectionId =
  | 'handsome-1'
  | 'handsome-2'
  | 'dating-photo'
  | 'linkedin-headshot'
  | 'instagram-post'
export type SelectionId = RankingSelectionId | BrollSelectionId

export type TimelineSelection = { id: SelectionId; start: number; end: number }

export type RankingSelection = {
  id: RankingSelectionId
  label: string
  rank: number
  start: number
  end: number
  color: string
  icon: string
}

export type BaseScene = { src: string; start: number; end: number; sourceStart: number }

export type BrollItem = {
  id: BrollSelectionId
  src: string
  start: number
  end: number
  zoom: number
}

export type SourceLine = {
  html: string
  selection?: SelectionId
  range?: SelectionId
  ranges?: SelectionId[]
  edge?: 'start' | 'end'
  tokens?: readonly [number, number]
}

export type SemanticRangeBounds = {
  id: SelectionId
  start: number
  end: number
  depth: number
}

export const ENTER_DURATION = 0.45
export const MOVE_DURATION = 0.55

const rankingTimeline = createDemoTimeline([
  { src: rankingMedia.avatars[0], start: 0, end: 12.033333333333333 },
  { src: rankingMedia.avatars[1], start: 12.033333333333333, end: 24.066666666666666 },
  { src: rankingMedia.avatars[2], start: 24.066666666666666, end: 36.1 },
])

export const TOTAL_DURATION = rankingTimeline.duration
export const baseScenes: BaseScene[] = rankingTimeline.scenes
export const wordCues = rawWordCues.map((cue) => rankingTimeline.mapRange(cue))
export type { WordCue }

export const selections: RankingSelection[] = (
  [
    { id: 'photoshop', label: 'Photoshop', rank: 5, start: 0.08, end: 6.4, color: '#31add0', icon: rankingMedia.icons[4] },
    { id: 'facetune', label: 'Facetune', rank: 4, start: 6.4, end: 12, color: 'rgb(132, 198, 84)', icon: rankingMedia.icons[3] },
    { id: 'remini', label: 'Remini', rank: 3, start: 12.043333333333333, end: 18.184444444444445, color: 'rgb(234, 220, 42)', icon: rankingMedia.icons[2] },
    { id: 'chatgpt', label: 'ChatGPT', rank: 2, start: 18.184444444444445, end: 24.066666666666666, color: 'rgb(255, 167, 45)', icon: rankingMedia.icons[1] },
    { id: 'regen', label: 'ReGen', rank: 1, start: 24.076666666666668, end: 36.06666666666666, color: '#ff3f56', icon: rankingMedia.icons[0] },
  ] as RankingSelection[]
).map((selection) => rankingTimeline.mapRange(selection))

export const brollItems: BrollItem[] = (
  [
    { id: 'handsome-1', src: rankingMedia.broll[4], start: 791 / 30, end: 831 / 30, zoom: 1.02 },
    { id: 'handsome-2', src: rankingMedia.broll[3], start: 831 / 30, end: 888 / 30, zoom: 1.03 },
    { id: 'dating-photo', src: rankingMedia.broll[2], start: 925 / 30, end: 952 / 30, zoom: 1.02 },
    { id: 'linkedin-headshot', src: rankingMedia.broll[1], start: 952 / 30, end: 977 / 30, zoom: 1.03 },
    { id: 'instagram-post', src: rankingMedia.broll[0], start: 977 / 30, end: 1009 / 30, zoom: 1.02 },
  ] as BrollItem[]
).map((selection) => rankingTimeline.mapRange(selection))

export const semanticSelections: TimelineSelection[] = [...selections, ...brollItems]

export const runtimeItems = selections.map((selection) => ({
  ...selection,
  start: selection.start + 0.1,
  end: selection.end - 0.3,
}))

export const lines: SourceLine[] = [
  { html: '<span class="syn-tag">&lt;script&gt;</span>' },
  { html: '  <span class="syn-tag">&lt;segment</span> <span class="syn-attr">id</span>=<span class="syn-string">"scene-1"</span><span class="syn-tag">&gt;</span>' },
  { html: '    <span class="syn-tag">&lt;NARRATOR&gt;</span> <span class="syn-marker semantic-token" data-selection="photoshop" tabindex="0">@photoshop</span> Photoshop.', selection: "photoshop", range: "photoshop", edge: "start", tokens: [0, 1] },
  { html: '    <span class="syn-tag">&lt;SPEAKER&gt;</span> Powerful, but only if you know how to use it. Otherwise, your new profile', range: "photoshop", tokens: [1, 15] },
  { html: '              picture becomes a three-hour design project <span class="syn-marker semantic-token" data-selection="photoshop" tabindex="0">@/photoshop</span>.', selection: "photoshop", range: "photoshop", edge: "end", tokens: [15, 21] },
  { html: '    <span class="syn-tag">&lt;NARRATOR&gt;</span> <span class="syn-marker semantic-token" data-selection="facetune" tabindex="0">@facetune</span> Facetune.', selection: "facetune", range: "facetune", edge: "start", tokens: [21, 22] },
  { html: '    <span class="syn-tag">&lt;SPEAKER&gt;</span> Fast and great for touch-ups. But it still leaves you with the same awkward pose and the same dorm-room background <span class="syn-marker semantic-token" data-selection="facetune" tabindex="0">@/facetune</span>.', selection: "facetune", range: "facetune", edge: "end", tokens: [22, 42] },
  { html: '  <span class="syn-tag">&lt;/segment&gt;</span>' },
  { html: "" },
  { html: '  <span class="syn-tag">&lt;segment</span> <span class="syn-attr">id</span>=<span class="syn-string">"scene-2"</span><span class="syn-tag">&gt;</span>' },
  { html: '    <span class="syn-tag">&lt;NARRATOR&gt;</span> <span class="syn-marker semantic-token" data-selection="remini" tabindex="0">@remini</span> Remini.' , selection: "remini", range: "remini", edge: "start", tokens: [42, 43] },
  { html: '    <span class="syn-tag">&lt;SPEAKER&gt;</span> Great for blurry photos. It restores detail, but it can\'t fix the pose, outfit, or background. You get the same bad photo in HD <span class="syn-marker semantic-token" data-selection="remini" tabindex="0">@/remini</span>.', selection: "remini", range: "remini", edge: "end", tokens: [43, 67] },
  { html: '    <span class="syn-tag">&lt;NARRATOR&gt;</span> <span class="syn-marker semantic-token" data-selection="chatgpt" tabindex="0">@chatgpt</span> ChatGPT.', selection: "chatgpt", range: "chatgpt", edge: "start", tokens: [67, 68] },
  { html: '    <span class="syn-tag">&lt;SPEAKER&gt;</span> More flexible. It can create a new shot, but getting your face and the details right becomes a prompt-writing group project <span class="syn-marker semantic-token" data-selection="chatgpt" tabindex="0">@/chatgpt</span>.', selection: "chatgpt", range: "chatgpt", edge: "end", tokens: [68, 89] },
  { html: '  <span class="syn-tag">&lt;/segment&gt;</span>' },
  { html: "" },
  { html: '  <span class="syn-tag">&lt;segment</span> <span class="syn-attr">id</span>=<span class="syn-string">"scene-3"</span><span class="syn-tag">&gt;</span>' },
  { html: '    <span class="syn-tag">&lt;NARRATOR&gt;</span> <span class="syn-marker semantic-token" data-selection="regen" tabindex="0">@regen</span> ReGen.', selection: "regen", range: "regen", edge: "start", tokens: [89, 90] },
  { html: '    <span class="syn-tag">&lt;SPEAKER&gt;</span> Pick a photo you love, and the app <span class="syn-marker semantic-token" data-selection="handsome-1" tabindex="0">@handsome-1</span> rebuilds it around you with a', selection: "handsome-1", range: "handsome-1", edge: "start", tokens: [90, 104] },
  { html: '              <span class="syn-marker semantic-token" data-selection="handsome-1" tabindex="0">@/handsome-1~</span> <span class="syn-marker semantic-token" data-selection="handsome-2" tabindex="0">@handsome-2</span> better pose, outfit, and setting. <span class="syn-marker semantic-token" data-selection="handsome-2" tabindex="0">@/handsome-2</span>', selection: "handsome-2", ranges: ["handsome-1", "handsome-2"], edge: "end", tokens: [104, 109] },
  { html: '              From one selfie, you can make <span class="syn-marker semantic-token" data-selection="dating-photo" tabindex="0">@dating-photo</span> a dating photo, <span class="syn-marker semantic-token" data-selection="dating-photo" tabindex="0">@/dating-photo~</span>', selection: "dating-photo", range: "dating-photo", edge: "end", tokens: [109, 118] },
  { html: '              <span class="syn-marker semantic-token" data-selection="linkedin-headshot" tabindex="0">@linkedin-headshot</span> LinkedIn headshot, <span class="syn-marker semantic-token" data-selection="linkedin-headshot" tabindex="0">@/linkedin-headshot~</span>', selection: "linkedin-headshot", range: "linkedin-headshot", edge: "end", tokens: [118, 120] },
  { html: '              <span class="syn-marker semantic-token" data-selection="instagram-post" tabindex="0">@instagram-post</span> or Instagram post, <span class="syn-marker semantic-token" data-selection="instagram-post" tabindex="0">@/instagram-post</span>', selection: "instagram-post", range: "instagram-post", edge: "end", tokens: [120, 123] },
  { html: '              so you get what you wanted instead of fixing a bad shot <span class="syn-marker semantic-token" data-selection="regen" tabindex="0">@/regen</span>.', selection: "regen", range: "regen", edge: "end", tokens: [123, 135] },
  { html: '  <span class="syn-tag">&lt;/segment&gt;</span>' },
  { html: '<span class="syn-tag">&lt;/script&gt;</span>' },
  { html: "" },
  { html: '<span class="syn-tag">&lt;ranking-column</span> <span class="syn-attr">id</span>=<span class="syn-string">"ranking"</span> <span class="syn-attr">z</span>=<span class="syn-string">"42"</span><span class="syn-tag">&gt;</span>' },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">rank</span>=<span class="syn-string">"5"</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="photoshop" tabindex="0">{script.selection.photoshop}</span> <span class="syn-tag">/&gt;</span>', selection: "photoshop" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">rank</span>=<span class="syn-string">"4"</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="facetune" tabindex="0">{script.selection.facetune}</span> <span class="syn-tag">/&gt;</span>', selection: "facetune" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">rank</span>=<span class="syn-string">"3"</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="remini" tabindex="0">{script.selection.remini}</span> <span class="syn-tag">/&gt;</span>', selection: "remini" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">rank</span>=<span class="syn-string">"2"</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="chatgpt" tabindex="0">{script.selection.chatgpt}</span> <span class="syn-tag">/&gt;</span>', selection: "chatgpt" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">rank</span>=<span class="syn-string">"1"</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="regen" tabindex="0">{script.selection.regen}</span> <span class="syn-tag">/&gt;</span>', selection: "regen" },
  { html: '<span class="syn-tag">&lt;/ranking-column&gt;</span>' },
  { html: "" },
  { html: '<span class="syn-tag">&lt;broll-track</span> <span class="syn-attr">id</span>=<span class="syn-string">"broll"</span> <span class="syn-attr">z</span>=<span class="syn-string">"700"</span><span class="syn-tag">&gt;</span>' },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">source</span>=<span class="syn-expr">{broll-5}</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="handsome-1" tabindex="0">{script.selection.handsome-1}</span> <span class="syn-tag">/&gt;</span>', selection: "handsome-1" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">source</span>=<span class="syn-expr">{broll-4}</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="handsome-2" tabindex="0">{script.selection.handsome-2}</span> <span class="syn-tag">/&gt;</span>', selection: "handsome-2" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">source</span>=<span class="syn-expr">{broll-3}</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="dating-photo" tabindex="0">{script.selection.dating-photo}</span> <span class="syn-tag">/&gt;</span>', selection: "dating-photo" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">source</span>=<span class="syn-expr">{broll-2}</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="linkedin-headshot" tabindex="0">{script.selection.linkedin-headshot}</span> <span class="syn-tag">/&gt;</span>', selection: "linkedin-headshot" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">source</span>=<span class="syn-expr">{broll-1}</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="instagram-post" tabindex="0">{script.selection.instagram-post}</span> <span class="syn-tag">/&gt;</span>', selection: "instagram-post" },
  { html: '<span class="syn-tag">&lt;/broll-track&gt;</span>' },
]

const rawRangeBounds = semanticSelections
  .map((selection) => ({
    id: selection.id,
    start: lines.findIndex((line) => line.html.includes(`>@${selection.id}</span>`)),
    end: lines.findIndex((line) => line.html.includes(`>@/${selection.id}`)),
  }))
  .filter((range) => range.start >= 0 && range.end >= range.start)

export const semanticRangeBounds: SemanticRangeBounds[] = rawRangeBounds.map((range) => ({
  ...range,
  depth: rawRangeBounds.filter(
    (candidate) =>
      candidate.id !== range.id && candidate.start <= range.start && candidate.end >= range.end,
  ).length,
}))

export const rankingBlock = {
  start: lines.findIndex((line) => line.html.includes('&lt;ranking-column')),
  end: lines.findIndex((line) => line.html.includes('&lt;/ranking-column')),
}

export const brollBlock = {
  start: lines.findIndex((line) => line.html.includes('&lt;broll-track')),
  end: lines.findIndex((line) => line.html.includes('&lt;/broll-track')),
}

function decorateLine(line: SourceLine) {
  if (!line.tokens) return line.html
  let cueIndex = line.tokens[0]
  const end = line.tokens[1]
  return line.html
    .split(/(<span\b[^>]*>.*?<\/span>)/giu)
    .map((part) => {
      if (part.startsWith('<span')) return part
      let output = ''
      let cursor = 0
      while (cueIndex < end) {
        const cue = wordCues[cueIndex]
        const position = part.toLocaleLowerCase().indexOf(cue.text.toLocaleLowerCase(), cursor)
        if (position === -1) break
        output += part.slice(cursor, position)
        output += `<span class="script-word" data-word-index="${cue.index}">${part.slice(position, position + cue.text.length)}</span>`
        cursor = position + cue.text.length
        cueIndex += 1
      }
      return output + part.slice(cursor)
    })
    .join('')
}

export const decoratedLines = lines.map(decorateLine)
