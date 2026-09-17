import { clipDurations } from "./timing.ts";

export type GuidedField = {
  id: string;
  label: string;
  hint: string;
  required?: boolean;
  maxLines?: number;
};

export type HypitFormat = {
  id: string;
  title: string;
  chip: string;
  subtitle: string;
  category: string;
  image: string;
  playbook: string;
  crafts: string[];
  imageSkills: string[];
  videoSkills: string[];
  fields: GuidedField[];
  aspectRatio: string;
  duration: number;
};

export const hypitFormats: HypitFormat[] = [
  {
    id: "talking-head",
    title: "Talking-head UGC",
    chip: "Talking-head",
    subtitle: "One person talks to camera",
    category: "CREATOR",
    image: "ugc",
    playbook: "references/playbooks/formats/talking-head.md",
    crafts: ["image-direction", "voice-direction", "video-direction", "captions"],
    imageSkills: ["gpt-image-people", "ugc-realistic"],
    videoSkills: ["ugc-realistic", "ugc-ad-formats"],
    aspectRatio: "9:16",
    duration: 20,
    fields: [
      {
        id: "say",
        label: "What should they say?",
        hint: "The claim, lines, or story. Name the product or subject in the same answer.",
        required: true,
        maxLines: 5,
      },
      {
        id: "who",
        label: "Who is on camera?",
        hint: "Look, age range, attitude. Leave blank for a fitting creator.",
        maxLines: 2,
      },
      {
        id: "facts",
        label: "What must be true?",
        hint: "Names, prices, features. The agent will not invent claims.",
        maxLines: 3,
      },
    ],
  },
  {
    id: "narration-led",
    title: "Narration-led",
    chip: "Narration",
    subtitle: "Voiceover over product, screens, or graphics",
    category: "PRODUCT",
    image: "product",
    playbook: "references/playbooks/formats/narration-led-demo.md",
    crafts: ["voice-direction", "voice-and-performance", "b-roll", "graphic-compositions"],
    imageSkills: ["gpt-image-people"],
    videoSkills: ["ugc-ad-formats", "seedance-home-video"],
    aspectRatio: "9:16",
    duration: 20,
    fields: [
      {
        id: "voice",
        label: "What should we hear?",
        hint: "The narration idea or the lines themselves.",
        required: true,
        maxLines: 5,
      },
      {
        id: "picture",
        label: "What should we see?",
        hint: "Product, hands, screens, or motion graphics.",
        maxLines: 3,
      },
      {
        id: "proof",
        label: "What must be visibly true?",
        hint: "Facts the pictures have to prove. No invented results.",
        maxLines: 3,
      },
    ],
  },
  {
    id: "presenter-led",
    title: "Presenter-led explainer",
    chip: "Presenter-led",
    subtitle: "A host plus demonstrations",
    category: "MOTION",
    image: "product",
    playbook: "references/playbooks/formats/presenter-led-explainer.md",
    crafts: ["voice-and-performance", "image-direction", "video-direction", "graphic-compositions"],
    imageSkills: ["gpt-image-people", "ugc-realistic"],
    videoSkills: ["ugc-ad-formats", "h3-video"],
    aspectRatio: "16:9",
    duration: 30,
    fields: [
      {
        id: "idea",
        label: "What are they explaining?",
        hint: "One idea, in a sentence. Then the steps if you have them.",
        required: true,
        maxLines: 5,
      },
      {
        id: "host",
        label: "Who presents?",
        hint: "Stance, look, energy.",
        maxLines: 2,
      },
      {
        id: "demo",
        label: "What demonstration carries it?",
        hint: "The graphic, comparison, or walkthrough on screen.",
        maxLines: 3,
      },
    ],
  },
  {
    id: "ranking",
    title: "Ranking / listicle",
    chip: "Ranking",
    subtitle: "A list the board keeps honest",
    category: "EDITORIAL",
    image: "ugc",
    playbook: "references/playbooks/formats/ranking-listicle.md",
    crafts: ["graphic-compositions", "captions", "voice-direction"],
    imageSkills: ["gpt-image-people"],
    videoSkills: ["ugc-ad-formats"],
    aspectRatio: "9:16",
    duration: 20,
    fields: [
      {
        id: "subject",
        label: "What is being ranked?",
        hint: "The category and the point of view.",
        required: true,
        maxLines: 4,
      },
      {
        id: "items",
        label: "The list",
        hint: "Best first, or the reveal order. Include why.",
        maxLines: 4,
      },
      {
        id: "host",
        label: "Host attitude",
        hint: "One-liner and energy.",
        maxLines: 2,
      },
    ],
  },
  {
    id: "short-drama",
    title: "Short drama",
    chip: "Short drama",
    subtitle: "Characters carry the story",
    category: "CINEMATIC",
    image: "cinematic",
    playbook: "references/playbooks/formats/short-drama.md",
    crafts: ["image-direction", "video-direction", "voice-and-performance", "visual-continuity"],
    imageSkills: ["gpt-image-people"],
    videoSkills: ["ad-story-framework", "h3-video"],
    aspectRatio: "16:9",
    duration: 30,
    fields: [
      {
        id: "story",
        label: "The story in 2-3 beats",
        hint: "Who wants what, what changes, where it lands.",
        required: true,
        maxLines: 5,
      },
      {
        id: "world",
        label: "Place, light, feeling",
        hint: "The world we should recognize in the first shot.",
        maxLines: 3,
      },
      {
        id: "payoff",
        label: "The last image or line",
        hint: "What the clip should leave behind.",
        maxLines: 2,
      },
    ],
  },
  {
    id: "street-interview",
    title: "Street interview",
    chip: "Street interview",
    subtitle: "A motivated encounter",
    category: "CREATOR",
    image: "ugc",
    playbook: "references/playbooks/formats/street-interview.md",
    crafts: ["image-direction", "video-direction", "caption-tracking", "voice-and-performance"],
    imageSkills: ["gpt-image-people", "ugc-realistic"],
    videoSkills: ["ad-story-framework", "ugc-ad-formats"],
    aspectRatio: "9:16",
    duration: 20,
    fields: [
      {
        id: "encounter",
        label: "The setup and the question",
        hint: "Where this happens, and what gets asked.",
        required: true,
        maxLines: 4,
      },
      {
        id: "people",
        label: "Interviewer and guest",
        hint: "Who asks, who answers, how they feel about it.",
        maxLines: 2,
      },
      {
        id: "reveal",
        label: "What the clip lands on",
        hint: "The line, object, or caption that closes it.",
        maxLines: 2,
      },
    ],
  },
  {
    id: "podcast",
    title: "Two-person podcast",
    chip: "Podcast",
    subtitle: "Complementary hosts, one conversation",
    category: "MUSIC",
    image: "music",
    playbook: "references/playbooks/formats/two-person-podcast.md",
    crafts: ["image-direction", "voice-and-performance", "visual-continuity"],
    imageSkills: ["gpt-image-people", "ugc-realistic"],
    videoSkills: ["ugc-ad-formats"],
    aspectRatio: "9:16",
    duration: 30,
    fields: [
      {
        id: "topic",
        label: "What are they talking about?",
        hint: "The conversation, and any product on the table.",
        required: true,
        maxLines: 4,
      },
      {
        id: "hosts",
        label: "Who is talking?",
        hint: "Two people and their relationship.",
        maxLines: 2,
      },
      {
        id: "visual",
        label: "Studio look",
        hint: "Room, light, and whether a product stays in frame.",
        maxLines: 2,
      },
    ],
  },
];

