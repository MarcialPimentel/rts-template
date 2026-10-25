import { decodeSnapshot, type ServerMessage } from "../../../shared/protocol";
import type { Command } from "../../../shared/sim/commands";
import type { ViewState } from "../../../shared/view";
import type { Session } from "../game/session";
import type { Connection } from "./connection";
import { SnapshotBuffer } from "./snapshot_buffer";

const PING_EVERY_MS = 2000;

/**
 * A match against another player through the server. Commands go up with a sequence number;
 * snapshots come down and are interpolated. Nothing here changes the world.
 */
export class OnlineSession implements Session {
  readonly localPlayer: number;
  private seq = 0;
  private ack = 0;
  private readonly sentTrains: { seq: number; building: number }[] = [];
  private readonly buffer = new SnapshotBuffer();
  private pingMs: number | null = null;
  private readonly pingTimer: number;
  private readonly pingsSent = new Map<number, number>();
  private nextPingId = 1;
  private opponentForfeitAt: number | null = null;
  private connectionLost = false;

  constructor(
    private readonly conn: Connection,
    you: number,
    private readonly typeIds: string[],
    readonly colors: readonly number[],
    readonly roomCode: string,
  ) {
    this.localPlayer = you;
    this.pingTimer = window.setInterval(() => this.ping(), PING_EVERY_MS);
    this.ping();
  }

  /** Called by the online controller for every message while the match screen is open. */
  handle(message: ServerMessage): void {
    switch (message.t) {
      case "snapshot": {
        const view = decodeSnapshot(message.s, this.typeIds);
        this.buffer.push(view, performance.now());
        this.ack = Math.max(this.ack, message.s.a);
        while (this.sentTrains.length && this.sentTrains[0]!.seq <= this.ack) this.sentTrains.shift();
        break;
      }
      case "pong": {
        const sent = this.pingsSent.get(message.id);
        if (sent !== undefined) {
          this.pingsSent.delete(message.id);
          const rtt = performance.now() - sent;
          this.pingMs = this.pingMs === null ? rtt : this.pingMs * 0.7 + rtt * 0.3;
        }
        break;
      }
      case "opponent_disconnected":
        this.opponentForfeitAt = performance.now() + message.forfeitInMs;
        break;
      case "match_end":
        this.opponentForfeitAt = null;
        break;
    }
  }

  markConnectionLost(): void {
    this.connectionLost = true;
  }

  send(command: Command): void {
    const seq = ++this.seq;
    if (command.type === "train") this.sentTrains.push({ seq, building: command.building });
    this.conn.send({ t: "command", seq, cmd: command });
  }

  view(nowMs: number): ViewState | null {
    return this.buffer.sample(nowMs);
  }

  pendingTrains(buildingId: number): number {
    return this.sentTrains.filter((t) => t.building === buildingId).length;
  }

  status(): string {
    const ping = this.pingMs === null ? "…" : `${Math.round(this.pingMs)} ms`;
    return `Online · room ${this.roomCode} · ping ${ping}`;
  }

  /** A message for the banner at the top of the screen, if something needs attention. */
  alert(): string | null {
    if (this.connectionLost) return "Connection to the server lost.";
    if (this.opponentForfeitAt !== null) {
      const s = Math.max(0, Math.ceil((this.opponentForfeitAt - performance.now()) / 1000));
      return `Opponent disconnected. They forfeit in ${s} s.`;
    }
    return null;
  }

  dispose(): void {
    window.clearInterval(this.pingTimer);
  }

  private ping(): void {
    const id = this.nextPingId++;
    this.pingsSent.set(id, performance.now());
    this.conn.send({ t: "ping", id });
  }
}
