import streetTranscript from "../../../public/street-interview/transcript.json";
import goodBetterBestTranscript from "../../../public/good-better-best/transcript.json";

export type DemoId = "street" | "good-better-best";

export type WordCue = {
  index: number;
  text: string;
  start: number;
  end: number;
};

export type DemoSelection = {
  id: string;
  start: number;
  end: number;
  layer: "scene" | "overlay";
  asset?: string;
};

export type DemoScene = {
  src: string;
  start: number;
  end: number;
};

export type DemoSourceLine = {
  html: string;
  selection?: string;
  range?: string;
  ranges?: string[];
  tokens?: readonly [number, number];
};

export type SemanticVideoDemoConfig = {
  id: DemoId;
  duration: number;
  words: WordCue[];
  selections: DemoSelection[];
  scenes: DemoScene[];
  lines: DemoSourceLine[];
};

const words = (input: Array<{ text: string; start: number; end: number }>) => input.map((cue, index) => ({
  ...cue,
  index,
}));

const streetWords = words(streetTranscript);
const goodBetterBestWords = words(goodBetterBestTranscript).map((cue) => {
  if (cue.index === 8) return { ...cue, text: "ChatGPT." };
  if (cue.index === 65) return { ...cue, text: "Areum." };
  if (cue.index === 66) return { ...cue, text: "" };
  return cue;
});

