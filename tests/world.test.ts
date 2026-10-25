import { describe, expect, it } from "vitest";
import { GAME } from "../shared/data";
import { step } from "../shared/sim/step";
import { createWorld, entityList, spawnEntity } from "../shared/sim/world";

describe("world state", () => {
  it("starts each player with their base and starting gold", () => {
    const world = createWorld();
    expect(world.players.map((p) => p.gold)).toEqual([150, 150]);
    for (const p of [0, 1]) {
      const types = entityList(world)
        .filter((e) => e.owner === p)
        .map((e) => e.type)
        .sort();
      expect(types).toEqual(["barracks", "town_hall"]);
    }
    const barracks = entityList(world).find((e) => e.type === "barracks" && e.owner === 0)!;
    expect(barracks.rally).toEqual(GAME.map.bases[0]!.rally);
  });

  it("assigns increasing ids and never reuses them", () => {
    const world = createWorld();
    const a = spawnEntity(world, 0, "soldier", 10, 10);
    delete world.entities[a.id];
    const b = spawnEntity(world, 0, "soldier", 10, 10);
    expect(b.id).toBeGreaterThan(a.id);
  });

  it("is plain serializable data", () => {
    const world = createWorld();
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
  });

  it("advances one tick per step and stops once ended", () => {
    const world = createWorld();
    step(world);
    step(world);
    expect(world.tick).toBe(2);
    world.status = "ended";
    step(world);
    expect(world.tick).toBe(2);
  });
});
