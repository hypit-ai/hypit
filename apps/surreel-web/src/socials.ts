import type { Project } from "./types.ts";

export type SocialTarget = {
  id: string;
  label: string;
  composeUrl: string;
};

export const socialTargets: SocialTarget[] = [
  { id: "tiktok", label: "TikTok", composeUrl: "https://www.tiktok.com/upload" },
  { id: "instagram", label: "Instagram", composeUrl: "https://www.instagram.com/" },
  { id: "youtube", label: "YouTube", composeUrl: "https://studio.youtube.com" },
  { id: "x", label: "X", composeUrl: "https://x.com/compose/post" },
];

export function socialTarget(id: string): SocialTarget {
  return socialTargets.find((item) => item.id === id) ?? socialTargets[0]!;
}

export function socialCaption(project: Project): string {
  const firstLine =
    project.prompt
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? project.title;
  if (firstLine === project.title) return project.title;
  return `${project.title}\n\n${firstLine}`;
}

export function launchUri(target: SocialTarget, caption: string): string {
  if (target.id === "x") {
    const url = new URL(target.composeUrl);
    url.searchParams.set("text", caption);
    return url.toString();
  }
  return target.composeUrl;
}
