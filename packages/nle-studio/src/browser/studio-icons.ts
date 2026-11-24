import { AudioLines, Blend, Captions, Clapperboard, createLucideIcon, Film, Group, Layers, Palette, Type } from "lucide-react";

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

export const unavailableTrackIcons = {
  picture: createLucideIcon("EyeMinus", [
    ["path", { d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0", key: "eye" }],
    ["path", { d: "M8 12h8", key: "minus" }],
  ]),
  audio: createLucideIcon("VolumeMinus", [
    ["path", { d: "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z", key: "speaker" }],
    ["path", { d: "M15 12h7", key: "minus" }],
  ]),
} as const;

const matteOutline = { cx: "12", cy: "12", r: "9", key: "edge" };

export const timelineBadgeIcons = {
  composition: { Icon: Layers, label: "子时间线" },
  matteContent: { Icon: createLucideIcon("MatteContent", [
    ["circle", matteOutline],
    ["path", { d: "M12 3a9 9 0 0 1 0 18Z", fill: "currentColor", stroke: "none", key: "inside" }],
  ]), label: "被遮罩" },
  matteSource: { Icon: createLucideIcon("MatteSource", [
    ["circle", { ...matteOutline, strokeDasharray: "3 4" }],
  ]), label: "遮罩源" },
  group: { Icon: Group, label: "组内联动" },
} as const;
