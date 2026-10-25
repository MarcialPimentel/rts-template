import { describe, expect, it } from "vitest";
import type { ServerMessage } from "../shared/protocol";
import type { Connection } from "../server/src/net";
import { RoomManager, type RoomTimings } from "../server/src/rooms";

const TIMINGS: RoomTimings = { countdownMs: 3000, forfeitMs: 30_000, cleanupMs: 60_000 };
let nextId = 1000;

class FakeConn implements Connection {
  readonly id = nextId++;
  readonly inbox: ServerMessage[] = [];
  send(m: ServerMessage) {
    this.inbox.push(m);
  }
  sendRaw(json: string) {
    this.inbox.push(JSON.parse(json));
  }
  close() {}
  last<T extends ServerMessage["t"]>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    return this.inbox.filter((m) => m.t === t).at(-1) as Extract<ServerMessage, { t: T }> | undefined;
  }
}

/** Ticks the manager every 50 ms from `from` for `ms` milliseconds; returns the new time. */
function advance(manager: RoomManager, from: number, ms: number): number {
  let now = from;
  for (let t = 0; t < ms; t += 50) {
    now += 50;
    manager.tick(now);
  }
  return now;
}

describe("RoomManager", () => {
  it("creates rooms with unique 4-letter codes", () => {
    const m = new RoomManager(TIMINGS);
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) codes.add(m.create(new FakeConn(), 0).code);
    expect(codes.size).toBe(50);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{4}$/);
  });

  it("joins by code, counts down 3 seconds, then starts the match for both", () => {
    const m = new RoomManager(TIMINGS);
    const a = new FakeConn();
    const b = new FakeConn();
    const room = m.create(a, 0);
    expect(a.last("room")).toMatchObject({ phase: "waiting", you: 0, connected: [true, false] });

    expect(m.join(b, room.code, 0)).toBe(room);
    expect(b.last("room")).toMatchObject({ phase: "countdown", you: 1, startsInMs: 3000 });

    let now = advance(m, 0, 2950);
    expect(room.phase).toBe("countdown");
    now = advance(m, now, 50);
    expect(room.phase).toBe("playing");
    expect(a.last("match_start")).toMatchObject({ you: 0 });
    expect(b.last("match_start")).toMatchObject({ you: 1 });
  });

  it("rejects unknown codes and full rooms", () => {
    const m = new RoomManager(TIMINGS);
    const room = m.create(new FakeConn(), 0);
    m.join(new FakeConn(), room.code, 0);
    expect(m.join(new FakeConn(), "ZZZZ", 0)).toBe("room_not_found");
    expect(m.join(new FakeConn(), room.code, 0)).toBe("room_full");
  });

  it("goes back to waiting if a player leaves during the countdown", () => {
    const m = new RoomManager(TIMINGS);
    const a = new FakeConn();
    const b = new FakeConn();
    const room = m.create(a, 0);
    m.join(b, room.code, 0);
    m.leave(b, 100);
    expect(room.phase).toBe("waiting");
    expect(a.last("room")).toMatchObject({ phase: "waiting", connected: [true, false] });
  });

  it("applies commands on the next tick, sends snapshots and acks the seq", () => {
    const m = new RoomManager(TIMINGS);
    const a = new FakeConn();
    const b = new FakeConn();
    const room = m.create(a, 0);
    m.join(b, room.code, 0);
    let now = advance(m, 0, 3000);
    const barracks = Object.values(room.world!.entities).find((e) => e.type === "barracks" && e.owner === 0)!;
    room.queueCommand(a, 5, { type: "train", building: barracks.id, unit: "soldier" });
    // A command for the other player's barracks is dropped by validation.
    room.queueCommand(b, 9, { type: "train", building: barracks.id, unit: "soldier" });
    now = advance(m, now, 50);
    expect(barracks.queue).toEqual(["soldier"]);
    expect(a.last("snapshot")!.s.a).toBe(5);
    expect(a.last("snapshot")!.s.g[0]).toBe(100);
    expect(b.last("snapshot")!.s.k).toBe(a.last("snapshot")!.s.k);
  });

  it("a disconnected player forfeits after 30 seconds", () => {
    const m = new RoomManager(TIMINGS);
    const a = new FakeConn();
    const b = new FakeConn();
    const room = m.create(a, 0);
    m.join(b, room.code, 0);
    let now = advance(m, 0, 3000);
    m.leave(b, now);
    expect(a.last("opponent_disconnected")).toEqual({ t: "opponent_disconnected", forfeitInMs: 30000 });
    now = advance(m, now, 29_900);
    expect(room.phase).toBe("playing");
    now = advance(m, now, 100);
    expect(room.phase).toBe("ended");
    expect(a.last("match_end")).toEqual({ t: "match_end", winner: 0, reason: "forfeit" });
  });

  it("deletes ended and empty rooms after 60 seconds", () => {
    const m = new RoomManager(TIMINGS);
    const a = new FakeConn();
    const room = m.create(a, 0);
    m.leave(a, 0);
    advance(m, 0, 59_950);
    expect(m.rooms.has(room.code)).toBe(true);
    advance(m, 59_950, 50);
    expect(m.rooms.has(room.code)).toBe(false);
  });
});
