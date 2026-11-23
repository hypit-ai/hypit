export function assertUtcTimestamp(value: unknown, subject: string): asserts value is string {
  const milliseconds = typeof value === "string" && value.length === 24 ? Date.parse(value) : NaN;
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`${subject} must be a UTC timestamp in YYYY-MM-DDTHH:mm:ss.sssZ format.`);
  }
}
