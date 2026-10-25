import { describe, expect, it } from "vitest";
import { TICKS_PER_SECOND, perSecondToPerTick, secondsToTicks } from "../shared/sim/constants";

describe("tick constants", () => {
  it("runs at 20 ticks per second", () => {
    expect(TICKS_PER_SECOND).toBe(20);
  });

  it("converts seconds and rates to ticks", () => {
    expect(secondsToTicks(5)).toBe(100);
    expect(secondsToTicks(1)).toBe(20);
    expect(perSecondToPerTick(90)).toBeCloseTo(4.5);
  });
});
