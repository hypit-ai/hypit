import { ccFormatRoutes, ccSkillsPack } from "./cc-skills-pack.ts";

export type SkillKind = "image" | "video";
export type CcSkillName = keyof typeof ccSkillsPack;

export type FormatRoute = {
  id: string;
  imageSkills: readonly string[];
  videoSkills: readonly string[];
};

export const CC_SKILL_NAMES = Object.keys(ccSkillsPack) as CcSkillName[];

export function listCcSkills(): Array<{ name: string; description: string; kinds: readonly string[] }> {
  return CC_SKILL_NAMES.map((name) => {
    const pack = ccSkillsPack[name];
    return { name: pack.name, description: pack.description, kinds: pack.kinds };
  });
}

export function skillsForKind(kind: SkillKind): string[] {
  return CC_SKILL_NAMES.filter((name) => (ccSkillsPack[name].kinds as readonly string[]).includes(kind));
}

export function formatRoute(formatId?: string): FormatRoute {
  const id = formatId && formatId in ccFormatRoutes ? formatId : "talking-head";
  const row = ccFormatRoutes[id as keyof typeof ccFormatRoutes];
  return { id, imageSkills: row.imageSkills, videoSkills: row.videoSkills };
}

export function requiredSkills(formatId?: string): string[] {
  const route = formatRoute(formatId);
  return [...new Set([...route.imageSkills, ...route.videoSkills])];
}

export function ccSkillContext(formatId?: string): string {
  const names = requiredSkills(formatId);
  const packs = names.map((name) => {
    const pack = ccSkillsPack[name as CcSkillName];
    if (!pack) throw new Error(`Surreel skill ${name} is not packed.`);
    return [`# Skill: ${pack.name} [${pack.kinds.join(", ")}]`, pack.description, "", pack.plannerText].join("\n");
  });
  return [
    "Open these Surreel packs before you write a prompt. A still written without an image pack, or a clip written without a video pack, is refused.",
    `Image packs for this angle: ${formatRoute(formatId).imageSkills.join(", ")}.`,
    `Video packs for this angle: ${formatRoute(formatId).videoSkills.join(", ")}.`,
    "",
    ...packs,
  ].join("\n");
}

export function consultLine(route: FormatRoute): string {
  return `Open one of these image packs: ${route.imageSkills.join(", ")}. Open one of these video packs: ${route.videoSkills.join(", ")}. Then generate. They are the prompt styles this deployment was built on, and a generation made without one is worse in ways nobody will report.`;
}

export function readConsulted(value: unknown, formatId?: string): { imageSkill: string; videoSkill: string } {
  const route = formatRoute(formatId);
  if (!value || typeof value !== "object") throw new Error(consultLine(route));
  const record = value as Record<string, unknown>;
  const imageSkill = pickName(record, "imageskill", "image_skill", "imagePack", "image_pack");
  const videoSkill = pickName(record, "videoskill", "video_skill", "videoPack", "video_pack");
  if (!route.imageSkills.includes(imageSkill) || !skillsForKind("image").includes(imageSkill)) {
    throw new Error(consultLine(route));
  }
  if (!route.videoSkills.includes(videoSkill) || !skillsForKind("video").includes(videoSkill)) {
    throw new Error(consultLine(route));
  }
  return { imageSkill, videoSkill };
}

function pickName(record: Record<string, unknown>, ...keys: string[]): string {
  const lower = Object.fromEntries(Object.entries(record).map(([key, value]) => [key.toLowerCase().replace(/[\s-]+/g, ""), value]));
  for (const key of keys) {
    const value = lower[key.toLowerCase().replace(/[\s-]+/g, "")];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
