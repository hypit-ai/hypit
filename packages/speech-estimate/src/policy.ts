import { sealSpeechEstimatePolicy } from "./program.js";
import type {
  SpeechEstimateLanguage,
  SpeechEstimatePace,
  SpeechEstimatePolicy,
  SpeechEstimateRounding,
} from "./types.js";

const POLICY_PROPERTIES = ["language", "pace", "rate", "rounding", "padding"] as const;

/** CLI option names accepted by the local speech estimator. */
export const speechEstimatePolicyProperties: readonly string[] = POLICY_PROPERTIES;

function policyFrom(
  properties: Readonly<Record<string, unknown>>,
  subject: string,
): SpeechEstimatePolicy {
  const allowed = new Set<string>(POLICY_PROPERTIES);
  const unknown = Object.keys(properties).filter((name) => !allowed.has(name));
  if (unknown.length > 0) throw new Error(`${subject} contains unknown property ${unknown[0]}`);
  const missing = ["language", "rounding"].filter((name) => properties[name] === undefined);
  if (missing.length > 0) throw new Error(`${subject} requires ${missing.join(", ")}`);
  const string = (name: string): string => {
    const value = properties[name];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${subject}.${name} must be a non-empty string`);
    }
    return value.trim();
  };
  const finite = (name: string): number => {
    const raw = properties[name];
    const value = typeof raw === "string" ? Number(raw) : raw;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${subject}.${name} must be a finite number`);
    }
    return value;
  };
  const pace = properties.pace;
  const rate = properties.rate;
  if ((pace !== undefined) === (rate !== undefined)) {
    throw new Error(`${subject} requires exactly one of pace or rate`);
  }
  const common = {
    language: string("language") as SpeechEstimateLanguage,
    rounding: string("rounding") as SpeechEstimateRounding,
    ...(properties.padding !== undefined ? { paddingSec: finite("padding") } : {}),
  } as const;
  return rate === undefined
    ? sealSpeechEstimatePolicy({ ...common, pace: string("pace") as SpeechEstimatePace })
    : sealSpeechEstimatePolicy({ ...common, rate: finite("rate") });
}

/** CLI strings are decoded into one local estimate policy; the policy never enters AuthorGraph. */
export function speechEstimatePolicyFromAttributes(
  attributes: Readonly<Record<string, unknown>>,
  subject: string,
): SpeechEstimatePolicy {
  const present = Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== undefined));
  return policyFrom(present, subject);
}
