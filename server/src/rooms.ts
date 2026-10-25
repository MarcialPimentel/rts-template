import { GAME, type CompiledGame } from "../../shared/data";
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  encodeSnapshot,
  type RoomPhase,
  type ServerMessage,
} from "../../shared/protocol";
import type { Command, PlayerCommand } from "../../shared/sim/commands";
import { forfeit } from "../../shared/sim/match";
import { step } from "../../shared/sim/step";
import { createWorld, type World } from "../../shared/sim/world";
import type { Connection } from "./net";

export interface RoomTimings {
  /** Countdown between both players joining and the match starting. */
  countdownMs: number;
  /** How long a disconnected player has before forfeiting. */
  forfeitMs: number;
  /** Ended or empty rooms are deleted after this long. */
  cleanupMs: number;
}

export const DEFAULT_TIMINGS: RoomTimings = {
  countdownMs: 3000,
  forfeitMs: 30_000,
  cleanupMs: 60_000,
};

const PLAYERS_PER_ROOM = 2;

interface QueuedCommand extends PlayerCommand {
  seq: number;
}

/**
 * One match: two player slots, the lobby lifecycle (waiting → countdown → playing → ended)
 * and, while playing, the one true simulation for that match.
 */
export class Room {
  phase: RoomPhase = "waiting";
  readonly slots: (Connection | null)[] = Array(PLAYERS_PER_ROOM).fill(null);
  world: World | null = null;
  /** Last command seq applied by the simulation, per player. */
  readonly acks: number[] = Array(PLAYERS_PER_ROOM).fill(0);
  /** When a disconnected player forfeits (playing phase only). */
  readonly forfeitAt: (number | null)[] = Array(PLAYERS_PER_ROOM).fill(null);
  /** Players asking for a rematch after a match. */
  readonly rematch: boolean[] = Array(PLAYERS_PER_ROOM).fill(false);
  private countdownEndsAt = 0;
  /** When the room became ended or empty, for cleanup. */
  idleSince: number | null = null;
  private queue: QueuedCommand[] = [];

  constructor(
    readonly code: string,
    private readonly timings: RoomTimings,
    private readonly game: CompiledGame = GAME,
  ) {}

  slotOf(conn: Connection): number {
    return this.slots.indexOf(conn);
  }

  isFull(): boolean {
    return this.slots.every((s) => s !== null);
  }

  isEmpty(): boolean {
    return this.slots.every((s) => s === null);
  }

  /** Adds a player to the first free slot. Returns the slot, or -1 if the room can't take them. */
  join(conn: Connection, now: number): number {
    if (this.phase !== "waiting") return -1;
    const slot = this.slots.indexOf(null);
    if (slot === -1) return -1;
    this.slots[slot] = conn;
    this.idleSince = null;
    if (this.isFull()) {
      this.phase = "countdown";
      this.countdownEndsAt = now + this.timings.countdownMs;
    }
    this.broadcastRoomState(now);
    return slot;
  }

  /** A player leaves or their connection closes. */
  leave(conn: Connection, now: number): void {
    const slot = this.slotOf(conn);
    if (slot === -1) return;
    this.slots[slot] = null;

    if (this.phase === "playing") {
      this.forfeitAt[slot] = now + this.timings.forfeitMs;
      this.send(1 - slot, { t: "opponent_disconnected", forfeitInMs: this.timings.forfeitMs });
    } else if (this.phase === "countdown") {
      this.phase = "waiting";
    } else if (this.phase === "ended") {
      this.rematch.fill(false);
    }
    if (this.isEmpty()) this.idleSince ??= now;
    this.broadcastRoomState(now);
  }

  /** Queues a command for the next tick. Commands from players not in a match are ignored. */
  queueCommand(conn: Connection, seq: number, command: Command): void {
    const player = this.slotOf(conn);
    if (player === -1 || this.phase !== "playing") return;
    this.queue.push({ player, command, seq });
  }

