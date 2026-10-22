export function toIsoNow(): string {
  return new Date().toISOString();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function nextDailyUtcIso(cronHourUtc: number, nowMs = Date.now()): string {
  const now = new Date(nowMs);
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(cronHourUtc);

  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next.toISOString();
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
