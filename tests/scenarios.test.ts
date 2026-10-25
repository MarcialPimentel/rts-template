/**
 * Whole-game scenarios from the GDD's Testing section. Each builds a world, feeds commands,
 * runs ticks and checks the outcome, exactly as the server would.
 */
import { describe, expect, it } from "vitest";
import { applyCommand, type PlayerCommand } from "../shared/sim/commands";
import { TICKS_PER_SECOND } from "../shared/sim/constants";
import { step } from "../shared/sim/step";
import { createWorld, entityList, spawnEntity, type World } from "../shared/sim/world";

const run = (w: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(w);
};
const soldiersOf = (w: World, p: number) =>
  entityList(w).filter((e) => e.owner === p && e.type === "soldier");

describe("GDD scenarios", () => {
  it("10 Soldiers beat 5", () => {
    const w = createWorld();
    for (let i = 0; i < 10; i++) spawnEntity(w, 0, "soldier", 1000, 400 + i * 22);
    for (let i = 0; i < 5; i++) spawnEntity(w, 1, "soldier", 1150, 450 + i * 22);
    run(w, 60 * TICKS_PER_SECOND);
    expect(soldiersOf(w, 1)).toHaveLength(0);
    expect(soldiersOf(w, 0).length).toBeGreaterThan(0);
  });

  it("a train command without enough gold is rejected", () => {
    const w = createWorld();
    w.players[0]!.gold = 10;
    const b = entityList(w).find((e) => e.owner === 0 && e.type === "barracks")!;
    expect(applyCommand(w, 0, { type: "train", building: b.id, unit: "soldier" })).toBe(false);
  });

  it("commands for another player's units are ignored", () => {
    const w = createWorld();
    const theirs = spawnEntity(w, 1, "soldier", 1500, 500);
    step(w, [{ player: 0, command: { type: "move", units: [theirs.id], x: 100, y: 100 } }]);
    expect(theirs.order.kind).toBe("idle");
  });

  it("a full match played through commands ends with the attacker winning", () => {
    const w = createWorld();
    const barracks = entityList(w).find((e) => e.owner === 0 && e.type === "barracks")!;
    const maxTicks = 15 * 60 * TICKS_PER_SECOND;
    while (w.status === "playing" && w.tick < maxTicks) {
      const commands: PlayerCommand[] = [];
      // Player 0 keeps training and sends everyone at the enemy base every 20 seconds.
      if (w.tick % TICKS_PER_SECOND === 0) {
        commands.push({ player: 0, command: { type: "train", building: barracks.id, unit: "soldier" } });
      }
      if (w.tick % (20 * TICKS_PER_SECOND) === 0) {
        const army = soldiersOf(w, 0).map((s) => s.id);
        if (army.length >= 8) {
          commands.push({ player: 0, command: { type: "attack_move", units: army, x: 2200, y: 500 } });
        }
      }
      step(w, commands);
    }
    expect(w.status).toBe("ended");
    expect(w.winner).toBe(0);
    expect(w.endReason).toBe("headquarters_destroyed");
  });

  it("a Town Hall at 0 HP ends the match", () => {
    const w = createWorld();
    entityList(w).find((e) => e.owner === 0 && e.type === "town_hall")!.hp = 0;
    step(w);
    expect(w.status).toBe("ended");
    expect(w.winner).toBe(1);
  });
});
