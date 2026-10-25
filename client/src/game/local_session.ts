import { GAME } from "../../../shared/data";
import type { Command, PlayerCommand } from "../../../shared/sim/commands";
import { TICK_MS } from "../../../shared/sim/constants";
import { step } from "../../../shared/sim/step";
import { createWorld, type World } from "../../../shared/sim/world";
import { interpolateView, worldToView, type ViewState } from "../../../shared/view";
import type { Session } from "./session";

/**
 * Offline sandbox: runs the real simulation in the browser at 20 ticks per second.
 * Commands still go through the same validate/apply path the server uses.
 */
export class LocalSession implements Session {
  localPlayer = 0;
  private world: World = createWorld(GAME);
  private queue: PlayerCommand[] = [];
  private prev: ViewState;
  private current: ViewState;
  private lastStepAt = performance.now();
  private timer: number;

  constructor() {
    this.prev = worldToView(this.world);
    this.current = this.prev;
    this.timer = window.setInterval(() => this.advance(), TICK_MS / 2);
  }

  send(command: Command): void {
    this.queue.push({ player: this.localPlayer, command });
  }

  view(nowMs: number): ViewState {
    return interpolateView(this.prev, this.current, (nowMs - this.lastStepAt) / TICK_MS);
  }

  pendingTrains(buildingId: number): number {
    return this.queue.filter(
      (c) => c.command.type === "train" && c.command.building === buildingId,
    ).length;
  }

  status(): string {
    return `Sandbox · controlling Player ${this.localPlayer + 1} · Tab to switch`;
  }

  switchPlayer(): void {
    this.localPlayer = (this.localPlayer + 1) % this.world.players.length;
  }

  dispose(): void {
    window.clearInterval(this.timer);
  }

  /** Runs as many fixed ticks as real time requires (catching up after tab throttling, capped). */
  private advance(): void {
    const now = performance.now();
    let steps = 0;
    while (now - this.lastStepAt >= TICK_MS && steps < 10) {
      this.prev = this.current;
      step(this.world, this.queue.splice(0), GAME);
      this.current = worldToView(this.world);
      this.lastStepAt += TICK_MS;
      steps++;
    }
    if (now - this.lastStepAt > TICK_MS * 10) this.lastStepAt = now;
  }
}
