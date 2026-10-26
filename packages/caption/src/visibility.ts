import type { FrameSpan } from "@hypit/timeline";
import type { CaptionProgram } from "./types.js";

/** Later Uses replace this Cue's presentation inside their windows, including Hidden. */
export function captionUseVisibility(program: CaptionProgram, index: number, role: string | undefined, envelope: FrameSpan): FrameSpan[] {
  const use = program.uses[index]!;
  if (use.role !== undefined && use.role !== role) return [];
  const startFrame = Math.max(envelope.startFrame, use.window?.span.startFrame ?? envelope.startFrame);
  const endFrameExclusive = Math.min(envelope.endFrameExclusive, use.window?.span.endFrameExclusive ?? envelope.endFrameExclusive);
  let visible = endFrameExclusive > startFrame ? [{ startFrame, endFrameExclusive }] : [];
  for (const later of program.uses.slice(index + 1)) {
    if (later.role !== undefined && later.role !== role) continue;
    const cut = later.window?.span ?? envelope;
    visible = visible.flatMap(span => {
      if (cut.startFrame >= span.endFrameExclusive || cut.endFrameExclusive <= span.startFrame) return [span];
      return [
        ...(cut.startFrame > span.startFrame ? [{ startFrame: span.startFrame, endFrameExclusive: cut.startFrame }] : []),
        ...(cut.endFrameExclusive < span.endFrameExclusive ? [{ startFrame: cut.endFrameExclusive, endFrameExclusive: span.endFrameExclusive }] : []),
      ];
    });
  }
  return visible;
}