const streetLines: DemoSourceLine[] = [
  { html: '<span class="syn-tag">&lt;script&gt;</span>' },
  { html: '  <span class="syn-tag">&lt;segment</span> <span class="syn-attr">id</span>=<span class="syn-string">"hook"</span><span class="syn-tag">&gt;</span>' },
  { html: '    <span class="syn-tag">&lt;A&gt;</span> <span class="syn-marker semantic-token" data-selection="hook">@hook</span> How much was your flight?', selection: "hook", range: "hook", tokens: [0, 5] },
  { html: '    <span class="syn-tag">&lt;B&gt;</span> $49.', range: "hook", tokens: [5, 6] },
  { html: '    <span class="syn-tag">&lt;A&gt;</span> That\'s cheap.', range: "hook", tokens: [6, 8] },
  { html: '    <span class="syn-tag">&lt;B&gt;</span> The seat was cheap. The rainbow wasn\'t. <span class="syn-marker semantic-token" data-selection="hook">@/hook</span>', selection: "hook", range: "hook", tokens: [8, 15] },
  { html: '  <span class="syn-tag">&lt;/segment&gt;</span>' },
  { html: "" },
  { html: '  <span class="syn-tag">&lt;segment</span> <span class="syn-attr">id</span>=<span class="syn-string">"rainbow"</span><span class="syn-tag">&gt;</span>' },
  { html: '    <span class="syn-tag">&lt;A&gt;</span> <span class="syn-marker semantic-token" data-selection="rainbow">@rainbow</span> They charged you for the rainbow?', selection: "rainbow", range: "rainbow", tokens: [15, 21] },
  { html: '    <span class="syn-tag">&lt;B&gt;</span> <span class="syn-marker semantic-token" data-selection="seven-bags">@seven-bags</span> They counted it as seven carry-ons.', selection: "seven-bags", range: "seven-bags", ranges: ["rainbow", "seven-bags"], tokens: [21, 27] },
  { html: '    <span class="syn-tag">&lt;A&gt;</span> Why seven?', range: "seven-bags", ranges: ["rainbow", "seven-bags"], tokens: [27, 29] },
  { html: '    <span class="syn-tag">&lt;B&gt;</span> One bag for each color. <span class="syn-marker semantic-token" data-selection="seven-bags">@/seven-bags</span> <span class="syn-marker semantic-token" data-selection="rainbow">@/rainbow</span>', selection: "seven-bags", range: "seven-bags", ranges: ["rainbow", "seven-bags"], tokens: [29, 34] },
  { html: '  <span class="syn-tag">&lt;/segment&gt;</span>' },
  { html: "" },
  { html: '  <span class="syn-tag">&lt;segment</span> <span class="syn-attr">id</span>=<span class="syn-string">"fees"</span><span class="syn-tag">&gt;</span>' },
  { html: '    <span class="syn-tag">&lt;A&gt;</span> <span class="syn-marker semantic-token" data-selection="fees">@fees</span> Couldn\'t you turn it off?', selection: "fees", range: "fees", tokens: [34, 39] },
  { html: '    <span class="syn-tag">&lt;B&gt;</span> I tried. They charged me a $35 rainbow deactivation fee.', range: "fees", tokens: [39, 49] },
  { html: '    <span class="syn-tag">&lt;A&gt;</span> What was the total?', range: "fees", tokens: [49, 53] },
  { html: '    <span class="syn-tag">&lt;B&gt;</span> $2,846.', range: "fees", tokens: [53, 54] },
  { html: '    <span class="syn-tag">&lt;A&gt;</span> <span class="syn-marker semantic-token" data-selection="receipt">@receipt</span> Do you have the receipt?', selection: "receipt", range: "receipt", ranges: ["fees", "receipt"], tokens: [54, 59] },
  { html: '    <span class="syn-tag">&lt;B&gt;</span> Yeah, but I can\'t screenshot the whole thing. It\'s still scrolling. <span class="syn-marker semantic-token" data-selection="receipt">@/receipt</span> <span class="syn-marker semantic-token" data-selection="fees">@/fees</span>', selection: "receipt", range: "receipt", ranges: ["fees", "receipt"], tokens: [59, 70] },
  { html: '  <span class="syn-tag">&lt;/segment&gt;</span>' },
  { html: "" },
  { html: '  <span class="syn-tag">&lt;segment</span> <span class="syn-attr">id</span>=<span class="syn-string">"loan"</span><span class="syn-tag">&gt;</span>' },
  { html: '    <span class="syn-tag">&lt;A&gt;</span> <span class="syn-marker semantic-token" data-selection="loan">@loan</span> How did you pay for it?', selection: "loan", range: "loan", tokens: [70, 76] },
  { html: '    <span class="syn-tag">&lt;B&gt;</span> I took out a student loan.', range: "loan", tokens: [76, 82] },
  { html: '    <span class="syn-tag">&lt;A&gt;</span> <span class="syn-marker semantic-token" data-selection="college">@college</span> But you\'re not in college.', selection: "college", range: "college", ranges: ["loan", "college"], tokens: [82, 87] },
  { html: '    <span class="syn-tag">&lt;B&gt;</span> I am now. The airline enrolled me so I could finance the baggage fees. <span class="syn-marker semantic-token" data-selection="college">@/college</span> <span class="syn-marker semantic-token" data-selection="loan">@/loan</span>', selection: "college", range: "college", ranges: ["loan", "college"], tokens: [87, 101] },
  { html: '  <span class="syn-tag">&lt;/segment&gt;</span>' },
  { html: '<span class="syn-tag">&lt;/script&gt;</span>' },
  { html: "" },
  { html: '<span class="syn-tag">&lt;street-interview&gt;</span>' },
  { html: '  <span class="syn-tag">&lt;scene</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="hook">{script.selection.hook}</span> <span class="syn-tag">/&gt;</span>', selection: "hook" },
  { html: '  <span class="syn-tag">&lt;scene</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="rainbow">{script.selection.rainbow}</span> <span class="syn-tag">/&gt;</span>', selection: "rainbow" },
  { html: '  <span class="syn-tag">&lt;scene</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="fees">{script.selection.fees}</span> <span class="syn-tag">/&gt;</span>', selection: "fees" },
  { html: '  <span class="syn-tag">&lt;scene</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="loan">{script.selection.loan}</span> <span class="syn-tag">/&gt;</span>', selection: "loan" },
  { html: '<span class="syn-tag">&lt;/street-interview&gt;</span>' },
  { html: "" },
  { html: '<span class="syn-tag">&lt;broll-track&gt;</span>' },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="seven-bags">{script.selection.seven-bags}</span> <span class="syn-tag">/&gt;</span>', selection: "seven-bags" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="receipt">{script.selection.receipt}</span> <span class="syn-tag">/&gt;</span>', selection: "receipt" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="college">{script.selection.college}</span> <span class="syn-tag">/&gt;</span>', selection: "college" },
  { html: '<span class="syn-tag">&lt;/broll-track&gt;</span>' },
];

