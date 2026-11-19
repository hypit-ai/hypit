import type { NlePictureLayout } from "@hypit/nle";
import type { Take } from "./speech.js";

type Shot = { readonly id: string; readonly at: string; readonly media: string; readonly layout: NlePictureLayout;
  readonly motion: "pop" | "rise" | "wide" | "edge"; readonly loop?: string };
export type Group = { readonly id: string; readonly take: Take; readonly crossfadeFrames?: number; readonly shots: readonly Shot[] };

export const groups: readonly Group[] = [
  { id: "01", take: "wife", shots: [
    {"id":"forty-years","at":"broll-01-1","media":"media/broll-wife-84-years/reference.media.json","layout":{"x":7,"y":701,"width":399,"height":399,"fit":"contain"},"motion":"pop","loop":"23/10"},
    {"id":"same-version","at":"broll-01-2","media":"media/broll-wife-version-update/same-version-png.media.json","layout":{"x":386,"y":668,"width":306,"height":306,"fit":"contain"},"motion":"rise"},
    {"id":"zero-updates","at":"broll-01-3","media":"media/broll-wife-version-update/zero-updates-png.media.json","layout":{"x":134,"y":894,"width":557,"height":353.647,"fit":"contain"},"motion":"edge"},
  ] },
  { id: "02", take: "wife", shots: [
    {"id":"loris-lawyer","at":"broll-02-1","media":"media/broll-wife-divorce-lawyer/final-loris-lawyer-v3.media.json","layout":{"x":11,"y":579,"width":380,"height":473.89,"fit":"contain"},"motion":"pop"},
    {"id":"lori-after-divorce","at":"broll-02-2","media":"media/broll-wife-huell-money/final-lori-after-divorce-v3.media.json","layout":{"x":56,"y":873,"width":636,"height":358.464,"fit":"contain"},"motion":"wide"},
  ] },
  { id: "03", take: "wife", shots: [
    {"id":"math-lady","at":"broll-03-1","media":"media/broll-wife-five-million/math-lady.media.json","layout":{"x":350,"y":652,"width":330,"height":215.956,"fit":"contain"},"motion":"pop"},
    {"id":"five-million","at":"broll-03-2","media":"media/broll-wife-five-million/money-reference-png.media.json","layout":{"x":30,"y":808,"width":587,"height":379.639,"fit":"contain"},"motion":"rise"},
  ] },
  { id: "04", take: "wife", shots: [
    {"id":"linkedin-job","at":"broll-04-1","media":"media/broll-wife-linkedin-job/source-user.media.json","layout":{"x":17,"y":328,"width":691,"height":518.25,"fit":"contain"},"motion":"pop"},
  ] },
  { id: "05", take: "trump", shots: [
    {"id":"honeytrap","at":"broll-05-1","media":"media/broll-trump-honeytrap/source-user.media.json","layout":{"x":367,"y":582,"width":330,"height":330,"fit":"contain"},"motion":"pop"},
    {"id":"honorable","at":"broll-05-2","media":"media/broll-trump-honorable/source-user.media.json","layout":{"x":25,"y":846,"width":638,"height":358.882,"fit":"contain"},"motion":"wide"},
  ] },
  { id: "06", take: "trump", shots: [
    {"id":"trump-jensen","at":"broll-06-1","media":"media/broll-trump-pointing/final-trump-jensen-v3.media.json","layout":{"x":11,"y":760,"width":382,"height":286.5,"fit":"contain"},"motion":"pop"},
    {"id":"no-big-deal","at":"broll-06-2","media":"media/broll-trump-no-big-deal/final-wife-ranking-v2.media.json","layout":{"x":34,"y":524,"width":644,"height":429.331,"fit":"contain"},"motion":"rise"},
    {"id":"which-one","at":"broll-06-3","media":"media/broll-trump-which-one/final-which-one-v2.media.json","layout":{"x":16,"y":825,"width":687,"height":366.737,"fit":"contain"},"motion":"wide"},
  ] },
  { id: "07", take: "kimberly", shots: [
    {"id":"healthcare-vp","at":"broll-07-1","media":"media/broll-kimberly-healthcare-vp/source-user.media.json","layout":{"x":34,"y":564,"width":654,"height":490.5,"fit":"contain"},"motion":"pop"},
  ] },
  { id: "08", take: "kimberly", shots: [
    {"id":"training","at":"broll-08-1","media":"media/broll-kimberly-training/source-user.media.json","layout":{"x":32,"y":738,"width":306,"height":408,"fit":"contain"},"motion":"pop"},
    {"id":"heart-rate","at":"broll-08-2","media":"media/broll-kimberly-heart-rate/source-user.media.json","layout":{"x":63,"y":703,"width":632,"height":474,"fit":"contain"},"motion":"rise"},
  ] },
  { id: "09", take: "kimberly", crossfadeFrames: 5, shots: [
    {"id":"side-effects","at":"broll-09-1","media":"media/broll-kimberly-side-effects/final-no-wife-no-job-v3.media.json","layout":{"x":280,"y":506,"width":393,"height":594.749,"fit":"contain"},"motion":"pop"},
    {"id":"wife-lost","at":"broll-09-2","media":"media/broll-kimberly-wife-lost/final-no-wife-no-job-both-v3.media.json","layout":{"x":280,"y":506,"width":393,"height":594.749,"fit":"contain"},"motion":"rise"},
  ] },
  { id: "10", take: "alice", shots: [
    {"id":"not-like-others","at":"broll-10-1","media":"media/broll-alice-not-like-others/huang-png.media.json","layout":{"x":33,"y":502,"width":656,"height":492,"fit":"contain"},"motion":"pop"},
  ] },
  { id: "11", take: "alice", crossfadeFrames: 5, shots: [
    {"id":"hermes","at":"broll-11-1","media":"media/broll-alice-hermes-h100/final-hermes-stage.media.json","layout":{"x":63,"y":491,"width":600,"height":600,"fit":"contain"},"motion":"pop"},
    {"id":"h100","at":"broll-11-2","media":"media/broll-alice-hermes-h100/final-h100-stage.media.json","layout":{"x":63,"y":491,"width":600,"height":600,"fit":"contain"},"motion":"rise"},
  ] },
  { id: "12", take: "alice", shots: [
    {"id":"source-extraction","at":"broll-12-1","media":"media/broll-alice-source-extraction/source-user.media.json","layout":{"x":120,"y":510,"width":572,"height":429,"fit":"contain"},"motion":"pop"},
    {"id":"deepseek-transfer","at":"broll-12-2","media":"media/broll-alice-deepseek-transfer/source-user.media.json","layout":{"x":26,"y":448,"width":615,"height":615,"fit":"contain"},"motion":"rise"},
  ] },
  { id: "13", take: "jacket", shots: [
    {"id":"dlss","at":"broll-13-1","media":"media/broll-jacket-dlss/source-user.media.json","layout":{"x":65,"y":812,"width":584,"height":438,"fit":"contain"},"motion":"pop"},
  ] },
  { id: "14", take: "jacket", shots: [
    {"id":"no-glitch","at":"broll-14-1","media":"media/broll-jacket-no-glitch/source-user.media.json","layout":{"x":86,"y":681,"width":555,"height":555,"fit":"contain"},"motion":"pop"},
  ] },
  { id: "15", take: "jacket", shots: [
    {"id":"galaxy-brain","at":"broll-15-1","media":"media/broll-jacket-galaxy-brain/final-galaxy-brain-v2.media.json","layout":{"x":9,"y":656,"width":493,"height":480.065,"fit":"contain"},"motion":"pop"},
    {"id":"gpu-date","at":"broll-15-2","media":"media/broll-jacket-gpu-date/source-user.media.json","layout":{"x":60,"y":806,"width":586,"height":439.5,"fit":"contain"},"motion":"rise"},
    {"id":"agi","at":"broll-15-3","media":"media/broll-jacket-agi/source-png.media.json","layout":{"x":414,"y":849,"width":208,"height":274.82,"fit":"contain"},"motion":"pop"},
    {"id":"new-ceo","at":"broll-15-4","media":"media/broll-jacket-ceo/source-user.media.json","layout":{"x":85,"y":671,"width":586,"height":586,"fit":"contain"},"motion":"rise"},
  ] },
];
