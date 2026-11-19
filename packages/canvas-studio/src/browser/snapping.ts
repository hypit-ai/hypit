/**
 * Alignment snapping while nodes move: the start, centre and end of each moving node snap to those of other nodes
 * within 5 screen pixels, and an active alignment holds until the node is 8 screen pixels away.
 */
export type SnapBox = { id: string; x: number; y: number; width: number; height: number };
export type SnapAnchor = 'start' | 'center' | 'end';
export type SnapAxis = 'x' | 'y';
export type SnapRelation = { axis: SnapAxis; subjectId: string; subjectAnchor: SnapAnchor; targetId: string; targetAnchor: SnapAnchor; offset: number };
export type SnapGuide = { id: string; axis: SnapAxis; coordinate: number; start: number; end: number };
export type SnapState = { x?: SnapRelation; y?: SnapRelation };

const anchors: SnapAnchor[] = ['start', 'center', 'end'];
const enterTolerance = 5, releaseTolerance = 8;

function anchorValue(box: SnapBox, axis: SnapAxis, anchor: SnapAnchor) {
  const start = axis === 'x' ? box.x : box.y, size = axis === 'x' ? box.width : box.height;
  return anchor === 'start' ? start : anchor === 'center' ? start + size / 2 : start + size;
}

function relationsAt(subjects: SnapBox[], targets: SnapBox[], axis: SnapAxis, offset: number): SnapRelation[] {
  const found: SnapRelation[] = [];
  for (const subject of subjects) for (const subjectAnchor of anchors) {
    const value = anchorValue(subject, axis, subjectAnchor) + offset;
    for (const target of targets) for (const targetAnchor of anchors)
      if (Math.abs(anchorValue(target, axis, targetAnchor) - value) <= 1e-6) found.push({ axis, subjectId: subject.id, subjectAnchor, targetId: target.id, targetAnchor, offset });
  }
  return found;
}

function resolveAxis(subjects: SnapBox[], targets: SnapBox[], axis: SnapAxis, zoom: number, active?: SnapRelation): SnapRelation | undefined {
  if (active) {
    const subject = subjects.find(box => box.id === active.subjectId), target = targets.find(box => box.id === active.targetId);
    if (subject && target) {
      const offset = anchorValue(target, axis, active.targetAnchor) - anchorValue(subject, axis, active.subjectAnchor);
      if (Math.abs(offset) <= releaseTolerance / zoom) return { ...active, offset };
    }
  }
  let best: SnapRelation | undefined;
  for (const subject of subjects) for (const subjectAnchor of anchors) {
    const value = anchorValue(subject, axis, subjectAnchor);
    for (const target of targets) for (const targetAnchor of anchors) {
      const offset = anchorValue(target, axis, targetAnchor) - value;
      // Same-anchor alignments win a tie, so edges align with edges before an edge meets a centre.
      const rank = Math.abs(offset) + (subjectAnchor === targetAnchor ? 0 : 1e-6);
      if (Math.abs(offset) <= enterTolerance / zoom && (!best || rank < Math.abs(best.offset) + (best.subjectAnchor === best.targetAnchor ? 0 : 1e-6)))
        best = { axis, subjectId: subject.id, subjectAnchor, targetId: target.id, targetAnchor, offset };
    }
  }
  return best;
}

/** Each guide runs along the aligned coordinate across both nodes: between centres, across the gap, or over their union. */
function guideFor(relation: SnapRelation, subject: SnapBox, target: SnapBox): SnapGuide {
  const across: SnapAxis = relation.axis === 'x' ? 'y' : 'x';
  const coordinate = anchorValue(target, relation.axis, relation.targetAnchor);
  let start: number, end: number;
  if (relation.subjectAnchor === 'center' && relation.targetAnchor === 'center') {
    const a = anchorValue(subject, across, 'center'), b = anchorValue(target, across, 'center');
    start = Math.min(a, b); end = Math.max(a, b);
  } else {
    const subjectStart = anchorValue(subject, across, 'start'), subjectEnd = anchorValue(subject, across, 'end');
    const targetStart = anchorValue(target, across, 'start'), targetEnd = anchorValue(target, across, 'end');
    [start, end] = subjectStart > targetEnd ? [targetEnd, subjectStart] : targetStart > subjectEnd ? [subjectEnd, targetStart]
      : [Math.min(subjectStart, targetStart), Math.max(subjectEnd, targetEnd)];
  }
  return { id: `${relation.axis}:${coordinate}:${start}:${end}`, axis: relation.axis, coordinate, start, end };
}

export function resolveSnap(subjects: SnapBox[], targets: SnapBox[], zoom: number, state: SnapState) {
  const x = resolveAxis(subjects, targets, 'x', zoom, state.x), y = resolveAxis(subjects, targets, 'y', zoom, state.y);
  const offset = { x: x?.offset ?? 0, y: y?.offset ?? 0 };
  const moved = subjects.map(box => ({ ...box, x: box.x + offset.x, y: box.y + offset.y }));
  const guides = new Map<string, SnapGuide>();
  for (const relation of [...(x ? relationsAt(subjects, targets, 'x', offset.x) : []), ...(y ? relationsAt(subjects, targets, 'y', offset.y) : [])]) {
    const subject = moved.find(box => box.id === relation.subjectId), target = targets.find(box => box.id === relation.targetId);
    if (!subject || !target) continue;
    const guide = guideFor(relation, subject, target);
    const same = [...guides.values()].find(item => item.axis === guide.axis && item.coordinate === guide.coordinate && item.start <= guide.end && guide.start <= item.end);
    if (same) { guides.delete(same.id); const merged = { ...same, start: Math.min(same.start, guide.start), end: Math.max(same.end, guide.end) }; guides.set(merged.id, merged); }
    else guides.set(guide.id, guide);
  }
  return { offset, guides: [...guides.values()], state: { x, y } as SnapState };
}
