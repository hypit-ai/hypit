export type SourceRange = {
  start: number;
  end: number;
};

export type SourceDisplayEntry<Line> =
  | {
      key: string;
      kind: "line";
      index: number;
      line: Line;
    }
  | {
      key: string;
      kind: "fold";
      index: number;
      line: null;
    };

type SourceWindowOptions = SourceRange & {
  focus: number;
  alignment: "start" | "end";
  rowBudget: number;
  rowSpans: readonly number[];
  totalLines: number;
};

type FoldedSourceViewOptions<Line> = {
  lines: readonly Line[];
  rowSpans: readonly number[];
  rowBudget: number;
  topRanges: readonly SourceRange[];
  topFocus: number;
  bottomLine: number;
};

function sourceRowSpan(rowSpans: readonly number[], index: number) {
  return rowSpans[index] ?? 1;
}

function sourceRowsSpan(rowSpans: readonly number[], indices: readonly number[]) {
  return indices.reduce((sum, index) => sum + sourceRowSpan(rowSpans, index), 0);
}

function fitSourceWindow({
  start,
  end,
  focus,
  alignment,
  rowBudget,
  rowSpans,
  totalLines,
}: SourceWindowOptions) {
  const spanOf = (indices: readonly number[]) => sourceRowsSpan(rowSpans, indices);
  const fillBefore = (indices: number[], minimum: number) => {
    let before = indices[0] - 1;
    while (before >= minimum && spanOf(indices) + sourceRowSpan(rowSpans, before) <= rowBudget) {
      indices.unshift(before);
      before -= 1;
    }
  };
  const fillAfter = (indices: number[], maximum: number) => {
    let after = indices[indices.length - 1] + 1;
    while (after <= maximum && spanOf(indices) + sourceRowSpan(rowSpans, after) <= rowBudget) {
      indices.push(after);
      after += 1;
    }
  };
  const fill = (indices: number[], minimum: number, maximum: number) => {
    if (alignment === "end") {
      fillBefore(indices, minimum);
      fillAfter(indices, maximum);
    } else {
      fillAfter(indices, maximum);
      fillBefore(indices, minimum);
    }
    return indices;
  };
  const fullRange = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);

  if (spanOf(fullRange) <= rowBudget) {
    return fill(fullRange, 0, totalLines - 1);
  }

  const center = Math.max(start, Math.min(end, focus));
  return fill([center], start, end);
}

function pickFittingSourceRange<Range extends SourceRange>(
  ranges: readonly Range[],
  rowSpans: readonly number[],
  rowBudget: number,
) {
  return ranges.find((range) => {
    const indices = Array.from(
      { length: range.end - range.start + 1 },
      (_, offset) => range.start + offset,
    );
    return sourceRowsSpan(rowSpans, indices) <= rowBudget;
  }) ?? ranges.at(-1);
}

export function buildFullSourceView<Line>(lines: readonly Line[]): SourceDisplayEntry<Line>[] {
  return lines.map((line, index) => ({ key: `line-${index}`, kind: "line", index, line }));
}

export function buildFoldedSourceView<Line>({
  lines,
  rowSpans,
  rowBudget,
  topRanges,
  topFocus,
  bottomLine,
}: FoldedSourceViewOptions<Line>): SourceDisplayEntry<Line>[] {
  const selectedRange = pickFittingSourceRange(topRanges, rowSpans, rowBudget);
  const top = fitSourceWindow({
    start: selectedRange?.start ?? topFocus,
    end: selectedRange?.end ?? topFocus,
    focus: topFocus,
    alignment: "end",
    rowBudget,
    rowSpans,
    totalLines: lines.length,
  });
  const bottom = fitSourceWindow({
    start: bottomLine,
    end: bottomLine,
    focus: bottomLine,
    alignment: "start",
    rowBudget,
    rowSpans,
    totalLines: lines.length,
  });
  const lineEntry = (index: number): SourceDisplayEntry<Line> => ({
    key: `line-${index}`,
    kind: "line",
    index,
    line: lines[index],
  });

  const topIndices = new Set(top);
  const remainingBottom = bottom.filter((index) => !topIndices.has(index));
  const lastTop = top.at(-1) ?? -1;
  const firstBottom = remainingBottom[0] ?? lines.length;
  const hasFold = firstBottom > lastTop + 1;

  return [
    ...top.map(lineEntry),
    ...(hasFold ? [{
      key: `fold-${top.at(-1)}-${bottom[0]}`,
      kind: "fold" as const,
      index: Math.floor(((top.at(-1) ?? 0) + (bottom[0] ?? lines.length - 1)) / 2),
      line: null,
    }] : []),
    ...remainingBottom.map(lineEntry),
  ];
}
