import { describe, expect, it } from "vitest";
import { GAME, compileGame } from "../shared/data";
import { POC_GAME } from "../shared/data/poc";

describe("game data", () => {
  it("converts seconds and per-second rates to ticks", () => {
    const soldier = GAME.defs["soldier"]!;
    expect(soldier.buildTicks).toBe(100); // 5 s
    expect(soldier.speedPerTick).toBeCloseTo(4.5); // 90 px/s
    expect(soldier.attack?.intervalTicks).toBe(20); // 1 s
    expect(GAME.defs["town_hall"]!.incomePerTick).toBeCloseTo(0.25); // 5 gold/s
  });

  it("matches the GDD's PoC stats", () => {
    expect(GAME.defs["town_hall"]!.hp).toBe(2000);
    expect(GAME.defs["barracks"]!.hp).toBe(1000);
    expect(GAME.defs["barracks"]!.queueMax).toBe(5);
    expect(GAME.defs["soldier"]!.cost).toBe(50);
    expect(GAME.economy).toEqual({ startingGold: 150, unitCap: 30 });
  });

  it("gives both players a headquarters on a mirrored map", () => {
    expect(GAME.map.bases).toHaveLength(2);
    const [a, b] = GAME.map.bases;
    expect(a!.entities.length).toBe(b!.entities.length);
    a!.entities.forEach((e, i) => {
      expect(b!.entities[i]!.x).toBe(GAME.map.width - e.x);
      expect(b!.entities[i]!.y).toBe(e.y);
    });
    expect(a!.entities.some((e) => GAME.defs[e.type]?.isHeadquarters)).toBe(true);
  });

  it("rejects a building that produces an unknown type", () => {
    const bad = structuredClone(POC_GAME);
    bad.defs[1]!.produces = ["dragon"];
    expect(() => compileGame(bad)).toThrow(/unknown type/);
  });
});
