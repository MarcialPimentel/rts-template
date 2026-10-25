/**
 * Server integration tests: the real server on a random port with real WebSocket clients
 * (GDD: server integration tests). Timings are shortened so the suite runs in seconds.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GAME } from "../shared/data";
import { decodeSnapshot } from "../shared/protocol";
import { startServer, type RunningServer } from "../server/src/server";
import { TestClient } from "./helpers/test_client";

let server: RunningServer;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer({
    port: 0,
    timings: { countdownMs: 100, forfeitMs: 400, cleanupMs: 2000 },
  });
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server.close();
});

async function connect(): Promise<TestClient> {
  const c = await TestClient.connect(server.port);
  clients.push(c);
  return c;
}

/** Two players in a started match. */
async function startMatch() {
  const a = await connect();
  const b = await connect();
  a.send({ t: "create_room" });
  const room = await a.waitFor("room");
  b.send({ t: "join_room", code: room.code.toLowerCase() });
  const [startA, startB] = await Promise.all([a.waitFor("match_start"), b.waitFor("match_start")]);
  return { a, b, code: room.code, startA, startB };
}

describe("game server", () => {
  it("answers health checks with its build", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toMatchObject({ ok: true, build: expect.any(String) });
  });

  it("greets each connection with its build number", async () => {
    const c = await connect();
    expect(await c.waitFor("hello")).toMatchObject({ build: expect.any(String) });
  });

  it("creates a room, lets a second player join by code, and starts the match", async () => {
    const { startA, startB } = await startMatch();
    expect(startA.you).toBe(0);
    expect(startB.you).toBe(1);
    expect(startA.typeIds).toEqual(GAME.typeIds);
  });

  it("reports unknown room codes and malformed messages", async () => {
    const c = await connect();
    c.send({ t: "join_room", code: "QQQQ" });
    expect(await c.waitFor("error")).toMatchObject({ code: "room_not_found" });
    c.clear();
    c.sendRaw("{not json");
    expect(await c.waitFor("error")).toMatchObject({ code: "bad_message" });
  });

  it("applies a player's command and both players see the same world", async () => {
    const { a, b } = await startMatch();
    const first = await a.waitFor("snapshot");
    const view = decodeSnapshot(first.s, GAME.typeIds);
    const barracks = view.entities.find((e) => e.owner === 0 && e.type === "barracks")!;

    a.send({ t: "command", seq: 1, cmd: { type: "train", building: barracks.id, unit: "soldier" } });
    const acked = await a.waitFor("snapshot", (m) => m.s.a === 1);
    const ackedView = decodeSnapshot(acked.s, GAME.typeIds);
    expect(ackedView.entities.find((e) => e.id === barracks.id)!.queue).toEqual(["soldier"]);
    expect(ackedView.players[0]!.gold).toBeLessThan(150);

    const sameTick = await b.waitFor("snapshot", (m) => m.s.k === acked.s.k);
    expect({ ...sameTick.s, a: 0 }).toEqual({ ...acked.s, a: 0 });
  });

  it("ignores commands for the other player's buildings", async () => {
    const { a, b } = await startMatch();
    const first = await a.waitFor("snapshot");
    const view = decodeSnapshot(first.s, GAME.typeIds);
    const theirs = view.entities.find((e) => e.owner === 0 && e.type === "barracks")!;
    b.send({ t: "command", seq: 1, cmd: { type: "train", building: theirs.id, unit: "soldier" } });
    const later = await b.waitFor("snapshot", (m) => m.s.k > first.s.k + 4);
    const after = decodeSnapshot(later.s, GAME.typeIds);
    expect(after.entities.find((e) => e.id === theirs.id)!.queue).toEqual([]);
    expect(after.players[1]!.gold).toBeGreaterThanOrEqual(150);
  });

  it("a dropped player forfeits after the grace period", async () => {
    const { a, b } = await startMatch();
    b.close();
    expect(await a.waitFor("opponent_disconnected")).toEqual({
      t: "opponent_disconnected",
      forfeitInMs: 400,
    });
    expect(await a.waitFor("match_end")).toEqual({ t: "match_end", winner: 0, reason: "forfeit" });
    const last = await a.waitFor("snapshot", (m) => m.s.st === 1);
    expect(last.s.w).toBe(0);
  });

  it("leaving mid-match forfeits immediately", async () => {
    const { a, b } = await startMatch();
    await b.waitFor("snapshot");
    const started = performance.now();
    b.send({ t: "leave" });
    expect(await a.waitFor("match_end")).toEqual({ t: "match_end", winner: 0, reason: "forfeit" });
    expect(performance.now() - started).toBeLessThan(300);
    expect(a.inbox.some((m) => m.t === "opponent_disconnected")).toBe(false);
  });

  it("answers pings", async () => {
    const c = await connect();
    c.send({ t: "ping", id: 77 });
    expect(await c.waitFor("pong")).toEqual({ t: "pong", id: 77 });
  });
});
