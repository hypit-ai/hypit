import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import { runMediaProcessLines } from "./process.js";

export type LocalVideoFrameIndex = {
  readonly width: number;
  readonly height: number;
  readonly timestamps: readonly bigint[];
  readonly keyframes: readonly number[];
  readonly timeBase: { readonly numerator: bigint; readonly denominator: bigint };
};

export async function indexLocalVideoFrames(input: {
  readonly address: string;
  readonly stream: number;
  readonly ffprobePath?: string;
  readonly signal?: AbortSignal;
}): Promise<LocalVideoFrameIndex> {
  const timestamps: bigint[] = [];
  const keyframes: number[] = [];
  let width = 0;
  let height = 0;
  let timeBase: LocalVideoFrameIndex["timeBase"] | undefined;
  await runMediaProcessLines({
    executable: input.ffprobePath ?? "ffprobe",
    argv: ["-v", "error", "-select_streams", String(input.stream),
      "-show_entries", "stream=index,width,height,time_base:frame=key_frame,best_effort_timestamp",
      "-of", "compact=print_section=1:nokey=0", input.address],
    timeoutMs: 120_000,
    maxLineBytes: 8192,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    onLine(line) {
      const frame = /^frame\|key_frame=([01])\|best_effort_timestamp=(-?\d+)(?:\||side_data\||$)/u.exec(line);
      if (frame !== null) {
        const tick = BigInt(frame[2]!);
        const previous = timestamps.at(-1);
        if (previous !== undefined && tick < previous) throw new Error("Selected Media frames have unordered presentation timestamps.");
        if (timestamps.length >= 3_000_000) throw new Error("Selected Media frame index exceeds the local bound.");
        if (frame[1] === "1") keyframes.push(timestamps.length);
        timestamps.push(tick);
        return;
      }
      if (line.startsWith("frame|")) throw new Error("Selected Media frame has no presentation timestamp.");
      if (!line.startsWith("stream|")) return;
      const fields = new Map(line.split("|").slice(1).map(field => {
        const offset = field.indexOf("=");
        return [field.slice(0, offset), field.slice(offset + 1)] as const;
      }));
      if (Number(fields.get("index")) !== input.stream) return;
      width = Number(fields.get("width"));
      height = Number(fields.get("height"));
      const base = /^([1-9]\d*)\/([1-9]\d*)$/u.exec(fields.get("time_base") ?? "");
      if (base !== null) timeBase = { numerator: BigInt(base[1]!), denominator: BigInt(base[2]!) };
    },
  });
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1
    || timeBase === undefined || timestamps.length === 0) {
    throw new Error(`Selected Media stream ${input.stream} has no usable frame index.`);
  }
  return { width, height, timestamps, keyframes, timeBase };
}

/** Select by exact container timestamp. Source-local callers add the accepted stream presentation start. */
export function localVideoFrameOrdinal(
  index: LocalVideoFrameIndex,
  position: ExactTemporalValue,
  side: "before" | "after",
  reconstruction: "sided" | "nearest" = "sided",
  origin?: ExactTemporalValue,
): number {
  const targetNumerator = BigInt(position.ticks) * BigInt(position.timeBase.numerator);
  const targetDenominator = BigInt(position.timeBase.denominator);
  const originNumerator = origin === undefined ? 0n : BigInt(origin.ticks) * BigInt(origin.timeBase.numerator);
  const originDenominator = origin === undefined ? 1n : BigInt(origin.timeBase.denominator);
  const numerator = targetNumerator * originDenominator + originNumerator * targetDenominator;
  const denominator = targetDenominator * originDenominator;
  const comparison = (i: number) => index.timestamps[i]! * index.timeBase.numerator * denominator
    - numerator * index.timeBase.denominator;
  let low = 0;
  let high = index.timestamps.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const order = comparison(middle);
    if (order < 0n || (order === 0n && side === "after" && reconstruction === "sided")) low = middle + 1;
    else high = middle;
  }
  const lower = Math.max(0, low - 1);
  if (reconstruction === "nearest") {
    const upper = Math.min(index.timestamps.length - 1, low);
    const distance = (i: number) => {
      const order = comparison(i);
      return order < 0n ? -order : order;
    };
    return distance(lower) <= distance(upper) ? lower : upper;
  }
  return lower;
}

/** Select by absolute PTS after a keyframe seek and independently check the decoded timestamps. */
export function planLocalVideoFrameSeek(index: LocalVideoFrameIndex, ordinals: readonly number[]): {
  readonly inputArgs: readonly string[];
  readonly selection: string;
  observe(line: string): void;
  verified(): boolean;
} | undefined {
  const first = ordinals[0];
  if (first === undefined || ordinals.some((ordinal, i) => !Number.isSafeInteger(ordinal)
    || ordinal < 0 || ordinal >= index.timestamps.length || (i > 0 && ordinal <= ordinals[i - 1]!))) return undefined;
  let low = 0;
  let high = index.keyframes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (index.keyframes[middle]! <= first) low = middle + 1;
    else high = middle;
  }
  // Begin one GOP earlier so an open GOP has its preceding reference pictures.
  const anchor = index.keyframes[low - 2];
  if (anchor === undefined || anchor < 48) return undefined;
  const target = ordinals.map(ordinal => index.timestamps[ordinal]!);
  if (ordinals.some((ordinal, i) => {
    const pts = target[i]!;
    return pts < -BigInt(Number.MAX_SAFE_INTEGER) || pts > BigInt(Number.MAX_SAFE_INTEGER)
      || index.timestamps[ordinal - 1] === pts || index.timestamps[ordinal + 1] === pts;
  })) return undefined;

  const micros = index.timestamps[anchor]! * index.timeBase.numerator * 1_000_000n / index.timeBase.denominator;
  if (micros <= 0n) return undefined;
  const seek = `${micros / 1_000_000n}.${String(micros % 1_000_000n).padStart(6, "0")}`;
  const selection = target.every((pts, i) => i === 0 || index.timestamps[ordinals[i - 1]! + 1] === pts)
    ? `between(pts\\,${target[0]}\\,${target.at(-1)})`
    : target.map(pts => `eq(pts\\,${pts})`).join("+");
  let base: LocalVideoFrameIndex["timeBase"] | undefined;
  let matched = 0;
  let mismatch = false;
  return {
    // Keep native timestamps after the demuxer seek. The selector performs the exact cut.
    inputArgs: ["-copyts", "-seek_timestamp", "1", "-ss", seek, "-noaccurate_seek",
      "-xerror", "-err_detect", "explode"],
    selection,
    observe(line) {
      if (!line.includes("Parsed_showinfo")) return;
      const configuration = /config in time_base: (\d+)\/(\d+)/u.exec(line);
      if (configuration !== null) {
        base = { numerator: BigInt(configuration[1]!), denominator: BigInt(configuration[2]!) };
        return;
      }
      const frame = /\bn:\s*\d+\s+pts:\s*(-?\d+)/u.exec(line);
      if (frame === null) return;
      const expected = target[matched++];
      if (expected === undefined || base === undefined
        || BigInt(frame[1]!) * base.numerator * index.timeBase.denominator
          !== expected * index.timeBase.numerator * base.denominator) mismatch = true;
    },
    verified: () => !mismatch && matched === target.length,
  };
}
