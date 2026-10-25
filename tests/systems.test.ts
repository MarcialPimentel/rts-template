import { describe, expect, it } from "vitest";
import { GAME } from "../shared/data";
import { applyCommand } from "../shared/sim/commands";
import { forfeit } from "../shared/sim/match";
import { step } from "../shared/sim/step";
import { createWorld, entityList, spawnEntity, type World } from "../shared/sim/world";

const run = (w: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(w);
};
const barracksOf = (w: World, p: number) =>
  entityList(w).find((e) => e.owner === p && e.type === "barracks")!;
const soldiersOf = (w: World, p: number) =>
  entityList(w).filter((e) => e.owner === p && e.type === "soldier");

describe("income", () => {
  it("gives 5 gold per second per Town Hall", () => {
    const w = createWorld();
    run(w, 20);
    expect(w.players[0]!.gold).toBeCloseTo(155);
    expect(w.players[1]!.gold).toBeCloseTo(155);
  });
});

describe("production", () => {
  it("trains a Soldier in 5 seconds and sends it to the rally point", () => {
    const w = createWorld();
    const b = barracksOf(w, 0);
    applyCommand(w, 0, { type: "train", building: b.id, unit: "soldier" });
    run(w, 99);
    expect(soldiersOf(w, 0)).toHaveLength(0);
    run(w, 1);
    const [s] = soldiersOf(w, 0);
    expect(s).toBeDefined();
    expect(b.queue).toEqual([]);
    run(w, 200);
    expect(Math.hypot(s!.x - b.rally!.x, s!.y - b.rally!.y)).toBeLessThan(40);
    expect(s!.order.kind).toBe("idle");
  });

  it("works through the queue one unit at a time", () => {
    const w = createWorld();
    const b = barracksOf(w, 0);
    applyCommand(w, 0, { type: "train", building: b.id, unit: "soldier" });
    applyCommand(w, 0, { type: "train", building: b.id, unit: "soldier" });
    run(w, 100);
    expect(soldiersOf(w, 0)).toHaveLength(1);
    run(w, 100);
    expect(soldiersOf(w, 0)).toHaveLength(2);
  });
});

describe("movement", () => {
  it("moves at 90 px/s toward the ordered point and stops there", () => {
    const w = createWorld();
    const s = spawnEntity(w, 0, "soldier", 1000, 700);
    applyCommand(w, 0, { type: "move", units: [s.id], x: 1180, y: 700 });
    run(w, 20);
    expect(s.x).toBeCloseTo(1090);
    run(w, 40);
    expect(s.x).toBeCloseTo(1180);
    expect(s.order.kind).toBe("idle");
  });

  it("keeps units from stacking on top of each other or inside buildings", () => {
    const w = createWorld();
    const units = Array.from({ length: 8 }, () => spawnEntity(w, 0, "soldier", 1200, 500));
    const hall = entityList(w).find((e) => e.type === "town_hall" && e.owner === 0)!;
    const inside = spawnEntity(w, 0, "soldier", hall.x, hall.y);
    run(w, 30);
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const d = Math.hypot(units[i]!.x - units[j]!.x, units[i]!.y - units[j]!.y);
        expect(d).toBeGreaterThan(15);
      }
    }
    expect(Math.hypot(inside.x - hall.x, inside.y - hall.y)).toBeGreaterThanOrEqual(69);
  });

  it("spreads a group move into a formation that every unit reaches", () => {
    const w = createWorld();
    const units = Array.from({ length: 10 }, (_, i) => spawnEntity(w, 0, "soldier", 800, 300 + i * 25));
    applyCommand(w, 0, { type: "move", units: units.map((u) => u.id), x: 1100, y: 500 });
    run(w, 200);
    for (const u of units) expect(u.order.kind).toBe("idle");
  });
});

describe("targeting and combat", () => {
  it("idle units attack enemies that come into sight", () => {
    const w = createWorld();
    const a = spawnEntity(w, 0, "soldier", 1000, 700);
    const b = spawnEntity(w, 1, "soldier", 1200, 700);
    step(w);
    expect(a.target).toBe(b.id);
    expect(b.target).toBe(a.id);
  });

  it("units on a move order ignore enemies", () => {
    const w = createWorld();
    const a = spawnEntity(w, 0, "soldier", 1000, 700);
    spawnEntity(w, 1, "soldier", 1100, 700);
    applyCommand(w, 0, { type: "move", units: [a.id], x: 1000, y: 100 });
    step(w);
    expect(a.target).toBeNull();
  });

  it("deals 10 damage once per second when in range", () => {
    const w = createWorld();
    const a = spawnEntity(w, 0, "soldier", 1000, 700);
    const b = spawnEntity(w, 1, "soldier", 1040, 700);
    applyCommand(w, 1, { type: "move", units: [b.id], x: 1040, y: 700 });
    applyCommand(w, 0, { type: "attack", units: [a.id], target: b.id });
    run(w, 1);
    expect(b.hp).toBe(90);
    run(w, 19);
    expect(b.hp).toBe(90);
    run(w, 1);
    expect(b.hp).toBe(80);
  });

  it("removes dead entities and clears references to them", () => {
    const w = createWorld();
    const a = spawnEntity(w, 0, "soldier", 1000, 700);
    const b = spawnEntity(w, 1, "soldier", 1040, 700);
    b.hp = 5;
    applyCommand(w, 0, { type: "attack", units: [a.id], target: b.id });
    run(w, 2);
    expect(w.entities[b.id]).toBeUndefined();
    expect(a.target).toBeNull();
    expect(a.order.kind).toBe("idle");
  });

  it("attack-moving units stop to fight, then continue", () => {
    const w = createWorld();
    const a = spawnEntity(w, 0, "soldier", 900, 700);
    const b = spawnEntity(w, 1, "soldier", 1100, 700);
    b.hp = 10;
    applyCommand(w, 0, { type: "attack_move", units: [a.id], x: 1500, y: 700 });
    run(w, 200);
    expect(w.entities[b.id]).toBeUndefined();
    expect(a.x).toBeGreaterThan(1400);
  });
});

describe("win check", () => {
  it("ends the match when a Town Hall is destroyed", () => {
    const w = createWorld();
    const hall = entityList(w).find((e) => e.type === "town_hall" && e.owner === 1)!;
    hall.hp = 0;
    step(w);
    expect(w.status).toBe("ended");
    expect(w.winner).toBe(0);
    expect(w.endReason).toBe("headquarters_destroyed");
  });

  it("forfeit ends the match for the other player", () => {
    const w = createWorld();
    forfeit(w, 0);
    expect(w.status).toBe("ended");
    expect(w.winner).toBe(1);
    expect(w.endReason).toBe("forfeit");
  });

  it("is deterministic: the same commands give the same world", () => {
    const play = () => {
      const w = createWorld();
      const b0 = barracksOf(w, 0);
      const b1 = barracksOf(w, 1);
      for (let t = 0; t < 1500; t++) {
        if (t % 200 === 0) {
          applyCommand(w, 0, { type: "train", building: b0.id, unit: "soldier" });
          applyCommand(w, 1, { type: "train", building: b1.id, unit: "soldier" });
        }
        if (t === 1000) {
          const ids = soldiersOf(w, 0).map((s) => s.id);
          if (ids.length) applyCommand(w, 0, { type: "attack_move", units: ids, x: 2000, y: 500 });
        }
        step(w, [], GAME);
      }
      return JSON.stringify(w);
    };
    expect(play()).toBe(play());
  });
});