  /** Advances the room by one 50 ms tick. */
  tick(now: number): void {
    if (this.phase === "countdown" && now >= this.countdownEndsAt) this.startMatch(now);
    if (this.phase !== "playing" || !this.world) return;

    for (let p = 0; p < PLAYERS_PER_ROOM; p++) {
      const deadline = this.forfeitAt[p];
      if (deadline !== null && deadline !== undefined && now >= deadline) {
        this.forfeitAt[p] = null;
        forfeit(this.world, p);
      }
    }

    const commands = this.queue.splice(0);
    step(this.world, commands, this.game);
    for (const c of commands) this.acks[c.player] = Math.max(this.acks[c.player]!, c.seq);

    this.broadcastSnapshot();

    if (this.world.status === "ended") this.endMatch(now);
  }

  /** Called on every message so lobby screens stay in sync. */
  broadcastRoomState(now: number): void {
    for (let slot = 0; slot < PLAYERS_PER_ROOM; slot++) {
      this.send(slot, {
        t: "room",
        code: this.code,
        phase: this.phase,
        you: slot,
        connected: this.slots.map((s) => s !== null),
        startsInMs: this.phase === "countdown" ? Math.max(0, this.countdownEndsAt - now) : null,
        rematch: [...this.rematch],
      });
    }
  }

  private startMatch(now: number): void {
    this.phase = "playing";
    this.world = createWorld(this.game, PLAYERS_PER_ROOM);
    this.queue = [];
    this.acks.fill(0);
    this.forfeitAt.fill(null);
    this.rematch.fill(false);
    for (let slot = 0; slot < PLAYERS_PER_ROOM; slot++) {
      this.send(slot, { t: "match_start", you: slot, typeIds: this.game.typeIds });
    }
    this.broadcastRoomState(now);
  }

  private endMatch(now: number): void {
    this.phase = "ended";
    this.idleSince = now;
    this.forfeitAt.fill(null);
    const world = this.world!;
    for (let slot = 0; slot < PLAYERS_PER_ROOM; slot++) {
      this.send(slot, { t: "match_end", winner: world.winner, reason: world.endReason });
    }
    this.broadcastRoomState(now);
  }

  private broadcastSnapshot(): void {
    const snapshot = encodeSnapshot(this.world!, this.game);
    for (let slot = 0; slot < PLAYERS_PER_ROOM; slot++) {
      const conn = this.slots[slot];
      if (!conn) continue;
      snapshot.a = this.acks[slot]!;
      conn.sendRaw(JSON.stringify({ t: "snapshot", s: snapshot }));
    }
  }

  private send(slot: number, message: ServerMessage): void {
    this.slots[slot]?.send(message);
  }

  /** True once the room should be deleted. */
  expired(now: number): boolean {
    return this.idleSince !== null && now - this.idleSince >= this.timings.cleanupMs;
  }

  close(): void {
    for (const conn of this.slots) conn?.send({ t: "room_closed" });
    this.slots.fill(null);
  }
}

/** Creates rooms with unique codes, tracks which room each connection is in, and ticks them all. */
export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly roomOf = new Map<number, Room>();

  constructor(
    private readonly timings: RoomTimings = DEFAULT_TIMINGS,
    private readonly random: () => number = Math.random,
  ) {}

  create(conn: Connection, now: number): Room {
    this.leave(conn, now);
    const room = new Room(this.newCode(), this.timings);
    this.rooms.set(room.code, room);
    this.roomOf.set(conn.id, room);
    room.join(conn, now);
    return room;
  }

  join(conn: Connection, code: string, now: number): Room | "room_not_found" | "room_full" {
    const room = this.rooms.get(code);
    if (!room) return "room_not_found";
    if (this.roomOf.get(conn.id) === room) return room;
    if (room.phase !== "waiting" || room.isFull()) return "room_full";
    this.leave(conn, now);
    room.join(conn, now);
    this.roomOf.set(conn.id, room);
    return room;
  }

  leave(conn: Connection, now: number): void {
    const room = this.roomOf.get(conn.id);
    if (!room) return;
    this.roomOf.delete(conn.id);
    room.leave(conn, now);
  }

  roomFor(conn: Connection): Room | undefined {
    return this.roomOf.get(conn.id);
  }

  /** Ticks every room and deletes expired ones. */
  tick(now: number): void {
    for (const [code, room] of this.rooms) {
      room.tick(now);
      if (room.expired(now)) {
        for (const conn of room.slots) if (conn) this.roomOf.delete(conn.id);
        room.close();
        this.rooms.delete(code);
      }
    }
  }

  private newCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[Math.floor(this.random() * ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }
}
