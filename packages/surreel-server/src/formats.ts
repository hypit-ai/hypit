export const HYPIT_FORMATS = {
  "talking-head": {
    title: "Talking-head UGC",
    playbook: "references/playbooks/formats/talking-head.md",
    crafts: ["image-direction", "voice-direction", "video-direction", "captions"],
  },
  "narration-led": {
    title: "Narration-led",
    playbook: "references/playbooks/formats/narration-led-demo.md",
    crafts: ["voice-direction", "voice-and-performance", "b-roll", "graphic-compositions"],
  },
  "presenter-led": {
    title: "Presenter-led explainer",
    playbook: "references/playbooks/formats/presenter-led-explainer.md",
    crafts: ["voice-and-performance", "image-direction", "video-direction", "graphic-compositions"],
  },
  ranking: {
    title: "Ranking / listicle",
    playbook: "references/playbooks/formats/ranking-listicle.md",
    crafts: ["graphic-compositions", "captions", "voice-direction"],
  },
  "short-drama": {
    title: "Short drama",
    playbook: "references/playbooks/formats/short-drama.md",
    crafts: ["image-direction", "video-direction", "voice-and-performance", "visual-continuity"],
  },
  "street-interview": {
    title: "Street interview",
    playbook: "references/playbooks/formats/street-interview.md",
    crafts: ["image-direction", "video-direction", "caption-tracking", "voice-and-performance"],
  },
  podcast: {
    title: "Two-person podcast",
    playbook: "references/playbooks/formats/two-person-podcast.md",
    crafts: ["image-direction", "voice-and-performance", "visual-continuity"],
  },
} as const;

export type HypitFormatId = keyof typeof HYPIT_FORMATS;

export function isHypitFormatId(value: string): value is HypitFormatId {
  return Object.hasOwn(HYPIT_FORMATS, value);
}
