const anchors = ["start", "center", "end"];

function anchorValue(box, axis, anchor) {
  const start = axis === "x" ? box.x : box.y;
  const size = axis === "x" ? box.width : box.height;
  return anchor === "start" ? start : anchor === "center" ? start + size / 2 : start + size;
}

function resolveAxis(subject, targets, axis, zoom, active) {
  const enterTolerance = 5 / zoom;
  const releaseTolerance = 8 / zoom;
  if (active) {
    const target = targets.find(box => box.id === active.targetId);
    if (target) {
      const offset = anchorValue(target, axis, active.targetAnchor)
        - anchorValue(subject, axis, active.subjectAnchor);
      if (Math.abs(offset) <= releaseTolerance) return { ...active, offset };
    }
  }
  let best;
  for (const subjectAnchor of anchors) {
    const value = anchorValue(subject, axis, subjectAnchor);
    for (const target of targets) for (const targetAnchor of anchors) {
      const offset = anchorValue(target, axis, targetAnchor) - value;
      const rank = Math.abs(offset) + (subjectAnchor === targetAnchor ? 0 : 1e-6);
      const bestRank = best === undefined ? Infinity
        : Math.abs(best.offset) + (best.subjectAnchor === best.targetAnchor ? 0 : 1e-6);
      if (Math.abs(offset) <= enterTolerance && rank < bestRank) {
        best = { axis, subjectAnchor, targetId: target.id, targetAnchor, offset };
      }
    }
  }
  return best;
}

function guideFor(relation, subject, target) {
  const across = relation.axis === "x" ? "y" : "x";
  const coordinate = anchorValue(target, relation.axis, relation.targetAnchor);
  const subjectStart = anchorValue(subject, across, "start");
  const subjectEnd = anchorValue(subject, across, "end");
  const targetStart = anchorValue(target, across, "start");
  const targetEnd = anchorValue(target, across, "end");
  let start;
  let end;
  if (relation.subjectAnchor === "center" && relation.targetAnchor === "center") {
    const a = anchorValue(subject, across, "center");
    const b = anchorValue(target, across, "center");
    start = Math.min(a, b);
    end = Math.max(a, b);
  } else if (subjectStart > targetEnd) {
    start = targetEnd;
    end = subjectStart;
  } else if (targetStart > subjectEnd) {
    start = subjectEnd;
    end = targetStart;
  } else {
    start = Math.min(subjectStart, targetStart);
    end = Math.max(subjectEnd, targetEnd);
  }
  return { axis: relation.axis, coordinate, start, end };
}

function alignedRelations(subject, targets, axis) {
  const relations = [];
  for (const subjectAnchor of anchors) {
    const value = anchorValue(subject, axis, subjectAnchor);
    for (const target of targets) for (const targetAnchor of anchors) {
      const offset = anchorValue(target, axis, targetAnchor) - value;
      if (Math.abs(offset) <= 1e-6) {
        relations.push({ axis, subjectAnchor, targetId: target.id, targetAnchor, offset: 0 });
      }
    }
  }
  return relations;
}

function mergeGuides(guides) {
  const merged = new Map();
  for (const guide of guides) {
    const key = `${guide.axis}\u0000${guide.coordinate.toFixed(6)}`;
    const current = merged.get(key);
    merged.set(key, current === undefined ? guide : {
      ...guide,
      start: Math.min(current.start, guide.start),
      end: Math.max(current.end, guide.end),
    });
  }
  return [...merged.values()];
}

/** Align one moving box to the starts, centres and ends of stationary boxes in screen-pixel tolerances. */
export function resolveCanvasSnap(subject, targets, zoom, state = {}) {
  const x = resolveAxis(subject, targets, "x", zoom, state.x);
  const y = resolveAxis(subject, targets, "y", zoom, state.y);
  const moved = { ...subject, x: subject.x + (x?.offset ?? 0), y: subject.y + (y?.offset ?? 0) };
  const relations = [
    ...(x === undefined ? [] : alignedRelations(moved, targets, "x")),
    ...(y === undefined ? [] : alignedRelations(moved, targets, "y")),
  ];
  const guides = mergeGuides(relations.flatMap(relation => {
    const target = targets.find(box => box.id === relation.targetId);
    return target ? [guideFor(relation, moved, target)] : [];
  }));
  return { x: moved.x, y: moved.y, guides, state: { x, y } };
}

function boxesOverlap(a, b, gap) {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

/** Find the closest unobstructed card position, preferring positions visible in the current viewport. */
export function findOpenCanvasPosition(subject, targets, viewport, gap = 40) {
  const stepX = subject.width + gap;
  const stepY = subject.height + gap;
  const candidates = [{ x: subject.x, y: subject.y, order: 0 }];
  let order = 1;
  for (let ring = 1; ring <= 8; ring += 1) {
    const offsets = [
      [ring, 0], [-ring, 0], [0, ring], [0, -ring],
      [ring, ring], [-ring, ring], [ring, -ring], [-ring, -ring],
    ];
    for (let index = 1; index < ring; index += 1) {
      offsets.push(
        [ring, index], [ring, -index], [-ring, index], [-ring, -index],
        [index, ring], [-index, ring], [index, -ring], [-index, -ring],
      );
    }
    for (const [offsetX, offsetY] of offsets) {
      candidates.push({
        x: subject.x + offsetX * stepX,
        y: subject.y + offsetY * stepY,
        order: order++,
      });
    }
  }
  const overflow = candidate => {
    if (!viewport) return 0;
    return Math.max(0, viewport.left - candidate.x)
      + Math.max(0, candidate.x + subject.width - viewport.right)
      + Math.max(0, viewport.top - candidate.y)
      + Math.max(0, candidate.y + subject.height - viewport.bottom);
  };
  candidates.sort((a, b) => {
    const overflowDifference = overflow(a) - overflow(b);
    if (overflowDifference !== 0) return overflowDifference;
    const distanceA = ((a.x - subject.x) / stepX) ** 2 + ((a.y - subject.y) / stepY) ** 2;
    const distanceB = ((b.x - subject.x) / stepX) ** 2 + ((b.y - subject.y) / stepY) ** 2;
    return distanceA - distanceB || a.order - b.order;
  });
  const available = candidates.find(candidate => !targets.some(target => boxesOverlap(
    { ...candidate, width: subject.width, height: subject.height },
    target,
    gap,
  )));
  return available === undefined
    ? { x: subject.x, y: subject.y }
    : { x: available.x, y: available.y };
}
