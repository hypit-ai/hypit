import { paceVoices } from "../src/timing.ts";
import { hypitPack } from "./hypit-pack.ts";

export type HypitSkillPack = (typeof hypitPack)[keyof typeof hypitPack];

export type CraftPlan = {
  still: string;
  motion: string;
  voice?: string;
  captions?: string;
  picture?: string;
};

export function hypitSkill(formatId?: string): HypitSkillPack {
  if (formatId && formatId in hypitPack) return hypitPack[formatId as keyof typeof hypitPack];
  return hypitPack["talking-head"];
}

export function skillContext(pack: HypitSkillPack): string {
  const crafts = pack.crafts
    .map((name) => `# Craft: ${name}\n\n${pack.plannerCrafts[name as keyof typeof pack.plannerCrafts] ?? ""}`)
    .join("\n\n");
  return [
    `Format: ${pack.title}`,
    `Playbook: ${pack.playbook}`,
    `Crafts (run every one): ${pack.crafts.join(", ")}.`,
    "",
    "# Format playbook",
    "",
    pack.plannerPlaybook,
    "",
    crafts,
  ].join("\n");
}

export const CLEAN_PLATE =
  "Clean plate only. No on-screen text, burned captions, subtitles, lower thirds, logos, or watermarks. Picture and spoken audio only. Captions are applied later by Hypit caption craft.";

export function composeFalStill(plan: CraftPlan): string {
  return [plan.still, CLEAN_PLATE].filter(Boolean).join("\n\n");
}

export function composeFalMotion(plan: CraftPlan, seconds?: number): string {
  return [
    plan.motion,
    plan.voice ? `Spoken performance:\n${plan.voice}` : "",
    plan.picture ? `Picture, B-roll, or graphics:\n${plan.picture}` : "",
    seconds
      ? `This clip is ${seconds} seconds. Speak only the lines below, at a natural talking pace. If time runs out, stop. Never speed up or compress.`
      : "Natural talking pace. Speak only the lines given. Never speed up.",
    CLEAN_PLATE,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type CaptionCue = { start: number; end: number; text: string };

export function captionCues(raw: string | undefined, duration: number): CaptionCue[] {
  const seconds = Math.max(5, Math.min(60, duration));
  const lines = (raw ?? "")
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.)\]]+\s*/, "").trim())
    .filter((line) => line.length >= 2)
    .slice(0, 12);
  if (lines.length === 0) return [];
  const span = Math.max(1.2, seconds / lines.length);
  return lines.map((text, index) => {
    const start = Math.round(index * span * 100) / 100;
    const end = Math.min(seconds, Math.round((start + span - 0.08) * 100) / 100);
    return { start, end: Math.max(end, start + 0.8), text: text.slice(0, 80) };
  });
}

