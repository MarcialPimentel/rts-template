import type { World } from "./world";

export type EndReason = "headquarters_destroyed" | "forfeit" | "draw";

/** Ends the match if at most one player is left standing. */
export function endIfDecided(world: World, reason: EndReason): void {
  if (world.status === "ended" || world.players.length < 2) return;
  const standing = world.players.filter((p) => !p.defeated);
  if (standing.length > 1) return;
  world.status = "ended";
  world.winner = standing[0]?.id ?? null;
  world.endReason = standing.length === 0 ? "draw" : reason;
}

/** A player leaves or disconnects past the grace period: they lose. */
export function forfeit(world: World, player: number): void {
  const p = world.players[player];
  if (!p || world.status === "ended") return;
  p.defeated = true;
  endIfDecided(world, "forfeit");
}
