import { TICK_MS } from "../../../shared/sim/constants";
import { interpolateView, type ViewState } from "../../../shared/view";

/** How far behind the newest snapshot the client renders (GDD: about 100 ms). */
export const INTERPOLATION_DELAY_MS = 100;
const KEEP = 40;

/**
 * Holds recent snapshots and produces a smoothly interpolated view for any moment.
 * Rendering slightly in the past means there are usually two snapshots around the render time,
 * which hides network jitter at the cost of a small, constant delay.
 */
export class SnapshotBuffer {
  private snaps: { tick: number; view: ViewState }[] = [];
  /** Estimated (server time − local time) in ms, from the earliest-arriving snapshots. */
  private offset: number | null = null;

  constructor(private readonly delayMs = INTERPOLATION_DELAY_MS) {}

  push(view: ViewState, receivedAtMs: number): void {
    const last = this.snaps.at(-1);
    if (last && view.tick < last.tick) return; // arrived out of order
    if (last && view.tick === last.tick) {
      // Same tick sent again with newer information (e.g. the match ended by forfeit).
      last.view = view;
      return;
    }
    this.snaps.push({ tick: view.tick, view });
    if (this.snaps.length > KEEP) this.snaps.shift();

    const sample = view.tick * TICK_MS - receivedAtMs;
    if (this.offset === null || sample > this.offset) {
      this.offset = sample;
    } else {
      // Drift slowly toward later arrivals so a one-off early packet doesn't stick forever.
      this.offset += (sample - this.offset) * 0.02;
    }
  }

  latest(): ViewState | null {
    return this.snaps.at(-1)?.view ?? null;
  }

  /** The view to draw at local time `nowMs`. */
  sample(nowMs: number): ViewState | null {
    if (this.snaps.length === 0 || this.offset === null) return null;
    const renderTick = (nowMs + this.offset - this.delayMs) / TICK_MS;
    const first = this.snaps[0]!;
    if (renderTick <= first.tick) return first.view;
    for (let i = this.snaps.length - 1; i > 0; i--) {
      const a = this.snaps[i - 1]!;
      const b = this.snaps[i]!;
      if (renderTick >= a.tick && renderTick <= b.tick) {
        return interpolateView(a.view, b.view, (renderTick - a.tick) / (b.tick - a.tick));
      }
    }
    return this.snaps.at(-1)!.view; // render time is past the newest snapshot: hold it
  }
}
