import { describe, expect, it } from "vitest";
import { GAME } from "../shared/data";
import { decodeSnapshot, encodeSnapshot, parseClientMessage } from "../shared/protocol";
import { applyCommand } from "../shared/sim/commands";
import { step } from "../shared/sim/step";
import { createWorld, entityList, spawnEntity } from "../shared/sim/world";
import { worldToView } from "../shared/view";

describe("snapshot encoding", () => {
  it("round-trips the world into the same view (rounded)", () => {
    const w = createWorld();
    const b = entityList(w).find((e) => e.type === "barracks" && e.owner === 0)!;
    applyCommand(w, 0, { type: "train", building: b.id, unit: "soldier" });
    spawnEntity(w, 1, "soldier", 1000.4, 500.6);
    for (let i = 0; i < 30; i++) step(w);

    const decoded = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(w, GAME, 7))), GAME.typeIds);
    const direct = worldToView(w);
    expect(decoded.tick).toBe(direct.tick);
    expect(decoded.players).toEqual(direct.players);
    expect(decoded.entities.map((e) => [e.id, e.type, e.owner])).toEqual(
      direct.entities.map((e) => [e.id, e.type, e.owner]),
    );
    for (let i = 0; i < decoded.entities.length; i++) {
      expect(Math.abs(decoded.entities[i]!.x - direct.entities[i]!.x)).toBeLessThanOrEqual(0.5);
      expect(decoded.entities[i]!.queue).toEqual(direct.entities[i]!.queue);
    }
    const barracks = decoded.entities.find((e) => e.id === b.id)!;
    expect(barracks.progress).toBeCloseTo(0.3, 1);
    expect(barracks.rally).toEqual(b.rally);
  });

  it("carries the recipient's ack and the match result", () => {
    const w = createWorld();
    w.status = "ended";
    w.winner = 1;
    w.endReason = "forfeit";
    const s = encodeSnapshot(w, GAME, 42);
    expect(s.a).toBe(42);
    const v = decodeSnapshot(s, GAME.typeIds);
    expect(v.status).toBe("ended");
    expect(v.winner).toBe(1);
    expect(v.endReason).toBe("forfeit");
  });

  it("stays small: a 60-unit battle is under 3 KB per snapshot", () => {
    const w = createWorld();
    for (let i = 0; i < 30; i++) spawnEntity(w, 0, "soldier", 900 + (i % 6) * 22, 300 + i * 12);
    for (let i = 0; i < 30; i++) spawnEntity(w, 1, "soldier", 1300 + (i % 6) * 22, 300 + i * 12);
    expect(JSON.stringify({ t: "snapshot", s: encodeSnapshot(w, GAME) }).length).toBeLessThan(3000);
  });
});

describe("parseClientMessage", () => {
  it("accepts valid messages", () => {
    expect(parseClientMessage('{"t":"create_room"}')).toEqual({ t: "create_room" });
    expect(parseClientMessage({ t: "join_room", code: " abcd " })).toEqual({ t: "join_room", code: "ABCD" });
    expect(parseClientMessage({ t: "ping", id: 3 })).toEqual({ t: "ping", id: 3 });
    expect(
      parseClientMessage({ t: "command", seq: 1, cmd: { type: "stop", units: [4] }, player: 1 }),
    ).toEqual({ t: "command", seq: 1, cmd: { type: "stop", units: [4] } });
  });

  it("rejects malformed messages", () => {
    for (const bad of [
      "not json",
      "{}",
      { t: "join_room", code: "TOOLONG" },
      { t: "command", seq: -1, cmd: { type: "stop", units: [1] } },
      { t: "command", seq: 1, cmd: { type: "nuke" } },
      { t: "teleport" },
      "x".repeat(9000),
    ]) {
      expect(parseClientMessage(bad)).toBeNull();
    }
  });
});
