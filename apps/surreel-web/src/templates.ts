import { hypitFormat, type HypitFormat } from "./formats.ts";

export type BriefTemplate = {
  formatId: string;
  title: string;
  subtitle: string;
  category: string;
  image: string;
  prompt: string;
  answers: Record<string, string>;
  durationOverride?: number;
  aspectOverride?: string;
};

export const briefTemplates: BriefTemplate[] = [
  {
    formatId: "talking-head",
    title: "A little more human.",
    subtitle: "UGC talking-head",
    category: "CREATOR",
    image: "ugc",
    prompt:
      "A creator in a small apartment kitchen talks about Harbor Brew instant oat latte. They used to skip breakfast, show the tin, and make one cup. Warm window light, handheld framing, word-level captions. No health claims.",
    answers: {
      who: "A relaxed creator, warm and unpolished, speaking to a phone on the counter.",
      facts: "Harbor Brew instant oat latte. One tin. No health or performance claims.",
    },
  },
  {
    formatId: "narration-led",
    title: "Made to be noticed.",
    subtitle: "Narration-led product film",
    category: "PRODUCT",
    image: "product",
    prompt:
      "A 20-second vertical product film for a botanical skincare serum. Soft directional light, macro textures, amber glass, slow confident movement. Open on an unexpected detail, reveal the bottle, end with an invitation to discover more. Elegant type. No unverified health claims.",
    answers: {
      picture: "Amber glass, serum texture, hands, and a quiet bathroom shelf.",
      proof: "The bottle, the texture, and the name on the label. No clinical results.",
    },
  },
  {
    formatId: "short-drama",
    title: "Go somewhere new.",
    subtitle: "Short cinematic drama",
    category: "CINEMATIC",
    image: "cinematic",
    aspectOverride: "16:9",
    durationOverride: 30,
    prompt:
      "A 30-second cinematic travel film about leaving the familiar behind. An open desert road, vast landscapes, golden-hour light, and intimate details. Build from quiet anticipation to a sweeping final shot.",
    answers: {
      world: "Desert highway, golden hour, dust in the last light.",
      payoff: "The car becomes small in a wide last frame.",
    },
  },
  {
    formatId: "podcast",
    title: "Two voices. One room.",
    subtitle: "Two-person podcast",
    category: "MUSIC",
    image: "music",
    durationOverride: 30,
    prompt:
      "Two friends at a small table talk about a new ceramic pour-over dripper. Complementary camera views, coffee-shop light, the product stays on the table.",
    answers: {
      hosts: "Two friends who cook together. Easy interruptions.",
      visual: "Small table, warm practicals, ceramic dripper between them.",
    },
  },
  {
    formatId: "presenter-led",
    title: "One idea. Every angle.",
    subtitle: "Presenter-led explainer",
    category: "MOTION",
    image: "product",
    aspectOverride: "16:9",
    durationOverride: 30,
    prompt:
      "Explain how a creative idea becomes a finished video in three steps: describe, create, refine. A host plus evolving graphics. Clean dark background, expressive type, one idea per scene, a lime accent. Captions. Generate visuals locally.",
    answers: {
      host: "Calm, precise, a little dry.",
      demo: "Three graphic stages: brief, timeline, finished frame.",
    },
  },
  {
    formatId: "ranking",
    title: "The order of things.",
    subtitle: "Ranking board",
    category: "EDITORIAL",
    image: "ugc",
    prompt:
      "Rank three desk lamps for late-night work: a cheap clamp light, a mid-range task lamp, and a nicer brass lamp. Host is dry and slightly mean. Vertical, captions, a persistent ranking board.",
    answers: {
      items: "1. Brass lamp that actually aims. 2. Mid-range task lamp. 3. The clamp light everyone owns.",
      host: "Affectionate roast. Knows the subject too well.",
    },
  },
  {
    formatId: "street-interview",
    title: "Ask a stranger.",
    subtitle: "Street interview",
    category: "CREATOR",
    image: "ugc",
    prompt:
      "A sidewalk interview about the last song that made someone stop walking. Interviewer has a handheld mic. Guest is surprised, then sincere. Land on the song title as a caption.",
    answers: {
      people: "A curious interviewer. A slightly startled guest.",
      reveal: "The song title, held as a caption.",
    },
  },
];

export function templateFormat(template: BriefTemplate): HypitFormat {
  return hypitFormat(template.formatId);
}
