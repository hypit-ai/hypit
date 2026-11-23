import { AudioLines, Blend, Captions, Clapperboard, createLucideIcon, Film, Palette, Type } from "lucide-react";

export const studioIcons = {
  assets: Clapperboard,
  picture: Film,
  audio: AudioLines,
  text: Type,
  subtitle: Captions,
  transition: Blend,
  filter: Palette,
  effect: createLucideIcon("VisualEffect", [
    ["path", { d: "M4 20c2 0 2.6-1.3 3-3.5L9 7c.4-2 1.6-3 3.5-3H14M5.5 10.5h7", key: "f" }],
    ["path", { d: "m14 12 6 8m0-8-6 8", key: "x" }],
  ]),
} as const;
