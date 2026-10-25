import type { Command } from "../../../shared/sim/commands";
import type { ViewState } from "../../../shared/view";

/**
 * Where the game screen gets the world from and sends commands to. The local sandbox and the
 * online match both implement this, so the screen, input and rendering are shared.
 */
export interface Session {
  /** Which player this screen controls. Can change in the sandbox. */
  readonly localPlayer: number;
  /** Sends a command. The game never changes state directly. */
  send(command: Command): void;
  /** The world to draw right now (interpolated), or null before the first state arrives. */
  view(nowMs: number): ViewState | null;
  /** Train commands sent but not yet confirmed by the simulation, for a building. */
  pendingTrains(buildingId: number): number;
  /** Optional status line for the HUD (e.g. ping or room code). */
  status(): string;
  /** A message for the banner at the top of the screen (e.g. opponent disconnected), if any. */
  alert?(): string | null;
  /** Sandbox only: switch which player this screen controls. */
  switchPlayer?(): void;
  /** Called by the screen when it closes. */
  dispose(): void;
}
