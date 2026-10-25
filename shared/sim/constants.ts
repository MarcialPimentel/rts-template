/** Simulation timing. GDD rule: fixed 50 ms tick, 20 ticks per second. */
export const TICK_MS = 50;
export const TICKS_PER_SECOND = 1000 / TICK_MS;

/** Converts a duration in seconds (as written in data files) to whole ticks. */
export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICKS_PER_SECOND));
}

/** Converts a per-second rate (speed, income) to a per-tick rate. */
export function perSecondToPerTick(perSecond: number): number {
  return perSecond / TICKS_PER_SECOND;
}
