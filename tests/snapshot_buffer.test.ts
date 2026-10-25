import { describe, expect, it } from "vitest";
import type { ViewState } from "../shared/view";
import { SnapshotBuffer } from "../client/src/net/snapshot_buffer";

const view = (tick: number, x: number): ViewState => ({
  tick,
  players: [],
  entities: [{ id: 1, type: "soldier", owner: 0, x, y: 0, hp: 100, queue: [], progress: 0, rally: null }],
  status: "playing",
  winner: null,
  endReason: null,
});

describe("SnapshotBuffer", () => {
  it("renders 100 ms behind the newest snapshot, interpolating between snapshots", () => {
    const buf = new SnapshotBuffer(100);
    // Snapshots for ticks 10..14 arrive exactly 50 ms apart; x moves 10 per tick.
    for (let i = 0; i < 5; i++) buf.push(view(10 + i, (10 + i) * 10), 1000 + i * 50);
    // At local time 1200 (when tick 14 arrived) we render tick 12.
    expect(buf.sample(1200)!.entities[0]!.x).toBeCloseTo(120);
    // Halfway between ticks 12 and 13.
    expect(buf.sample(1225)!.entities[0]!.x).toBeCloseTo(125);
  });

  it("smooths over jitter: a late snapshot doesn't make the view jump back", () => {
    const buf = new SnapshotBuffer(100);
    buf.push(view(10, 100), 1000);
    buf.push(view(11, 110), 1050);
    buf.push(view(12, 120), 1140); // arrived 40 ms late
    buf.push(view(13, 130), 1150);
    const xs = [1150, 1160, 1170, 1180].map((t) => buf.sample(t)!.entities[0]!.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]!);
  });

  it("ignores out-of-order snapshots and holds the newest when starved", () => {
    const buf = new SnapshotBuffer(100);
    buf.push(view(10, 100), 1000);
    buf.push(view(11, 110), 1050);
    buf.push(view(10, 999), 1060);
    expect(buf.latest()!.tick).toBe(11);
    expect(buf.sample(5000)!.entities[0]!.x).toBe(110);
  });

  it("takes a resent snapshot for the same tick (a forfeit ends the match without a new tick)", () => {
    const buf = new SnapshotBuffer(100);
    buf.push(view(10, 100), 1000);
    buf.push({ ...view(10, 100), status: "ended", winner: 0 }, 1010);
    expect(buf.sample(5000)!.status).toBe("ended");
  });

  it("returns null before any snapshot", () => {
    expect(new SnapshotBuffer().sample(0)).toBeNull();
  });
});