const goodBetterBestLines: DemoSourceLine[] = [
  { html: '<span class="syn-tag">&lt;script&gt;</span>' },
  { html: '  <span class="syn-tag">&lt;segment</span> <span class="syn-attr">id</span>=<span class="syn-string">"hook"</span><span class="syn-tag">&gt;</span>' },
  { html: '    <span class="syn-tag">&lt;SPEAKER&gt;</span> <span class="syn-marker semantic-token" data-selection="hook">@hook</span> Good. Better. Best. Face Rating Edition. <span class="syn-marker semantic-token" data-selection="hook">@/hook</span>', selection: "hook", range: "hook", tokens: [0, 6] },
  { html: '  <span class="syn-tag">&lt;/segment&gt;</span>' },
  { html: "" },
  { html: '  <span class="syn-tag">&lt;segment</span> <span class="syn-attr">id</span>=<span class="syn-string">"good"</span><span class="syn-tag">&gt;</span>' },
  { html: '    <span class="syn-tag">&lt;SPEAKER&gt;</span> <span class="syn-marker semantic-token" data-selection="good">@good</span> Good is ChatGPT. Everyone\'s asked it to rate their selfie.', selection: "good", range: "good", tokens: [6, 16] },
  { html: '              But it\'s a chatbot, not a face scanner. It can\'t measure a jawline, so it just guesses to keep you happy. <span class="syn-marker semantic-token" data-selection="good">@/good</span>', selection: "good", range: "good", tokens: [16, 37] },
  { html: '  <span class="syn-tag">&lt;/segment&gt;</span>' },
  { html: "" },
  { html: '  <span class="syn-tag">&lt;segment</span> <span class="syn-attr">id</span>=<span class="syn-string">"better"</span><span class="syn-tag">&gt;</span>' },
  { html: '    <span class="syn-tag">&lt;SPEAKER&gt;</span> <span class="syn-marker semantic-token" data-selection="better">@better</span> Better is LooksMax AI, an app actually built to score your face.', selection: "better", range: "better", tokens: [37, 49] },
  { html: '              But it scores the photo, not you. Same guy, new lighting, totally different number. <span class="syn-marker semantic-token" data-selection="better">@/better</span>', selection: "better", range: "better", tokens: [49, 63] },
  { html: '  <span class="syn-tag">&lt;/segment&gt;</span>' },
  { html: "" },
  { html: '  <span class="syn-tag">&lt;segment</span> <span class="syn-attr">id</span>=<span class="syn-string">"best"</span><span class="syn-tag">&gt;</span>' },
  { html: '    <span class="syn-tag">&lt;SPEAKER&gt;</span> <span class="syn-marker semantic-token" data-selection="best">@best</span> Best is Areum. It scans your face in 3D with Face ID. No angles, no lighting tricks.', selection: "best", range: "best", tokens: [63, 82] },
  { html: '              And it doesn\'t stop at a score.', range: "best", tokens: [82, 90] },
  { html: '              <span class="syn-marker semantic-token" data-selection="votes">@votes</span> It\'s built on 7 million real human votes. <span class="syn-marker semantic-token" data-selection="votes">@/votes</span>', selection: "votes", range: "votes", ranges: ["best", "votes"], tokens: [90, 98] },
  { html: '              <span class="syn-marker semantic-token" data-selection="attract">@attract</span> Shows you which type of people you attract, <span class="syn-marker semantic-token" data-selection="attract">@/attract</span>', selection: "attract", range: "attract", ranges: ["best", "attract"], tokens: [98, 106] },
  { html: '              <span class="syn-marker semantic-token" data-selection="features">@features</span> and tells you exactly which feature to fix first. <span class="syn-marker semantic-token" data-selection="features">@/features</span>', selection: "features", range: "features", ranges: ["best", "features"], tokens: [106, 114] },
  { html: '              Your glow up, finally measurable. <span class="syn-marker semantic-token" data-selection="best">@/best</span>', selection: "best", range: "best", tokens: [114, 118] },
  { html: '  <span class="syn-tag">&lt;/segment&gt;</span>' },
  { html: '<span class="syn-tag">&lt;/script&gt;</span>' },
  { html: "" },
  { html: '<span class="syn-tag">&lt;good-better-best&gt;</span>' },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">label</span>=<span class="syn-string">"GOOD"</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="good">{script.selection.good}</span> <span class="syn-tag">/&gt;</span>', selection: "good" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">label</span>=<span class="syn-string">"BETTER"</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="better">{script.selection.better}</span> <span class="syn-tag">/&gt;</span>', selection: "better" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">label</span>=<span class="syn-string">"BEST"</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="best">{script.selection.best}</span> <span class="syn-tag">/&gt;</span>', selection: "best" },
  { html: '<span class="syn-tag">&lt;/good-better-best&gt;</span>' },
  { html: "" },
  { html: '<span class="syn-tag">&lt;deck&gt;</span>' },
  { html: '  <span class="syn-tag">&lt;card</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="votes">{script.selection.votes}</span> <span class="syn-tag">/&gt;</span>', selection: "votes" },
  { html: '  <span class="syn-tag">&lt;card</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="attract">{script.selection.attract}</span> <span class="syn-tag">/&gt;</span>', selection: "attract" },
  { html: '  <span class="syn-tag">&lt;card</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="features">{script.selection.features}</span> <span class="syn-tag">/&gt;</span>', selection: "features" },
  { html: '<span class="syn-tag">&lt;/deck&gt;</span>' },
];

