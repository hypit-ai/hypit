import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import { runMediaProcessLines } from "./process.js";

export type LocalVideoFrameIndex = {
  readonly width: number;
  readonly height: number;
  readonly timestamps: readonly bigint[];
  readonly timeBase: { readonly numerator: bigint; readonly denominator: bigint };
};

export async function indexLocalVideoFrames(input: {
  readonly address: string;
  readonly stream: number;
  readonly ffprobePath?: string;
  readonly signal?: AbortSignal;
}): Promise<LocalVideoFrameIndex> {
  const timestamps: bigint[] = [];
  let width = 0;
  let height = 0;
  let timeBase: LocalVideoFrameIndex["timeBase"] | undefined;
  await runMediaProcessLines({
    executable: input.ffprobePath ?? "ffprobe",
    argv: ["-v", "error", "-select_streams", String(input.stream),
      "-show_entries", "stream=index,width,height,time_base:frame=best_effort_timestamp",
      "-of", "compact=print_section=1:nokey=0", input.address],
    timeoutMs: 120_000,
    maxLineBytes: 8192,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    onLine(line) {
      const frame = /^frame\|best_effort_timestamp=(-?\d+)(?:\||side_data\||$)/u.exec(line);
      if (frame !== null) {
        const tick = BigInt(frame[1]!);
        const previous = timestamps.at(-1);
        if (previous !== undefined && tick < previous) throw new Error("Selected Media frames have unordered presentation timestamps.");
        if (timestamps.length >= 3_000_000) throw new Error("Selected Media frame index exceeds the local bound.");
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
  return { width, height, timestamps, timeBase };
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
