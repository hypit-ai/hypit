import { ccSkillContext, consultLine, formatRoute, readConsulted } from "./cc-skills.ts";
import { clipDurations } from "../src/timing.ts";
import {
  composeFalMotion,
  composeFalStill,
  hypitSkill,
  needsCaptions,
  needsPicture,
  needsVoice,
  readClipPlans,
  readCraftPlan,
  skillContext,
  type ClipPlan,
  type CraftPlan,
  type HypitSkillPack,
} from "./hypit.ts";

export const OPENROUTER_MODEL = "deepseek/deepseek-v4.1-flash:nitro";

export class OpenRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export async function planShots(
  key: string,
  input: {
    prompt: string;
    format?: string;
    style: string;
    aspectRatio: string;
    duration: number;
    pageNote?: string;
    referenceUrl?: string;
  },
): Promise<{
  pack: HypitSkillPack;
  plan: CraftPlan;
  still: string;
  motion: string;
  captions?: string;
  clips: ClipPlan[];
  imageSkill: string;
  videoSkill: string;
}> {
  const pack = hypitSkill(input.format);
  const route = formatRoute(input.format);
  const clips = clipDurations(input.duration);
  const required = [
    `"imageSkill": one of ${route.imageSkills.join("|")}`,
    `"videoSkill": one of ${route.videoSkills.join("|")}`,
    '"still": photoreal start-frame written with the image pack (gpt-image-people JSON spec when that pack is open), 2+ sentences',
    '"motion": camera and action written with the video pack, 2+ sentences',
    needsVoice(pack) ? '"voice": spoken lines plus vocal character, never empty' : undefined,
    needsCaptions(pack)
      ? '"captions": Hypit caption-craft display cues for the later edit pass, never empty. Do not write those words into still or motion'
      : undefined,
    needsPicture(pack) ? '"picture": B-roll or graphic board direction, never empty' : undefined,
    clips.length > 1
      ? `"clips": array of ${clips.length} objects {motion,voice,captions}. Clip lengths: ${clips.join("+")}s. Each clip holds only what a person can say in that time at a natural pace. Never dump the full ${input.duration}s script into one clip`
      : undefined,
  ].filter(Boolean);
  const brief = [
    ccSkillContext(input.format),
    "",
    skillContext(pack),
    "",
    "# Brief",
    `Aspect: ${input.aspectRatio}`,
    `Duration: ${input.duration}s as ${clips.length} clip${clips.length === 1 ? "" : "s"} (${clips.join(" + ")}s). Natural talking pace. Do not speed through.`,
    `Style: ${input.style}`,
    input.referenceUrl ? `Source URL: ${input.referenceUrl}` : "",
    input.pageNote ? `Page notes: ${input.pageNote.slice(0, 1800)}` : "",
    "",
    input.prompt,
  ]
    .filter(Boolean)
    .join("\n");

  let lastError = "Hypit craft plan was incomplete.";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parsed = await completeJson(
      key,
      [
      {
        role: "system",
        content: [
          "You are Surreel's production agent.",
          consultLine(route),
          "Read the pointed Surreel packs first, then the Hypit playbook, then run every listed craft.",
          "still follows the image pack. motion follows the video pack.",
          "still and motion are a clean plate. Never burn captions or ask Seedance to draw type.",
          "captions belong to Hypit caption craft and are edited onto the finished film. Never transcribe the video.",
          "Speech stays at a natural pace. A 30s film is two 15s clips, not one rushed 15s take.",
          "Invent no product facts. Use only the brief and page notes.",
          `Return one JSON object with every key filled: {${required.join(",")}}.`,
        ].join(" "),
      },
      { role: "user", content: brief },
      ...(attempt === 0
        ? []
        : [
            {
              role: "user" as const,
              content: `Your last JSON failed (${lastError}). Return the same object again with every required key as a non-empty string. Do not wrap in markdown.`,
            },
          ]),
      ],
      { maxTokens: 3500 },
    );
    try {
      const consulted = readConsulted(parsed, input.format);
      const plan = readCraftPlan(parsed, pack);
      const clipPlans = readClipPlans(parsed, pack, clips);
      return {
        pack,
        plan,
        still: composeFalStill(plan),
        motion: clipPlans[0]?.motion ?? composeFalMotion(plan, clips[0]),
        captions: clipPlans.map((item) => item.captions).filter(Boolean).join("\n") || plan.captions,
        clips: clipPlans,
        imageSkill: consulted.imageSkill,
        videoSkill: consulted.videoSkill,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new OpenRouterError(lastError);
}

export async function completeJson(
  key: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  options: { maxTokens?: number } = {},
): Promise<unknown> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://studio.getvideos.app",
      "X-Title": "Surreel",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0.2,
      max_tokens: options.maxTokens ?? 2200,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    throw new OpenRouterError(`OpenRouter returned non-JSON (${response.status}).`);
  }
  if (!response.ok) {
    const error = body && typeof body === "object" ? (body as { error?: { message?: unknown } }).error : undefined;
    const message = typeof error?.message === "string" ? error.message : `OpenRouter ${response.status}`;
    throw new OpenRouterError(message);
  }
  const raw = (body as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
  const content = messageContent(raw);
  if (!content) throw new OpenRouterError("OpenRouter returned an empty plan.");
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new OpenRouterError("OpenRouter did not return JSON.");
    return JSON.parse(match[0]);
  }
}

function messageContent(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}