export const semanticVideoDemos: Record<DemoId, SemanticVideoDemoConfig> = {
  street: {
    id: "street",
    duration: 31.1333333333,
    words: streetWords,
    scenes: [
      { src: "/street-interview/scene-1.mp4", start: 0, end: 5 },
      { src: "/street-interview/scene-2.mp4", start: 5, end: 11 },
      { src: "/street-interview/scene-3.mp4", start: 11, end: 22 },
      { src: "/street-interview/scene-4.mp4", start: 22, end: 31.1333333333 },
    ],
    selections: [
      { id: "hook", start: .04, end: 5.12, layer: "scene" },
      { id: "rainbow", start: 5.12, end: 11.12, layer: "scene" },
      { id: "fees", start: 11.12, end: 22.2, layer: "scene" },
      { id: "loan", start: 22.2, end: 31.13, layer: "scene" },
      { id: "seven-bags", start: 7.08, end: 11.12, layer: "overlay", asset: "/street-interview/broll-2.mp4" },
      { id: "receipt", start: 18.81, end: 22.2, layer: "overlay", asset: "/street-interview/broll-3.mp4" },
      { id: "college", start: 26.22, end: 31.06, layer: "overlay", asset: "/street-interview/broll-4.mp4" },
    ],
    lines: streetLines,
  },
  "good-better-best": {
    id: "good-better-best",
    duration: 42.0333333333,
    words: goodBetterBestWords,
    scenes: [
      { src: "/good-better-best/speaker-hook.mp4", start: 0, end: 4 },
      { src: "/good-better-best/speaker-1.mp4", start: 4, end: 8 },
      { src: "/good-better-best/speaker-good.mp4", start: 8, end: 14 },
      { src: "/good-better-best/speaker-2.mp4", start: 14, end: 18.05 },
      { src: "/good-better-best/speaker-better.mp4", start: 18.05, end: 23.05 },
      { src: "/good-better-best/speaker-3.mp4", start: 23.05, end: 28.05 },
      { src: "/good-better-best/speaker-best.mp4", start: 28.05, end: 42.0333333333 },
    ],
    selections: [
      { id: "hook", start: .19, end: 4.01, layer: "scene" },
      { id: "good", start: 4.01, end: 14.12, layer: "scene" },
      { id: "better", start: 14.12, end: 23.12, layer: "scene" },
      { id: "best", start: 23.12, end: 41.34, layer: "scene" },
      { id: "votes", start: 30.24, end: 33.45, layer: "overlay", asset: "/good-better-best/deck-votes.png" },
      { id: "attract", start: 33.49, end: 36, layer: "overlay", asset: "/good-better-best/deck-attract.png" },
      { id: "features", start: 36, end: 39.28, layer: "overlay", asset: "/good-better-best/deck-features.png" },
    ],
    lines: goodBetterBestLines,
  },
};