export function hypitFormat(id: string): HypitFormat {
  return hypitFormats.find((format) => format.id === id) ?? hypitFormats[0]!;
}

export function readPublicHttpUrl(value: string): string | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  const candidates = [raw];
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    if (raw.startsWith("//")) candidates.push(`https:${raw}`);
    else if (/^(www\.)?[\w-]+(\.[\w-]+)+([/:?#].*)?$/i.test(raw)) candidates.push(`https://${raw}`);
  }
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if ((url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password) {
        return url.toString();
      }
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

export function findPublicHttpUrl(value: string): string | undefined {
  const direct = readPublicHttpUrl(value);
  if (direct) return direct;
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  return match ? readPublicHttpUrl(match[0]) : undefined;
}

export function sourceUrlFrom(answers: Record<string, string>, referenceUrl?: string): string | undefined {
  const reference = readPublicHttpUrl(referenceUrl ?? "");
  if (reference) return reference;
  for (const value of Object.values(answers)) {
    const found = findPublicHttpUrl(value);
    if (found) return found;
  }
  return undefined;
}

export function titleFromAnswers(format: HypitFormat, answers: Record<string, string>, referenceUrl?: string): string {
  const primary = format.fields.length === 0 ? "" : (answers[format.fields[0]!.id] ?? "").trim();
  if (primary && !readPublicHttpUrl(primary)) {
    const first = primary.split(/[\n.!?]/)[0]?.trim() ?? "";
    if (first.length > 0) return first.length <= 80 ? first : first.slice(0, 80);
  }
  const source = sourceUrlFrom(answers, referenceUrl);
  if (source) {
    try {
      return new URL(source).hostname.replace(/^www\./, "");
    } catch {
      return format.title;
    }
  }
  return format.title;
}

export function composeHypitBrief(input: {
  format: HypitFormat;
  answers: Record<string, string>;
  aspectRatio: string;
  duration: number;
  referenceUrl?: string;
}): string {
  const source = sourceUrlFrom(input.answers, input.referenceUrl);
  const lines = [
    "Produce this video with Hypit.",
    `Format: ${input.format.title}`,
    `Playbook: ${input.format.playbook}`,
    `Crafts: ${input.format.crafts.join(", ")}.`,
    `Surreel still packs: ${input.format.imageSkills.join(", ")}.`,
    `Surreel motion packs: ${input.format.videoSkills.join(", ")}.`,
    "Open those packs and run every listed craft. Voice, picture, and motion stay on the same path as a written brief.",
    "Captions are Hypit caption craft edited onto the finished plate. Do not burn type in Seedance. Do not transcribe the film.",
    "Do not ask for facts already answered here or already present at the source URL.",
    "",
  ];
  if (source) {
    lines.push(`Source URL: ${source}`);
    lines.push("Fetch this page or video first. Use it as the subject, facts, look, and motion brief.");
    lines.push("If it is a video page, download it with Hypit media fetch, then read it as a reference video.");
    lines.push("Then author the same .svml / .svrun path and animate with the format playbook and crafts above.");
    lines.push("");
  }
  for (const field of input.format.fields) {
    const value = input.answers[field.id]?.trim() ?? "";
    if (value.length === 0) continue;
    if (readPublicHttpUrl(value) && !/\s/.test(value)) continue;
    lines.push(`${field.label}: ${value}`, "");
  }
  const clips = clipDurations(input.duration);
  if (clips.length === 1) {
    lines.push(`Deliver a ${input.duration}-second ${input.aspectRatio} video at a natural speaking pace.`);
  } else {
    lines.push(
      `Deliver a ${input.duration}-second ${input.aspectRatio} video as ${clips.length} clips (${clips.join(" + ")}s), then join them. Natural speaking pace. Do not compress the whole film into 15 seconds.`,
    );
  }
  return lines.join("\n").trim();
}

export function formatReady(format: HypitFormat, answers: Record<string, string>): boolean {
  return format.fields
    .filter((field) => field.required)
    .every((field) => (answers[field.id] ?? "").trim().length > 0);
}

export function queueReady(format: HypitFormat, answers: Record<string, string>, referenceUrl?: string): boolean {
  return formatReady(format, answers) || sourceUrlFrom(answers, referenceUrl) !== undefined;
}
