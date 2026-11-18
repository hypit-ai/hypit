function reducedTime(numerator, denominator) {
  let a = numerator;
  let b = denominator;
  while (b !== 0n) [a, b] = [b, a % b];
  return { numerator: numerator / a, denominator: denominator / a };
}

function captionTime(value, label) {
  const base = value?.timeBase;
  if (typeof value?.ticks !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value.ticks)
      || !Number.isSafeInteger(base?.numerator) || base.numerator <= 0
      || !Number.isSafeInteger(base?.denominator) || base.denominator <= 0) {
    throw new Error(`${label} requires non-negative exact time.`);
  }
  return reducedTime(BigInt(value.ticks) * BigInt(base.numerator), BigInt(base.denominator));
}

export function formatCaptionTime(value, label) {
  const time = captionTime(value, label);
  return `${time.numerator}/${time.denominator}`;
}

export function parseCaptionTime(value, label) {
  const match = typeof value === "string" ? /^(\d+)\/([1-9]\d*)$/u.exec(value.trim()) : null;
  if (match === null) throw new Error(`${label} requires non-negative numerator/denominator seconds.`);
  const time = reducedTime(BigInt(match[1]), BigInt(match[2]));
  if (time.denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds the supported exact range.`);
  }
  return { ticks: String(time.numerator), timeBase: { numerator: 1, denominator: Number(time.denominator) } };
}

function compareTime(left, right) {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function validateCaptionUnitTime(unit) {
  const start = captionTime(unit.start, `Caption ${unit.id} start`);
  const end = captionTime(unit.end, `Caption ${unit.id} end`);
  if (compareTime(start, end) > 0) throw new Error(`Caption ${unit.id} start must not follow its end.`);
  return start;
}

/** Equal starts retain display order so the later unit wins a current-mode handoff. */
export function captionUnitsInPlaybackOrder(units) {
  return units.map(unit => ({ unit, start: validateCaptionUnitTime(unit) }))
    .sort((left, right) => compareTime(left.start, right.start))
    .map(({ unit }) => unit);
}
