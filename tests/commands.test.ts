import { describe, expect, it } from "vitest";
import { applyCommand, parseCommand } from "../shared/sim/commands";
import { createWorld, entityList, spawnEntity, type World } from "../shared/sim/world";

const barracksOf = (w: World, p: number) =>
  entityList(w).find((e) => e.owner === p && e.type === "barracks")!;
const hallOf = (w: World, p: number) =>
  entityList(w).find((e) => e.owner === p && e.type === "town_hall")!;

describe("commands", () => {
  it("move: sets the order on own units only, clamped to the map", () => {
    const w = createWorld();
    const mine = spawnEntity(w, 0, "soldier", 500, 500);
    const theirs = spawnEntity(w, 1, "soldier", 600, 500);
    expect(applyCommand(w, 0, { type: "move", units: [mine.id, theirs.id], x: 99999, y: -5 })).toBe(
      true,
    );
    expect(mine.order).toEqual({ kind: "move", x: 2400, y: 0 });
    expect(theirs.order).toEqual({ kind: "idle" });
  });

  it("ignores commands for another player's units", () => {
    const w = createWorld();
    const theirs = spawnEntity(w, 1, "soldier", 600, 500);
    expect(applyCommand(w, 0, { type: "move", units: [theirs.id], x: 1, y: 1 })).toBe(false);
    expect(applyCommand(w, 0, { type: "stop", units: [theirs.id] })).toBe(false);
    expect(theirs.order).toEqual({ kind: "idle" });
  });

  it("cannot order buildings to move", () => {
    const w = createWorld();
    expect(applyCommand(w, 0, { type: "move", units: [hallOf(w, 0).id], x: 1, y: 1 })).toBe(false);
  });

  it("attack: requires an enemy target", () => {
    const w = createWorld();
    const s = spawnEntity(w, 0, "soldier", 500, 500);
    const friend = spawnEntity(w, 0, "soldier", 520, 500);
    expect(applyCommand(w, 0, { type: "attack", units: [s.id], target: friend.id })).toBe(false);
    expect(applyCommand(w, 0, { type: "attack", units: [s.id], target: hallOf(w, 1).id })).toBe(true);
    expect(s.order).toEqual({ kind: "attack", target: hallOf(w, 1).id });
  });

  it("attack_move and stop set the matching orders", () => {
    const w = createWorld();
    const s = spawnEntity(w, 0, "soldier", 500, 500);
    applyCommand(w, 0, { type: "attack_move", units: [s.id], x: 2000, y: 500 });
    expect(s.order).toEqual({ kind: "attack_move", x: 2000, y: 500 });
    applyCommand(w, 0, { type: "stop", units: [s.id] });
    expect(s.order).toEqual({ kind: "idle" });
  });

  it("train: pays gold and queues the unit", () => {
    const w = createWorld();
    const b = barracksOf(w, 0);
    expect(applyCommand(w, 0, { type: "train", building: b.id, unit: "soldier" })).toBe(true);
    expect(w.players[0]!.gold).toBe(100);
    expect(b.queue).toEqual(["soldier"]);
  });

  it("train: rejected without enough gold", () => {
    const w = createWorld();
    w.players[0]!.gold = 49;
    const b = barracksOf(w, 0);
    expect(applyCommand(w, 0, { type: "train", building: b.id, unit: "soldier" })).toBe(false);
    expect(b.queue).toEqual([]);
    expect(w.players[0]!.gold).toBe(49);
  });

  it("train: rejected when the queue is full, at the unit cap, or at another player's building", () => {
    const w = createWorld();
    w.players[0]!.gold = 100000;
    const b = barracksOf(w, 0);
    for (let i = 0; i < 5; i++) applyCommand(w, 0, { type: "train", building: b.id, unit: "soldier" });
    expect(applyCommand(w, 0, { type: "train", building: b.id, unit: "soldier" })).toBe(false);

    const w2 = createWorld();
    w2.players[0]!.gold = 100000;
    for (let i = 0; i < 30; i++) spawnEntity(w2, 0, "soldier", 300, 300);
    expect(applyCommand(w2, 0, { type: "train", building: barracksOf(w2, 0).id, unit: "soldier" })).toBe(
      false,
    );

    expect(applyCommand(w, 1, { type: "train", building: b.id, unit: "soldier" })).toBe(false);
  });

  it("train: rejected for a unit the building can't produce", () => {
    const w = createWorld();
    expect(applyCommand(w, 0, { type: "train", building: barracksOf(w, 0).id, unit: "town_hall" })).toBe(
      false,
    );
  });

  it("set_rally: moves the rally point of own producers only", () => {
    const w = createWorld();
    const b = barracksOf(w, 0);
    expect(applyCommand(w, 0, { type: "set_rally", building: b.id, x: 700, y: 600 })).toBe(true);
    expect(b.rally).toEqual({ x: 700, y: 600 });
    expect(applyCommand(w, 1, { type: "set_rally", building: b.id, x: 1, y: 1 })).toBe(false);
    expect(applyCommand(w, 0, { type: "set_rally", building: hallOf(w, 0).id, x: 1, y: 1 })).toBe(false);
  });

  it("drops everything once the match has ended", () => {
    const w = createWorld();
    w.status = "ended";
    expect(applyCommand(w, 0, { type: "train", building: barracksOf(w, 0).id, unit: "soldier" })).toBe(
      false,
    );
  });
});

describe("parseCommand", () => {
  it("accepts well-formed commands and strips unknown fields", () => {
    expect(parseCommand({ type: "move", units: [1, 2], x: 5, y: 6, player_id: 1 })).toEqual({
      type: "move",
      units: [1, 2],
      x: 5,
      y: 6,
    });
    expect(parseCommand({ type: "train", building: 3, unit: "soldier" })).toEqual({
      type: "train",
      building: 3,
      unit: "soldier",
    });
  });

  it("rejects malformed input", () => {
    for (const bad of [
      null,
      "move",
      { type: "fly" },
      { type: "move", units: [], x: 1, y: 1 },
      { type: "move", units: [1.5], x: 1, y: 1 },
      { type: "move", units: [1], x: Number.NaN, y: 1 },
      { type: "move", units: Array.from({ length: 65 }, (_, i) => i + 1), x: 1, y: 1 },
      { type: "attack", units: [1], target: "x" },
      { type: "train", building: 1 },
    ]) {
      expect(parseCommand(bad)).toBeNull();
    }
  });
});
