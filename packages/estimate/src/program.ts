import {
  assertSpeechDurationIdentity,
  sealSpeechDuration,
} from "@narratage/video-contracts";
import type {
  NarrativeSpeechExcerpt,
  SpeechDuration,
} from "@narratage/video-contracts";
import { digestOf } from "@narratage/protocol";

import type {
  ResolvedSpeechEstimateLanguage,
  SpeechEstimateLanguage,
  SpeechEstimatePolicy,
} from "./types.js";

export const estimateSpeechImplementationDigest = digestOf("@narratage/estimate/estimate-speech@1");

const BASE_RATE: Readonly<Record<ResolvedSpeechEstimateLanguage, number>> = {
  en: 4.5,
  zh: 5.25,
  ja: 7.5,
  es: 5.9,
};

const PACE_MULTIPLIER = {
  slow: 0.8,
  normal: 1,
  fast: 1.25,
} as const;

function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)?/gu) ?? [];
}

function looksSpanish(text: string): boolean {
  if (/[ñáéíóúü¿¡]/iu.test(text)) return true;
  const tokens = words(text).map((word) => word.toLowerCase());
  if (tokens.length === 0) return false;
  const hits = tokens.filter((word) => /^(?:que|de|la|el|los|las|un|una|para|por|con|sin|pero|porque|como|más|muy|este|esta|eso|soy|eres|es|son|estoy|está|tengo|quiero|puedo|ahora|cuando|todo|nada|aquí|así)$/u.test(word)).length;
  return hits >= Math.max(2, Math.ceil(tokens.length * 0.18));
}

export function detectSpeechEstimateLanguage(text: string): ResolvedSpeechEstimateLanguage {
  const han = (text.match(/[\u3400-\u9fff]/gu) ?? []).length;
  const kana = (text.match(/[\u3040-\u30ff]/gu) ?? []).length;
  const ascii = (text.match(/[A-Za-z]/gu) ?? []).length;
  if (kana > Math.max(han, ascii / 4)) return "ja";
  if (han > ascii / 4) return "zh";
  if (looksSpanish(text)) return "es";
  return "en";
}

function englishSyllables(word: string): number {
  const normalized = word.toLowerCase().replace(/[^a-z]/gu, "");
  if (!normalized) return 0;
  if (normalized.length <= 3) return 1;
  const stripped = normalized
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/u, "")
    .replace(/^y/u, "");
  return Math.max(1, stripped.match(/[aeiouy]{1,2}/gu)?.length ?? 1);
}

function spanishVowelNuclei(run: string): number {
  let nuclei = 0;
  let pending = "";
  const flush = () => {
    if (!pending) return;
    nuclei += Math.max(1, pending.match(/[aeoáéó]/gu)?.length ?? 0);
    pending = "";
  };
  for (const character of run) {
    if (character === "í" || character === "ú") {
      flush();
      nuclei += 1;
    } else {
      pending += character;
    }
  }
  flush();
  return nuclei;
}

function spanishSyllables(word: string): number {
  let normalized = word.toLowerCase().normalize("NFC").replace(/[^a-záéíóúüñ]/gu, "");
  if (!normalized) return 0;
  if (normalized === "y") normalized = "i";
  else normalized = normalized.replace(/y$/u, "i");
  const runs = normalized.match(/[aeiouáéíóúü]+/gu) ?? [];
  return Math.max(1, runs.reduce((sum, run) => sum + spanishVowelNuclei(run), 0));
}

export function countSpeechEstimateUnits(
  text: string,
  language: ResolvedSpeechEstimateLanguage,
): number {
  if (language === "zh" || language === "ja") {
    const cjk = (text.match(/[\u3400-\u9fff\u3040-\u30ff]/gu) ?? []).length;
    const latin = text
      .replace(/[\u3400-\u9fff\u3040-\u30ff]/gu, " ")
      .split(/\s+/u)
      .filter((word) => /[A-Za-z]/u.test(word));
    return cjk + latin.reduce((sum, word) => sum + englishSyllables(word), 0);
  }
  if (language === "es") return words(text).reduce((sum, word) => sum + spanishSyllables(word), 0);
  return words(text).reduce((sum, word) => sum + englishSyllables(word), 0);
}

export function sealSpeechEstimatePolicy(value: SpeechEstimatePolicy): SpeechEstimatePolicy {
  const policy = structuredClone(value);
  assertSpeechEstimatePolicy(policy);
  return policy;
}

export function assertSpeechEstimatePolicy(value: SpeechEstimatePolicy): void {
  if (
    value.contract !== "svml.speech-estimate-policy@1"
    || !(["auto", "en", "zh", "ja", "es"] as const).includes(value.language)
    || !(["slow", "normal", "fast"] as const).includes(value.pace)
    || !(["none", "round", "ceil"] as const).includes(value.rounding)
    || !Number.isFinite(value.paddingSec)
    || value.paddingSec < 0
    || !Number.isFinite(value.minimumSec)
    || value.minimumSec < 0
    || !Number.isFinite(value.maximumSec)
    || value.maximumSec <= 0
    || value.minimumSec > value.maximumSec
  ) {
    throw new Error("SpeechEstimatePolicy is invalid");
  }
}

function assertSpeechExcerpt(value: NarrativeSpeechExcerpt): void {
  if (
    value.contract !== "svml.narrative-speech-excerpt@1"
    || value.kind !== "segment"
    || value.id.length === 0
    || !Number.isSafeInteger(value.tokenStart)
    || !Number.isSafeInteger(value.tokenEndExclusive)
    || value.tokenEndExclusive <= value.tokenStart
    || value.speech.trim().length === 0
  ) {
    throw new Error("NarrativeSpeechExcerpt is invalid");
  }
}

function rounded(value: number, mode: SpeechEstimatePolicy["rounding"]): number {
  if (mode === "ceil") return Math.ceil(value);
  if (mode === "round") return Math.round(value);
  return value;
}

export function estimateSpeechDuration(
  excerpt: NarrativeSpeechExcerpt,
  policy: SpeechEstimatePolicy,
): SpeechDuration {
  assertSpeechExcerpt(excerpt);
  assertSpeechEstimatePolicy(policy);
  const language = policy.language === "auto" ? detectSpeechEstimateLanguage(excerpt.speech) : policy.language;
  const units = countSpeechEstimateUnits(excerpt.speech, language);
  if (units < 1) throw new Error("NarrativeSpeechExcerpt contains no countable speech units");
  const raw = units / (BASE_RATE[language] * PACE_MULTIPLIER[policy.pace]) + policy.paddingSec;
  const firstClamp = Math.min(policy.maximumSec, Math.max(policy.minimumSec, raw));
  const durationSec = Math.min(policy.maximumSec, Math.max(policy.minimumSec, rounded(firstClamp, policy.rounding)));
  const duration = sealSpeechDuration({
    contract: "svml.speech-duration@1",
    durationSec,
  });
  assertSpeechDurationIdentity(duration);
  return duration;
}

export function resolveSpeechEstimateLanguage(
  text: string,
  requested: SpeechEstimateLanguage,
): ResolvedSpeechEstimateLanguage {
  return requested === "auto" ? detectSpeechEstimateLanguage(text) : requested;
}
