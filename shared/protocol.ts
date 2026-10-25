/**
 * Network protocol shared by client and server (GDD: Network protocol). Messages are JSON.
 * Every message from a client is untrusted and goes through `parseClientMessage` first.
 */
import type { CompiledGame } from "./data";
import { parseCommand, type Command } from "./sim/commands";
import type { World } from "./sim/world";
import type { ViewEntity, ViewState } from "./view";

export const ROOM_CODE_LENGTH = 4;
/** Letters that can't be confused with each other or with digits. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";

/** `waiting` is the lobby: players join, pick colours and ready up. It returns there after each match. */
export type RoomPhase = "waiting" | "countdown" | "playing";

export type ClientMessage =
  | { t: "create_room" }
  | { t: "join_room"; code: string }
  | { t: "command"; seq: number; cmd: Command }
  | { t: "ping"; id: number }
  | { t: "set_color"; color: number }
  | { t: "set_ready"; ready: boolean }
  | { t: "leave" };

export type ErrorCode = "room_not_found" | "room_full" | "bad_message" | "not_in_room";

export type ServerMessage =
  | { t: "hello"; build: string }
  | {
      t: "room";
      code: string;
      phase: RoomPhase;
      /** Your player slot (0 or 1). */
      you: number;
      /** Which slots have a connected player. */
      connected: boolean[];
      /** Milliseconds until the match starts, during the countdown. */
      startsInMs: number | null;
      /** Colour index (into PLAYER_COLORS) per slot. */
      colors: number[];
      /** Which players have pressed Ready. The match starts when both have. */
      ready: boolean[];
    }
  | { t: "error"; code: ErrorCode; message: string }
  | { t: "match_start"; you: number; typeIds: string[]; colors: number[] }
  | { t: "snapshot"; s: EncodedSnapshot }
  | { t: "match_end"; winner: number | null; reason: string | null }
  | { t: "opponent_disconnected"; forfeitInMs: number }
  | { t: "pong"; id: number }
  | { t: "room_closed" };

/**
 * One entity in a snapshot: [id, typeIndex, owner, x, y, hp] and, for producers,
 * [queue (type indexes), progress 0-100, rallyX, rallyY]. Numbers are rounded to keep messages small.
 */
export type EncodedEntity =
  | [number, number, number, number, number, number]
  | [number, number, number, number, number, number, number[], number, number, number];

export interface EncodedSnapshot {
  /** Tick number. */
  k: number;
  /** Gold per player. */
  g: number[];
  /** Defeated flags per player (1 = defeated). */
  d: number[];
  /** Last command `seq` from the recipient that the simulation has applied. */
  a: number;
  e: EncodedEntity[];
  /** 1 once the match has ended. */
  st: 0 | 1;
  w: number | null;
  r: string | null;
}

/** Encodes the world once per tick; `ack` is filled in per recipient. */
export function encodeSnapshot(world: World, game: CompiledGame, ack = 0): EncodedSnapshot {
  const typeIndex = new Map(game.typeIds.map((id, i) => [id, i]));
  const e: EncodedEntity[] = [];
  for (const ent of Object.values(world.entities)) {
    const base: [number, number, number, number, number, number] = [
      ent.id,
      typeIndex.get(ent.type)!,
      ent.owner,
      Math.round(ent.x),
      Math.round(ent.y),
      Math.ceil(ent.hp),
    ];
    if (game.defs[ent.type]!.produces.length > 0) {
      const next = ent.queue[0];
      const total = next ? game.defs[next]!.buildTicks : 0;
      e.push([
        ...base,
        ent.queue.map((q) => typeIndex.get(q)!),
        total > 0 ? Math.min(100, Math.floor((ent.progress / total) * 100)) : 0,
        Math.round(ent.rally?.x ?? ent.x),
        Math.round(ent.rally?.y ?? ent.y),
      ]);
    } else {
      e.push(base);
    }
  }
  return {
    k: world.tick,
    g: world.players.map((p) => Math.floor(p.gold)),
    d: world.players.map((p) => (p.defeated ? 1 : 0)),
    a: ack,
    e,
    st: world.status === "ended" ? 1 : 0,
    w: world.winner,
    r: world.endReason,
  };
}

/** Turns a snapshot back into something the client can draw. */
export function decodeSnapshot(s: EncodedSnapshot, typeIds: string[]): ViewState {
  return {
    tick: s.k,
    players: s.g.map((gold, id) => ({ id, gold, defeated: s.d[id] === 1 })),
    entities: s.e.map((raw): ViewEntity => {
      const [id, t, owner, x, y, hp] = raw;
      const producer = raw.length === 10;
      return {
        id,
        type: typeIds[t] ?? "unknown",
        owner,
        x,
        y,
        hp,
        queue: producer ? raw[6].map((q) => typeIds[q] ?? "unknown") : [],
        progress: producer ? raw[7] / 100 : 0,
        rally: producer ? { x: raw[8], y: raw[9] } : null,
      };
    }),
    status: s.st === 1 ? "ended" : "playing",
    winner: s.w,
    endReason: s.r,
  };
}

/** Validates a raw message from a client. Returns null for anything malformed. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > 8192) return null;
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.t) {
    case "create_room":
    case "leave":
      return { t: m.t };
    case "set_color":
      return Number.isInteger(m.color) ? { t: "set_color", color: m.color as number } : null;
    case "set_ready":
      return typeof m.ready === "boolean" ? { t: "set_ready", ready: m.ready } : null;
    case "join_room": {
      if (typeof m.code !== "string") return null;
      const code = m.code.trim().toUpperCase();
      if (code.length !== ROOM_CODE_LENGTH) return null;
      return { t: "join_room", code };
    }
    case "command": {
      if (!Number.isInteger(m.seq) || (m.seq as number) < 0) return null;
      const cmd = parseCommand(m.cmd);
      return cmd ? { t: "command", seq: m.seq as number, cmd } : null;
    }
    case "ping":
      return Number.isFinite(m.id) ? { t: "ping", id: m.id as number } : null;
    default:
      return null;
  }
}

/** Parses a message from the server. The client trusts the server, so this only checks JSON. */
export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const data = JSON.parse(raw) as ServerMessage;
    return typeof data === "object" && data !== null && typeof data.t === "string" ? data : null;
  } catch {
    return null;
  }
}