export function cuesToVtt(cues: CaptionCue[]): string {
  const stamp = (value: number) => {
    const clamped = Math.max(0, value);
    const hours = Math.floor(clamped / 3600);
    const minutes = Math.floor((clamped % 3600) / 60);
    const secs = clamped % 60;
    const whole = Math.floor(secs);
    const ms = Math.round((secs - whole) * 1000);
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(whole)}.${pad(ms, 3)}`;
  };
  return ["WEBVTT", "", ...cues.flatMap((cue, index) => [`${index + 1}`, `${stamp(cue.start)} --> ${stamp(cue.end)}`, cue.text, ""])].join("\n");
}

export type ClipPlan = {
  duration: number;
  motion: string;
  voice?: string;
  captions?: string;
  picture?: string;
};

export function readClipPlans(value: unknown, pack: HypitSkillPack, durations: number[]): ClipPlan[] {
  const plan = readCraftPlan(value, pack);
  const record = flattenPlan(value);
  const raw = Array.isArray(record.clips) ? record.clips : [];
  const pieces = raw.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return "";
    return coerceText((item as Record<string, unknown>).voice ?? (item as Record<string, unknown>).dialogue ?? (item as Record<string, unknown>).script);
  });
  const voices = paceVoices(pieces, plan.voice, durations);
  const captions = paceVoices(
    raw.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      return coerceText((item as Record<string, unknown>).captions ?? (item as Record<string, unknown>).caption);
    }),
    plan.captions,
    durations,
  );
  const motions = raw.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return "";
    return coerceText((item as Record<string, unknown>).motion ?? (item as Record<string, unknown>).video ?? (item as Record<string, unknown>).action);
  });
  return durations.map((duration, index) => {
    const voice = voices[index] ?? "";
    const motion = clipMotionDirection(motions[index] || plan.motion, duration, index, durations.length);
    return {
      duration,
      motion: composeFalMotion({ still: plan.still, motion, voice, picture: plan.picture }, duration),
      voice,
      captions: captions[index] || undefined,
      picture: plan.picture,
    };
  });
}

function clipMotionDirection(motion: string, seconds: number, index: number, total: number): string {
  const rewritten = motion.replace(/\b\d+\s*-?\s*seconds?\b/gi, `${seconds} seconds`);
  return `${rewritten}\nClip ${index + 1} of ${total}. Hold ${seconds} seconds at a natural pace.`;
}

export function readCraftPlan(value: unknown, pack: HypitSkillPack): CraftPlan {
  const record = flattenPlan(value);
  const still = requiredText(pick(record, "still", "image", "startframe", "start_frame"), "still");
  const motion = requiredText(pick(record, "motion", "video", "action"), "motion");
  const plan: CraftPlan = { still, motion };
  const voice = optionalText(pick(record, "voice", "dialogue", "script", "lines"));
  const captions = optionalText(pick(record, "captions", "caption", "supers", "text_on_screen"));
  const picture = optionalText(pick(record, "picture", "broll", "b_roll", "graphics"));
  if (voice) plan.voice = voice;
  if (captions) plan.captions = captions;
  if (picture) plan.picture = picture;
  if (needsVoice(pack) && !plan.voice) throw new Error("Hypit voice craft produced no lines.");
  if (needsCaptions(pack) && !plan.captions) throw new Error("Hypit caption craft produced no cues.");
  if (needsPicture(pack) && !plan.picture) throw new Error("Hypit picture craft produced no direction.");
  return plan;
}

export function needsVoice(pack: HypitSkillPack): boolean {
  return pack.crafts.some((craft) => craft === "voice-direction" || craft === "voice-and-performance");
}

export function needsCaptions(pack: HypitSkillPack): boolean {
  return pack.crafts.some((craft) => craft === "captions" || craft === "caption-tracking");
}

export function needsPicture(pack: HypitSkillPack): boolean {
  return pack.crafts.some((craft) => craft === "b-roll" || craft === "graphic-compositions");
}

function flattenPlan(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Hypit plan was not an object.");
  const record = value as Record<string, unknown>;
  const first = Array.isArray(record.clips) ? record.clips[0] : undefined;
  const lifted = first && typeof first === "object" && !Array.isArray(first) ? (first as Record<string, unknown>) : {};
  const nested = record.plan ?? record.crafts ?? record.result;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...flattenPlan(nested), ...lifted, ...record };
  }
  return { ...lifted, ...record };
}

function pick(record: Record<string, unknown>, ...names: string[]): unknown {
  const keys = Object.fromEntries(Object.entries(record).map(([key, value]) => [key.toLowerCase().replace(/[\s-]+/g, "_"), value]));
  for (const name of names) {
    if (keys[name] !== undefined) return keys[name];
  }
  return undefined;
}

function requiredText(value: unknown, name: string): string {
  const text = coerceText(value);
  if (text.length < 8) throw new Error(`Hypit ${name} direction was empty.`);
  return text.slice(0, 4000);
}

function optionalText(value: unknown): string | undefined {
  const text = coerceText(value);
  return text.length >= 4 ? text.slice(0, 4000) : undefined;
}

function coerceText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceText(item))
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["prompt", "text", "direction", "lines", "content", "value"]) {
      const inner = coerceText(record[key]);
      if (inner) return inner;
    }
  }
  return "";
}
